import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { createLiveInvoicePdfApi } from '../payments/live-invoice-pdf.mjs';
import { liveDataStamp } from '../payments/live-pilot-contract.mjs';
import { livePaymentMethods } from '../payments/live-payment-methods.mjs';
import { quotePrimary } from '../payments/quote.mjs';

// Synthetic persisted records and fake providers only. These tests do not
// archive an account, create a real charge or issue a fiscal document.
const oldId = '11111111-1111-4111-8111-111111111111';
const newId = '22222222-2222-4222-8222-222222222222';
const oldSupplementId = '33333333-3333-4333-8333-333333333333';
const uid = 'history-participant';
const registrationId = `circ-2027-${uid}`;
const archiveId = `${registrationId}-archived-20261101`;
const identity = { sub: uid, email: 'araujotiagofc@gmail.com', email_verified: true };
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const env = {
  FIREBASE_PROJECT_ID: 'circ-test', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'synthetic-service', LIVE_CHECKOUT_ENABLED: 'true',
  LIVE_MBWAY_ENABLED: 'true', LIVE_MBWAY_VALIDATION_ONLY: 'true', LIVE_MBWAY_VALIDATION_EMAILS: 'araujotiagofc@gmail.com',
  EUPAGO_LIVE_CHANNEL: 'CIRC 2027', EUPAGO_LIVE_API_KEY: 'synthetic-key', EUPAGO_LIVE_WEBHOOK_KEY: 'synthetic-signing-key',
  TOCONLINE_OAUTH_CLIENT_ID: 'synthetic-client', TOCONLINE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
  TOCONLINE_OAUTH_URL: 'https://oauth.example.test', TOCONLINE_API_URL: 'https://api.example.test/api', TOCONLINE_SESSION_KEY: 'synthetic-session',
};
const billing = { customer_business_name: 'Participante Exemplo', customer_tax_registration_number: '203821432',
  customer_address_detail: 'Rua Exemplo 1', customer_postcode: '3000-001', customer_city: 'Coimbra', customer_country: 'PT' };
