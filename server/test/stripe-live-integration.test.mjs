import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { createStripeLiveWebhook } from '../payments/stripe-live-webhook.mjs';
import { createStripeLive, STRIPE_LIVE_FLOW, STRIPE_LIVE_WEBHOOK_PATH } from '../payments/stripe-live.mjs';
import { createLiveFiscalResumeApi } from '../payments/live-fiscal-resume.mjs';

// Real application/domain/provider-adapter code, versioned in-memory storage,
// fake Stripe HTTP and fake fiscal issuing. No request leaves this fixture.
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const uid = 'stripe-participant';
const registrationId = `circ-2027-${uid}`;
const owner = { sub: uid, email: 'araujotiagofc@gmail.com', email_verified: true };
const env = {
  FIREBASE_PROJECT_ID: 'circ-test', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'synthetic-service', LIVE_CHECKOUT_ENABLED: 'true',
  LIVE_STRIPE_ENABLED: 'true', LIVE_STRIPE_VALIDATION_ONLY: 'true', LIVE_STRIPE_VALIDATION_EMAILS: owner.email,
  STRIPE_LIVE_SECRET_KEY: 'rk_live_circ-unit-fixture-01', STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_unitfixture02',
  EUPAGO_LIVE_CHANNEL: 'CIRC 2027', EUPAGO_LIVE_API_KEY: 'synthetic-key', EUPAGO_LIVE_WEBHOOK_KEY: 'synthetic-hmac',
  TOCONLINE_OAUTH_CLIENT_ID: 'synthetic-client', TOCONLINE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
  TOCONLINE_OAUTH_URL: 'https://oauth.example.test', TOCONLINE_API_URL: 'https://api.example.test/api', TOCONLINE_SESSION_KEY: 'synthetic-session',
};
const primary = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const extras = { morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 };
const clone = value => structuredClone(value);
function fixture({ identity = owner, funding = 'credit', wallet = null, clock = '2026-11-15T12:00:00Z', configuration = env } = {}) {
  const payments = new Map(), jobs = new Map(), sessions = new Map();
  let registration = null, registrationVersion = 0, currentTime = clock, instrumentStatus = 200, creationFailure = false;
  const httpCalls = [], fiscalCalls = [];
  const failConflict = () => { throw Object.assign(new Error('conflict'), { code: 'conflict' }); };
  const snapshot = (rows, id) => {
    const row = rows.get(id); return { data: row ? clone(row.data) : null, version: row ? String(row.version) : null };
  };
  const put = (rows, id, data) => rows.set(id, { data: clone(data), version: Number(rows.get(id)?.version || 0) + 1 });
  const sameReg = version => registration && String(registrationVersion) === version;
  const store = {
    registrationId,
    capacity:async()=>({limits:{onsite:400,morningCourse:170,afternoonCourse:170},paid:{onsite:0,morningCourse:0,afternoonCourse:0},remaining:{onsite:400,morningCourse:170,afternoonCourse:170}}),
    registration: async () => ({ data: clone(registration), version: registration ? String(registrationVersion) : null }),
    payment: async id => snapshot(payments, id), document: async id => snapshot(jobs, id),
    primaryPayment: async () => {
      const found = [...payments].find(([, row]) => row.data.kind === 'primary' && !row.data.registrationArchiveId);
      return found ? { id: found[0], ...snapshot(payments, found[0]) } : null;
    },
    profile: async () => ({ data: { name: 'Participante Exemplo', taxNumber: '203821432', billingAddress: 'Rua Exemplo 1',
      billingPostalCode: '3000-001', billingCity: 'Coimbra', billingCountry: 'Portugal' } }),
    context: async () => ({ uid: identity.sub, emailVerified: true, guards: [] }),
    createPendingPrimary: async ({ orderId, payment, registration: next }) => {
      if (registration || payments.has(orderId)) failConflict();
      registration = clone(next); registrationVersion++; put(payments, orderId, payment);
      return { registrationVersion: String(registrationVersion), paymentVersion: String(payments.get(orderId).version) };
    },
    createPendingSupplementary: async ({ orderId, payment, registration: next, registrationVersion: version }) => {
      if (!sameReg(version) || registration.openSupplementaryOrderId || payments.has(orderId)) failConflict();
      registration = clone(next); registrationVersion++; put(payments, orderId, payment);
      return { registrationVersion: String(registrationVersion), paymentVersion: String(payments.get(orderId).version) };
    },
    updatePendingProvider: async ({ orderId, payment, paymentVersion, registration: next, registrationVersion: version }) => {
      if (!sameReg(version) || String(payments.get(orderId)?.version) !== paymentVersion) failConflict();
      registration = clone(next); registrationVersion++; put(payments, orderId, payment);
      return { registrationVersion: String(registrationVersion), paymentVersion: String(payments.get(orderId).version) };
    },
    updatePayment: async (id, payment, version) => {
      if (String(payments.get(id)?.version) !== version) failConflict();
      put(payments, id, payment); return snapshot(payments, id);
    },
    confirmPrimaryPaid: async ({ orderId, payment, paymentVersion, registration: next, registrationVersion: version, fiscalJob }) => {
      if (!sameReg(version) || String(payments.get(orderId)?.version) !== paymentVersion || jobs.has(orderId)) failConflict();
      registration = clone(next); registrationVersion++; put(payments, orderId, payment); put(jobs, orderId, fiscalJob);
    },
    finalizeFiscalResult: async ({ orderId, payment, paymentVersion, registration: next, registrationVersion: version, document, documentVersion }) => {
      if (!sameReg(version) || String(payments.get(orderId)?.version) !== paymentVersion || String(jobs.get(orderId)?.version) !== documentVersion) failConflict();
      registration = clone(next); registrationVersion++; put(payments, orderId, payment); put(jobs, orderId, document);
    },
  };
  const stripeFactory = ({ apiKey }) => createStripeLive({ apiKey, fetchImpl: async (rawUrl, options) => {
    const url = new URL(rawUrl); assert.equal(url.origin, 'https://api.stripe.com');
    httpCalls.push({ path: url.pathname, method: options.method, headers: options.headers, body: options.body });
    if (options.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const body = new URLSearchParams(options.body), metadata = {};
      for (const [key, value] of body) {
        const field = /^metadata\[([^\]]+)\]$/.exec(key);
        if (field) { metadata[field[1]] = value; assert.equal(body.get(`payment_intent_data[metadata][${field[1]}]`), value); }
      }
      assert.equal(metadata.integration, STRIPE_LIVE_FLOW); assert.equal(metadata.environment, 'production');
      let amount = 0;
      for (let index = 0; body.has(`line_items[${index}][quantity]`); index++) {
        amount += Number(body.get(`line_items[${index}][quantity]`)) * Number(body.get(`line_items[${index}][price_data][unit_amount]`));
      }
      const id = `cs_live_${metadata.order_id.replaceAll('-', '')}`;
      const session = { id, object: 'checkout.session', livemode: true, mode: 'payment', currency: 'eur',
        client_reference_id: body.get('client_reference_id'), amount_total: amount, status: 'open', payment_status: 'unpaid',
        payment_intent: null, payment_method_types: ['card'], metadata, created: Math.floor(Date.parse(currentTime) / 1000),
        expires_at: Math.floor(Date.parse(currentTime) / 1000) + 1800, url: `https://checkout.stripe.com/c/pay/${id}` };
      sessions.set(id, session);
      if (creationFailure) throw new Error('synthetic lost creation response');
      return Response.json(session);
    }
    if (options.method === 'GET' && url.pathname.startsWith('/v1/checkout/sessions/')) {
      const session = sessions.get(url.pathname.split('/').at(-1)); assert.ok(session);
      return Response.json(session);
    }
    if (options.method === 'GET' && url.pathname.startsWith('/v1/payment_intents/')) {
      if (instrumentStatus !== 200) return Response.json({ error: { message: 'synthetic restricted-key permission failure' } }, { status: instrumentStatus });
      const intentId = url.pathname.split('/').at(-1), session = [...sessions.values()].find(row => row.payment_intent === intentId);
      assert.ok(session); assert.equal(url.searchParams.get('expand[]'), 'payment_method');
      return Response.json({ id: intentId, object: 'payment_intent', livemode: true, status: 'succeeded', currency: 'eur',
        amount: session.amount_total, amount_received: session.amount_total, metadata: session.metadata, created: session.created,
        payment_method: { id: 'pm_synthetic12345678', object: 'payment_method', livemode: true, type: 'card',
          card: { funding, wallet: wallet ? { type: wallet } : null, brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } } });
    }
    assert.fail(`unexpected Stripe request: ${options.method} ${url.pathname}`);
  } });
  const fiscalClient = { issueFinalizedSalesDocument: async (_env, payload) => {
    fiscalCalls.push(clone(payload)); return { providerDocumentId: String(900 + fiscalCalls.length), providerDocumentNo: `FR EXEMPLO/${fiscalCalls.length}` };
  } };
  const api = createCheckoutLiveApi({ verify: async () => identity, tokenProvider: async () => 'synthetic-service-token', storeFactory: () => store,
    stripeFactory, providerFactory: () => { assert.fail('Stripe checkout must not contact EuPago'); }, now: () => currentTime });
  const webhook = createStripeLiveWebhook({ tokenProvider: async () => 'synthetic-service-token', storeFactory: () => store,
    paymentLookup: async ({ orderId }) => snapshot(payments, orderId), providerFactory: stripeFactory, fiscalClient, now: () => currentTime });
  const request = (path, data) => new Request(`https://circ.test/api/checkout/live${path}`, { method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer synthetic-session', Origin: 'https://circ.test', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const call = (path, data) => api(request(path, data), configuration);
  const resume = (id = ids[0], claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true }) => {
    const handler = createLiveFiscalResumeApi({ verify: async () => claims, tokenProvider: async () => 'synthetic-service-token',
      storeFactory: () => store, paymentLookup: async ({ orderId }) => snapshot(payments, orderId), stripeFactory, fiscalClient, now: () => currentTime });
    return handler(request(`/orders/${id}/fiscal-resume`, { confirmation: 'RETOMAR FATURACAO AUTORIZADA' }), configuration);
  };
  async function orderBody(id, selection = primary, kind = 'primary') {
    const prefix = kind === 'primary' ? '' : '/supplementary';
    const response = await call(`${prefix}/quote`, { selection }); assert.equal(response.status, 200, await response.clone().text());
    const quote = await response.json(); return { id, selection, method: 'stripe_card', stamp: quote.stamp, billingStamp: quote.billingStamp };
  }
  async function create(id = ids[0], selection = primary, kind = 'primary') {
    const body = await orderBody(id, selection, kind), prefix = kind === 'primary' ? '' : '/supplementary';
    const response = await call(`${prefix}/orders`, body); assert.equal(response.status, 201, await response.clone().text());
    return { body, order: (await response.json()).order };
  }
  const rawSession = id => sessions.get(payments.get(id)?.data.reference);
  function markPaid(id = ids[0]) {
    const session = rawSession(id); assert.ok(session);
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${id.replaceAll('-', '')}` });
  }
  async function notify(id = ids[0], { type = 'checkout.session.completed', eventChanges = {}, snapshotChanges = {}, validSignature = true, created } = {}) {
    const snapshot = { ...clone(rawSession(id)), ...clone(snapshotChanges) };
    const event = { object: 'event', id: `evt_${id.replaceAll('-', '')}`, livemode: true, type,
      created: created ?? Math.floor(Date.parse(currentTime) / 1000), data: { object: snapshot }, ...clone(eventChanges) };
    const body = JSON.stringify(event), timestamp = String(Math.floor(Date.parse(currentTime) / 1000));
    const signature = createHmac('sha256', validSignature ? configuration.STRIPE_LIVE_WEBHOOK_SECRET : 'whsec_unitfixture03')
      .update(`${timestamp}.${body}`).digest('hex');
    return webhook(new Request(`https://circ.test${STRIPE_LIVE_WEBHOOK_PATH}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body }), configuration);
  }
  return { call, create, orderBody, notify, markPaid, rawSession, resume, store, httpCalls, fiscalCalls,
    payment: id => snapshot(payments, id).data, job: id => snapshot(jobs, id).data, registration: () => clone(registration),
    patchPayment: (id, change) => put(payments, id, { ...payments.get(id).data, ...clone(change) }),
    patchJob: (id, change) => put(jobs, id, { ...jobs.get(id).data, ...clone(change) }),
    patchRegistration: change => { registration = { ...registration, ...clone(change) }; registrationVersion++; },
    setTime: value => { currentTime = value; }, setInstrumentStatus: value => { instrumentStatus = value; },
    setFunding: value => { funding = value; }, failCreation: () => { creationFailure = true; } };
}

