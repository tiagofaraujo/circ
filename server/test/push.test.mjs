import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { createPushApi, createPushStore, normalizePushSubscription, pushConfiguration, sendPushTest, validPushEndpoint } from '../push.mjs';

const keys = webpush.generateVAPIDKeys();
const env = { PUSH_ENABLED: 'true', PUSH_TEST_ONLY: 'true', PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
  PUSH_VAPID_PRIVATE_KEY: keys.privateKey, FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'configured' };
const ec = createECDH('prime256v1'); ec.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
const admin = { sub: 'organiser', email: 'circ.chuc@gmail.com', email_verified: true };
const participant = { sub: 'participant', email: 'participant@example.org', email_verified: true };
const clock = Date.parse('2026-11-21T12:00:00Z');
const request = (action, data, method = 'POST', origin = 'https://circ-coimbra.org') => new Request(`https://circ-coimbra.org/api/push/${action}`, {
  method, headers: { Authorization: 'Bearer session', Origin: origin, 'Content-Type': 'application/json' },
  ...(method === 'GET' ? {} : { body: JSON.stringify(data) }),
});
function setup(claims = admin, settings = env) {
  let record = null, deliveries = 0, time = clock;
  const store = {
    async read() { return record ? structuredClone(record) : null; },
    async save(next, previous) {
      if ((record?.revision || null) !== (previous?.revision || null)) throw new Error('concurrent-update');
      record = { ...next, revision: String(Number(record?.revision || 0) + 1) };
    },
    async remove() { record = null; },
  };
  const api = createPushApi({ verify: async () => claims, tokenProvider: async () => 'server-token', storeFactory: () => store,
    now: () => time, send: async () => { deliveries++; return { accepted: true }; } });
  return { api: req => api(req, settings), read: () => record, deliveries: () => deliveries,
    advance: ms => { time += ms; }, store };
}
const enrollment = () => request('subscriptions', { subscription, locale: 'pt', consent: true });

test('production stays disabled by default; config never exposes the private key', async () => {
  assert.equal(pushConfiguration({}).enabled, false);
  assert.equal(pushConfiguration({ ...env, PUSH_ENABLED: 'false' }).enabled, false);
  assert.equal(pushConfiguration({ ...env, PUSH_VAPID_PRIVATE_KEY: webpush.generateVAPIDKeys().privateKey }).enabled, false);
  const state = setup(admin, { ...env, PUSH_ENABLED: 'false' });
  const result = await state.api(request('config', null, 'GET'));
  assert.deepEqual(await result.json(), { enabled: false, testOnly: true, publicKey: null });
  assert.equal((await state.api(enrollment())).status, 503);
  assert.equal(state.read(), null);
});

test('pilot denies participant enrollment and all non-admin tests', async () => {
  const pilot = setup(participant);
  assert.equal((await pilot.api(enrollment())).status, 503);
  const publicMode = setup(participant, { ...env, PUSH_TEST_ONLY: 'false' });
  assert.equal((await publicMode.api(enrollment())).status, 200);
  assert.equal((await publicMode.api(request('test', { endpoint: subscription.endpoint }))).status, 403);
  assert.equal(publicMode.deliveries(), 0);
});

test('authentication, email verification and same-origin are required', async () => {
  const state = setup();
  const anonymous = enrollment(); anonymous.headers.delete('Authorization');
  assert.equal((await state.api(anonymous)).status, 401);
  assert.equal((await state.api(request('subscriptions', {}, 'POST', 'https://evil.example'))).status, 403);
  const unverified = setup({ ...admin, email_verified: false });
  assert.equal((await unverified.api(enrollment())).status, 403);
  assert.equal(state.read(), null);
});

test('only known HTTPS push providers are accepted; redirects are not followed', () => {
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/id', 'https://localhost/test', 'https://127.0.0.1/test',
    'https://fcm.googleapis.com.evil.test/fcm/send/id', 'https://user@web.push.apple.com/id', 'https://web.push.apple.com:8443/id',
    'https://fcm.googleapis.com/other', 'https://web.push.apple.com/id#fragment']) assert.equal(validPushEndpoint(endpoint), false, endpoint);
  assert.equal(validPushEndpoint('https://web.push.apple.com/unique'), true);
  assert.equal(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/unique'), true);
  assert.throws(() => normalizePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'short' } }));
});

test('consent, key lengths and bounded request size validated before writing', async () => {
  const state = setup();
  for (const data of [{ subscription, locale: 'pt' }, { subscription, locale: 'pt', consent: false },
    { subscription: { ...subscription, keys: {} }, locale: 'pt', consent: true }, { text: 'x'.repeat(5000) }]) {
    assert.equal((await state.api(request('subscriptions', data))).status, 400);
  }
  assert.equal(state.read(), null);
});

