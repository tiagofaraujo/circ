import test from 'node:test';
import assert from 'node:assert/strict';
import { isLiveCheckoutEnabled, isPrivatePilotWindow, livePilotDeadline } from '../payments/live-pilot-contract.mjs';

test('pilot deadline is strict UTC and closes at the exact expiry boundary', () => {
  const env = { LIVE_CHECKOUT_ENABLED: 'true', LIVE_PILOT_UNTIL: '2026-10-31T12:00:00Z' };
  const deadline = Date.parse(env.LIVE_PILOT_UNTIL);
  assert.equal(isLiveCheckoutEnabled(env, deadline - 1), true);
  assert.equal(isLiveCheckoutEnabled(env, deadline), false);
  assert.equal(isLiveCheckoutEnabled(env, deadline + 1), false);
  assert.equal(isLiveCheckoutEnabled({ ...env, LIVE_CHECKOUT_ENABLED: 'false' }, deadline - 1), false);
  assert.equal(isLiveCheckoutEnabled(env, NaN), false);
  for (const value of ['', null, '2026-10-31', '2026-02-30T12:00:00Z', '2026-10-31T25:00:00Z', '2026-10-31T12:00:00+00:00']) {
    const invalid = { ...env, LIVE_PILOT_UNTIL: value };
    assert.equal(isPrivatePilotWindow(invalid), true);
    assert.equal(livePilotDeadline(invalid), null);
    assert.equal(isLiveCheckoutEnabled(invalid, deadline - 1), false);
  }
  assert.equal(isPrivatePilotWindow({}), false);
  assert.equal(isLiveCheckoutEnabled({ LIVE_CHECKOUT_ENABLED: 'true' }, deadline), true);
  assert.equal(isLiveCheckoutEnabled({ LIVE_CHECKOUT_ENABLED: 'false' }, deadline), false);
});
