import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import webpush from 'web-push';
import { createBirthdayJob } from '../birthday-push.mjs';
import { birthdayIsToday, birthdayMessage, lisbonDate, validBirthday } from '../birthday-message.mjs';
import { createPushStore } from '../push.mjs';

const keys = webpush.generateVAPIDKeys();
const env = { PUSH_ENABLED: 'true', PUSH_TEST_ONLY: 'false', PUSH_BIRTHDAY_ENABLED: 'true',
  PUSH_VAPID_PUBLIC_KEY: keys.publicKey, PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
  FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'configured' };
const ec = createECDH('prime256v1'); ec.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/one',
  keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
const winter = Date.parse('2026-11-21T09:00:00Z');
function setup(overrides = {}) {
  let time = winter;
  const record = { uid: 'birthday-user', subscription, locale: 'pt', revision: 'revision',
    expiresAt: '2028-01-01T00:00:00Z', birthdayEnabled: true, birthdayConsentedAt: '2026-11-01', ...overrides };
  const state = { records: [record], profiles: { 'birthday-user': { name: 'Tiago Araújo', dateOfBirth: '1980-11-21' } },
    deliveries: [], reservations: new Set(), reads: [], accepted: true, expired: false, progress: null };
  const store = {
    async birthdayProgress() { return structuredClone(state.progress); },
    async saveBirthdayProgress(data, previous) {
      if (previous?.revision !== state.progress?.revision) return false;
      state.progress = { ...data, revision: (previous?.revision || 0) + 1 }; return true;
    },
    async birthdayCandidates(cursor) {
      const records = structuredClone(state.records).map(r => ({ ...r, documentName: r.subscription.endpoint }));
      const start = cursor ? records.findIndex(r => r.documentName === cursor) + 1 : 0;
      const page = records.slice(start, start + 100);
      return { records: page, cursor: page.length === 100 ? page.at(-1).documentName : null };
    },
    async birthdayProfile(uid) { state.reads.push(uid); return state.profiles[uid] || null; },
    async birthdayProfiles(uids) { return new Map(await Promise.all([...new Set(uids)].map(async uid => [uid, await store.birthdayProfile(uid)]))); },
    async read(endpoint) { return state.records.find(r => r.subscription.endpoint === endpoint) || null; },
    async reserveBirthday(r, profile, year) {
      const id = `${r.uid}/${r.subscription.endpoint}/${year}`;
      if (state.reservations.has(id)) return false;
      state.reservations.add(id); return true;
    },
    async remove(endpoint) { state.records = state.records.filter(r => r.subscription.endpoint !== endpoint); },
  };
  const run = createBirthdayJob({ now: () => time, tokenProvider: async () => 'server-token', storeFactory: () => store,
    send: async (device, payload) => { state.deliveries.push({ device, payload });
      if (state.failure) throw new Error('uncertain-provider-result');
      return { accepted: state.accepted, expired: state.expired }; } });
  return { state, store, run: (settings = env, scheduled = time) => run(scheduled, settings),
    setTime(value) { time = Date.parse(value); } };
}

test('disabled flags, non-09:00 Lisbon and delayed invocations do not read private profiles', async () => {
  const s = setup();
  for (const flag of ['PUSH_ENABLED', 'PUSH_BIRTHDAY_ENABLED']) assert.equal((await s.run({ ...env, [flag]: 'false' })).skipped, 'disabled');
  assert.equal((await s.run(env, winter - 16 * 60000)).skipped, 'outside-window');
  s.setTime('2026-11-21T08:00:00Z');
  assert.equal((await s.run()).skipped, 'outside-window');
  assert.deepEqual(s.state.reads, []);
});

test('birthday dates follow Lisbon DST, strict calendar validation and leap-day policy', () => {
  assert.equal(lisbonDate(Date.parse('2027-07-01T08:00:00Z')).hour, '09');
  assert.equal(lisbonDate(Date.parse('2027-01-01T09:00:00Z')).hour, '09');
  assert.equal(lisbonDate(Date.parse('2027-03-28T08:00:00Z')).hour, '09');
  assert.equal(lisbonDate(Date.parse('2027-10-31T09:00:00Z')).hour, '09');
  for (const value of ['', '2001-02-29', '2000-04-31', '21/11/1980', '2099-11-21']) assert.equal(validBirthday(value, winter), false);
  assert.equal(birthdayIsToday('2000-02-29', Date.parse('2027-02-28T09:00:00Z')), true);
  assert.equal(birthdayIsToday('2000-02-29', Date.parse('2028-02-28T09:00:00Z')), false);
  assert.equal(birthdayIsToday('2000-02-29', Date.parse('2028-02-29T09:00:00Z')), true);
});