test('production Stripe checkout persists one hosted session per UUID and a signed paid credit-card event issues one claimed FR', async () => {
  const f = fixture(); const { body, order } = await f.create();
  assert.equal(order.method, 'stripe_card'); assert.equal(order.status, 'pending'); assert.equal(order.stripe.status, 'open');
  assert.match(order.stripe.url, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_live_/);
  assert.equal(f.payment(ids[0]).provider, 'stripe'); assert.equal(f.payment(ids[0]).userId, uid);
  assert.equal((await f.call('/orders', body)).status, 200);
  assert.equal(f.httpCalls.filter(call => call.method === 'POST').length, 1);
  assert.ok(f.httpCalls[0].headers['Idempotency-Key']);
  f.markPaid(); const paid = await f.notify(); assert.equal(paid.status, 200, await paid.clone().text());
  assert.equal(f.payment(ids[0]).status, 'paid'); assert.equal(f.payment(ids[0]).fiscalStatus, 'issued');
  assert.equal(f.registration().status, 'confirmed'); assert.equal(f.registration().documentCount, 1);
  assert.equal(f.job(ids[0]).issuanceProtocol, 'claimed-v1'); assert.equal(f.job(ids[0]).status, 'issued');
  assert.equal(f.fiscalCalls.length, 1); assert.equal(f.fiscalCalls[0].payment_mechanism, 'CC');
  const duplicate = await f.notify(); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(f.fiscalCalls.length, 1); assert.equal(f.registration().documentCount, 1);
  const publicOrder = (await (await f.call(`/orders/${ids[0]}`)).json()).order;
  assert.doesNotMatch(JSON.stringify(publicOrder), /pi_|paymentIntentId|last4|exp_year|4242/);
  assert.doesNotMatch(JSON.stringify([f.payment(ids[0]), f.job(ids[0])]), /last4|exp_year|4242/);
});