test('successful enrollment stores only the necessary device data and never sends a message', async () => {
  const state = setup();
  assert.equal((await state.api(enrollment())).status, 200);
  assert.equal(state.read().uid, admin.sub);
  assert.equal(state.read().consentedAt, new Date(clock).toISOString());
  assert.equal(state.read().email, undefined);
  assert.equal(state.deliveries(), 0);
  assert.deepEqual(await (await state.api(request('status', { endpoint: subscription.endpoint }))).json(), { subscribed: true });
  state.advance(91 * 86400000);
  assert.deepEqual(await (await state.api(request('status', { endpoint: subscription.endpoint }))).json(), { subscribed: false });
});

test('one device test per minute, only after a saved subscription', async () => {
  const state = setup();
  assert.equal((await state.api(request('test', { endpoint: subscription.endpoint }))).status, 404);
  await state.api(enrollment());
  assert.equal((await state.api(request('test', { endpoint: subscription.endpoint }))).status, 200);
  assert.equal((await state.api(request('test', { endpoint: subscription.endpoint }))).status, 429);
  assert.equal(state.deliveries(), 1);
  state.advance(60001);
  assert.equal((await state.api(request('test', { endpoint: subscription.endpoint }))).status, 200);
  assert.equal(state.deliveries(), 2);
});

test('concurrent tests reserve the device before contacting the provider', async () => {
  const state = setup(); await state.api(enrollment());
  const results = await Promise.all([state.api(request('test', { endpoint: subscription.endpoint })), state.api(request('test', { endpoint: subscription.endpoint }))]);
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(state.deliveries(), 1);
});

test('a different account cannot read, replace or delete another device registration', async () => {
  const state = setup(); await state.api(enrollment());
  const other = createPushApi({ verify: async () => participant, tokenProvider: async () => 'token', storeFactory: () => state.store, now: () => clock });
  const publicEnv = { ...env, PUSH_TEST_ONLY: 'false' };
  assert.deepEqual(await (await other(request('status', { endpoint: subscription.endpoint }), publicEnv)).json(), { subscribed: false });
  assert.equal((await other(enrollment(), publicEnv)).status, 409);
  assert.equal((await other(request('subscriptions', { endpoint: subscription.endpoint }, 'DELETE'), publicEnv)).status, 409);
  assert.equal(state.read().uid, admin.sub);
});

test('unsubscribe remains available even when sending is disabled', async () => {
  const state = setup(); await state.api(enrollment());
  const stopped = createPushApi({ verify: async () => admin, tokenProvider: async () => 'token', storeFactory: () => state.store });
  assert.equal((await stopped(request('subscriptions', { endpoint: subscription.endpoint }, 'DELETE'), { ...env, PUSH_ENABLED: 'false' })).status, 200);
  assert.equal(state.read(), null);
});

test('expired provider endpoint is removed, failure is not reported as delivered', async () => {
  const state = setup(); await state.api(enrollment());
  const expired = createPushApi({ verify: async () => admin, tokenProvider: async () => 'token', storeFactory: () => state.store,
    now: () => clock, send: async () => ({ expired: true, accepted: false }) });
  assert.equal((await expired(request('test', { endpoint: subscription.endpoint }), env)).status, 410);
  assert.equal(state.read(), null);
});

test('provider request is encrypted, bounded and uses standard VAPID authentication', async () => {
  let sent;
  const result = await sendPushTest(subscription, 'pt', env, async (url, options) => { sent = { url, ...options }; return new Response('', { status: 201 }); });
  assert.deepEqual(result, { accepted: true, expired: false });
  assert.equal(sent.url, subscription.endpoint);
  assert.equal(sent.redirect, 'manual');
  assert.equal(sent.headers.TTL, 300);
  assert.equal(sent.headers['Content-Encoding'], 'aes128gcm');
  assert.match(sent.headers.Authorization, /^vapid t=/);
  assert.equal(sent.body.includes(Buffer.from('Notificação de teste')), false);
  assert.equal((await sendPushTest(subscription, 'pt', env, async () => new Response('', { status: 302 }))).accepted, false);
});

test('Firestore saves with revision preconditions and a TTL field; endpoint absent from document IDs', async () => {
  const calls = [];
  const store = createPushStore({ projectId: 'circ-coimbra', token: 'server-token', fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); return Response.json({});
  } });
  const record = { uid: 'organiser', subscription, expiresAt: '2027-02-19T12:00:00.000Z' };
  await store.save(record, null);
  assert.match(calls[0].url, /pushSubscriptions\/[a-f0-9]{64}\?currentDocument.exists=false$/);
  assert.equal(JSON.parse(calls[0].body).fields.expiresAt.timestampValue, record.expiresAt);
  await store.save(record, { revision: '2026-11-21T00:00:00Z' });
  assert.match(calls[1].url, /currentDocument.updateTime=/);
});
