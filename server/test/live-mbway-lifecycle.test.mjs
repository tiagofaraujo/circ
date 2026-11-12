import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { createCheckoutLiveStore, readLivePaymentById } from '../payments/checkout-live-store.mjs';
import { createEupagoLive } from '../payments/eupago-live.mjs';
import { createLivePaymentWebhook } from '../payments/live-webhook.mjs';
import { liveDataStamp } from '../payments/live-pilot-contract.mjs';
import { quotePrimary, quoteSupplementary } from '../payments/quote.mjs';

// Every provider and storage request below stays inside these in-memory fetch
// implementations. Existing MB WAY orders are seeded without changing the
// fiscal mapping registry or bypassing the creation gate.
const oldId = '11111111-1111-4111-8111-111111111111';
const nextId = '22222222-2222-4222-8222-222222222222';
const thirdId = '33333333-3333-4333-8333-333333333333';
const primaryId = '44444444-4444-4444-8444-444444444444';
const uid = 'participant';
const registrationId = `circ-2027-${uid}`;
const owner = { sub: uid, email: 'participant@example.test', email_verified: true };
const admin = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };
const env = {
  FIREBASE_PROJECT_ID: 'circ-test', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'synthetic-service-account',
  LIVE_CHECKOUT_ENABLED: 'true', LIVE_MBWAY_ENABLED: 'true', LIVE_MBWAY_VALIDATION_ONLY: 'true',
  EUPAGO_LIVE_CHANNEL: 'CIRC 2027', EUPAGO_LIVE_API_KEY: 'synthetic-key', EUPAGO_LIVE_WEBHOOK_KEY: 'synthetic-hmac',
  TOCONLINE_OAUTH_CLIENT_ID: 'synthetic-client', TOCONLINE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
  TOCONLINE_OAUTH_URL: 'https://oauth.example.test', TOCONLINE_API_URL: 'https://api.example.test/api',
  TOCONLINE_SESSION_KEY: 'synthetic-session-key',
};
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const extras = { morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 };
const billing = { customer_business_name: 'Participante Exemplo', customer_tax_registration_number: '203821432',
  customer_address_detail: 'Rua Exemplo 1', customer_postcode: '3000-001', customer_city: 'Coimbra', customer_country: 'PT' };