test('concurrent paid callbacks cannot duplicate the primary financial confirmation or claimed fiscal POST', async () => {
  const f = fixture(); await f.create(); f.markPaid();
  const responses = await Promise.all([f.notify(), f.notify()]);
  assert.ok(responses.some(response => response.status === 200)); assert.ok(responses.every(response => [200, 503].includes(response.status)));
  assert.equal(f.payment(ids[0]).status, 'paid'); assert.equal(f.fiscalCalls.length, 1); assert.equal(f.registration().documentCount, 1);
  assert.equal((await f.notify()).status, 200); assert.equal(f.fiscalCalls.length, 1);
});

test('a paid debit-card supplement preserves the original payment ledger and adds purchased entitlements exactly once', async () => {
  const f = fixture(); await f.create(); f.markPaid(); assert.equal((await f.notify()).status, 200);
  const original = f.registration().payment;
  await f.create(ids[1], extras, 'supplementary'); f.setFunding('debit'); f.markPaid(ids[1]);
  const responses = await Promise.all([f.notify(ids[1]), f.notify(ids[1])]);
  assert.ok(responses.some(response => response.status === 200)); assert.ok(responses.every(response => [200, 503].includes(response.status)));
  assert.deepEqual(f.registration().payment, original); assert.equal(f.registration().entitlements.morningCourse, true);
  assert.equal(f.registration().entitlements.dinnerQuantity, 1); assert.equal(f.registration().documentCount, 2);
  assert.deepEqual(f.registration().paidSupplementaryOrderIds, [ids[1]]); assert.equal(f.fiscalCalls[1].payment_mechanism, 'DC');
  assert.equal(f.job(ids[1]).issuanceProtocol, 'claimed-v1'); assert.ok(!f.registration().openSupplementaryOrderId);
  assert.equal((await f.notify(ids[1])).status, 200); assert.equal(f.fiscalCalls.length, 2); assert.equal(f.registration().entitlements.dinnerQuantity, 1);
});