test('only the birthday recipient with explicit, unexpired consent receives a personalised private greeting', async () => {
  const s = setup();
  const other = (uid, extra = {}) => ({ ...s.state.records[0], uid, subscription: { ...subscription, endpoint: `${subscription.endpoint}-${uid}` }, ...extra });
  s.state.records.push(other('no-consent', { birthdayEnabled: false }), other('expired', { expiresAt: '2026-11-20' }),
    other('other-day'), other('deleted-account'), other('no-date'));
  s.state.profiles['other-day'] = { name: 'Someone Else', dateOfBirth: '1970-11-22' };
  s.state.profiles['no-date'] = { name: 'Another Person' };
  const result = await s.run();
  assert.equal(result.accepted, 1);
  assert.equal(s.state.deliveries[0].device.endpoint, subscription.endpoint);
  assert.equal(s.state.deliveries[0].payload.body, 'Parabéns, Tiago! A equipa do CIRC deseja-lhe um dia muito feliz.');
  assert.equal(JSON.stringify(s.state.deliveries).includes('1980'), false);
  assert.equal(JSON.stringify(s.state.deliveries).includes('Araújo'), false);
  assert.equal(s.state.reads.includes('no-consent'), false);
  assert.equal(s.state.reads.includes('expired'), false);
});

test('concurrent cron invocations and unsubscribe/re-enrolment cannot duplicate the annual attempt', async () => {
  const s = setup();
  await Promise.all([s.run(), s.run()]);
  await s.run();
  s.state.records[0] = { ...s.state.records[0], revision: 'new-consent' };
  await s.run();
  assert.equal(s.state.deliveries.length, 1);
  s.setTime('2027-11-21T09:00:00Z');
  await s.run();
  assert.equal(s.state.deliveries.length, 2);
});

test('pilot excludes everyone except server-marked organiser subscriptions', async () => {
  const s = setup();
  s.state.profiles['birthday-user'].email = 'circ.chuc@gmail.com';
  await s.run({ ...env, PUSH_TEST_ONLY: 'true' });
  assert.equal(s.state.deliveries.length, 0);
  assert.equal(s.state.reads.length, 0);
  s.state.records[0].testAccount = true;
  s.state.progress = null;
  await s.run({ ...env, PUSH_TEST_ONLY: 'true' });
  assert.equal(s.state.deliveries.length, 1);
});

test('a busy birthday resumes next minute without losing recipients, and resets on a new day', async () => {
  const s = setup();
  s.state.records = Array.from({ length: 12 }, (_, i) => ({ ...s.state.records[0], uid: `person-${i}`,
    subscription: { ...subscription, endpoint: `${subscription.endpoint}-${i}` } }));
  for (const r of s.state.records) s.state.profiles[r.uid] = { name: 'Ana', dateOfBirth: '1980-11-21' };
  assert.equal((await s.run()).accepted, 5);
  assert.equal(s.state.progress.done, false);
  s.setTime('2026-11-21T09:01:00Z');
  assert.equal((await s.run()).accepted, 5);
  s.setTime('2026-11-21T09:02:00Z');
  assert.equal((await s.run()).accepted, 2);
  assert.equal(s.state.progress.done, true);
  assert.equal((await s.run()).skipped, 'complete');
  assert.equal(new Set(s.state.deliveries.map(d => d.device.endpoint)).size, 12);
  s.setTime('2026-11-22T09:00:00Z');
  await s.run();
  assert.equal(s.state.progress.day, '2026-11-22');
});

test('bounded scans continue after three pages instead of dropping later participants', async () => {
  const s = setup();
  const first = s.state.records[0];
  s.state.profiles['birthday-user'].dateOfBirth = '1980-11-22';
  s.state.records = Array.from({ length: 350 }, (_, i) => ({ ...first, subscription: { ...subscription, endpoint: `${subscription.endpoint}-${i}` } }));
  assert.equal((await s.run()).checked, 300);
  assert.equal(s.state.progress.done, false);
  s.setTime('2026-11-21T09:01:00Z');
  assert.equal((await s.run()).checked, 50);
  assert.equal(s.state.progress.done, true);
});

test('batch profile reads use minimal masks and reject unrelated or missing responses', async () => {
  const calls = [];
  const root = 'projects/circ-coimbra/databases/(default)/documents';
  let rows = [{ found: { name: `${root}/users/one`, updateTime: 'revision', fields: { name: { stringValue: 'Ana' } } } },
    { missing: `${root}/users/two` }];
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, opts) => {
    calls.push({ url, ...opts }); return Response.json(rows);
  } });
  const profiles = await store.birthdayProfiles(['one', 'two', 'one']);
  assert.equal(profiles.get('one').name, 'Ana');
  assert.equal(profiles.get('two'), null);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].body);
  assert.equal(body.documents.length, 2);
  assert.ok(body.mask.fieldPaths.includes('dateOfBirth'));
  assert.ok(!body.mask.fieldPaths.includes('email'));
  rows = [];
  await assert.rejects(store.birthdayProfiles(['one']));
  rows = [{ missing: `${root}/users/other` }];
  await assert.rejects(store.birthdayProfiles(['one']));
});

