import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createCheckoutSandboxApi, createCheckoutSandboxNotification } from '../payments/checkout-sandbox.mjs';
import { createSandboxWebhook, parseSignedPayment } from '../payments/sandbox-webhook.mjs';
import { createEupagoSandbox } from '../payments/eupago-sandbox.mjs';

const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const OID2 = 'ca991ca4-52ab-4b7e-b6cf-bc9d6480388f';
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', EUPAGO_SANDBOX_API_KEY: 'test-checkout-key',
  EUPAGO_SANDBOX_WEBHOOK_KEY: 'test-checkout-signature', EUPAGO_SANDBOX_CHANNEL: 'demo-checkout', FIREBASE_SANDBOX_SERVICE_ACCOUNT: 'injected' };
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 };
const claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };
const time = '2026-10-09T20:00:00Z';
function fixture() {
  const documents = new Map(); const payments = new Map(); const inspected = []; const sent = [];
  let currentClaims = claims, contextOverride = {}, source = null, createUnavailable = false, infoUnavailable = false,
    storeUnavailable = false, guardsInvalid = false, onCreate, clock = time, writes = 0, ref = 405000;
  const versioned = record => ({ record, version: '1' });
  const store = {
    read: async id => { if (storeUnavailable) throw Object.assign(new Error(), { code: 'storage_unavailable' }); return structuredClone(documents.get(id) || null); },
    create: async (id, record) => {
      if (documents.has(id)) throw Object.assign(new Error(), { code: 'conflict' });
      const next = versioned(structuredClone(record)); documents.set(id, next); writes++; return structuredClone(next);
    },
    replace: async (id, record, expected, guards = []) => {
      if (storeUnavailable) throw Object.assign(new Error(), { code: 'storage_unavailable' });
      if (guardsInvalid && guards.length || documents.get(id)?.version !== expected) throw Object.assign(new Error(), { code: 'conflict' });
      const next = { record: structuredClone(record), version: String(Number(expected) + 1) };
      documents.set(id, next); writes++; return structuredClone(next);
    },
    context: async received => ({ context: { uid: received.sub, emailVerified: received.email_verified, ...contextOverride }, guards: [{ verify: 'test-eligibility' }] }),
    sourceRegistration: async () => ({ data: structuredClone(source) }),
    list: async () => ({ records: [...documents.values()].map(d => structuredClone(d.record)), truncated: false }),
  };
  const storeFactory = options => { assert.equal(options.uid, 'admin'); assert.equal(options.projectId, 'circ-coimbra'); return store; };
  const providerFactory = options => createEupagoSandbox({ ...options, fetchImpl: async (url, options) => {
    assert.ok(url.startsWith('https://sandbox.eupago.pt/clientes/rest_api/'));
    assert.equal(options.headers.Authorization, `ApiKey ${env.EUPAGO_SANDBOX_API_KEY}`);
    const body = JSON.parse(options.body);
    if (url.endsWith('/create')) {
      sent.push(body);
      const method = url.includes('/mbway/') ? 'mbway' : 'multibanco';
      const reference = String(++ref); const entity = method === 'mbway' ? '10045' : '82142';
      payments.set(reference, { reference, entity, identifier: body.id, value: body.valor, method, state: 'pendente' });
      if (onCreate) await onCreate(reference);
      if (createUnavailable) throw Object.assign(new Error('secret transport details'), { name: 'TimeoutError' });
      return Response.json({ sucesso: true, referencia: reference, ...(method === 'multibanco' ? { entidade: entity } : {}) });
    }
    assert.ok(url.endsWith('/multibanco/info'));
    inspected.push(body);
    if (infoUnavailable) throw new Error('secret provider');
    const payment = payments.get(body.referencia);
    if (!payment) return Response.json({ sucesso: false });
    return Response.json({ sucesso: true, estado: 0, estado_referencia: payment.state, referencia: payment.reference,
      entidade: payment.entity, identificador: payment.identifier });
  } });
  const api = createCheckoutSandboxApi({ verify: async () => currentClaims, storeFactory, providerFactory, now: () => clock });
  const webhook = createSandboxWebhook({ checkoutHandler: createCheckoutSandboxNotification({ storeFactory, providerFactory,
    tokenProvider: async () => 'injected-service-token', now: () => clock }) });
  const request = (path = '', body, headers = {}) => new Request(`https://circ.local/api/checkout/sandbox/${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer token', Origin: 'https://circ.local',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const call = (path, body, headers) => api(request(path, body, headers), env);
  const newSession = () => call('sessions', { id: SID, source: 'new' });
  const quote = async (chosen = selection) => {
    const response = await call(`sessions/${SID}/quote`, { selection: chosen });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); return response.json();
  };
  const create = async (chosen = selection, method = 'mbway', id = OID) => {
    const q = await quote(chosen);
    return call(`sessions/${SID}/orders`, { id, selection: chosen, stamp: q.stamp, method,
      ...(method === 'mbway' ? { phone: '911111111' } : {}), sandboxAcknowledged: true });
  };
  const payload = reference => {
    const p = payments.get(reference);
    return { channel: { name: env.EUPAGO_SANDBOX_CHANNEL }, transaction: { entity: p.entity, reference: p.reference,
      identifier: p.identifier, method: p.method === 'mbway' ? 'MW:PT' : 'PC:PT', amount: { value: p.value.toFixed(2), currency: 'EUR' },
      date: '2026-10-09T20:00:00', status: 'Paid', trid: String(20000000 + Number(reference)) } };
  };
  const sendPayload = (data, signature) => {
    const body = JSON.stringify(data);
    return webhook(new Request('https://circ.local/api/payments/sandbox/notifications/YWRtaW4', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': signature ?? createHmac('sha256', env.EUPAGO_SANDBOX_WEBHOOK_KEY).update(body).digest('base64') }, body }), env);
  };
  const notify = reference => sendPayload(payload(reference));
  return { call, api, request, newSession, quote, create, notify, payload, sendPayload, sent, inspected, payments,
    record: () => structuredClone(documents.get(SID)?.record), writes: () => writes,
    paid: reference => { payments.get(reference).state = 'paga'; },
    modify: change => { const d = documents.get(SID); change(d.record); d.version = String(Number(d.version) + 1); },
    setContext: value => { contextOverride = value; }, setClaims: value => { currentClaims = value; },
    setSource: value => { source = value; }, setCreateUnavailable: value => { createUnavailable = value; },
    setInfoUnavailable: value => { infoUnavailable = value; }, setStoreUnavailable: value => { storeUnavailable = value; },
    setGuardsInvalid: value => { guardsInvalid = value; }, setOnCreate: value => { onCreate = value; }, setTime: value => { clock = value; },
  };
}
async function start(method = 'mbway', chosen = selection) {
  const f = fixture(); assert.equal((await f.newSession()).status, 201);
  assert.equal((await f.create(chosen, method)).status, 201); return f;
}
async function complete(f, reference = f.record().orders.at(-1).reference) {
  f.paid(reference); const result = await f.notify(reference); assert.equal(result.status, 200, JSON.stringify(await result.clone().json())); return reference;
}
for (const method of ['mbway', 'multibanco']) test(`${method}: full server-price checkout, signed confirmation and atomic registration in sandbox`, async () => {
  const f = await start(method); const r = f.record();
  assert.equal(r.orders[0].amountCents, 19000); assert.equal(f.sent[0].valor, 190);
  assert.equal(r.registration, null); assert.equal(r.orders[0].status, 'pending');
  assert.equal(r.orders[0].entity, method === 'mbway' ? null : '82142');
  await complete(f);
  const paid = f.record(); assert.equal(paid.orders[0].status, 'confirmed');
  assert.equal(paid.orders[0].entity, method === 'mbway' ? '10045' : '82142');
  assert.ok(paid.orders[0].notification.verifiedAt);
  assert.deepEqual(paid.registration.entitlements, { congressMode: 'onsite', morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 });
  assert.equal(paid.kind, 'checkout-test'); assert.equal(paid.environment, 'sandbox');
  const visible = await (await f.call(`sessions/${SID}`)).json();
  assert.equal(visible.session.invoiceStatus, 'disabled_sandbox');
  assert.ok(!JSON.stringify(visible).includes('fingerprint')); assert.ok(!JSON.stringify(paid).includes('911111111'));
});
test('manual query indicating paid never confirms an order or a registration', async () => {
  const f = await start(); f.paid(f.record().orders[0].reference);
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/inspect`, {})).status, 200);
  assert.equal(f.record().registration, null); assert.equal(f.record().orders[0].status, 'pending');
  assert.equal(f.record().orders[0].providerState, 'paga');
  await complete(f); assert.equal(f.record().registration.status, 'confirmed');
});
test('same notification and concurrent replays do not apply courses/dinner twice', async () => {
  const f = await start(); const ref = f.record().orders[0].reference; f.paid(ref);
  const responses = await Promise.all([f.notify(ref), f.notify(ref), f.notify(ref)]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(f.record().registration.entitlements.dinnerQuantity, 2);
  const writes = f.writes(), queries = f.inspected.length;
  assert.deepEqual(await (await f.notify(ref)).json(), { received: true, duplicate: true });
  assert.equal(f.writes(), writes); assert.equal(f.inspected.length, queries);
});
test('supplementary checkout adds only new items and replays preserve aggregate quantities', async () => {
  const f = await start(); await complete(f);
  const added = { afternoonCourse: true, dinnerQuantity: 1 };
  assert.equal((await f.create(added, 'multibanco', OID2)).status, 201);
  assert.equal(f.record().orders[1].amountCents, 6500);
  const ref = await complete(f); await f.notify(ref);
  assert.deepEqual(f.record().registration.entitlements, { congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 3 });
  const duplicateCourse = await f.call(`sessions/${SID}/quote`, { selection: { morningCourse: true } });
  assert.equal(duplicateCourse.status, 400); assert.equal((await duplicateCourse.json()).error, 'course-already-owned');
});
test('dinner-only addition is supported after a confirmed checkout', async () => {
  const f = await start(); await complete(f);
  assert.equal((await f.create({ dinnerQuantity: 2 }, 'mbway', OID2)).status, 201);
  assert.equal(f.record().orders[1].amountCents, 6000); await complete(f);
  assert.equal(f.record().registration.entitlements.dinnerQuantity, 4);
});
test('idempotent creation sends only one provider request', async () => {
  const f = fixture(); await f.newSession(); const q = await f.quote();
  const body = { id: OID, selection, stamp: q.stamp, method: 'multibanco', sandboxAcknowledged: true };
  const results = await Promise.all([f.call(`sessions/${SID}/orders`, body), f.call(`sessions/${SID}/orders`, body)]);
  assert.ok(results.every(r => [200, 201, 409].includes(r.status))); assert.equal(f.sent.length, 1);
  assert.equal((await f.call(`sessions/${SID}/orders`, body)).status, 200); assert.equal(f.sent.length, 1);
  assert.equal((await f.call(`sessions/${SID}/orders`, { ...body, method: 'mbway', phone: '911111111' })).status, 409);
});
test('different concurrent order IDs cannot create two outstanding requests', async () => {
  const f = fixture(); await f.newSession(); const q = await f.quote();
  const body = { selection, stamp: q.stamp, method: 'multibanco', sandboxAcknowledged: true };
  const results = await Promise.all([f.call(`sessions/${SID}/orders`, { ...body, id: OID }), f.call(`sessions/${SID}/orders`, { ...body, id: OID2 })]);
  assert.ok(results.some(r => r.status === 201)); assert.ok(results.some(r => r.status === 409));
  assert.equal(f.sent.length, 1); assert.equal(f.record().orders.length, 1);
});
test('new-session retries reuse one persisted test, without overwriting later payment data', async () => {
  const f = await start();
  assert.equal((await f.newSession()).status, 200); assert.equal(f.record().orders.length, 1);
  assert.equal((await f.call('sessions', { id: SID, source: 'registration-copy' })).status, 409);
});
test('callbacks that overtake creation responses are not overwritten', async () => {
  const f = fixture(); await f.newSession();
  f.setOnCreate(async ref => { f.paid(ref); assert.equal((await f.notify(ref)).status, 200); });
  const response = await f.create(); assert.equal(response.status, 200);
  assert.equal(f.record().orders[0].status, 'confirmed'); assert.ok(f.record().registration);
});
test('a creation timeout after a successful callback never reverts the confirmation', async () => {
  const f = fixture(); await f.newSession(); f.setCreateUnavailable(true);
  f.setOnCreate(async ref => { f.paid(ref); await f.notify(ref); });
  assert.equal((await f.create()).status, 200); assert.equal(f.record().orders[0].status, 'confirmed');
});
test('a timeout retains the attempted order and a later signed callback safely recovers it', async () => {
  const f = fixture(); await f.newSession(); f.setCreateUnavailable(true);
  const response = await f.create(); assert.equal(response.status, 502);
  assert.equal(f.record().orders[0].status, 'creation_unknown'); assert.equal(f.record().orders[0].reference, null);
  assert.equal(f.sent.length, 1);
  const ref = [...f.payments.keys()][0]; await complete(f, ref);
  assert.equal(f.record().orders[0].status, 'confirmed'); assert.equal(f.sent.length, 1);
});
test('reference recovery verifies identifier and never confirms payment on its own', async () => {
  const f = fixture(); await f.newSession(); f.setCreateUnavailable(true); await f.create();
  const ref = [...f.payments.keys()][0]; f.paid(ref);
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/recover`, { reference: ref })).status, 200);
  assert.equal(f.record().orders[0].status, 'pending'); assert.equal(f.record().registration, null);
  assert.equal(f.sent.length, 1); await complete(f, ref);
});
test('provider mismatch in recovered reference is rejected', async () => {
  const f = fixture(); await f.newSession(); f.setCreateUnavailable(true); await f.create();
  const ref = [...f.payments.keys()][0]; f.payments.get(ref).identifier = 'a_different_identifier';
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/recover`, { reference: ref })).status, 409);
  assert.equal(f.record().orders[0].reference, null);
});
test('provider failure on a callback never grants entitlements and retry can recover', async () => {
  const f = await start(); const ref = f.record().orders[0].reference; f.paid(ref); f.setInfoUnavailable(true);
  assert.equal((await f.notify(ref)).status, 503); assert.equal(f.record().registration, null);
  f.setInfoUnavailable(false); await complete(f, ref);
});
test('storage failure never acknowledges or partially applies payment/registration', async () => {
  const f = await start(); const ref = f.record().orders[0].reference; f.paid(ref); f.setStoreUnavailable(true);
  assert.equal((await f.notify(ref)).status, 503); assert.equal(f.record().registration, null);
  assert.equal(f.record().orders[0].status, 'pending'); f.setStoreUnavailable(false); await complete(f, ref);
});
test('numeric API response code zero is not proof of payment', async () => {
  const f = await start(); const ref = f.record().orders[0].reference;
  f.payments.get(ref).state = undefined;
  assert.equal((await f.notify(ref)).status, 503); assert.equal(f.record().registration, null);
  assert.equal(f.record().orders[0].notification.verifiedAt, null);
});
test('closed requests can be retried, while a later payment cannot duplicate registration rights', async () => {
  const f = await start(); const old = f.record().orders[0].reference;
  f.payments.get(old).state = 'expirado';
  await f.call(`sessions/${SID}/orders/${OID}/inspect`, {}); assert.equal(f.record().orders[0].status, 'closed');
  assert.equal((await f.create(selection, 'mbway', OID2)).status, 201); await complete(f);
  f.paid(old); const late = await f.notify(old);
  assert.equal(late.status, 200); assert.equal((await late.json()).reviewRequired, true);
  assert.equal(f.record().orders[0].status, 'review_required'); assert.equal(f.record().registration.entitlements.dinnerQuantity, 2);
  assert.equal((await f.call(`sessions/${SID}/quote`, { selection: { dinnerQuantity: 1 } })).status, 409);
});
test('tampered or missing signature does no provider work', async () => {
  const f = await start(); const ref = f.record().orders[0].reference;
  for (const sig of ['', 'invalid', Buffer.alloc(32).toString('base64')]) assert.equal((await f.sendPayload(f.payload(ref), sig)).status, 401);
  assert.equal(f.inspected.length, 0); assert.equal(f.record().registration, null);
});
for (const [name, change] of [
  ['amount', p => { p.transaction.amount.value = '1.00'; }], ['currency', p => { p.transaction.amount.currency = 'USD'; }],
  ['method', p => { p.transaction.method = 'PC:PT'; }], ['channel', p => { p.channel.name = 'another-channel'; }],
  ['reference', p => { p.transaction.reference = '405999'; }], ['entity', p => { p.transaction.entity = '11111'; }],
  ['state', p => { p.transaction.status = 'Refund'; }], ['invalid date', p => { p.transaction.date = '2026-02-30T12:00:00'; }],
]) test(`signed mismatch: ${name} cannot confirm checkout`, async () => {
  const f = await start(); const ref = f.record().orders[0].reference; f.paid(ref); const p = f.payload(ref); change(p);
  assert.equal((await f.sendPayload(p)).status, 422); assert.equal(f.record().registration, null);
});
test('a different signed transaction cannot replace a confirmed receipt', async () => {
  const f = await start(); const ref = await complete(f); const p = f.payload(ref); p.transaction.trid = '99999999';
  assert.equal((await f.sendPayload(p)).status, 409); assert.notEqual(f.record().orders[0].notification.transactionId, '99999999');
});
test('server checks eligibility on quote and again before creation with atomic read guards', async () => {
  const f = fixture(); await f.newSession(); const chosen = { ...selection, profile: 'student' };
  assert.equal((await f.call(`sessions/${SID}/quote`, { selection: chosen })).status, 400);
  const profileName = 'Participante de Teste';
  f.setContext({ profileName, student: { userId: 'admin', eventId: 'circ-2027', academicYear: '2026/2027', profileName, status: 'approved' } });
  const q = await f.quote(chosen); assert.equal(q.quote.amountCents, 15500);
  f.setContext({});
  const body = { id: OID, selection: chosen, stamp: q.stamp, method: 'multibanco', sandboxAcknowledged: true };
  assert.equal((await f.call(`sessions/${SID}/orders`, body)).status, 400); assert.equal(f.sent.length, 0);
  const external = await f.quote(); f.setGuardsInvalid(true);
  assert.equal((await f.call(`sessions/${SID}/orders`, { ...body, selection, stamp: external.stamp })).status, 409);
  assert.equal(f.sent.length, 0);
});
test('ULS prices require all current server records', async () => {
  const f = fixture(); await f.newSession(); const chosen = { ...selection, profile: 'uls' };
  assert.equal((await f.call(`sessions/${SID}/quote`, { selection: chosen })).status, 400);
  const identity = { userId: 'admin', eventId: 'circ-2027', mec: '12345', nameKey: 'participante teste', method: 'mec-name-match' };
  f.setContext({ uls: { ...identity, status: 'matched' }, claim: identity, roster: { eventId: 'circ-2027', nameKey: identity.nameKey, active: true } });
  const q = await f.quote(chosen); assert.equal(q.quote.amountCents, 13500);
});
test('a price-period change requires a new accepted summary', async () => {
  const f = fixture(); await f.newSession(); const q = await f.quote(); f.setTime('2027-02-02T12:00:00Z');
  const r = await f.call(`sessions/${SID}/orders`, { id: OID, selection, stamp: q.stamp, method: 'multibanco', sandboxAcknowledged: true });
  assert.equal(r.status, 409); assert.equal((await r.json()).error, 'quote-changed'); assert.equal(f.sent.length, 0);
});
test('request bodies cannot choose prices, owner, environment or eligibility', async () => {
  const f = fixture(); await f.newSession(); const q = await f.quote();
  const body = { id: OID, selection, stamp: q.stamp, method: 'multibanco', sandboxAcknowledged: true };
  for (const extra of [{ amountCents: 1 }, { owner: 'someone_else' }, { environment: 'production' }, { studentApproved: true }]) {
    assert.equal((await f.call(`sessions/${SID}/orders`, { ...body, ...extra })).status, 400);
  }
  for (const bad of [{ ...selection, amountCents: 1 }, { ...selection, dinnerQuantity: -1 }, { ...selection, dinnerQuantity: 0.5 }, { ...selection, dinnerQuantity: 21 }, { ...selection, morningCourse: 'true' }]) {
    assert.equal((await f.call(`sessions/${SID}/quote`, { selection: bad })).status, 400);
  }
  assert.equal((await f.call(`sessions/${SID}/orders`, { ...body, sandboxAcknowledged: false })).status, 400);
  assert.equal(f.sent.length, 0);
});
test('online and courses-only choices use the real catalogue', async () => {
  const f = fixture(); await f.newSession();
  const virtual = await f.quote({ profile: 'external', congressMode: 'virtual' }); assert.equal(virtual.quote.amountCents, 6000);
  const courses = await f.quote({ profile: 'external', congressMode: 'courses-only', morningCourse: true }); assert.equal(courses.quote.amountCents, 3500);
  assert.equal((await f.call(`sessions/${SID}/quote`, { selection: { profile: 'external', congressMode: 'courses-only' } })).status, 400);
});
test('an existing paid voucher registration can seed a read-only test and receive sandbox add-ons', async () => {
  const f = fixture(); const original = { id: 'circ-2027-admin', eventId: 'circ-2027', userId: 'admin', status: 'confirmed',
    payment: { status: 'paid', method: 'company-voucher' }, selection: { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } };
  f.setSource(original);
  assert.equal((await f.call('sessions', { id: SID, source: 'registration-copy' })).status, 201);
  assert.equal(f.record().registration.source, 'read_only_snapshot');
  assert.equal((await f.create({ morningCourse: true }, 'mbway')).status, 201); await complete(f);
  assert.equal(f.record().registration.entitlements.morningCourse, true); assert.equal(original.selection.morningCourse, false);
});
test('unpaid or test registrations are not imported as real paid snapshots', async () => {
  for (const fields of [{ isTest: true }, { testMode: true }, { status: 'pending' }, { payment: { status: 'pending' } }, { userId: 'other' }]) {
    const f = fixture(); f.setSource({ id: 'circ-2027-admin', eventId: 'circ-2027', userId: 'admin', status: 'confirmed', payment: { status: 'paid' }, selection: { profile: 'external' }, ...fields });
    assert.equal((await f.call('sessions', { id: SID, source: 'registration-copy' })).status, 400); assert.equal(f.record(), undefined);
  }
});
test('verified administrator and same-origin writes are mandatory', async () => {
  const f = fixture();
  for (const identity of [{ ...claims, email: 'participant@example.invalid' }, { ...claims, email_verified: false }]) {
    f.setClaims(identity); assert.equal((await f.newSession()).status, 403);
  }
  f.setClaims(claims);
  assert.equal((await f.call('sessions', { id: SID, source: 'new' }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await f.call('config', undefined, { Authorization: '' })).status, 401);
  assert.equal(f.sent.length, 0);
});
test('sandbox checkout parser is opt-in and does not relax the original EUR 1 gateway test', async () => {
  const f = await start(); const body = JSON.stringify(f.payload(f.record().orders[0].reference));
  const sig = createHmac('sha256', env.EUPAGO_SANDBOX_WEBHOOK_KEY).update(body).digest('base64');
  assert.throws(() => parseSignedPayment(Buffer.from(body), sig, env.EUPAGO_SANDBOX_WEBHOOK_KEY, env.EUPAGO_SANDBOX_CHANNEL));
  const event = parseSignedPayment(Buffer.from(body), sig, env.EUPAGO_SANDBOX_WEBHOOK_KEY, env.EUPAGO_SANDBOX_CHANNEL, { allowOrders: true });
  assert.equal(event.id, SID); assert.equal(event.amountCents, 19000);
  const p = JSON.parse(body); p.transaction.identifier = `circ_test_${SID.replaceAll('-', '')}`; const legacy = JSON.stringify(p);
  assert.throws(() => parseSignedPayment(Buffer.from(legacy), createHmac('sha256', env.EUPAGO_SANDBOX_WEBHOOK_KEY).update(legacy).digest('base64'), env.EUPAGO_SANDBOX_WEBHOOK_KEY, env.EUPAGO_SANDBOX_CHANNEL, { allowOrders: true }));
});
test('test history and reload preserve the same confirmed record without provider calls', async () => {
  const f = await start(); await complete(f); const queries = f.inspected.length;
  const list = await (await f.call('sessions')).json(); assert.equal(list.sessions[0].confirmed, true);
  const data = await (await f.call(`sessions/${SID}`)).json(); assert.equal(data.session.orders[0].status, 'confirmed');
  assert.equal(f.inspected.length, queries); assert.equal(f.sent.length, 1);
});