test('instrument-read permission failure or unknown/prepaid funding retains paid finances while blocking fiscal issuing', async () => {
  for (const scenario of ['permissions', 'unknown', 'prepaid']) {
    const f = fixture({ funding: scenario === 'permissions' ? 'credit' : scenario }); await f.create(); f.markPaid();
    if (scenario === 'permissions') f.setInstrumentStatus(403);
    const response = await f.notify(); assert.equal(response.status, 200, await response.clone().text());
    assert.equal(f.payment(ids[0]).status, 'paid'); assert.equal(f.payment(ids[0]).fiscalStatus, 'review_required');
    assert.equal(f.registration().status, 'confirmed'); assert.equal(f.registration().payment.status, 'paid');
    assert.equal(f.job(ids[0]).status, 'review_required'); assert.equal(f.job(ids[0]).errorCode, 'stripe-instrument-unconfirmed');
    assert.equal(f.job(ids[0]).issuanceProtocol, 'claimed-v1'); assert.equal(f.fiscalCalls.length, 0); assert.equal(f.registration().documentCount, 0);
    const duplicate = await f.notify(); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(f.fiscalCalls.length, 0);
  }
});

test('only an administrator can resume an unstarted instrument-review invoice after restoring read permission without charging again', async () => {
  const f = fixture(); await f.create(); f.markPaid(); f.setInstrumentStatus(403);
  assert.equal((await f.notify()).status, 200); assert.equal(f.payment(ids[0]).status, 'paid'); assert.equal(f.fiscalCalls.length, 0);
  assert.equal(f.job(ids[0]).salesDocument, null); assert.ok(!f.job(ids[0]).issuanceAttemptId);
  assert.equal((await f.resume(ids[0], owner)).status, 403); assert.equal(f.fiscalCalls.length, 0);
  f.setInstrumentStatus(200);
  const resumed = await f.resume(); assert.equal(resumed.status, 200, await resumed.clone().text());
  assert.equal(f.payment(ids[0]).status, 'paid'); assert.equal(f.payment(ids[0]).fiscalStatus, 'issued');
  assert.equal(f.registration().documentCount, 1); assert.equal(f.fiscalCalls.length, 1); assert.equal(f.fiscalCalls[0].payment_mechanism, 'CC');
  assert.equal(f.httpCalls.filter(call => call.method === 'POST').length, 1);
  assert.equal((await f.resume()).status, 409); assert.equal(f.fiscalCalls.length, 1); assert.equal(f.registration().documentCount, 1);
});