function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) } };
  assert.fail(`unsupported fixture value: ${typeof value}`);
}
function decode(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, decode(entry)]));
  assert.fail('unsupported fixture field');
}
function memoryFirestore() {
  const root = 'projects/circ-test/databases/(default)/documents';
  const documents = new Map();
  const calls = [];
  let version = 0;
  const name = path => `${root}/${path}`;
  const put = (path, data) => {
    const fullName = path.startsWith(`${root}/`) ? path : name(path);
    const doc = { name: fullName, fields: encode(data).mapValue.fields, updateTime: `version-${++version}` };
    documents.set(fullName, doc);
    return doc;
  };
  const get = path => {
    const doc = documents.get(name(path));
    return doc ? decode({ mapValue: { fields: doc.fields } }) : null;
  };
  const fetchImpl = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    assert.equal(url.origin, 'https://firestore.googleapis.com');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: url.toString(), method: options.method, body });
    if (options.method === 'GET') {
      const doc = documents.get(url.pathname.replace(/^\/v1\//, ''));
      return doc ? Response.json(doc) : new Response(null, { status: 404 });
    }
    if (options.method === 'PATCH') {
      const docName = url.pathname.replace(/^\/v1\//, '');
      const existing = documents.get(docName);
      const expected = url.searchParams.get('currentDocument.updateTime');
      if (!existing || (expected && existing.updateTime !== expected)) return new Response(null, { status: 409 });
      return Response.json(put(docName, decode({ mapValue: { fields: body.fields } })));
    }
    if (url.pathname.endsWith(':batchGet')) {
      const rows = body.documents.map(docName => documents.has(docName)
        ? { found: structuredClone(documents.get(docName)) } : { missing: docName });
      if (rows.length) rows[0].transaction = 'memory-transaction';
      return Response.json(rows);
    }
    if (url.pathname.endsWith(':runQuery')) {
      const query=body.structuredQuery;
      assert.deepEqual(query.from,[{collectionId:'registrations'}]);
      assert.equal(query.where.fieldFilter.field.fieldPath,'payment.status');
      assert.equal(query.where.fieldFilter.value.stringValue,'paid');
      if(body.transaction)assert.equal(body.transaction,'memory-transaction');
      const after=query.startAt?.values?.[0]?.referenceValue;
      const rows=[...documents.values()].filter(doc=>doc.name.startsWith(`${root}/registrations/`)
        &&decode({mapValue:{fields:doc.fields}}).payment?.status==='paid'&&(!after||doc.name>after))
        .sort((a,b)=>a.name.localeCompare(b.name)).slice(0,query.limit);
      return Response.json(rows.map(document=>({document:structuredClone(document)})));
    }
    if (url.pathname.endsWith(':rollback')) return Response.json({});
    if (url.pathname.endsWith(':commit')) {
      // Validate every precondition before applying any of the writes.
      for (const write of body.writes) {
        const docName = write.update?.name || write.delete;
        const existing = documents.get(docName);
        const condition = write.currentDocument || {};
        if ((condition.exists === false && existing) || (condition.exists === true && !existing)
          || (condition.updateTime && existing?.updateTime !== condition.updateTime)) return new Response(null, { status: 409 });
      }
      const writeResults = body.writes.map(write => {
        if (write.delete) { documents.delete(write.delete); return { updateTime: `version-${++version}` }; }
        const data = decode({ mapValue: { fields: write.update.fields } });
        return { updateTime: put(write.update.name, data).updateTime };
      });
      return Response.json({ writeResults });
    }
    assert.fail(`unexpected Firestore request: ${options.method} ${url.pathname}`);
  };
  return { get, put, remove: path => documents.delete(name(path)), fetchImpl, calls };
}

function fixture({ supplementary = false, providerState = 'pendente', billingBlocked = false, identity = owner } = {}) {
  const uid = identity.sub;
  const registrationId = `circ-2027-${uid}`;
  const context = { uid, emailVerified: true, guards: [] };
  const db = memoryFirestore();
  let clock = '2026-11-15T12:10:00Z';
  const providerStates = new Map([['700000001', providerState]]);
  const providerCalls = [];
  const fiscalCalls = [];
  let inspectHook = null;
  const primaryQuote = quotePrimary(selection, context, null, new Date('2026-11-15T12:00:00Z'));
  const registration = { eventId: 'circ-2027', userId: uid, registrationKey: `circ-2027:${uid}`, primaryRegistration: true,
    participantName: 'Participante Exemplo', participantEmail: identity.email, registrationType: 'CIRC 2027 · Presencial',
    isTest: false, testMode: false, status: supplementary ? 'confirmed' : 'submitted', selection: primaryQuote.selection,
    entitlements: { congressMode: supplementary ? 'onsite' : '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
    payment: { orderId: supplementary ? primaryId : oldId, status: supplementary ? 'paid' : 'pending',
      method: supplementary ? 'multibanco' : 'mbway', reference: supplementary ? '600000001' : '700000001',
      amountCents: primaryQuote.amountCents, currency: 'EUR' },
    documentCount: supplementary ? 1 : 0, addOnOrderCount: supplementary ? 1 : 0,
    ...(supplementary ? { openSupplementaryOrderId: oldId, paidSupplementaryOrderIds: [] } : {}),
    createdAt: '2026-11-15T12:00:00Z', updatedAt: '2026-11-15T12:00:00Z',
  };
  const quote = supplementary ? quoteSupplementary(extras, context, { ...registration, id: registrationId }, new Date('2026-11-15T12:00:00Z')) : primaryQuote;
  const payment = { id: oldId, kind: quote.kind, eventId: 'circ-2027', registrationId, userId: uid,
    environment: 'production', provider: 'eupago', method: 'mbway', status: 'pending',
    amountCents: quote.amountCents, currency: 'EUR', identifier: `circ_live_${oldId.replaceAll('-', '')}`,
    reference: '700000001', entity: null, transactionId: null, paidAt: null, quote,
    billingSnapshot: billingBlocked ? { ...billing, customer_tax_registration_number: '' } : billing,
    methodFingerprint: liveDataStamp({ method: 'mbway', phone: '911111111' }),
    createdAt: '2026-11-15T12:00:00Z', updatedAt: '2026-11-15T12:00:00Z', expiresAt: '2026-11-15T12:04:00Z' };
  db.put(`registrations/${registrationId}`, registration);
  db.put(`payments/${oldId}`, payment);
  db.put(`users/${uid}`, { name: 'Participante Exemplo', taxNumber: '203821432', billingAddress: 'Rua Exemplo 1',
    billingPostalCode: '3000-001', billingCity: 'Coimbra', billingCountry: 'Portugal' });
  const providerFactory = ({ apiKey }) => createEupagoLive({ apiKey, fetchImpl: async (url, options) => {
    assert.match(url, /^https:\/\/clientes\.eupago\.pt\/clientes\/rest_api\//);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    providerCalls.push({ url, body });
    if (url.endsWith('/info')) {
      const p = [oldId, nextId, thirdId].map(id => db.get(`payments/${id}`)).find(order => order?.reference === body.referencia);
      assert.ok(p, 'inspection must refer to a stored order');
      const state = providerStates.get(p.reference) ?? 'pendente';
      if (state instanceof Error) throw state;
      if (inspectHook) await inspectHook(p);
      return Response.json({ sucesso: true, referencia: p.reference, identificador: p.identifier,
        ...(p.entity ? { entidade: p.entity } : {}), estado_referencia: state });
    }
    assert.match(url, /\/(multibanco|mbway)\/create$/);
    const reference = String(800000000 + providerCalls.filter(call => call.url.endsWith('/create')).length);
    providerStates.set(reference, 'pendente');
    return Response.json({ sucesso: true, referencia: reference, ...(url.endsWith('/multibanco/create') ? { entidade: '12345' } : {}) });
  } });
  const storeFactory = args => createCheckoutLiveStore({ ...args, fetchImpl: db.fetchImpl });
  const fiscalClient = { issueFinalizedSalesDocument: async (_env, payload) => {
    fiscalCalls.push(structuredClone(payload));
    return { providerDocumentId: 'synthetic-document-1', providerDocumentNo: 'FR EXEMPLO/1' };
  } };
  const webhook = createLivePaymentWebhook({ tokenProvider: async () => 'synthetic-service-token', storeFactory, providerFactory,
    paymentLookup: args => readLivePaymentById({ ...args, fetchImpl: db.fetchImpl }), fiscalClient, now: () => clock });
  const call = (path, data, { claims = identity, origin = 'https://circ.test', configuration = env } = {}) => {
    const api = createCheckoutLiveApi({ verify: async () => claims, tokenProvider: async () => 'synthetic-service-token',
      storeFactory, providerFactory, now: () => clock });
    return api(new Request(`https://circ.test/api/checkout/live${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer synthetic-session', Origin: origin, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }), configuration);
  };
  const reconcile = (options = {}) => call(`/orders/${oldId}/mbway-reconcile`, {}, options);
  const existingRequest = (phone = '911111111') => ({ id: oldId, selection: supplementary ? extras : selection,
    method: 'mbway', phone, stamp: liveDataStamp(quote), billingStamp: liveDataStamp(payment.billingSnapshot) });
  async function replace(id = nextId) {
    const prefix = supplementary ? '/supplementary' : '';
    const qResponse = await call(`${prefix}/quote`, { selection: supplementary ? extras : selection });
    assert.equal(qResponse.status, 200, await qResponse.clone().text());
    const q = await qResponse.json();
    return call(`${prefix}/orders`, { id, replacesOrderId: oldId, selection: supplementary ? extras : selection, method: 'multibanco', stamp: q.stamp, billingStamp: q.billingStamp });
  }
  const callback = async ({ id = oldId, method = 'MW:PT', signatureValid = true, amountCents, fees, date = '2026-11-15T12:02:00Z' } = {}) => {
    const p = db.get(`payments/${id}`);
    const text = JSON.stringify({ channel: { name: 'CIRC 2027' }, transaction: { identifier: p.identifier, method,
      reference: p.reference, ...(p.entity ? { entity: p.entity } : {}), trid: '7001', status: 'Paid',
      amount: { value: (amountCents ?? p.amountCents) / 100, currency: 'EUR' }, fees, date } });
    const signature = createHmac('sha256', signatureValid ? env.EUPAGO_LIVE_WEBHOOK_KEY : 'invalid-key').update(text).digest('base64');
    return webhook(new Request('https://circ.test/api/payments/live/notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': signature }, body: text,
    }), env);
  };
  return { db, call, reconcile, replace, callback, existingRequest, providerCalls, fiscalCalls,
    setState: (value, reference = '700000001') => providerStates.set(reference, value), setClock: value => { clock = value; },
    onInspect: hook => { inspectHook = hook; },
    startFresh: () => { db.remove(`registrations/${registrationId}`); db.remove(`payments/${oldId}`); },
    payment: (id = oldId) => db.get(`payments/${id}`), registration: () => db.get(`registrations/${registrationId}`),
    job: (id = oldId) => db.get(`documents/${id}`) };
}

test('admin validation creates a real-mode MB WAY order through the PSP adapter and signed callback issues one OU FR', async () => {
  const f = fixture({ identity: admin });
  f.startFresh();
  const qResponse = await f.call('/quote', { selection }); assert.equal(qResponse.status, 200, await qResponse.clone().text());
  const q = await qResponse.json();
  const request = { id: oldId, selection, method: 'mbway', phone: '911111111', stamp: q.stamp, billingStamp: q.billingStamp };
  const created = await f.call('/orders', request); assert.equal(created.status, 201, await created.clone().text());
  const { order } = await created.json();
  assert.equal(order.status, 'pending'); assert.equal(order.method, 'mbway'); assert.equal(order.amountCents, 9500);
  assert.equal(f.providerCalls.length, 1); assert.match(f.providerCalls[0].url, /\/mbway\/create$/);
  assert.equal(f.providerCalls[0].body.alias, '911111111'); assert.equal(f.providerCalls[0].body.failOver, '0');
  assert.equal(f.providerCalls[0].body.id, f.payment().identifier);
  assert.doesNotMatch(JSON.stringify(order), /911111111|methodFingerprint/);
  assert.doesNotMatch(JSON.stringify(f.payment()), /911111111/);
  assert.equal((await f.call('/orders', request)).status, 200); assert.equal(f.providerCalls.length, 1);
  f.setState('paga', order.reference); f.setClock('2026-11-15T12:12:00Z');
  const notification = { date: '2026-11-15T12:11:00Z', fees: { value: '0.83640', currency: 'EUR' } };
  const paid = await Promise.all([f.callback(notification), f.callback(notification)]);
  assert.ok(paid.some(response => response.status === 200));
  assert.ok(paid.every(response => [200, 503].includes(response.status)));
  assert.equal(f.payment().status, 'paid'); assert.equal(f.payment().fiscalStatus, 'issued');
  assert.equal(f.payment().providerFeeMicros, undefined);
  const fee = f.db.get(`paymentFees/${oldId}`);
  assert.deepEqual(fee, { eventId: 'circ-2027', environment: 'production', currency: 'EUR', provider: 'eupago', method: 'mbway',
    transactionId: '7001', providerFeeMicros: 836400, providerFeeSource: 'eupago-webhook' });
  assert.equal(f.registration().status, 'confirmed'); assert.equal(f.registration().documentCount, 1);
  assert.equal(f.fiscalCalls.length, 1); assert.equal(f.fiscalCalls[0].payment_mechanism, 'OU');
  assert.match(f.fiscalCalls[0].notes, /MB\s?WAY/i);
  assert.equal(f.job().status, 'issued');
  const repeated = await f.callback({ ...notification, fees: { value: '0.90', currency: 'EUR' } });
  assert.equal(repeated.status, 200); assert.equal((await repeated.json()).duplicate, true);
  assert.deepEqual(f.db.get(`paymentFees/${oldId}`), fee);
  assert.equal(f.fiscalCalls.length, 1); assert.equal(f.registration().documentCount, 1);
});

test('administrator-only validation gate prevents public MB WAY creation before any PSP request', async () => {
  const f = fixture(); f.startFresh();
  const preview = await f.call('/quote', { selection }); assert.equal(preview.status, 200);
  const q = await preview.json();
  const response = await f.call('/orders', { id: oldId, selection, method: 'mbway', phone: '911111111', stamp: q.stamp, billingStamp: q.billingStamp });
  assert.ok([403, 409].includes(response.status)); assert.equal(f.providerCalls.length, 0);
  assert.equal(f.registration(), null); assert.equal(f.payment(), null);
});

test('existing MB WAY UUID recovers after reload and never creates a second PSP request; changed phone conflicts', async () => {
  const f = fixture();
  const recovered = await f.call('/primary-order', undefined, { configuration: { ...env, LIVE_CHECKOUT_ENABLED: 'false' } });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).order.id, oldId);
  const repeated = await f.call('/orders', f.existingRequest());
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).order.status, 'pending');
  const changed = await f.call('/orders', f.existingRequest('922222222'));
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error, 'idempotency-conflict');
  assert.equal(f.providerCalls.length, 0);
  assert.equal(f.payment().status, 'pending');
});

test('elapsed local MB WAY timer and unrecognized numeric PSP state never authorize a retry', async () => {
  for (const providerState of ['pendente', 1, 'unknown']) {
    const f = fixture({ providerState });
    const response = await f.reconcile();
    assert.equal(response.status, 200, await response.clone().text());
    const { order } = await response.json();
    assert.equal(order.status, 'pending'); assert.equal(order.canRetry, false);
    assert.equal(f.payment().status, 'pending'); assert.equal(f.registration().payment.orderId, oldId);
    assert.equal(f.fiscalCalls.length, 0); assert.equal(f.providerCalls.length, 1);
  }
});

test('provider-paid lookup without the signed paid callback does not confirm finances or allow another charge', async () => {
  const f = fixture({ providerState: 'paga' });
  const response = await f.reconcile(); assert.equal(response.status, 200, await response.clone().text());
  const { order } = await response.json(); assert.equal(order.canRetry, false);
  assert.notEqual(f.payment().status, 'paid'); assert.notEqual(f.registration().status, 'confirmed');
  assert.equal(f.job(), null); assert.equal(f.fiscalCalls.length, 0);
});

test('only verified owner or admin with matching origin may reconcile MB WAY', async () => {
  for (const options of [
    { claims: { sub: 'stranger', email: 'stranger@example.test', email_verified: true } },
    { claims: { ...owner, email_verified: false } }, { origin: 'https://untrusted.test' },
  ]) {
    const f = fixture({ providerState: 'expirada' });
    const response = await f.reconcile(options);
    assert.ok([403, 404].includes(response.status)); assert.equal(f.providerCalls.length, 0);
    assert.equal(f.payment().status, 'pending');
  }
  const f = fixture({ providerState: 'expirada' });
  const response = await f.reconcile({ claims: admin, configuration: { ...env, LIVE_CHECKOUT_ENABLED: 'false' } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).order.canRetry, true);
  assert.equal(f.payment().status, 'expired'); assert.equal(f.fiscalCalls.length, 0);
});

for (const [providerState, terminalStatus] of [['expirada', 'expired'], ['cancelada', 'cancelled']]) {
  test(`PSP ${providerState} closes the original primary and permits exactly one new UUID`, async () => {
    const f = fixture({ providerState });
    const response = await f.reconcile();
    assert.equal(response.status, 200, await response.clone().text());
    const { order } = await response.json();
    assert.equal(order.canRetry, true); assert.equal(order.status, terminalStatus);
    assert.equal(f.payment().status, terminalStatus);
    assert.equal(f.registration().status, 'submitted');
    assert.equal(f.registration().payment.closedUnpaidStatus, terminalStatus);
    const repeated = await f.call('/orders', f.existingRequest());
    assert.equal(repeated.status, 200); assert.equal((await repeated.json()).order.status, terminalStatus);
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0);
    const replacements = await Promise.all([f.replace(nextId), f.replace(thirdId)]);
    assert.deepEqual(replacements.map(result => result.status).sort(), [201, 409]);
    const current = f.registration();
    assert.ok([nextId, thirdId].includes(current.payment.orderId));
    assert.equal(current.payment.status, 'pending'); assert.equal(current.status, 'submitted');
    assert.equal(f.payment().status, terminalStatus);
    assert.equal(f.payment().replacementOrderId, current.payment.orderId);
    assert.equal((await (await f.call(`/orders/${oldId}`)).json()).order.canRetry, false);
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 1);
    assert.equal(f.fiscalCalls.length, 0);
  });
}

test('a closed supplementary MB WAY releases its slot and counter without changing primary payment or paid entitlements', async () => {
  const f = fixture({ supplementary: true, providerState: 'expirada' });
  const before = f.registration();
  const first = await f.reconcile(); assert.equal(first.status, 200, await first.clone().text());
  let current = f.registration();
  assert.ok(!current.openSupplementaryOrderId); assert.equal(current.addOnOrderCount, 0);
  assert.deepEqual(current.payment, before.payment); assert.deepEqual(current.entitlements, before.entitlements);
  assert.equal(current.documentCount, 1); assert.equal(current.status, 'confirmed');
  const again = await f.reconcile(); assert.equal(again.status, 200); assert.equal(f.registration().addOnOrderCount, 0);
  const replacement = await f.replace(); assert.equal(replacement.status, 201, await replacement.clone().text());
  current = f.registration(); assert.equal(current.openSupplementaryOrderId, nextId); assert.equal(current.addOnOrderCount, 1);
  assert.deepEqual(current.payment, before.payment); assert.deepEqual(current.entitlements, before.entitlements);
  assert.equal(f.fiscalCalls.length, 0);
});

test('a paid or already confirmed primary can never be replaced after a terminal MB WAY history entry', async () => {
  const f = fixture({ providerState: 'expirada' });
  assert.equal((await f.reconcile()).status, 200);
  const registration = f.registration();
  f.db.put(`registrations/${registrationId}`, { ...registration, status: 'confirmed', payment: { ...registration.payment, status: 'paid' } });
  const response = await f.call('/orders', { ...f.existingRequest(), id: nextId, method: 'multibanco', phone: undefined });
  assert.equal(response.status, 409); assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0);
  assert.equal(f.registration().payment.status, 'paid'); assert.equal(f.payment(nextId), null);
});

test('late signed payment on a closed old order is retained for review without overwriting a new pending order', async () => {
  const f = fixture({ providerState: 'expirada' });
  assert.equal((await f.reconcile()).status, 200); assert.equal((await f.replace()).status, 201);
  const before = f.registration(); const currentPayment = f.payment(nextId);
  f.setState('paga');
  const response = await f.callback({ date: '2026-11-15T12:11:00Z' });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).reviewRequired, true);
  assert.equal(f.payment().status, 'review_required'); assert.equal(f.payment().transactionId, '7001');
  assert.deepEqual(f.registration().payment, before.payment); assert.deepEqual(f.registration().entitlements, before.entitlements);
  assert.equal(f.registration().status, 'submitted'); assert.deepEqual(f.payment(nextId), currentPayment);
  assert.equal(f.fiscalCalls.length, 0); assert.equal(f.job(), null);
});

test('a late paid notification on an archived closed supplement stays in review and leaves a fresh registration intact', async () => {
  const f = fixture({ supplementary: true, providerState: 'cancelada' });
  const registrationId = f.payment().registrationId;
  assert.equal((await f.reconcile()).status, 200);
  const archived = { ...f.payment(), registrationArchiveId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    registrationArchivedAt: '2026-11-15T12:10:00Z' };
  f.startFresh();
  f.db.put(`payments/${oldId}`, archived);
  const quoteResponse = await f.call('/quote', { selection });
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  const created = await f.call('/orders', { id: nextId, selection, method: 'mbway', phone: '911111111',
    stamp: quote.stamp, billingStamp: quote.billingStamp },
  { configuration: { ...env, LIVE_MBWAY_VALIDATION_EMAILS: owner.email } });
  assert.equal(created.status, 201, await created.clone().text());
  const newRegistration = structuredClone(f.registration()), newPayment = structuredClone(f.payment(nextId));
  f.setState('paga');
  const response = await f.callback({ date: '2026-11-15T12:11:00Z' });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).reviewRequired, true);
  assert.equal(f.payment().registrationId, registrationId);
  assert.equal(f.payment().registrationArchiveId, archived.registrationArchiveId);
  assert.equal(f.payment().registrationArchivedAt, archived.registrationArchivedAt);
  assert.equal(f.payment().status, 'review_required');
  assert.equal(f.payment().transactionId, '7001');
  assert.deepEqual(f.registration(), newRegistration);
  assert.deepEqual(f.payment(nextId), newPayment);
  assert.equal(f.fiscalCalls.length, 0); assert.equal(f.job(), null);
});

test('valid HMAC and provider-paid MB WAY confirms finances even when frozen billing prevents an FR payload', async () => {
  for (const supplementary of [false, true]) {
    const f = fixture({ supplementary, providerState: 'paga', billingBlocked: true });
    const originalPrimary = structuredClone(f.registration().payment);
    const response = await f.callback();
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(f.payment().status, 'paid'); assert.equal(f.payment().transactionId, '7001');
    assert.equal(f.payment().fiscalStatus, 'review_required'); assert.equal(f.job().status, 'review_required');
    assert.equal(f.registration().status, 'confirmed'); assert.equal(f.registration().entitlements.congressMode, 'onsite');
    assert.equal(f.registration().documentCount, supplementary ? 1 : 0);
    if (supplementary) {
      assert.deepEqual(f.registration().payment, originalPrimary);
      assert.equal(f.registration().entitlements.morningCourse, true); assert.equal(f.registration().entitlements.dinnerQuantity, 1);
      assert.deepEqual(f.registration().paidSupplementaryOrderIds, [oldId]);
    } else assert.equal(f.registration().payment.status, 'paid');
    assert.equal(f.fiscalCalls.length, 0);
    const duplicate = await f.callback(); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(f.fiscalCalls.length, 0); assert.equal(f.registration().entitlements.dinnerQuantity, supplementary ? 1 : 0);
  }
});

test('invalid signature, mismatched amount or nonpaid PSP state never confirm an MB WAY payment', async () => {
  for (const [providerState, callbackOptions, expectedStatus] of [
    ['paga', { signatureValid: false }, 401], ['paga', { amountCents: 9501 }, 422], ['pendente', {}, 503],
  ]) {
    const f = fixture({ providerState });
    const response = await f.callback(callbackOptions); assert.equal(response.status, expectedStatus);
    assert.equal(f.payment().status, 'pending'); assert.equal(f.registration().status, 'submitted');
    assert.equal(f.fiscalCalls.length, 0); assert.equal(f.job(), null);
  }
});

test('a paid MB WAY course basket whose student approval was revoked stays in eligibility review without fiscal issuing', async () => {
  const f = fixture({ providerState: 'paga' });
  const studentQuote = quotePrimary({ ...selection, profile: 'student', morningCourse: true }, {
    uid, emailVerified: true, profileName: 'Participante Exemplo', student: { userId: uid, eventId: 'circ-2027',
      academicYear: '2026/2027', status: 'approved', profileName: 'Participante Exemplo' },
  }, null, new Date('2026-11-15T12:00:00Z'));
  f.db.put(`payments/${oldId}`, { ...f.payment(), quote: studentQuote, amountCents: studentQuote.amountCents });
  const registration = f.registration();
  f.db.put(`registrations/${registrationId}`, { ...registration, selection: studentQuote.selection,
    payment: { ...registration.payment, amountCents: studentQuote.amountCents } });
  // The current server context has no studentVerifications approval, although
  // the persisted order was legitimately quoted before that approval changed.
  const response = await f.callback(); assert.equal(response.status, 200);
  assert.equal((await response.json()).reviewRequired, true);
  assert.equal(f.payment().status, 'review_required'); assert.equal(f.payment().reviewReason, 'payment-eligibility-review');
  assert.equal(f.payment().transactionId, '7001'); assert.equal(f.registration().status, 'submitted');
  assert.equal(f.registration().entitlements.morningCourse, false); assert.equal(f.job(), null); assert.equal(f.fiscalCalls.length, 0);
});

test('replacement rechecks the PSP and refuses paid, pending, error or unknown states without fabricating payment evidence', async () => {
  for (const supplementary of [false, true]) {
    for (const state of ['paga', 'pendente', 'erro', 'unknown']) {
      const f = fixture({ supplementary, providerState: 'expirada' });
      assert.equal((await f.reconcile()).status, 200);
      const original = f.registration();
      f.setState(state);
      const response = await f.replace();
      assert.equal(response.status, 409, `${supplementary ? 'supplementary' : 'primary'} / ${state}: ${await response.clone().text()}`);
      const result = await response.json();
      assert.equal(result.error, 'replacement-not-closed'); assert.equal(result.order.canRetry, false);
      assert.equal(f.payment().status, 'review_required'); assert.equal(f.payment().transactionId, null); assert.equal(f.payment().paidAt, null);
      assert.equal(f.payment().replacementOrderId, undefined); assert.equal(f.payment(nextId), null);
      assert.deepEqual(f.registration().entitlements, original.entitlements);
      assert.equal(f.registration().payment.orderId, original.payment.orderId);
      assert.equal(f.registration().payment.status, original.payment.status);
      if (supplementary) assert.deepEqual(f.registration().payment, original.payment);
      assert.equal((await (await f.call(`/orders/${oldId}`)).json()).order.canRetry, false);
      assert.equal(f.providerCalls.filter(call => call.url.endsWith('/info')).length, 2);
      assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0);
      assert.equal(f.fiscalCalls.length, 0); assert.equal(f.job(), null);
    }
  }
});

test('reconciling an already closed MB WAY order queries the PSP again and revokes retry when closure no longer holds', async () => {
  for (const state of ['paga', 'pendente', 'erro', 'unknown']) {
    const f = fixture({ providerState: 'expirada' });
    const first = await f.reconcile(); assert.equal(first.status, 200); assert.equal((await first.json()).order.canRetry, true);
    f.setState(state);
    const response = await f.reconcile(); assert.equal(response.status, 200, await response.clone().text());
    const { order } = await response.json(); assert.equal(order.canRetry, false); assert.equal(order.status, 'review_required');
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/info')).length, 2);
    assert.equal(f.payment().transactionId, null); assert.equal(f.payment().paidAt, null);
    assert.equal(f.registration().status, 'submitted'); assert.equal(f.registration().entitlements.congressMode, '');
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0); assert.equal(f.fiscalCalls.length, 0);
  }
});

test('a transport failure during the fresh replacement lookup blocks a new charge and preserves all stored history', async () => {
  for (const supplementary of [false, true]) {
    const f = fixture({ supplementary, providerState: 'expirada' });
    assert.equal((await f.reconcile()).status, 200);
    const payment = f.payment(); const registration = f.registration();
    f.setState(new Error('synthetic PSP transport failure'));
    const response = await f.replace(); assert.equal(response.status, 503, await response.clone().text());
    const result = await response.json(); assert.equal(result.error, 'replacement-check-unavailable'); assert.equal(result.order.canRetry, false);
    assert.deepEqual(f.payment(), payment); assert.deepEqual(f.registration(), registration); assert.equal(f.payment(nextId), null);
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0); assert.equal(f.fiscalCalls.length, 0);
  }
});

test('a closed supplement recovers without a browser UUID and requires its predecessor before consuming the saved pointer atomically', async () => {
  const f = fixture({ supplementary: true, providerState: 'expirada' });
  const primaryPayment = f.registration().payment;
  assert.equal((await f.reconcile()).status, 200);
  assert.equal(f.registration().lastClosedSupplementaryOrderId, oldId); assert.ok(!f.registration().openSupplementaryOrderId);
  const recovered = await f.call('/supplementary-order'); assert.equal(recovered.status, 200);
  const { order } = await recovered.json(); assert.equal(order.id, oldId); assert.equal(order.status, 'expired'); assert.equal(order.canRetry, true);
  const preview = await f.call('/supplementary/quote', { selection: extras }); assert.equal(preview.status, 200);
  const q = await preview.json();
  const missingLink = await f.call('/supplementary/orders', { id: nextId, selection: extras, method: 'multibanco', stamp: q.stamp, billingStamp: q.billingStamp });
  assert.equal(missingLink.status, 409); assert.equal((await missingLink.json()).error, 'replacement-required');
  assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0); assert.equal(f.payment(nextId), null);
  assert.equal(f.registration().lastClosedSupplementaryOrderId, oldId);
  const replacement = await f.replace(); assert.equal(replacement.status, 201, await replacement.clone().text());
  assert.ok(!f.registration().lastClosedSupplementaryOrderId); assert.equal(f.registration().openSupplementaryOrderId, nextId);
  assert.equal(f.registration().addOnOrderCount, 1); assert.equal(f.payment().replacementOrderId, nextId);
  assert.deepEqual(f.registration().payment, primaryPayment);
  assert.equal((await (await f.call('/supplementary-order')).json()).order.id, nextId);
  assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 1); assert.equal(f.fiscalCalls.length, 0);
});

test('concurrent payment evidence arriving during the replacement lookup invalidates the old-payment CAS before any PSP creation', async () => {
  for (const supplementary of [false, true]) {
    const f = fixture({ supplementary, providerState: 'expirada' });
    assert.equal((await f.reconcile()).status, 200);
    const registration = f.registration();
    f.onInspect(payment => {
      f.db.put(`payments/${oldId}`, { ...payment, status: 'review_required', retryAllowed: false,
        transactionId: '9001', paidAt: '2026-11-15T12:11:00Z', reviewReason: 'concurrent-paid-evidence' });
    });
    const response = await f.replace(); assert.equal(response.status, 409, await response.clone().text());
    assert.equal(f.payment().transactionId, '9001'); assert.equal(f.payment().status, 'review_required');
    assert.equal(f.payment().replacementOrderId, undefined); assert.equal(f.payment(nextId), null);
    assert.deepEqual(f.registration(), registration);
    assert.equal(f.providerCalls.filter(call => call.url.endsWith('/create')).length, 0); assert.equal(f.fiscalCalls.length, 0);
    assert.equal((await (await f.call(`/orders/${oldId}`)).json()).order.canRetry, false);
  }
});
