import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createCheckoutSandboxApi } from '../payments/checkout-sandbox.mjs';
import { createStripeSandbox, stripeConfiguration, STRIPE_WEBHOOK_PATH, safeCheckoutUrl } from '../payments/stripe-sandbox.mjs';
import { createStripeSandboxWebhook, verifyStripeEvent } from '../payments/stripe-webhook.mjs';
const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83', OID2 = 'ca991ca4-52ab-4b7e-b6cf-bc9d6480388f';
const time = '2026-10-13T11:00:00.000Z', unix = Date.parse(time) / 1000;
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_SANDBOX_SERVICE_ACCOUNT: 'injected-service-identity',
  STRIPE_SANDBOX_SECRET_KEY: 'rk_test_syntheticKeyOnly', STRIPE_SANDBOX_WEBHOOK_SECRET: 'whsec_syntheticWebhookOnly' };
const selection = { profile: 'external', congressMode: 'onsite' };
function fixture() {
  let doc, writes = 0, tokens = 0, postStatus = 200, timeout = false, unavailable = false, storageFailure = false, onCreate;
  const requests = [], sessions = new Map(); let claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };
  const store = {
    read: async id => { assert.equal(id, SID); if (storageFailure) throw new Error('private storage error'); return doc ? structuredClone(doc) : null; },
    create: async (id, record) => { assert.equal(id, SID); if (doc) throw Object.assign(new Error(), { code: 'conflict' }); doc = { record, version: '1' }; writes++; return structuredClone(doc); },
    replace: async (id, record, version) => {
      assert.equal(id, SID); if (storageFailure) throw new Error('private storage error');
      if (doc.version !== version) throw Object.assign(new Error(), { code: 'conflict' });
      doc = { record, version: String(Number(version) + 1) }; writes++; return structuredClone(doc);
    },
    context: async () => ({ context: { uid: claims.sub, emailVerified: claims.email_verified }, guards: [] }),
    list: async () => ({ records: doc ? [doc.record] : [], truncated: false }),
  };
  const provider = options => createStripeSandbox({ ...options, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    assert.ok(url.startsWith('https://api.stripe.com/v1/checkout/sessions'));
    assert.equal(options.headers.Authorization, `Bearer ${env.STRIPE_SANDBOX_SECRET_KEY}`);
    assert.equal(options.headers['Stripe-Version'], '2026-09-30.endive'); assert.equal(options.redirect, 'manual');
    if (options.method === 'POST') {
      if (postStatus !== 200) return new Response('private key echo must not escape', { status: postStatus });
      const body = new URLSearchParams(options.body), metadata = {};
      for (const [k, v] of body.entries()) if (k.startsWith('metadata[')) metadata[k.slice(9, -1)] = v;
      const id = `cs_test_session${sessions.size + 1}synthetic`;
      let total = 0;
      for (let i = 0; body.has(`line_items[${i}][quantity]`); i++) total += Number(body.get(`line_items[${i}][quantity]`)) * Number(body.get(`line_items[${i}][price_data][unit_amount]`));
      const session = { id, object: 'checkout.session', livemode: false, mode: 'payment', currency: 'eur',
        amount_total: total, client_reference_id: body.get('client_reference_id'), metadata,
        payment_method_types: ['card'], status: 'open', payment_status: 'unpaid', payment_intent: null,
        expires_at: unix + 86400, url: `https://checkout.stripe.com/c/pay/${id}#sample` };
      sessions.set(id, session); if (onCreate) await onCreate(id);
      if (timeout) throw Object.assign(new Error(), { name: 'TimeoutError' });
      return Response.json(session);
    }
    if (unavailable) return new Response('secret transport error', { status: 503 });
    return sessions.has(url.split('/').at(-1)) ? Response.json(sessions.get(url.split('/').at(-1))) : new Response('', { status: 404 });
  } });
  const storeFactory = options => { assert.equal(options.uid, 'admin'); return store; };
  const api = createCheckoutSandboxApi({ verify: async () => claims, storeFactory, stripeFactory: provider,
    providerFactory: () => assert.fail('must not call Eupago'), now: () => time });
  const webhook = createStripeSandboxWebhook({ storeFactory, providerFactory: provider, tokenProvider: async () => { tokens++; return 'test-service-token'; }, now: () => time });
  const call = (path, body, override = {}) => api(new Request(`https://circ.local/api/checkout/sandbox/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer user-token', Origin: 'https://circ.local', 'Content-Type': 'application/json', ...override },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const event = (id, type = 'checkout.session.completed') => ({ id: 'evt_synthetic1', object: 'event', livemode: false,
    type, created: unix, data: { object: structuredClone(sessions.get(id)) } });
  const send = (data, header, bodyText) => {
    const body = bodyText || JSON.stringify(data);
    const sig = header ?? `t=${unix},v1=${createHmac('sha256', env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(`${unix}.${body}`).digest('hex')}`;
    return webhook(new Request(`https://circ.local${STRIPE_WEBHOOK_PATH}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body }), env);
  };
  const quote = async chosen => { const r = await call(`sessions/${SID}/quote`, { selection: chosen || selection }); assert.equal(r.status, 200); return r.json(); };
  const create = async (chosen = selection, id = OID) => {
    const q = await quote(chosen);
    return call(`sessions/${SID}/orders`, { id, selection: chosen, stamp: q.stamp, method: 'stripe_card', sandboxAcknowledged: true });
  };
  const pay = id => { const s = sessions.get(id); Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_' + id.replaceAll('_', ''), url: null }); };
  return { call, api, webhook, quote, create, event, send, pay, requests, sessions,
    newSession: () => call('sessions', { id: SID, source: 'new' }),
    record: () => structuredClone(doc.record), writes: () => writes, tokens: () => tokens,
    mutate: fn => { fn(doc.record); doc.version = String(Number(doc.version) + 1); },
    setPostStatus: v => { postStatus = v; }, setTimeout: v => { timeout = v; }, setUnavailable: v => { unavailable = v; },
    setStorageFailure: v => { storageFailure = v; }, setOnCreate: fn => { onCreate = fn; }, setClaims: v => { claims = v; },
  };
}
async function start() { const f = fixture(); await f.newSession(); const r = await f.create(); assert.equal(r.status, 201, await r.clone().text()); return f; }
async function complete(f, id = f.record().orders.at(-1).reference) { f.pay(id); const response = await f.send(f.event(id)); assert.equal(response.status, 200, await response.clone().text()); return id; }
test('hosted session uses server totals, card-only, fixed EUR, no recurring products or invoices', async () => {
  const f = await start(); const { url, options } = f.requests[0], b = new URLSearchParams(options.body);
  assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions'); assert.equal(b.get('line_items[0][price_data][unit_amount]'), '9500');
  assert.equal(b.get('payment_method_types[0]'), null); assert.equal(b.get('mode'), 'payment');
  assert.equal(b.get('invoice_creation[enabled]'), 'false'); assert.equal(b.get('adaptive_pricing[enabled]'), 'false');
  assert.equal(b.get('automatic_tax[enabled]'), 'false'); assert.equal(b.get('customer_creation'), 'if_required');
  assert.ok(b.get('success_url').startsWith('https://circ-coimbra.org/conta/inscricoes-teste?teste='));
  assert.match(options.headers['Idempotency-Key'], /^circ-sandbox-[a-f0-9]{64}$/);
  assert.equal(f.record().registration, null); assert.ok(!JSON.stringify(f.record()).includes('rk_test_'));
  await complete(f); assert.equal(f.record().registration.status, 'confirmed');
  assert.equal(f.record().orders[0].notification.provider, 'stripe');
});
test('signed confirmation works without any Eupago configuration or invocation', async () => {
  const f = await start(); const config = await (await f.call('config')).json();
  assert.equal(config.eupagoConfigured, false); assert.equal(config.stripe.ready, true);
  assert.ok(!JSON.stringify(config).includes(env.STRIPE_SANDBOX_SECRET_KEY)); await complete(f);
});
test('idempotent and concurrent creations reserve only one session', async () => {
  const f = fixture(); await f.newSession(); const q = await f.quote();
  const b = { id: OID, selection, stamp: q.stamp, method: 'stripe_card', sandboxAcknowledged: true };
  const responses = await Promise.all([f.call(`sessions/${SID}/orders`, b), f.call(`sessions/${SID}/orders`, b)]);
  assert.ok(responses.every(r => [200, 201, 409].includes(r.status)));
  assert.equal((await f.call(`sessions/${SID}/orders`, b)).status, 200);
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 1);
});
test('manual query and success URL do not grant registration; later webhook does', async () => {
  const f = await start(); const id = f.record().orders[0].reference; f.pay(id);
  await f.call(`sessions/${SID}/orders/${OID}/inspect`, {});
  assert.equal(f.record().orders[0].providerState, 'paid'); assert.equal(f.record().registration, null);
  await f.call(`sessions/${SID}?stripe=return&status=paid`); assert.equal(f.record().registration, null);
  await complete(f); assert.equal(f.record().orders[0].status, 'confirmed');
});
test('same event, separate completed event IDs and concurrent delivery never duplicate entitlements', async () => {
  const f = await start(); const id = f.record().orders[0].reference; f.pay(id); const e = f.event(id);
  const responses = await Promise.all([f.send(e), f.send(e), f.send(e)]); assert.ok(responses.every(r => r.status === 200));
  const count = f.writes(); e.id = 'evt_synthetic2'; assert.deepEqual(await (await f.send(e)).json(), { received: true, duplicate: true });
  assert.equal(f.writes(), count); assert.equal(f.record().registration.sourceOrderId, OID);
});
test('supplementary order charges only a dinner and applies it once', async () => {
  const f = await start(); await complete(f);
  assert.equal((await f.create({ dinnerQuantity: 1 }, OID2)).status, 201); assert.equal(f.record().orders[1].amountCents, 3000);
  const id = await complete(f); await f.send(f.event(id)); assert.equal(f.record().registration.entitlements.dinnerQuantity, 1);
});
test('missing webhook or live API keys block creation before any reservation or Stripe request', async () => {
  for (const field of ['STRIPE_SANDBOX_WEBHOOK_SECRET', 'FIREBASE_SANDBOX_SERVICE_ACCOUNT']) {
    const f = fixture(); await f.newSession(); const q = await f.quote();
    const r = await f.api(new Request(`https://circ.local/api/checkout/sandbox/sessions/${SID}/orders`, { method: 'POST',
      headers: { Authorization: 'Bearer user', Origin: 'https://circ.local', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: OID, selection, stamp: q.stamp, method: 'stripe_card', sandboxAcknowledged: true }) }), { ...env, [field]: '' });
    assert.equal(r.status, 400); assert.equal(f.requests.length, 0); assert.equal(f.record().orders.length, 0);
  }
  assert.equal(stripeConfiguration({ ...env, STRIPE_SANDBOX_SECRET_KEY: 'rk_test_current_format-with_extra.parts' }).ready, true);
  for (const key of ['sk_live_no', 'rk_live_no', 'pk_test_public', '', 'rk_test_foo\n', 'rk_test_has space']) {
    assert.throws(() => createStripeSandbox({ apiKey: key })); assert.equal(stripeConfiguration({ ...env, STRIPE_SANDBOX_SECRET_KEY: key }).ready, false);
  }
});
for (const [status, code] of [[400, 'request-rejected'], [401, 'authentication'], [403, 'permissions']]) test(`Stripe ${status} is safely diagnosed, not claimed as a payment`, async () => {
  const f = fixture(); await f.newSession(); f.setPostStatus(status); const r = await f.create();
  assert.equal(r.status, 502); assert.equal((await r.json()).error, `stripe/${code}`);
  assert.equal(f.record().orders[0].status, 'closed'); assert.equal(f.record().registration, null);
  assert.ok(!JSON.stringify(f.record()).includes('private key echo'));
});
test('uncertain creation retains its ID and recovers by authenticated lookup, not new creation', async () => {
  const f = fixture(); await f.newSession(); f.setTimeout(true); assert.equal((await f.create()).status, 502);
  assert.equal(f.record().orders[0].status, 'creation_unknown'); const id = [...f.sessions.keys()][0];
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/recover`, { reference: id })).status, 200);
  assert.equal(f.record().registration, null); await complete(f, id);
  assert.equal(f.requests.filter(r => r.options.method === 'POST').length, 1);
});
test('webhook overtaking create response or timeout is not overwritten', async () => {
  for (const timeout of [false, true]) {
    const f = fixture(); await f.newSession(); f.setTimeout(timeout); f.setOnCreate(id => complete(f, id));
    assert.equal((await f.create()).status, 200); assert.equal(f.record().orders[0].status, 'confirmed');
  }
});
test('expiry is confirmed against Stripe; navigating back does not expire an open session', async () => {
  const f = await start(); const id = f.record().orders[0].reference;
  assert.equal((await f.send(f.event(id, 'checkout.session.expired'))).status, 503);
  assert.equal(f.record().orders[0].status, 'pending');
  Object.assign(f.sessions.get(id), { status: 'expired', url: null });
  assert.equal((await f.send(f.event(id, 'checkout.session.expired'))).status, 200);
  assert.equal(f.record().orders[0].status, 'closed'); assert.equal(f.record().registration, null);
  assert.equal((await f.create(selection, OID2)).status, 201);
});
test('late expired notifications never revert a completed registration', async () => {
  const f = await start(); const id = f.record().orders[0].reference; const old = f.event(id, 'checkout.session.expired');
  Object.assign(old.data.object, { status: 'expired', url: null }); await complete(f);
  assert.equal((await f.send(old)).status, 200); assert.equal(f.record().orders[0].status, 'confirmed');
});
test('payment arriving after a replacement order never grants primary rights twice', async () => {
  const f = await start(); const first = f.record().orders[0].reference;
  Object.assign(f.sessions.get(first), { status: 'expired', url: null }); await f.send(f.event(first, 'checkout.session.expired'));
  await f.create(selection, OID2); await complete(f);
  await complete(f, first); assert.equal(f.record().orders[0].status, 'review_required');
  assert.equal(f.record().registration.sourceOrderId, OID2);
});
for (const [name, change] of [
  ['live', e => { e.data.object.livemode = true; }], ['amount', e => { e.data.object.amount_total = 1; }],
  ['currency', e => { e.data.object.currency = 'usd'; }], ['method', e => { e.data.object.payment_method_types = ['mb_way']; }],
  ['identifier', e => { e.data.object.client_reference_id = 'other'; }], ['metadata', e => { e.data.object.metadata.identifier = 'other'; }],
  ['mode', e => { e.data.object.mode = 'subscription'; }], ['id', e => { e.data.object.id = 'cs_test_otherSession'; }],
]) test(`signed ${name} mismatch never confirms`, async () => {
  const f = await start(); const id = f.record().orders[0].reference; f.pay(id); const e = f.event(id); change(e);
  assert.equal((await f.send(e)).status, 422); assert.equal(f.record().registration, null);
});
test('signed event and retrieved session must match the same payment', async () => {
  const f = await start(); const id = f.record().orders[0].reference; f.pay(id); const e = f.event(id);
  f.sessions.get(id).metadata.identifier = 'other'; assert.equal((await f.send(e)).status, 422);
  assert.equal(f.record().registration, null);
});
test('paid signed snapshot is insufficient if API is unpaid, failed or unavailable', async () => {
  const f = await start(); const id = f.record().orders[0].reference; f.pay(id); const e = f.event(id);
  f.sessions.get(id).payment_status = 'unpaid'; assert.equal((await f.send(e)).status, 503);
  f.setUnavailable(true); assert.equal((await f.send(e)).status, 503); assert.equal(f.record().registration, null);
  f.setUnavailable(false); f.pay(id); assert.equal((await f.send(e)).status, 200);
});
test('storage failure returns retriable error and does not partially confirm', async () => {
  const f = await start(); const id = f.record().orders[0].reference; f.pay(id); f.setStorageFailure(true);
  assert.equal((await f.send(f.event(id))).status, 503); assert.equal(f.record().registration, null);
  f.setStorageFailure(false); await complete(f);
});
test('bad signatures, stale/future timestamp, wrong secret and oversized body precede service-token access', async () => {
  const f = await start(); const e = f.event(f.record().orders[0].reference), body = JSON.stringify(e);
  for (const ts of [unix - 301, unix + 301]) {
    const sig = `t=${ts},v1=${createHmac('sha256', env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex')}`;
    assert.equal((await f.send(e, sig)).status, 400);
  }
  for (const header of ['', `t=${unix},v1=bad`, `t=${unix},t=${unix},v1=${'0'.repeat(64)}`]) assert.equal((await f.send(e, header)).status, 400);
  assert.equal((await f.send(e, undefined, 'x'.repeat(65537))).status, 400); assert.equal(f.tokens(), 0);
});
test('signature validates exact bytes, accepts rotated v1 signatures and ignores v0', () => {
  const bytes = Buffer.from('{"greeting":"Olá"}\n'), secret = env.STRIPE_SANDBOX_WEBHOOK_SECRET;
  const sig = createHmac('sha256', secret).update(`${unix}.`).update(bytes).digest('hex');
  assert.equal(verifyStripeEvent(bytes, `t=${unix},v1=${'0'.repeat(64)},v1=${sig}`, secret, Date.parse(time)).greeting, 'Olá');
  assert.throws(() => verifyStripeEvent(Buffer.from('{"greeting": "Olá"}\n'), `t=${unix},v1=${sig}`, secret, Date.parse(time)));
  assert.throws(() => verifyStripeEvent(bytes, `t=${unix},v0=${sig}`, secret, Date.parse(time)));
});
test('unrelated dashboard samples are ignored, not treated as proof of checkout success', async () => {
  const f = await start(); const e = f.event(f.record().orders[0].reference); e.data.object.metadata = {};
  assert.deepEqual(await (await f.send(e)).json(), { received: true, ignored: true }); assert.equal(f.tokens(), 0);
  e.type = 'payment_intent.succeeded'; assert.equal((await f.send(e)).status, 200); assert.equal(f.record().registration, null);
});
test('live or Connect events rejected even when signed', async () => {
  const f = await start(); const e = f.event(f.record().orders[0].reference); e.livemode = true;
  assert.equal((await f.send(e)).status, 422); e.livemode = false; e.account = 'acct_connected';
  assert.equal((await f.send(e)).status, 422); assert.equal(f.tokens(), 0);
});
test('hosted links cannot redirect to arbitrary origins or live session paths', () => {
  const id = 'cs_test_session1synthetic';
  for (const url of ['javascript:alert(1)', `https://checkout.stripe.com.evil.invalid/c/pay/${id}`,
    `https://evil.invalid/c/pay/${id}`, `https://user@checkout.stripe.com/c/pay/${id}`, 'https://checkout.stripe.com/c/pay/cs_live_fake']) assert.equal(safeCheckoutUrl(url, id), null);
});
test('only the verified admin and same-origin requests may create sessions', async () => {
  const f = fixture(); await f.newSession(); const q = await f.quote(); const body = { id: OID, method: 'stripe_card', selection, stamp: q.stamp, sandboxAcknowledged: true };
  assert.equal((await f.call(`sessions/${SID}/orders`, body, { Origin: 'https://other.invalid' })).status, 403);
  f.setClaims({ sub: 'admin', email: 'notadmin@example.invalid', email_verified: true });
  assert.equal((await f.call(`sessions/${SID}/orders`, body)).status, 403); assert.equal(f.requests.length, 0);
});
test('readonly refresh and config return no secrets and perform no Stripe payment call', async () => {
  const f = await start(); await complete(f); const count = f.requests.length;
  const data = await (await f.call(`sessions/${SID}`)).json(); await f.call('config');
  assert.equal(data.session.orders[0].status, 'confirmed'); assert.equal(f.requests.length, count);
  assert.ok(!JSON.stringify(data).includes('rk_test_')); assert.ok(!JSON.stringify(data).includes('whsec_'));
});
