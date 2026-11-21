import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHash, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { createAnnouncementsApi, createAnnouncementJob, createAnnouncementStore, normalizeAnnouncement } from '../announcements.mjs';

const time = Date.parse('2026-11-21T22:00:00Z'), keys = webpush.generateVAPIDKeys();
const env = { PUSH_ENABLED: 'true', PUSH_TEST_ONLY: 'false', PUSH_ANNOUNCEMENTS_ENABLED: 'true', PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
  PUSH_VAPID_PRIVATE_KEY: keys.privateKey, FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'configured' };
const notice = { id: '7e4121c9-a990-44c8-9751-a438e77fd910', title: 'Programa atualizado', body: 'Consulte os horários no My CIRC.', createdAt: new Date(time).toISOString() };
const admin = { sub: 'organiser', email: 'circ.chuc@gmail.com', email_verified: true };
const root = 'projects/circ-coimbra/databases/(default)/documents';
const ec = createECDH('prime256v1'); ec.generateKeys();
function device(n, extra = {}) {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${n}`;
  return { uid: `user${n}`, consentedAt: new Date(time - 1000).toISOString(), expiresAt: new Date(time + 86400000).toISOString(),
    subscription: { endpoint, keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } },
    revision: 'r1', documentName: `${root}/pushSubscriptions/${createHash('sha256').update(endpoint).digest('hex')}`, ...extra };
}
const req = (method, value, origin = 'https://circ-coimbra.org') => new Request('https://circ-coimbra.org/api/notifications', { method,
  headers: { Authorization: 'Bearer session', Origin: origin, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(value) } : {}) });

test('only verified owner publishes; participants read without delivery metadata or new writes', async () => {
  let claims = { ...admin, email: 'person@example.org' }, writes = 0, listing;
  const api = createAnnouncementsApi({ verify: async () => claims, tokenProvider: async () => 'token', storeFactory: () => ({
    list: async isAdmin => { listing = isAdmin; return [notice]; }, publish: async () => { writes++; return { notification: notice }; },
  }) });
  assert.equal((await api(req('POST', notice), env)).status, 403);
  assert.equal((await api(req('GET'), env)).status, 200); assert.equal(listing, false); assert.equal(writes, 0);
  claims = { ...admin, email_verified: false };
  assert.equal((await api(req('POST', notice), env)).status, 403);
  claims = admin;
  assert.equal((await api(req('POST', notice, 'https://evil.test'), env)).status, 403);
  assert.equal((await api(req('POST', notice), { ...env, PUSH_ANNOUNCEMENTS_ENABLED: 'false' })).status, 503);
  assert.equal((await api(req('POST', notice), env)).status, 201); assert.equal(writes, 1);
});

test('publication rejects missing authentication and invalid, oversized or malformed content', async () => {
  let stores = 0;
  const api = createAnnouncementsApi({ verify: async () => admin, tokenProvider: async () => 'token', storeFactory: () => { stores++; } });
  const anonymous = req('GET'); anonymous.headers.delete('Authorization');
  assert.equal((await api(anonymous, env)).status, 401);
  for (const value of [{ ...notice, id: '../../users' }, { ...notice, title: ' ' }, { ...notice, title: 'x'.repeat(81) }, { ...notice, body: 'x'.repeat(1001) }, { ...notice, body: 'x'.repeat(9000) }]) {
    assert.equal((await api(req('POST', value), env)).status, 400);
  }
  assert.equal(stores, 0);
  assert.deepEqual(normalizeAnnouncement({ ...notice, title: ' Title ', arbitraryUrl: 'https://evil.test' }), { id: notice.id, title: 'Title', body: notice.body });
});

test('publication atomically creates notice and job; same id/content is idempotent, changed content conflicts', async () => {
  let stored = null, commits = 0;
  const store = createAnnouncementStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, options) => {
    if (url.endsWith(':commit')) {
      commits++; const { writes } = JSON.parse(options.body);
      assert.equal(writes.length, 2);
      assert.deepEqual(writes.map(w => w.currentDocument), [{ exists: false }, { exists: false }]);
      assert.equal(writes[1].update.fields.pending.booleanValue, true);
      stored = { ...writes[0].update, updateTime: 'revision' };
      return Response.json({});
    }
    return stored ? Response.json(stored) : new Response('', { status: 404 });
  } });
  assert.equal((await store.publish(normalizeAnnouncement(notice), admin.sub, time)).duplicate, false);
  assert.equal((await store.publish(normalizeAnnouncement(notice), admin.sub, time)).duplicate, true);
  await assert.rejects(store.publish({ ...notice, body: 'Different' }, admin.sub, time), /id-conflict/);
  assert.equal(commits, 1);
});

function state(records) {
  let job = { id: notice.id, createdAt: notice.createdAt, pending: true, cursor: null, leaseUntil: 0,
    checked: 0, attempted: 0, accepted: 0, failed: 0, skipped: 0, revision: '1' };
  const reserved = new Set(), sent = [], pageStarts = [];
  let failProgress = false, reserves = 0;
  const store = {
    nextJob: async () => job.pending ? structuredClone(job) : null,
    saveJob: async (next, previous) => {
      if (previous.revision !== job.revision) return null;
      if (failProgress && next.leaseUntil === 0) { failProgress = false; throw new Error('offline'); }
      job = { ...structuredClone(next), revision: String(Number(job.revision) + 1) }; return structuredClone(job);
    },
    read: async () => notice,
    candidates: async cursor => { const start = cursor ? records.findIndex(r => r.documentName === cursor) + 1 : 0; pageStarts.push(start);
      return { records: records.slice(start, start + 100), more: records.length >= start + 100 }; },
    reserve: async (_, record) => { reserves++; if (reserved.has(record.documentName)) return false; reserved.add(record.documentName); return true; },
  };
  let clock = time;
  const run = createAnnouncementJob({ storeFactory: () => store, tokenProvider: async () => 'token', now: () => clock,
    send: async (subscription, payload) => { sent.push({ subscription, payload }); return { accepted: true }; } });
  return { store, run: (settings = env) => run(clock, settings), job: () => job, sent, reserved, pageStarts,
    expireLease: () => { clock += 121000; }, failProgress: () => { failProgress = true; }, reserves: () => reserves };
}

test('broadcast resumes in bounded batches, covers all eligible devices and does not repeat on later cron runs', async () => {
  const s = state(Array.from({ length: 21 }, (_, i) => device(i)));
  await s.run(); assert.equal(s.sent.length, 8); assert.equal(s.job().pending, true);
  await s.run(); await s.run(); assert.equal(s.sent.length, 21); assert.equal(s.job().pending, false);
  assert.equal((await s.run()).skipped, 'empty');
  assert.equal(new Set(s.sent.map(s => s.subscription.endpoint)).size, 21);
  assert.equal(s.sent[0].payload.url, '/conta/notificacoes');
  assert.equal(s.sent[0].payload.tag, `circ-announcement-${notice.id}`);
  assert.equal(s.job().accepted, 21);
});

test('expired, unconsented and later subscriptions do not receive a past publication; birthday consent is irrelevant', async () => {
  const s = state([device(1, { birthdayEnabled: false }), device(2, { expiresAt: new Date(time - 1).toISOString() }),
    device(3, { consentedAt: null }), device(4, { consentedAt: new Date(time + 1).toISOString() })]);
  await s.run(); assert.equal(s.sent.length, 1); assert.equal(s.job().skipped, 3);
});

test('concurrent cron runs acquire a lease and cannot duplicate delivery', async () => {
  const s = state([device(1)]);
  await Promise.all([s.run(), s.run()]); assert.equal(s.sent.length, 1);
});

test('lost progress is recoverable without repeat sends, including reservation request budget', async () => {
  const s = state(Array.from({ length: 20 }, (_, i) => device(i)));
  s.failProgress(); await assert.rejects(s.run(), /offline/);
  assert.equal(s.sent.length, 8); s.expireLease();
  const before = s.reserves(); await s.run();
  assert.equal(s.reserves() - before, 8); assert.equal(s.sent.length, 8);
  await s.run(); await s.run(); assert.equal(s.sent.length, 20);
});

test('revocation before reservation is respected; send errors are counted without automatic duplicates', async () => {
  const s = state([device(1), device(2)]);
  s.store.reserve = async (_, record) => record.uid !== 'user1';
  await s.run(); assert.equal(s.sent.length, 1); assert.equal(s.sent[0].subscription.endpoint.endsWith('/2'), true);
  const t = state([device(1)]);
  const run = createAnnouncementJob({ storeFactory: () => t.store, tokenProvider: async () => 'token', now: () => time, send: async () => { throw new Error('unknown'); } });
  await run(time, env); await run(time, env); assert.equal(t.job().failed, 1); assert.equal(t.job().attempted, 1);
});

test('disabled sending never reads data and old jobs stop after seven days', async () => {
  const s = state([device(1)]);
  assert.equal((await s.run({ ...env, PUSH_ENABLED: 'false' })).skipped, 'disabled');
  s.job().createdAt = new Date(time - 8 * 86400000).toISOString();
  assert.equal((await s.run()).skipped, 'expired'); assert.equal(s.sent.length, 0); assert.equal(s.job().pending, false);
});

test('Firestore cursor, job/subscription revision checks and hashed delivery expiry are preserved', async () => {
  const record = device(1); const calls = [];
  const store = createAnnouncementStore({ projectId: 'circ-coimbra', token: 'token', fetchImpl: async (url, options) => {
    calls.push(JSON.parse(options.body)); return Response.json(url.endsWith(':runQuery') ? [] : {});
  } });
  await store.candidates(record.documentName);
  assert.equal(calls[0].structuredQuery.startAt.values[0].referenceValue, record.documentName);
  await assert.rejects(store.candidates(`${root}/users/other`), /invalid-cursor/);
  await store.reserve({ ...notice, revision: 'job-revision' }, record, time);
  const writes = calls[1].writes;
  assert.deepEqual(writes[0].currentDocument, { updateTime: 'job-revision' });
  assert.deepEqual(writes[1].currentDocument, { updateTime: record.revision });
  assert.match(writes[2].update.name, /pushAnnouncementDeliveries\/[a-f0-9]{64}$/);
  assert.equal(writes[2].update.fields.expiresAt.timestampValue, new Date(time + 30 * 86400000).toISOString());
  assert.equal(JSON.stringify(writes[2]).includes(record.uid), false);
});
