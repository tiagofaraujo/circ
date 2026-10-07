import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { jwtVerify, importSPKI } from 'jose';
import { createSandboxWebhook, parseSignedPayment } from '../payments/sandbox-webhook.mjs';
import { createServiceTokenProvider } from '../payments/service-token.mjs';
const ID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const key = 'unit-test-signing-key';
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_SANDBOX_SERVICE_ACCOUNT: 'test-credential',
  EUPAGO_SANDBOX_WEBHOOK_KEY: key, EUPAGO_SANDBOX_CHANNEL: 'demo-channel', EUPAGO_SANDBOX_API_KEY: 'test-provider-key' };
const payload = () => ({ transactions: { identifier: `circ_test_${ID.replaceAll('-', '')}`, method: 'Multibanco',
  entity: 82142, reference: 104100507, trid: 123456, amount: { value: 1, currency: 'EUR' },
  date: '2026-10-07T09:50:00Z', status: 'Paid' }, channel: { name: 'demo-channel' } });
const sign = body => createHmac('sha256', key).update(body).digest('base64');
const request = (data = payload(), signature, path = 'YWRtaW4') => {
  const body = JSON.stringify(data);
  return new Request(`https://circ.local/api/payments/sandbox/notifications/${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature ?? sign(body) }, body });
};
function fixture() {
  let calls = 0, writes = 0, version = 1, inspectCalls = 0, paid = true, storageFails = false;
  let document = { version: '1', record: { id: ID, owner: 'admin', kind: 'gateway-test', environment: 'sandbox', status: 'pending',
    identifier: payload().transactions.identifier, reference: '104100507', entity: '82142', amountCents: 100, currency: 'EUR', method: 'multibanco' } };
  const store = {
    read: async () => { if (storageFails) throw new Error('sensitive storage detail'); return structuredClone(document); },
    replace: async (id, record, expected) => {
      assert.equal(id, ID);
      if (expected !== document.version) throw Object.assign(new Error(), { code: 'conflict' });
      writes++; document = { record, version: String(++version) }; return structuredClone(document);
    },
    create: () => assert.fail('callback must never create a payment or registration'),
  };
  return { handle: createSandboxWebhook({ tokenProvider: async () => { calls++; return 'server-token'; },
    storeFactory: options => { assert.equal(options.token, 'server-token'); assert.equal(options.uid, 'admin'); return store; },
    providerFactory: options => { assert.equal(options.environment, 'sandbox'); return {
      inspectReference: async () => { inspectCalls++; if (paid === 'error') throw new Error('provider secret'); return { providerState: paid ? 'paga' : 'pendente' }; },
    }; }, now: () => '2026-10-07T10:00:00Z' }),
    record: () => document.record, calls: () => calls, writes: () => writes, inspectCalls: () => inspectCalls,
    setPaid: value => { paid = value; }, failStorage: () => { storageFails = true; },
    change: fields => { Object.assign(document.record, fields); } };
}
test('signed notification validates sandbox payment and duplicate has no extra writes or provider calls', async () => {
  const f = fixture();
  assert.equal((await f.handle(request(), env)).status, 200);
  assert.equal(f.record().status, 'sandbox_paid'); assert.equal(f.record().notification.transactionId, '123456');
  assert.ok(f.record().notification.verifiedAt); assert.equal(f.writes(), 2);
  const duplicate = await f.handle(request(), env);
  assert.deepEqual(await duplicate.json(), { received: true, duplicate: true });
  assert.equal(f.writes(), 2); assert.equal(f.inspectCalls(), 1);
});
test('simultaneous deliveries converge to one persisted confirmation', async () => {
  const f = fixture();
  const responses = await Promise.all([f.handle(request(), env), f.handle(request(), env), f.handle(request(), env)]);
  assert.ok(responses.every(r => r.status === 200)); assert.equal(f.writes(), 2);
  assert.equal(f.record().status, 'sandbox_paid');
});
test('invalid signatures, body tampering and excessive streamed data do no privileged work', async () => {
  const f = fixture();
  for (const signature of ['', 'bad', Buffer.alloc(32).toString('base64'), sign(JSON.stringify(payload()) + ' ')]) {
    assert.equal((await f.handle(request(payload(), signature), env)).status, 401);
  }
  const large = payload(); large.extra = 'a'.repeat(17000);
  assert.equal((await f.handle(request(large), env)).status, 400);
  assert.equal(f.calls(), 0); assert.equal(f.writes(), 0);
});
test('wrong channel, currency, amount, state, method or transaction identifiers are rejected', async () => {
  const f = fixture();
  for (const change of [p => { p.channel.name = 'production'; }, p => { p.transactions.amount.currency = 'USD'; },
    p => { p.transactions.amount.value = 1.001; }, p => { p.transactions.amount.value = 2; },
    p => { p.transactions.status = 'Refund'; }, p => { p.transactions.method = 'CreditCard'; },
    p => { p.transactions.trid = 9007199254740992; }, p => { p.transactions.identifier = 'real_purchase'; },
    p => { p.data = 'encrypted'; }, p => { p.transaction = p.transactions; }]) {
    const data = payload(); change(data); assert.equal((await f.handle(request(data), env)).status, 422);
  }
  assert.equal(f.calls(), 0);
});
test('signature covers exact bytes, documented plural and single object variants normalize identically', () => {
  const p = payload(); const body = JSON.stringify(p, null, 2);
  const event = parseSignedPayment(Buffer.from(body), sign(body), key, env.EUPAGO_SANDBOX_CHANNEL);
  const other = JSON.stringify({ transaction: p.transactions, channel: p.channel });
  assert.deepEqual(parseSignedPayment(Buffer.from(other), sign(other), key, env.EUPAGO_SANDBOX_CHANNEL), event);
  assert.equal(event.id, ID); assert.equal(event.amountCents, 100);
});
test('persisted data mismatch and production records never confirm', async () => {
  for (const fields of [{ environment: 'production' }, { owner: 'other' }, { reference: '9' }, { entity: '11111' },
    { method: 'mbway' }, { amountCents: 200 }, { currency: 'USD' }, { status: 'creating' }, { id: 'different' }]) {
    const f = fixture(); f.change(fields);
    assert.equal((await f.handle(request(), env)).status, 422); assert.equal(f.writes(), 0);
  }
});
test('pending or unavailable provider retains receipt and retry completes without a new payment', async () => {
  for (const unavailable of [false, 'error']) {
    const f = fixture(); f.setPaid(unavailable);
    const result = await f.handle(request(), env);
    assert.equal(result.status, 503); assert.equal(f.record().status, 'pending');
    assert.ok(f.record().notification.receivedAt); assert.equal(f.record().notification.verifiedAt, null);
    f.setPaid(true); assert.equal((await f.handle(request(), env)).status, 200);
    assert.equal(f.record().status, 'sandbox_paid'); assert.equal(f.writes(), 2);
  }
});
test('different signed transaction cannot overwrite a completed confirmation', async () => {
  const f = fixture(); await f.handle(request(), env);
  const data = payload(); data.transactions.trid++;
  assert.equal((await f.handle(request(data), env)).status, 409);
  assert.equal(f.record().notification.transactionId, '123456'); assert.equal(f.writes(), 2);
});
test('storage failure is not acknowledged and does not leak raw errors', async () => {
  const f = fixture(); f.failStorage(); const response = await f.handle(request(), env);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'notification_unavailable' });
});
test('configuration missing, unsupported method, query and path fail closed', async () => {
  const f = fixture();
  assert.equal((await f.handle(request(), {})).status, 503);
  assert.equal((await f.handle(new Request(request().url), env)).status, 405);
  assert.equal((await f.handle(request(payload(), undefined, 'YWRtaW4?chave_api=secret'), env)).status, 400);
  assert.equal((await f.handle(request(payload(), undefined, 'bad/path'), env)).status, 404);
  assert.equal(await f.handle(new Request('https://circ.local/api/payments/production/notifications/admin'), env), null);
  assert.equal(f.calls(), 0);
});
test('service credential exchanges a scoped signed JWT only with Google, caches and refreshes token', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { type: 'service_account', project_id: 'circ-coimbra', client_email: 'sandbox@circ-coimbra.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://attacker.invalid' };
  const secretEnv = { ...env, FIREBASE_SANDBOX_SERVICE_ACCOUNT: JSON.stringify(account) };
  let count = 0, time = Date.now();
  const publicCryptoKey = await importSPKI(publicKey.export({ type: 'spki', format: 'pem' }), 'RS256');
  const get = createServiceTokenProvider({ now: () => time, fetchImpl: async (url, options) => {
    count++; assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(options.redirect, 'manual');
    const assertion = new URLSearchParams(options.body).get('assertion');
    const { payload: jwt } = await jwtVerify(assertion, publicCryptoKey, { audience: url, currentDate: new Date(time) });
    assert.equal(jwt.scope, 'https://www.googleapis.com/auth/datastore'); assert.equal(jwt.iss, account.client_email);
    return Response.json({ access_token: 'scoped-token', token_type: 'Bearer', expires_in: 3600 });
  } });
  assert.equal(await get(secretEnv), 'scoped-token'); await get(secretEnv); assert.equal(count, 1);
  time += 3550000; await get(secretEnv); assert.equal(count, 2);
  await assert.rejects(get({ ...secretEnv, FIREBASE_PROJECT_ID: 'other-project' }), /service_identity_unavailable/);
});
test('service identity failures and redirects expose no credential or OAuth response', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { type: 'service_account', project_id: 'circ-coimbra', client_email: 'sandbox@circ-coimbra.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const get = createServiceTokenProvider({ fetchImpl: async () => new Response('sensitive response', { status: 302 }) });
  await assert.rejects(get({ ...env, FIREBASE_SANDBOX_SERVICE_ACCOUNT: JSON.stringify(account) }), /^Error: service_identity_unavailable$/);
});