const clone = value => structuredClone(value);
function fixture({ claims = identity, canonical = null } = {}) {
  const quote = quotePrimary(selection, { uid, emailVerified: true }, null, new Date('2026-11-01T12:00:00Z'));
  const archivedRegistration = { userId: uid, eventId: 'circ-2027', primaryRegistration: true, isTest: false, testMode: false,
    status: 'confirmed', selection: clone(quote.selection), entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
    payment: { orderId: oldId, status: 'paid', method: 'multibanco', amountCents: 9500, currency: 'EUR', reference: '700000001' },
    documentCount: 1, addOnOrderCount: 0 };
  const historicalPayment = { id: oldId, userId: uid, eventId: 'circ-2027', registrationId, registrationArchiveId: archiveId,
    environment: 'production', provider: 'eupago', kind: 'primary', method: 'multibanco', status: 'paid',
    amountCents: 9500, currency: 'EUR', identifier: `circ_live_${oldId.replaceAll('-', '')}`, reference: '700000001', entity: '12345',
    transactionId: '7001', paidAt: '2026-11-01T09:00:00Z', fiscalStatus: 'issued', fiscalDocumentId: 321,
    fiscalDocumentNo: 'FR EXEMPLO/1', quote, billingSnapshot: billing };
  const historicalDocument = { id: oldId, userId: uid, eventId: 'circ-2027', registrationId, registrationArchiveId: archiveId,
    environment: 'production', provider: 'toconline', type: 'invoice_receipt', paymentMethod: 'multibanco', status: 'issued',
    amountCents: 9500, providerDocumentId: 321, providerDocumentNo: 'FR EXEMPLO/1', issuedAt: '2026-11-01T09:01:00Z' };
  const payments = new Map([[oldId, { data: clone(historicalPayment), version: 1 }]]);
  const documents = new Map([[oldId, { data: clone(historicalDocument), version: 1 }]]);
  let registration = clone(canonical), registrationVersion = canonical ? 1 : 0;
  let creates = 0, fallbackReads = 0, reservations = 0, pdfReads = 0;
  const conflict = () => { throw Object.assign(new Error('conflict'), { code: 'conflict' }); };
  const snapshot = (rows, id) => {
    const row = rows.get(id);
    return { data: row ? clone(row.data) : null, version: row ? String(row.version) : null };
  };
  const store = {
    registrationId,
    capacity:async()=>({limits:{onsite:400,morningCourse:170,afternoonCourse:170},paid:{onsite:0,morningCourse:0,afternoonCourse:0},remaining:{onsite:400,morningCourse:170,afternoonCourse:170}}),
    registration: async () => ({ data: clone(registration), version: registration ? String(registrationVersion) : null }),
    payment: async id => snapshot(payments, id), document: async id => snapshot(documents, id),
    // Deliberately expose the archived shadow to verify that recovery never
    // treats it as the active registration after the canonical row is removed.
    primaryPayment: async () => { fallbackReads++; return { id: oldId, ...snapshot(payments, oldId) }; },
    context: async () => ({ uid: claims.sub, emailVerified: true, guards: [] }),
    profile: async () => ({ data: { name: 'Participante Exemplo', taxNumber: '203821432', billingAddress: 'Rua Exemplo 1',
      billingPostalCode: '3000-001', billingCity: 'Coimbra', billingCountry: 'Portugal' } }),
    createPendingPrimary: async ({ orderId, registration: next, payment }) => {
      if (registration || payments.has(orderId)) conflict();
      assert.equal(next.userId, claims.sub); assert.equal(payment.userId, claims.sub);
      reservations++; registration = clone(next); registrationVersion++;
      payments.set(orderId, { data: clone(payment), version: 1 });
      return { registrationVersion: String(registrationVersion), paymentVersion: '1' };
    },
    updatePendingProvider: async ({ orderId, payment, paymentVersion, registration: next, registrationVersion: expected }) => {
      const row = payments.get(orderId);
      if (!row || String(row.version) !== paymentVersion || String(registrationVersion) !== expected) conflict();
      payments.set(orderId, { data: clone(payment), version: row.version + 1 });
      registration = clone(next); registrationVersion++;
      return { paymentVersion: String(row.version + 1), registrationVersion: String(registrationVersion) };
    },
  };
  const api = createCheckoutLiveApi({ verify: async () => claims, tokenProvider: async () => 'synthetic-service-token', storeFactory: () => store,
    providerFactory: () => ({ createPayment: async payment => {
      creates++; assert.equal(payment.method, 'mbway'); assert.equal(payment.phone, '911111111');
      return { reference: '800000001', entity: null };
    } }), now: () => '2026-11-01T12:00:00Z' });
  const pdf = createLiveInvoicePdfApi({ verify: async () => claims, storeFactory: () => store,
    fiscalClient: { downloadSalesDocumentPdf: async (_env, providerId) => {
      pdfReads++; assert.equal(providerId, 321); return new TextEncoder().encode('%PDF-existing-original');
    } } });
  const request = (path, data) => new Request(`https://circ.test/api/checkout/live${path}`, {
    method: data === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer synthetic-user-token', Origin: 'https://circ.test',
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const call = (path, data, configuration = env) => api(request(path, data), configuration);
  const oldRequest = { id: oldId, selection, method: 'multibanco', stamp: liveDataStamp(quote), billingStamp: liveDataStamp(billing) };
  async function newRequest() {
    const response = await call('/quote', { selection }); assert.equal(response.status, 200, await response.clone().text());
    const q = await response.json();
    return { id: newId, selection, method: 'mbway', phone: '911111111', stamp: q.stamp, billingStamp: q.billingStamp };
  }
  return { call, newRequest, oldRequest, store,
    pdf: () => pdf(request(`/orders/${oldId}/invoice.pdf`), { ...env, LIVE_CHECKOUT_ENABLED: 'false' }),
    putPayment: (id, data) => payments.set(id, { data: clone(data), version: 1 }),
    setRegistration: data => { registration = clone(data); registrationVersion++; },
    state: () => ({ registration: clone(registration), historicalRegistration: clone(archivedRegistration),
      payments: [...payments].map(([id, row]) => [id, clone(row.data)]), documents: [...documents].map(([id, row]) => [id, clone(row.data)]),
      creates, fallbackReads, reservations, pdfReads }),
  };
}

test('an archived paid order remains explicitly historical and its original PDF stays available without changing stored financial records', async () => {
  const f = fixture(); const before = f.state();
  const response = await f.call(`/orders/${oldId}`); assert.equal(response.status, 200);
  const { order } = await response.json(); assert.equal(order.historicalRegistration, true);
  assert.equal(order.status, 'paid'); assert.equal(order.fiscalStatus, 'issued'); assert.equal(order.fiscalDocumentId, 321);
  const pdf = await f.pdf(); assert.equal(pdf.status, 200); assert.equal(await pdf.text(), '%PDF-existing-original');
  assert.equal(pdf.headers.get('Content-Type'), 'application/pdf');
  const after = f.state(); assert.deepEqual(after.payments, before.payments); assert.deepEqual(after.documents, before.documents);
  assert.deepEqual(after.historicalRegistration, before.historicalRegistration); assert.equal(after.registration, null);
  assert.equal(after.creates, 0); assert.equal(after.reservations, 0); assert.equal(after.pdfReads, 1);
});

test('missing canonical registration returns404 and never falls back to a historical paid primary or supplement', async () => {
  const f = fixture();
  for (const path of ['/primary-order', '/supplementary-order']) {
    const response = await f.call(path); assert.equal(response.status, 404); assert.equal((await response.json()).error, 'not-found');
  }
  assert.equal(f.state().fallbackReads, 0); assert.equal(f.state().creates, 0); assert.equal(f.state().registration, null);
});

test('reusing an archived UUID returns historical-order before idempotent checkout recovery and never calls a provider', async () => {
  const f = fixture();
  const response = await f.call('/orders', f.oldRequest); assert.equal(response.status, 409, await response.clone().text());
  const result = await response.json(); assert.equal(result.error, 'historical-order'); assert.equal(result.order.id, oldId);
  assert.equal(result.order.historicalRegistration, true); assert.equal(result.order.status, 'paid');
  assert.equal(f.state().creates, 0); assert.equal(f.state().reservations, 0); assert.equal(f.state().registration, null);
});

test('the same verified allowlisted UID creates one new MB WAY registration while its old payment, archive and FR remain immutable', async () => {
  const f = fixture(); const before = f.state();
  const config = await f.call('/config'); assert.equal(config.status, 200); assert.ok((await config.json()).methods.includes('mbway'));
  const data = await f.newRequest(); const response = await f.call('/orders', data);
  assert.equal(response.status, 201, await response.clone().text());
  const order = (await response.json()).order; assert.equal(order.id, newId); assert.equal(order.status, 'pending'); assert.equal(order.method, 'mbway');
  assert.notEqual(order.historicalRegistration, true);
  const repeated = await f.call('/orders', data); assert.equal(repeated.status, 200);
  const recovered = await f.call('/primary-order'); assert.equal(recovered.status, 200); assert.equal((await recovered.json()).order.id, newId);
  const after = f.state(); assert.equal(after.creates, 1); assert.equal(after.reservations, 1);
  assert.equal(after.registration.userId, uid); assert.equal(after.registration.status, 'submitted'); assert.equal(after.registration.documentCount, 0);
  assert.equal(after.registration.payment.orderId, newId); assert.equal(after.registration.payment.status, 'pending');
  assert.deepEqual(after.payments.find(([id]) => id === oldId), before.payments[0]); assert.deepEqual(after.documents, before.documents);
  assert.deepEqual(after.historicalRegistration, before.historicalRegistration);
  assert.equal((await (await f.call(`/orders/${oldId}`)).json()).order.historicalRegistration, true);
  assert.equal((await f.pdf()).status, 200); assert.equal(f.state().pdfReads, 1);
  const diagnosis = await f.call('/diagnostics'); assert.equal(diagnosis.status, 403); assert.equal((await diagnosis.json()).error, 'admin-required');
});

test('supplementary recovery refuses a stale pointer into an archived registration', async () => {
  const f = fixture();
  const archivedPayment = f.state().payments[0][1];
  f.putPayment(oldSupplementId, { ...archivedPayment, id: oldSupplementId, kind: 'supplementary', quote: { ...archivedPayment.quote, kind: 'supplementary' } });
  f.setRegistration({ ...f.state().historicalRegistration, payment: { ...f.state().historicalRegistration.payment, orderId: newId },
    openSupplementaryOrderId: oldSupplementId });
  const response = await f.call('/supplementary-order'); assert.equal(response.status, 404, await response.clone().text());
  assert.equal(f.state().creates, 0); assert.equal(f.state().reservations, 0);
});

test('the MB WAY validation allowlist requires a verified exact email and never grants administration', async () => {
  const other = fixture({ claims: { ...identity, email: 'other@example.test' } });
  const config = await other.call('/config'); assert.equal(config.status, 200); assert.ok(!(await config.json()).methods.includes('mbway'));
  const response = await other.call('/orders', await other.newRequest()); assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'payment-method-unavailable'); assert.equal(other.state().creates, 0);
  assert.equal(other.state().registration, null);
  const unverified = fixture({ claims: { ...identity, email_verified: false } });
  assert.equal((await unverified.call('/config')).status, 403);
  assert.equal((await unverified.call('/orders', { id: newId, selection, method: 'mbway', phone: '911111111' })).status, 403);
  assert.equal(unverified.state().creates, 0); assert.equal(unverified.state().registration, null);
  assert.ok(livePaymentMethods(env, { isAdmin: false, emailVerified: true, email: ' ARAUJOTIAGOFC@GMAIL.COM ' }).includes('mbway'));
  assert.ok(!livePaymentMethods(env, { isAdmin: false, emailVerified: false, email: identity.email }).includes('mbway'));
  assert.ok(!livePaymentMethods(env, { isAdmin: false, emailVerified: true, email: `other+${identity.email}` }).includes('mbway'));
});

test('the published launch configuration allows a verified ordinary participant to use MB WAY while Stripe remains restricted', async () => {
  // Exercise the deployed flags through the real checkout API, with synthetic
  // credentials and providers only. Configuration reads never create payments.
  const published = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')).vars;
  const production = { ...env, ...published,
    STRIPE_LIVE_SECRET_KEY: 'rk_live_synthetic12345678', STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_synthetic12345678' };
  const participant = fixture({ claims: { ...identity, email: 'ordinary@example.test' } });
  const config = await participant.call('/config', undefined, production);
  assert.equal(config.status, 200);
  const result = await config.json();
  assert.equal(result.enabled, true);
  assert.equal(result.publicOpen, true);
  assert.deepEqual(result.methods, ['multibanco', 'mbway', 'bank_transfer']);
  assert.equal(participant.state().creates, 0);

  const created = await participant.call('/orders', await participant.newRequest(), production);
  assert.equal(created.status, 201, await created.clone().text());
  assert.equal((await created.json()).order.method, 'mbway');
  assert.equal(participant.state().creates, 1);
  assert.equal(participant.state().registration.payment.status, 'pending');

  const stripe = fixture({ claims: { ...identity, email: 'ordinary@example.test' } });
  const request = { ...await stripe.newRequest(), method: 'stripe_card' }; delete request.phone;
  const refused = await stripe.call('/orders', request, production);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error, 'payment-method-unavailable');
  assert.equal(stripe.state().creates, 0);

  const unverified = fixture({ claims: { ...identity, email_verified: false } });
  assert.equal((await unverified.call('/config', undefined, production)).status, 403);
  assert.equal(unverified.state().creates, 0);
});
