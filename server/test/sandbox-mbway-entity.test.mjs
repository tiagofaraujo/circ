import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createSandboxWebhook, parseSignedPayment } from '../payments/sandbox-webhook.mjs';
import { createEupagoSandbox } from '../payments/eupago-sandbox.mjs';

const ID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const IDENTIFIER = `circ_test_${ID.replaceAll('-', '')}`;
const key = 'unit-test-mbway-signing-key';
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_SANDBOX_SERVICE_ACCOUNT: 'test-credential',
  EUPAGO_SANDBOX_WEBHOOK_KEY: key, EUPAGO_SANDBOX_CHANNEL: 'demo-channel', EUPAGO_SANDBOX_API_KEY: 'test-api-key' };
// Shape supplied by Eupago support; identifiers and channel are synthetic.
const payload = () => ({ channel: { account: 'demo-channel', name: 'demo-channel' }, transaction: {
  entity: '10045', reference: '405001', identifier: IDENTIFIER, method: 'MW:PT',
  amount: { value: '1.00', currency: 'EUR' }, fees: { value: '0.12000', currency: 'EUR' },
  date: '2026-10-09T11:50:16', trid: '29750001', status: 'Paid', local: 'NoInformation',
} });
const signedRequest = (data = payload(), signature) => {
  const body = JSON.stringify(data);
  return new Request('https://circ.local/api/payments/sandbox/notifications/YWRtaW4', { method: 'POST',
    headers: { 'Content-Type': 'application/json',
      'X-Signature': signature ?? createHmac('sha256', key).update(body).digest('base64') }, body });
};
function fixture(fields = {}) {
  let document = { version: '1', record: { kind: 'gateway-test', owner: 'admin', environment: 'sandbox', id: ID,
    identifier: IDENTIFIER, method: 'mbway', reference: '405001', entity: null,
    amountCents: 100, currency: 'EUR', status: 'pending', ...fields } };
  let info = { sucesso: true, estado: 0, referencia: '405001', identificador: IDENTIFIER,
    entidade: '10045', estado_referencia: 'paga' };
  let unavailable = false, storageFailure = false, writes = 0, tokens = 0;
  const calls = [];
  const store = {
    read: async id => { assert.equal(id, ID); return structuredClone(document); },
    replace: async (id, record, expectedVersion) => {
      assert.equal(id, ID);
      if (storageFailure) throw new Error('private storage failure');
      if (expectedVersion !== document.version) throw Object.assign(new Error(), { code: 'conflict' });
      document = { record, version: String(Number(document.version) + 1) }; writes++;
      return structuredClone(document);
    },
    create: () => assert.fail('A webhook must never create payments or registrations'),
  };
  const handle = createSandboxWebhook({
    tokenProvider: async () => { tokens++; return 'injected-server-token'; },
    storeFactory: options => { assert.equal(options.uid, 'admin'); assert.equal(options.token, 'injected-server-token'); return store; },
    providerFactory: options => createEupagoSandbox({ ...options, fetchImpl: async (url, request) => {
      assert.equal(url, 'https://sandbox.eupago.pt/clientes/rest_api/multibanco/info');
      assert.equal(request.method, 'POST'); assert.equal(request.redirect, 'manual');
      calls.push(JSON.parse(request.body));
      if (unavailable) throw new Error('private provider failure');
      return Response.json(info);
    } }),
    now: () => '2026-10-09T12:00:00.000Z',
  });
  return { handle, calls, record: () => structuredClone(document.record), writes: () => writes, tokens: () => tokens,
    setInfo: fields => { info = { ...info, ...fields }; }, setUnavailable: value => { unavailable = value; },
    setStorageFailure: value => { storageFailure = value; } };
}