test('card wallets retain their safe classification and choose the actual card funding for fiscal payment code', async () => {
  for (const [wallet, funding, mechanism] of [['apple_pay', 'credit', 'CC'], ['google_pay', 'debit', 'DC']]) {
    const f = fixture({ wallet, funding }); await f.create(); f.markPaid();
    assert.equal((await f.notify()).status, 200); assert.equal(f.payment(ids[0]).status, 'paid');
    assert.equal(f.fiscalCalls.length, 1); assert.equal(f.fiscalCalls[0].payment_mechanism, mechanism);
    assert.doesNotMatch(JSON.stringify(f.payment(ids[0])), /last4|exp_year|4242/);
  }
});

test('payment date comes from the paid event rather than the older Checkout Session or PaymentIntent creation date', async () => {
  const f = fixture({ clock: '2027-01-31T12:00:00Z' }); await f.create(ids[0], { ...primary, congressMode: 'virtual' });
  const created = f.rawSession(ids[0]).created; f.setTime('2027-02-01T12:00:00Z'); f.markPaid();
  const response = await f.notify(); assert.equal(response.status, 200, await response.clone().text());
  assert.ok(created < Math.floor(Date.parse('2027-02-01T00:00:00Z') / 1000));
  assert.equal(f.payment(ids[0]).paymentDate, '2027-02-01'); assert.equal(f.payment(ids[0]).fiscalQuote.ratePeriod, 'regular');
  assert.equal(f.fiscalCalls[0].date, '2027-02-01'); assert.equal(f.payment(ids[0]).status, 'paid');
});