test('latest profile, opt-out and account ownership are checked again before reserving', async () => {
  for (const mutation of [r => { r.birthdayEnabled = false; }, r => { r.uid = 'new-owner'; },
    r => { r.expiresAt = '2020-01-01'; }]) {
    const s = setup();
    s.store.birthdayProfile = async () => { mutation(s.state.records[0]); return s.state.profiles['birthday-user']; };
    await s.run();
    assert.equal(s.state.deliveries.length, 0);
  }
  const s = setup(); s.state.profiles['birthday-user'].dateOfBirth = '1980-11-22';
  await s.run(); assert.equal(s.state.deliveries.length, 0);
});

test('provider failures are not blindly retried; expired subscriptions are removed', async () => {
  const s = setup(); s.state.failure = true;
  assert.equal((await s.run()).failed, 1);
  await s.run(); assert.equal(s.state.deliveries.length, 1);
  const expired = setup(); expired.state.accepted = false; expired.state.expired = true;
  assert.equal((await expired.run()).expired, 1);
  assert.equal(expired.state.records.length, 0);
});

test('pagination processes later pages without exposing other users or profiles in results', async () => {
  const s = setup(); const cursors = [];
  s.store.birthdayCandidates = async cursor => { cursors.push(cursor); return cursor
    ? { records: s.state.records, cursor: null } : { records: [], cursor: 'next' }; };
  assert.equal((await s.run()).accepted, 1);
  assert.deepEqual(cursors, [null, 'next']);
  assert.equal(birthdayMessage({ name: 'http://private.example' }, 'en', '2026').body, 'Happy birthday! The CIRC team wishes you a wonderful day.');
});

test('Firestore reservation atomically checks subscription/profile revisions and creates a private annual TTL ledger', async () => {
  const calls = []; let response = Response.json({});
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); return response.clone();
  } });
  const r = setup().state.records[0];
  const profile = { documentName: 'projects/circ-coimbra/databases/(default)/documents/users/birthday-user', revision: 'profile-revision' };
  assert.equal(await store.reserveBirthday(r, profile, '2026', winter), true);
  const writes = JSON.parse(calls[0].body).writes;
  assert.match(calls[0].url, /\/documents:commit$/);
  assert.equal(writes[0].currentDocument.updateTime, r.revision);
  assert.equal(writes[1].verify, profile.documentName);
  assert.equal(writes[1].currentDocument.updateTime, profile.revision);
  assert.deepEqual(writes[2].currentDocument, { exists: false });
  assert.deepEqual(Object.keys(writes[2].update.fields), ['expiresAt']);
  assert.match(writes[2].update.name, /pushBirthdayDeliveries\/[a-f0-9]{64}$/);
  response = Response.json({ error: { status: 'ALREADY_EXISTS' } }, { status: 409 });
  assert.equal(await store.reserveBirthday(r, profile, '2026', winter), false);
  response = Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 });
  await assert.rejects(store.reserveBirthday(r, profile, '2026', winter));
});

test('Firestore query paginates by document cursor and profile read masks unrelated personal data', async () => {
  const calls = [];
  const name = 'projects/circ-coimbra/databases/(default)/documents';
  const record = setup().state.records[0];
  const hash = createHash('sha256').update(subscription.endpoint).digest('hex');
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, options) => {
    calls.push({ url, ...options });
    if (url.includes(':runQuery')) return Response.json([{ document: { name: `${name}/pushSubscriptions/${hash}`,
      updateTime: 'revision', fields: { record: { stringValue: JSON.stringify(record) } } } }]);
    return Response.json({ name: `${name}/users/birthday-user`, updateTime: 'profile-revision',
      fields: { name: { stringValue: 'Tiago' }, dateOfBirth: { stringValue: '1980-11-21' } } });
  } });
  assert.equal((await store.birthdayCandidates(`${name}/pushSubscriptions/previous`)).records[0].uid, record.uid);
  const query = JSON.parse(calls[0].body).structuredQuery;
  assert.equal(query.where.fieldFilter.field.fieldPath, 'birthdayEnabled');
  assert.equal(query.startAt.before, false);
  assert.equal(query.limit, 100);
  assert.equal((await store.birthdayProfile('birthday-user')).dateOfBirth, '1980-11-21');
  assert.match(calls[1].url, /mask.fieldPaths=dateOfBirth/);
  assert.equal(calls[1].url.includes('taxNumber'), false);
});
