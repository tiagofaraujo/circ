import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { hasRegistrationManagementAccess } from '../../src/auth/registrationPermissions.js';

const manager = { sub: 'paulo', email: 'paulojaneiro77@gmail.com', email_verified: true };
const id = '649d2dbd-6125-4212-bfa8-22035a3a55e7';
const payment = { id, userId: 'participant', eventId: 'circ-2027', registrationId: 'circ-2027-participant', environment: 'production',
  status: 'paid', method: 'multibanco', amountCents: 9500, currency: 'EUR', fiscalStatus: 'pending_authorization' };
const env = { FIREBASE_PROJECT_ID: 'circ-test', LIVE_CHECKOUT_ENABLED: 'false' };
function fixture(claims) {
  let reads = 0;
  const api = createCheckoutLiveApi({ verify: async () => claims, tokenProvider: async () => 'service-token',
    storeFactory: () => ({ payment: async () => { reads++; return { data: payment }; },
      document: async () => ({ data: { ...payment, status: 'pending_authorization' } }) }) });
  return { call: path => api(new Request(`https://circ.test/api/checkout/live/${path}`, { headers: { Authorization: 'Bearer test-token' } }), env), reads: () => reads };
}
test('the scoped manager can read diagnostics and another participant order without enabling checkout', async () => {
  const f = fixture(manager);
  const diagnostics = await f.call('diagnostics');
  assert.equal(diagnostics.status, 200);
  assert.equal((await diagnostics.json()).liveCheckoutEnabled, false);
  assert.equal(f.reads(), 0);
  const response = await f.call(`orders/${id}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).order.id, id);
  assert.equal((await (await f.call('config')).json()).pilotAvailable, false);
});
test('an unrelated account cannot consult other orders or diagnostics and an unverified manager is rejected', async () => {
  const other = fixture({ ...manager, email: 'other@example.test', roles: { admin: true, billing: true } });
  assert.equal((await other.call('diagnostics')).status, 403);
  assert.equal((await other.call(`orders/${id}`)).status, 404);
  const unverified = fixture({ ...manager, email_verified: false });
  assert.equal((await unverified.call(`orders/${id}`)).status, 403);
  assert.equal(unverified.reads(), 0);
});
test('the shared permission requires a verified exact email, with case normalization', () => {
  assert.equal(hasRegistrationManagementAccess(' PAULOJANEIRO77@GMAIL.COM ', true), true);
  for (const email of [null, '', 'paulojaneiro77+other@gmail.com', 'paulojaneiro77@gmail.com.attacker.test']) assert.equal(hasRegistrationManagementAccess(email, true), false);
  for (const verified of [false, undefined, 1, 'true']) assert.equal(hasRegistrationManagementAccess(manager.email, verified), false);
});