test('verified expiry updates the existing order and recovery never creates a replacement session automatically', async () => {
  const f = fixture(); const { body } = await f.create();
  Object.assign(f.rawSession(ids[0]), { status: 'expired', payment_status: 'unpaid', payment_intent: null });
  const response = await f.notify(ids[0], { type: 'checkout.session.expired' }); assert.equal(response.status, 200, await response.clone().text());
  assert.equal(f.payment(ids[0]).status, 'expired'); assert.equal(f.registration().status, 'submitted');
  assert.equal((await f.call('/primary-order')).status, 200); assert.equal((await f.call('/orders', body)).status, 200);
  assert.equal(f.httpCalls.filter(call => call.method === 'POST').length, 1); assert.equal(f.fiscalCalls.length, 0);
  assert.equal(f.registration().entitlements.congressMode, '');
});

test('a lost Checkout Session creation response stays recoverable under the same UUID without another provider POST', async () => {
  const f = fixture(); const body = await f.orderBody(ids[0]); f.failCreation();
  const response = await f.call('/orders', body); assert.equal(response.status, 502, await response.clone().text());
  assert.equal(f.payment(ids[0]).status, 'creation_unknown'); assert.equal(f.httpCalls.filter(call => call.method === 'POST').length, 1);
  const recovered = await f.call('/orders', body); assert.equal(recovered.status, 200);
  assert.equal((await f.call('/primary-order')).status, 200); assert.equal(f.httpCalls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.fiscalCalls.length, 0); assert.equal(f.registration().status, 'submitted');
});

test('invalid HMAC, test-mode events and mismatched signed amount, owner or PaymentIntent cannot confirm production payment', async () => {
  for (const changes of [{ validSignature: false }, { eventChanges: { livemode: false } },
    { snapshotChanges: { livemode: false } }, { snapshotChanges: { amount_total: 9501 } },
    { snapshotChanges: { payment_intent: 'pi_otherSynthetic12345' } }]) {
    const f = fixture(); await f.create(); f.markPaid();
    const response = await f.notify(ids[0], changes); assert.ok([400, 401, 422, 503].includes(response.status), await response.clone().text());
    assert.equal(f.payment(ids[0]).status, 'pending'); assert.equal(f.registration().status, 'submitted');
    assert.equal(f.job(ids[0]), null); assert.equal(f.fiscalCalls.length, 0);
  }
  const f = fixture(); await f.create(); f.markPaid();
  const metadata = { ...f.rawSession(ids[0]).metadata, owner: 'different-user' };
  const response = await f.notify(ids[0], { snapshotChanges: { metadata } }); assert.ok(response.status >= 400);
  assert.equal(f.payment(ids[0]).status, 'pending'); assert.equal(f.fiscalCalls.length, 0);
});

test('a historical registration payment never reactivates or overwrites the current canonical registration', async () => {
  const f = fixture(); await f.create();
  f.patchPayment(ids[0], { registrationArchiveId: 'synthetic-archive' });
  f.patchRegistration({ status: 'cancelled', payment: { orderId: ids[1], status: 'pending', method: 'multibanco' } });
  const original = f.registration(); f.markPaid();
  const response = await f.notify(); assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(f.registration(), original); assert.equal(f.payment(ids[0]).registrationArchiveId, 'synthetic-archive');
  assert.equal(f.job(ids[0]), null); assert.equal(f.fiscalCalls.length, 0);
});

test('Stripe validation is scoped to verified allowlisted users and works independently of EuPago credentials', async () => {
  const stripeOnly = { ...env }; delete stripeOnly.EUPAGO_LIVE_API_KEY; delete stripeOnly.EUPAGO_LIVE_WEBHOOK_KEY; delete stripeOnly.EUPAGO_LIVE_CHANNEL;
  const allowed = fixture({ configuration: stripeOnly });
  const config = await allowed.call('/config'); assert.equal(config.status, 200); assert.ok((await config.json()).methods.includes('stripe_card'));
  await allowed.create(); assert.equal(allowed.httpCalls.filter(call => call.method === 'POST').length, 1);
  const other = fixture({ identity: { ...owner, email: 'other@example.test' } });
  assert.ok(!(await (await other.call('/config')).json()).methods.includes('stripe_card'));
  const response = await other.call('/orders', await other.orderBody(ids[0])); assert.equal(response.status, 409); assert.equal(other.httpCalls.length, 0);
  const unverified = fixture({ identity: { ...owner, email_verified: false } });
  assert.equal((await unverified.call('/config')).status, 403); assert.equal(unverified.httpCalls.length, 0);
});

