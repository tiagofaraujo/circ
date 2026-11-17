import test from 'node:test';
import assert from 'node:assert/strict';
import { createToconlineLiveClient } from '../payments/toconline-live-client.mjs';

const env = {
  TOCONLINE_API_URL: 'https://api.example.test/api', TOCONLINE_OAUTH_URL: 'https://oauth.example.test/oauth',
  TOCONLINE_OAUTH_CLIENT_ID: 'client', TOCONLINE_OAUTH_CLIENT_SECRET: 'secret',
  TOCONLINE_REDIRECT_URL: 'https://circ.local/api/fiscal/toconline/callback',
};
const clock = 1_000_000;
const expired = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: clock - 1, refreshExpiresAt: clock - 1 };
function fixture(initial = null, overrides = {}) {
  let stored = initial, lock = null, saves = 0, releases = 0;
  const calls = [];
  const store = {
    load: async () => stored && { session: { ...stored } },
    acquireRefreshLock: async () => { if (lock) return null; lock = 'lease'; return lock; },
    releaseRefreshLock: async (_env, id) => { assert.equal(id, lock); lock = null; releases++; },
    save: async (_env, session, id) => { assert.equal(id, lock); stored = { ...session }; saves++; },
  };
  const fetchImpl = async (raw, options) => {
    const url = new URL(raw);
    calls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    if (url.pathname.endsWith('/auth')) {
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(url.searchParams.get('client_id'), 'client');
      assert.equal(url.searchParams.get('scope'), 'commercial');
      const callback = new URL(env.TOCONLINE_REDIRECT_URL);
      callback.search = new URLSearchParams({ code: 'one-time-code', state: url.searchParams.get('state') });
      if (overrides.auth) return overrides.auth(callback, options);
      return new Response(null, { status: 302, headers: { Location: callback.toString() } });
    }
    assert.equal(url.href, `${env.TOCONLINE_OAUTH_URL}/token`);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('client:secret').toString('base64')}`);
    const body = new URLSearchParams(options.body);
    if (body.get('grant_type') === 'refresh_token' && overrides.refresh) return overrides.refresh();
    if (body.get('grant_type') === 'authorization_code') assert.equal(body.get('code'), 'one-time-code');
    if (overrides.token) return overrides.token();
    return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 14400 });
  };
  const client = createToconlineLiveClient({ sessionStore: store, fetchImpl, now: () => clock });
  return { client, store, calls, stored: () => stored, saves: () => saves, releases: () => releases };
}

for (const [label, initial] of [['missing', null], ['expired overnight', expired]]) {
  test(`${label} session is reauthorized and stored before the operation without browser state`, async () => {
    const f = fixture(initial);
    const result = await f.client.withSession(env, async token => {
      assert.equal(token, 'new-access'); assert.equal(f.saves(), 1); return { ok: true };
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(f.calls.map(({ url }) => url.pathname), ['/oauth/auth', '/oauth/token']);
    assert.equal(f.stored().expiresAt, clock + 4 * 60 * 60 * 1000);
    assert.equal(f.stored().refreshExpiresAt, clock + 8 * 60 * 60 * 1000);
    assert.equal(f.releases(), 1);
  });
}
test('revoked refresh token recovers once using the documented server authorization flow', async () => {
  const f = fixture({ ...expired, refreshExpiresAt: clock + 100000 }, {
    refresh: () => Response.json({ error: 'invalid_grant', private: 'never-return-provider-details' }, { status: 400 }),
  });
  await f.client.withSession(env, async token => assert.equal(token, 'new-access'));
  assert.deepEqual(f.calls.map(({ url }) => url.pathname), ['/oauth/token', '/oauth/auth', '/oauth/token']);
});
test('temporary provider failure does not trigger a new authorization or run the operation', async () => {
  const f = fixture({ ...expired, refreshExpiresAt: clock + 100000 }, { refresh: () => new Response(null, { status: 503 }) });
  await assert.rejects(f.client.withSession(env, () => assert.fail('not authorized')), { code: 'toconline-oauth-rejected' });
  assert.equal(f.calls.length, 1); assert.equal(f.saves(), 0); assert.equal(f.releases(), 1);
});
for (const [label, mutate] of [
  ['external origin', url => { url.hostname = 'untrusted.test'; }],
  ['wrong callback', url => { url.pathname = '/another-callback'; }],
  ['missing state', url => { url.searchParams.delete('state'); }],
  ['wrong state', url => { url.searchParams.set('state', 'wrong'); }],
  ['duplicate code', url => { url.searchParams.append('code', 'another'); }],
  ['provider error', url => { url.searchParams.set('error', 'invalid_request'); }],
]) {
  test(`authorization rejects ${label} without following redirects or exchanging a code`, async () => {
    const f = fixture(null, { auth: url => { mutate(url); return new Response(null, { status: 302, headers: { Location: url.toString() } }); } });
    await assert.rejects(f.client.withSession(env, () => assert.fail('not authorized')), { code: 'toconline-oauth-invalid-response' });
    assert.equal(f.calls.length, 1); assert.equal(f.saves(), 0); assert.equal(f.releases(), 1);
  });
}
test('unexpected login page fails safely and never uses browser credentials', async () => {
  const f = fixture(null, { auth: () => new Response('<html>Login</html>') });
  await assert.rejects(f.client.withSession(env, () => assert.fail('not authorized')), { code: 'toconline-reauthorize-required' });
  assert.equal(f.calls.length, 1); assert.equal(f.releases(), 1);
});
for (const data of [null, {}, { access_token: 'x', refresh_token: 'y', expires_in: -1 }]) {
  test(`invalid OAuth token response ${JSON.stringify(data)} cannot reach an operation`, async () => {
    const f = fixture(null, { token: () => Response.json(data) });
    await assert.rejects(f.client.withSession(env, () => assert.fail('invalid tokens')), { code: 'toconline-oauth-invalid-response' });
    assert.equal(f.saves(), 0); assert.equal(f.releases(), 1);
  });
}
test('failed durable persistence blocks the operation and hides private storage errors', async () => {
  const f = fixture();
  f.store.save = async () => { throw new Error('private-storage-secret'); };
  await assert.rejects(f.client.withSession(env, () => assert.fail('not stored')), { code: 'toconline-background-session-unavailable' });
  assert.equal(f.releases(), 1);
});
test('simultaneous operations share one OAuth renewal and both use the persisted token', async () => {
  const f = fixture();
  const operations = await Promise.all([f.client.withSession(env, token => token), f.client.withSession(env, token => token)]);
  assert.deepEqual(operations, ['new-access', 'new-access']);
  assert.equal(f.calls.length, 2); assert.equal(f.saves(), 1); assert.equal(f.releases(), 1);
});
test('a second unauthorized response stops after one recovery attempt', async () => {
  const f = fixture({ ...expired, expiresAt: clock + 200000, refreshExpiresAt: clock + 300000 });
  let attempts = 0;
  await assert.rejects(f.client.withSession(env, () => { attempts++; throw Object.assign(new Error('unauthorized'), { code: 'toconline-api-unauthorized' }); }),
    { code: 'toconline-reauthorize-required' });
  assert.equal(attempts, 2); assert.equal(f.calls.length, 1); assert.equal(f.saves(), 1);
});
