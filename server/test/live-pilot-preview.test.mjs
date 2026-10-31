import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePilotPreviewApi } from '../payments/live-pilot-preview.mjs';
import { createWorker } from '../worker.mjs';

const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', LIVE_CHECKOUT_ENABLED: 'false' };
const admin = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };
const profile = { name: 'Pessoa Ensaio', taxNumber: '203821432', billingAddress: 'Rua Teste 1',
  billingPostalCode: '3030-471', billingCity: 'Coimbra', billingCountry: 'Portugal', privateToken: 'DO-NOT-EXPOSE' };
const request = (data = { profile: 'external' }, options = {}) => new Request('https://circ.local/api/checkout/live/pilot-preview', {
  method: 'POST', headers: { Origin: 'https://circ.local', Authorization: 'Bearer admin-token', 'Content-Type': 'application/json', ...options }, body: JSON.stringify(data),
});
function fixture({ claims = admin, record = null, billingProfile = profile, context = { uid: 'admin', emailVerified: true }, now = '2026-10-31T12:00:00Z' } = {}) {
  let reads = 0;
  const api = createLivePilotPreviewApi({ verify: async () => claims, now: () => now,
    tokenProvider: async () => { reads++; return 'service-token'; },
    storeFactory: ({ uid }) => {
      assert.equal(uid, admin.sub);
      const store = { registration: async () => ({ data: record }), profile: async () => ({ data: billingProfile }), context: async () => context };
      return new Proxy(store, { get(target, key) { assert.ok(Object.hasOwn(target, key), `unexpected store operation ${String(key)}`); return target[key]; } });
    },
  });
  return { api, reads: () => reads };
}

test('disabled live checkout allows only an admin read-only preview of real profile and server price', async () => {
  const f = fixture();
  const response = await f.api(request(), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const data = await response.json();
  assert.equal(data.previewOnly, true);
  assert.equal(data.paymentCreated, false);
  assert.equal(data.fiscalDocumentIssued, false);
  assert.equal(data.quote.amountCents, 9500);
  assert.equal(data.quote.selection.congressMode, 'onsite');
  assert.equal(data.quote.selection.dinnerQuantity, 0);
  assert.equal(data.billing.customer_business_name, 'Pessoa Ensaio');
  assert.ok(!JSON.stringify(data).includes('DO-NOT-EXPOSE'));
  assert.ok(!Object.hasOwn(data, 'reference'));
  assert.equal(env.LIVE_CHECKOUT_ENABLED, 'false');
});

test('preview applies the current server tariff rather than a client supplied amount or date', async () => {
  const f = fixture({ now: '2027-02-01T12:00:00Z' });
  assert.equal((await (await f.api(request(), env)).json()).quote.amountCents, 15000);
  for (const body of [{ profile: 'external', amountCents: 100 }, { profile: 'external', date: '2026-10-31' }, { profile: 'external', congressMode: 'virtual' }, { profile: 'external', userId: 'someone-else' }, { profile: 'unknown' }]) {
    const blocked = fixture();
    assert.equal((await blocked.api(request(body), env)).status, 400);
    assert.equal(blocked.reads(), 0);
  }
});

test('preview never bypasses ULS or student verification', async () => {
  for (const [selected, code] of [['uls', 'checkout/uls-not-verified'], ['student', 'checkout/student-not-approved']]) {
    const f = fixture();
    const response = await f.api(request({ profile: selected }), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, code);
  }
});

test('unauthorized, unverified and cross-origin requests stop before service identity or storage', async () => {
  for (const claims of [null, { ...admin, email: 'participant@example.test' }, { ...admin, email_verified: false }]) {
    const f = fixture({ claims });
    assert.equal((await f.api(request(), env)).status, 403);
    assert.equal(f.reads(), 0);
  }
  const f = fixture();
  assert.equal((await f.api(request(undefined, { Origin: 'https://other.example' }), env)).status, 403);
  const unsigned = request(); unsigned.headers.delete('Authorization');
  assert.equal((await f.api(unsigned, env)).status, 401);
  assert.equal(f.reads(), 0);
});

test('existing or unchecked registrations and incomplete billing block the preview', async () => {
  for (const record of [{ status: 'submitted' }, { status: 'confirmed' }]) {
    const f = fixture({ record });
    assert.equal((await f.api(request(), env)).status, 409);
  }
  const unchecked = createLivePilotPreviewApi({ verify: async () => admin, tokenProvider: async () => 'token',
    storeFactory: () => ({ registration: async () => undefined }) });
  assert.equal((await unchecked(request(), env)).status, 409);
  const incomplete = fixture({ billingProfile: { name: 'Pessoa Ensaio' } });
  const response = await incomplete.api(request(), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'billing-customer-unconfirmed');
});

test('provider or storage details are never returned in a failed preview', async () => {
  const api = createLivePilotPreviewApi({ verify: async () => admin, tokenProvider: async () => 'token',
    storeFactory: () => { throw new Error('PRIVATE-JSON-KEY'); } });
  const response = await api(request(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'preview-unavailable' });
});

test('worker routes preview before the disabled live checkout; creating an order stays blocked', async () => {
  const worker = createWorker(async () => ({ ...admin, email: 'participant@example.test' }));
  assert.equal((await worker.fetch(request(), env)).status, 403);
  const realOrder = new Request('https://circ.local/api/checkout/live/orders', { method: 'POST',
    headers: { Origin: 'https://circ.local', Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: '{}' });
  const result = await worker.fetch(realOrder, env);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, 'live-checkout-not-configured');
});