test('expiry and asynchronous failure cannot erase paid evidence previously retained for eligibility review', async () => {
  for (const [type, status] of [['checkout.session.expired', 'expired'], ['checkout.session.async_payment_failed', 'complete']]) {
    const f = fixture(); await f.create();
    const payment = f.payment(ids[0]);
    // The order was created before its student's approval changed; the current
    // authenticated context contains no approval and must retain paid evidence.
    f.patchPayment(ids[0], { quote: { ...payment.quote, selection: { ...payment.quote.selection, profile: 'student' } } });
    f.markPaid(); const paid = await f.notify(); assert.equal(paid.status, 200, await paid.clone().text());
    const evidence = f.payment(ids[0]), registration = f.registration();
    assert.equal(evidence.status, 'review_required'); assert.equal(evidence.reviewReason, 'payment-eligibility-review');
    assert.match(evidence.transactionId, /^pi_/); assert.ok(evidence.paidAt);
    Object.assign(f.rawSession(ids[0]), { status, payment_status: 'unpaid' });
    const response = await f.notify(ids[0], { type });
    assert.ok([200, 409].includes(response.status), await response.clone().text());
    const after = f.payment(ids[0]);
    assert.equal(after.status, 'review_required'); assert.equal(after.transactionId, evidence.transactionId);
    assert.equal(after.paidAt, evidence.paidAt); assert.equal(after.paymentDate, evidence.paymentDate);
    assert.equal(after.reviewReason, evidence.reviewReason); assert.deepEqual(f.registration(), registration);
    assert.equal(f.fiscalCalls.length, 0); assert.equal(f.job(ids[0]), null);
  }
});

test('instrument-review resume rejects prior attempts, malformed provider evidence, nonempty payloads and uncertain results without a fiscal POST', async () => {
  const forbidden = [
    ['missing claim protocol', {}, { issuanceProtocol: undefined }],
    ['legacy claim protocol', {}, { issuanceProtocol: 'legacy' }],
    ['job claim identity', {}, { issuanceAttemptId: 'already-claimed' }],
    ['job issuance started', {}, { issuanceStartedAt: '2026-11-01T12:01:00Z' }],
    ['payment claim identity', { issuanceAttemptId: 'already-claimed' }, {}],
    ['accepted provider ID', {}, { providerDocumentId: 901 }],
    ['zero provider ID', {}, { providerDocumentId: 0 }],
    ['object provider ID', {}, { providerDocumentId: { invalid: true } }],
    ['array provider ID', {}, { providerDocumentId: [] }],
    ['malformed string provider ID', {}, { providerDocumentId: 'not-a-provider-id' }],
    ['payment provider evidence', { fiscalDocumentId: { invalid: true } }, {}],
    ['existing fiscal payload', {}, { salesDocument: {} }],
    ['uncertain result', {}, { status: 'outcome_unknown' }],
  ];
  for (const [name, paymentChanges, jobChanges] of forbidden) {
    const f = fixture(); await f.create(); f.markPaid(); f.setInstrumentStatus(403);
    assert.equal((await f.notify()).status, 200); assert.equal(f.job(ids[0]).errorCode, 'stripe-instrument-unconfirmed');
    f.patchPayment(ids[0], paymentChanges); f.patchJob(ids[0], jobChanges); f.setInstrumentStatus(200);
    const before = { payment: f.payment(ids[0]), job: f.job(ids[0]), registration: f.registration() };
    const response = await f.resume(); assert.equal(response.status, 409, `${name}: ${await response.clone().text()}`);
    assert.equal(f.fiscalCalls.length, 0, name); assert.equal(f.httpCalls.filter(call => call.method === 'POST').length, 1, name);
    assert.deepEqual(f.payment(ids[0]), before.payment, name); assert.deepEqual(f.job(ids[0]), before.job, name);
    assert.deepEqual(f.registration(), before.registration, name);
  }
});