test('MB WAY support body reconciles an entity omitted at creation using the authenticated reference lookup', async () => {
  const f = fixture();
  const result = await f.handle(signedRequest(), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { received: true, duplicate: false });
  assert.equal(f.record().entity, '10045'); assert.equal(f.record().status, 'sandbox_paid');
  assert.equal(f.record().notification.transactionId, '29750001');
  assert.equal(f.record().notification.paidAt, '2026-10-09T11:50:16');
  assert.ok(f.record().notification.verifiedAt);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].entidade, '10045');
  assert.equal(f.calls[0].referencia, '405001'); assert.equal(f.writes(), 2);
});
test('a duplicate of a validated MB WAY notification needs no further writes or provider calls', async () => {
  const f = fixture();
  assert.equal((await f.handle(signedRequest(), env)).status, 200);
  assert.deepEqual(await (await f.handle(signedRequest(), env)).json(), { received: true, duplicate: true });
  assert.equal(f.writes(), 2); assert.equal(f.calls.length, 1);
});
test('a manually inspected paid hint does not block the signed notification or replace validation', async () => {
  const f = fixture({ providerState: 'paga', inspectedAt: '2026-10-09T11:59:00Z' });
  f.setUnavailable(true);
  assert.equal((await f.handle(signedRequest(), env)).status, 503);
  assert.equal(f.record().status, 'pending'); assert.equal(f.writes(), 0);
  f.setUnavailable(false);
  assert.equal((await f.handle(signedRequest(), env)).status, 200);
  assert.ok(f.record().notification.verifiedAt);
});
test('an absent stored entity field follows the same verified MB WAY reconciliation as null', async () => {
  const f = fixture({ entity: undefined });
  assert.equal((await f.handle(signedRequest(), env)).status, 200);
  assert.equal(f.record().entity, '10045');
});
test('matching entities already stored in MB WAY are still validated', async () => {
  const f = fixture({ entity: '10045' });
  assert.equal((await f.handle(signedRequest(), env)).status, 200);
  assert.equal(f.record().entity, '10045'); assert.equal(f.calls.length, 1);
});
test('a known different entity is never overwritten by MB WAY enrichment', async () => {
  const f = fixture({ entity: '11111' });
  const response = await f.handle(signedRequest(), env);
  assert.equal(response.status, 422); assert.deepEqual(await response.json(), { error: 'attempt_mismatch' });
  assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0); assert.equal(f.record().entity, '11111');
});
test('entity enrichment is never allowed for a Multibanco record', async () => {
  const f = fixture({ method: 'multibanco' }); const p = payload(); p.transaction.method = 'PC:PT';
  assert.equal((await f.handle(signedRequest(p), env)).status, 422);
  assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
});
test('Multibanco confirmation and duplicate handling still work with their required entity', async () => {
  const f = fixture({ method: 'multibanco', entity: '82142', reference: '104100501' });
  f.setInfo({ entidade: '82142', referencia: '104100501' });
  const p = payload(); Object.assign(p.transaction, { method: 'PC:PT', entity: '82142', reference: '104100501' });
  assert.equal((await f.handle(signedRequest(p), env)).status, 200);
  assert.equal(f.record().status, 'sandbox_paid');
  assert.deepEqual(await (await f.handle(signedRequest(p), env)).json(), { received: true, duplicate: true });
  assert.equal(f.writes(), 2); assert.equal(f.calls.length, 1);
});
for (const [name, info] of [
  ['different entity', { entidade: '11111' }], ['missing entity', { entidade: undefined }],
  ['different reference', { referencia: '405999' }], ['different identifier', { identificador: 'another_reference_identifier' }],
]) {
  test(`MB WAY entity is not saved when authenticated lookup returns ${name}`, async () => {
    const f = fixture(); f.setInfo(info);
    const response = await f.handle(signedRequest(), env);
    assert.equal(response.status, 422); assert.deepEqual(await response.json(), { error: 'attempt_mismatch' });
    assert.equal(f.writes(), 0); assert.equal(f.record().entity, null);
    assert.equal(f.record().notification, undefined); assert.equal(f.record().status, 'pending');
  });
}
test('numeric entity returned by the provider is compared with the normalized signed entity', async () => {
  const f = fixture(); f.setInfo({ entidade: 10045 });
  const p = payload(); p.transaction.entity = 10045;
  assert.equal((await f.handle(signedRequest(p), env)).status, 200);
  assert.equal(f.record().entity, '10045');
});
test('a different five-digit entity must also be confirmed by the API; no channel-specific constant is assumed', async () => {
  const f = fixture(); const p = payload(); p.transaction.entity = '10046';
  f.setInfo({ entidade: '10046' });
  assert.equal((await f.handle(signedRequest(p), env)).status, 200);
  assert.equal(f.record().entity, '10046'); assert.equal(f.calls[0].entidade, '10046');
});
test('a signed but wrong entity cannot pin a receipt and block a later correct notification', async () => {
  const f = fixture(); const wrong = payload(); wrong.transaction.entity = '11111';
  assert.equal((await f.handle(signedRequest(wrong), env)).status, 422);
  assert.equal(f.writes(), 0);
  assert.equal((await f.handle(signedRequest(), env)).status, 200);
  assert.equal(f.record().entity, '10045');
});
test('unavailable provider leaves a missing entity untouched and a later delivery can recover', async () => {
  const f = fixture(); f.setUnavailable(true);
  const response = await f.handle(signedRequest(), env);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'notification_unavailable' });
  assert.equal(f.writes(), 0); assert.equal(f.record().notification, undefined);
  f.setUnavailable(false); assert.equal((await f.handle(signedRequest(), env)).status, 200);
});
test('pending provider state retains only a verified entity and unconfirmed receipt, then recovers on retry', async () => {
  const f = fixture(); f.setInfo({ estado_referencia: 'pendente' });
  const result = await f.handle(signedRequest(), env);
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: 'reconciliation_pending' });
  assert.equal(f.record().entity, '10045'); assert.equal(f.record().status, 'pending');
  assert.equal(f.record().notification.verifiedAt, null); assert.equal(f.writes(), 1);
  f.setInfo({ estado_referencia: 'paga' });
  assert.equal((await f.handle(signedRequest(), env)).status, 200);
  assert.equal(f.writes(), 2); assert.equal(f.record().status, 'sandbox_paid');
});
test('numeric API code zero is never treated as a paid state', async () => {
  const f = fixture(); f.setInfo({ estado_referencia: undefined, estado: 0 });
  assert.equal((await f.handle(signedRequest(), env)).status, 503);
  assert.equal(f.record().status, 'pending'); assert.equal(f.record().notification.verifiedAt, null);
});
test('storage failure after independent verification is not acknowledged as a successful payment', async () => {
  const f = fixture(); f.setStorageFailure(true);
  const response = await f.handle(signedRequest(), env);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'notification_unavailable' });
  assert.equal(f.writes(), 0); assert.equal(f.record().entity, null);
  f.setStorageFailure(false); assert.equal((await f.handle(signedRequest(), env)).status, 200);
});
test('concurrent MB WAY deliveries converge without losing the entity or duplicating confirmation', async () => {
  const f = fixture();
  const responses = await Promise.all([f.handle(signedRequest(), env), f.handle(signedRequest(), env), f.handle(signedRequest(), env)]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(f.writes(), 2); assert.equal(f.record().entity, '10045'); assert.equal(f.record().status, 'sandbox_paid');
});
test('a different transaction cannot overwrite a validated MB WAY receipt', async () => {
  const f = fixture(); assert.equal((await f.handle(signedRequest(), env)).status, 200);
  const p = payload(); p.transaction.trid = '29750002';
  assert.equal((await f.handle(signedRequest(p), env)).status, 409);
  assert.equal(f.record().notification.transactionId, '29750001'); assert.equal(f.writes(), 2);
});
test('bad signatures and body tampering do not reach storage or the provider', async () => {
  const f = fixture();
  for (const sig of ['', 'bad', Buffer.alloc(32).toString('base64')]) {
    assert.equal((await f.handle(signedRequest(payload(), sig), env)).status, 401);
  }
  const p = payload(); const signature = createHmac('sha256', key).update(JSON.stringify(p)).digest('base64');
  p.transaction.entity = '11111';
  assert.equal((await f.handle(signedRequest(p, signature), env)).status, 401);
  assert.equal(f.tokens(), 0); assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
});
test('malformed entity is not converted to a missing entity', async () => {
  const f = fixture();
  for (const entity of ['', 'invalid', -1, 1.5, '1234', '123456', {}, [], true]) {
    const p = payload(); p.transaction.entity = entity;
    const response = await f.handle(signedRequest(p), env);
    assert.equal(response.status, 422); assert.deepEqual(await response.json(), { error: 'invalid_event' });
  }
  assert.equal(f.tokens(), 0); assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
});
test('signed wrong amount, currency, channel, method, state and date are still rejected', async () => {
  const f = fixture();
  for (const change of [p => { p.transaction.amount.value = '1.01'; }, p => { p.transaction.amount.currency = 'USD'; },
    p => { p.channel.name = 'other-channel'; }, p => { p.transaction.method = 'Card'; },
    p => { p.transaction.status = 'Refund'; }, p => { p.transaction.date = '2026-02-30T11:50:16'; }]) {
    const p = payload(); change(p);
    assert.equal((await f.handle(signedRequest(p), env)).status, 422);
  }
  assert.equal(f.tokens(), 0); assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
});
test('record ownership, method, amount, currency and sandbox boundaries remain strict', async () => {
  for (const fields of [{ owner: 'other-admin' }, { environment: 'production' }, { kind: 'registration' },
    { method: 'multibanco' }, { amountCents: 200 }, { currency: 'USD' }, { reference: '405999' },
    { identifier: 'another_reference_identifier' }, { id: 'different' }, { status: 'creating' }, { status: 'creation_unknown' }]) {
    const f = fixture(fields);
    assert.equal((await f.handle(signedRequest(), env)).status, 422);
    assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
  }
});
test('missing entities on both sides remain valid for MB WAY, but not for Multibanco', async () => {
  const f = fixture(); const p = payload(); delete p.transaction.entity;
  f.setInfo({ entidade: undefined });
  assert.equal((await f.handle(signedRequest(p), env)).status, 200);
  assert.equal(f.record().entity, null);
  const mb = fixture({ method: 'multibanco' }); p.transaction.method = 'PC:PT';
  const response = await mb.handle(signedRequest(p), env);
  assert.equal(response.status, 422); assert.deepEqual(await response.json(), { error: 'invalid_event' });
  assert.equal(mb.tokens(), 0);
});
test('normalization preserves existing digests for valid signed payloads', () => {
  const p = payload(); const body = JSON.stringify(p); const signature = createHmac('sha256', key).update(body).digest('base64');
  const a = parseSignedPayment(Buffer.from(body), signature, key, env.EUPAGO_SANDBOX_CHANNEL);
  p.transaction.method = 'Mbway'; p.transaction.entity = 10045;
  const other = JSON.stringify({ channel: p.channel, transactions: p.transaction });
  const b = parseSignedPayment(Buffer.from(other), createHmac('sha256', key).update(other).digest('base64'), key, env.EUPAGO_SANDBOX_CHANNEL);
  assert.deepEqual(a, b);
});
