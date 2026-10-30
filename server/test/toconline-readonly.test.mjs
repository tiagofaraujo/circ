import test from 'node:test';
import assert from 'node:assert/strict';
import { createToconlineReadonlyApi } from '../payments/toconline-readonly.mjs';

const env = {
  FIREBASE_PROJECT_ID: 'circ-coimbra',
  TOCONLINE_OAUTH_CLIENT_ID: 'client-test',
  TOCONLINE_OAUTH_CLIENT_SECRET: 'secret-test-value',
  TOCONLINE_OAUTH_URL: 'https://oauth.example.test/oauth',
  TOCONLINE_API_URL: 'https://api.example.test/api',
  TOCONLINE_SESSION_KEY: '0123456789abcdef0123456789abcdef-extra',
  TOCONLINE_REDIRECT_URL: 'https://circ.local/api/fiscal/toconline/callback',
};
const claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };

function cookieValue(header, name) {
  const source = Array.isArray(header) ? header.join(', ') : String(header || '');
  const match = source.match(new RegExp(`${name}=([^;,]+)`));
  return match?.[1] || '';
}

function fixture({ serverSessionStore, envOverrides = {} } = {}) {
  const runtimeEnv = { ...env, ...envOverrides };
  let clock = Date.parse('2026-10-17T10:00:00Z');
  let identity = claims;
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET', headers: options.headers, body: options.body || '' });
    if (href === 'https://oauth.example.test/oauth/token') {
      const body = new URLSearchParams(options.body);
      assert.equal(options.method, 'POST');
      assert.match(String(options.headers.Authorization), /^Basic /);
      assert.equal(body.get('scope'), 'commercial');
      if (body.get('grant_type') === 'authorization_code') {
        assert.equal(body.get('code'), 'auth-code');
        return Response.json({ access_token: 'access-one', refresh_token: 'refresh-one', expires_in: 3600, token_type: 'Bearer' });
      }
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'refresh-one');
      return Response.json({ access_token: 'access-two', refresh_token: 'refresh-two', expires_in: 3600, token_type: 'Bearer' });
    }
    if (href.startsWith('https://api.example.test/api/')) {
      assert.equal(options.method, 'GET');
      assert.match(String(options.headers.Authorization), /^Bearer access-(one|two)$/);
      const path = new URL(href).pathname.split('/api/')[1];
      if (path === 'commercial_document_series') return Response.json({ data: [{ id: '10', type: 'commercial_document_series', attributes: { document_type: 'FR', prefix: '2027', number: 1, is_active: true } }] });
      if (path === 'services') return Response.json({ data: [{ id: '20', type: 'services', attributes: { item_code: 'CIRC', item_description: 'Inscrição', sales_price: 95, sales_price_includes_vat: true, tax_code: 'ISE', applied_tax_code: 'ISE', is_active: true }, relationships: { unit_of_measure: { data: { id: '2' } } } }] });
      if (path === 'taxes') return Response.json({ data: [{ id: '30', type: 'taxes', attributes: { tax_country_region: 'PT', tax_code: 'NOR', description: 'Normal', tax_percentage: '23' } }] });
      if (path === 'tax_exemption_reasons') return Response.json({ data: [{ id: '40', type: 'tax_exemption_reasons', attributes: { code: 'M07', description: 'Isento' } }] });
      if (path === 'bank_accounts') return Response.json({ data: [{ id: '50', type: 'bank_accounts', attributes: { name: 'Conta CIRC', iban: 'PT50000000000000000000000', swift: 'TESTPTPL', account_type: 'DO', is_connected: false } }] });
      if (path === 'company_bank_accounts') return Response.json({ data: [{ id: '77', type: 'company_bank_accounts', attributes: { iban: new URL(href).searchParams.get('filter[iban]'), is_connected: false } }] });
      if (path === 'units_of_measure') return Response.json({ data: [{ id: '2', type: 'units_of_measure', attributes: { unit_of_measure: 'un', is_default: true } }] });
      if (path === 'currencies') return Response.json({ data: [{ id: '1', type: 'currencies', attributes: { iso_code: 'EUR', name: 'Euro', symbol: '€' } }] });
      return Response.json({ data: [] });
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  const api = createToconlineReadonlyApi({ verify: async () => identity, now: () => clock, serverSessionStore });
  const request = (path, { method = 'GET', cookie = '', origin = 'https://circ.local' } = {}) => new Request(`https://circ.local/api/fiscal/toconline/${path}`, {
    method,
    headers: {
      Authorization: 'Bearer firebase-token',
      ...(method === 'POST' ? { Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  return {
    call: (path, options) => api(request(path, options), runtimeEnv),
    raw: req => api(req, runtimeEnv),
    calls,
    advance: ms => { clock += ms; },
    setIdentity: value => { identity = value; },
    restore: () => { globalThis.fetch = originalFetch; },
  };
}

async function authorizeAndCallback(f) {
  const start = await f.call('authorize', { method: 'POST' });
  assert.equal(start.status, 200);
  const startData = await start.json();
  const stateCookie = cookieValue(start.headers.get('set-cookie'), '__Host-circ_toc_state');
  assert.ok(stateCookie);
  const authUrl = new URL(startData.authorizationUrl);
  assert.equal(authUrl.origin + authUrl.pathname, 'https://oauth.example.test/oauth/auth');
  assert.equal(authUrl.searchParams.get('client_id'), 'client-test');
  assert.equal(authUrl.searchParams.get('redirect_uri'), env.TOCONLINE_REDIRECT_URL);
  assert.equal(authUrl.searchParams.get('scope'), 'commercial');
  const state = authUrl.searchParams.get('state');
  assert.ok(state);

  const callback = await f.raw(new Request(`https://circ.local/api/fiscal/toconline/callback?code=auth-code&state=${encodeURIComponent(state)}`, {
    headers: { Cookie: `__Host-circ_toc_state=${stateCookie}` },
    redirect: 'manual',
  }));
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/admin/recibos-teste?toconline=connected');
  const tokenHeader = callback.headers.getSetCookie?.() || [callback.headers.get('set-cookie')];
  const token = cookieValue(tokenHeader, '__Host-circ_toc_session');
  assert.ok(token);
  return token;
}

test('config reports safe setup state without exposing credentials', async t => {
  const f = fixture(); t.after(f.restore);
  const response = await f.call('config');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.configured, true);
  assert.equal(data.connected, false);
  assert.equal(data.mode, 'read-only');
  assert.equal(data.commercialWritesEnabled, false);
  assert.equal(data.redirectUrl, env.TOCONLINE_REDIRECT_URL);
  assert.ok(!JSON.stringify(data).includes(env.TOCONLINE_OAUTH_CLIENT_SECRET));
});

for (const [code, reason] of [
  ['payments_service_identity_json_invalid', 'firebase-json'],
  ['payments_service_identity_key_invalid', 'firebase-key'],
  ['payments_service_identity_token_rejected', 'firebase-token'],
  ['private-error-detail', 'server-session'],
]) {
  test(`config reports ${reason} without requiring a new TOConline authorization`, async t => {
    const f = fixture({
      envOverrides: { FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'private-account-json' },
      serverSessionStore: { load: async () => { throw Object.assign(new Error('private-error-detail'), { code }); } },
    });
    t.after(f.restore);
    const response = await f.call('config');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.connected, false);
    assert.equal(data.backgroundAutomation.setupError, reason);
    assert.equal(data.backgroundAutomation.sessionStored, false);
    assert.doesNotMatch(JSON.stringify(data), /private-error-detail|private-account-json|refresh-one|access-one/);
    assert.equal(f.calls.length, 0);
  });
}

test('authorization is admin-only, same-origin and uses signed state', async t => {
  const f = fixture(); t.after(f.restore);
  f.setIdentity({ ...claims, email: 'participant@example.test' });
  assert.equal((await f.call('authorize', { method: 'POST' })).status, 403);
  f.setIdentity(claims);
  assert.equal((await f.call('authorize', { method: 'POST', origin: 'https://evil.invalid' })).status, 403);
  const response = await f.call('authorize', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.equal(f.calls.length, 0);
});

test('callback exchanges authorization code server-side and stores encrypted HttpOnly session', async t => {
  const f = fixture(); t.after(f.restore);
  const token = await authorizeAndCallback(f);
  assert.ok(token.length > 30);
  const oauth = f.calls.find(call => call.href.endsWith('/token'));
  assert.equal(oauth.method, 'POST');
  assert.ok(!token.includes('access-one'));
  assert.ok(!token.includes('refresh-one'));
});

test('read-only resource discovery performs only whitelisted commercial GETs', async t => {
  const f = fixture(); t.after(f.restore);
  const token = await authorizeAndCallback(f);
  const before = f.calls.length;
  const response = await f.call('resources', { cookie: `__Host-circ_toc_session=${token}` });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mode, 'read-only');
  assert.equal(data.commercialWritesEnabled, false);
  assert.equal(data.resources.series.items[0].documentType, 'FR');
  assert.equal(data.resources.services.items[0].code, 'CIRC');
  assert.equal(data.resources.bankAccounts.items[0].name, 'Conta CIRC');
  assert.equal(data.resources.billingBankAccount.source, 'company_bank_accounts');
  assert.equal(data.resources.billingBankAccount.status, 'matched');
  assert.equal(data.resources.billingBankAccount.account.id, '77');
  assert.equal(data.resources.billingBankAccount.assignedToRehearsal, false);
  const commercial = f.calls.slice(before);
  assert.equal(commercial.length, 8);
  assert.ok(commercial.every(call => call.method === 'GET'));
  assert.ok(commercial.every(call => call.href.startsWith('https://api.example.test/api/')));
});

test('expired access token is refreshed without exposing refresh token to the browser', async t => {
  const f = fixture(); t.after(f.restore);
  const token = await authorizeAndCallback(f);
  f.advance(3_700_000);
  const response = await f.call('resources', { cookie: `__Host-circ_toc_session=${token}` });
  assert.equal(response.status, 200);
  const refresh = f.calls.find(call => call.href.endsWith('/token') && String(call.body).includes('grant_type=refresh_token'));
  assert.ok(refresh);
  const setCookie = response.headers.get('set-cookie') || '';
  assert.match(setCookie, /__Host-circ_toc_session=/);
  assert.ok(!setCookie.includes('refresh-two'));
});

test('invalid callback state never exchanges a token', async t => {
  const f = fixture(); t.after(f.restore);
  const response = await f.raw(new Request('https://circ.local/api/fiscal/toconline/callback?code=auth-code&state=invalid', {
    headers: { Cookie: '__Host-circ_toc_state=wrong' },
    redirect: 'manual',
  }));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/recibos-teste?toconline=error&toconline_reason=state');
  assert.equal(f.calls.length, 0);
});

for (const [message, reason] of [
  ['payments_service_identity_unavailable', 'firebase-identity'],
  ['payments_storage_forbidden', 'firebase-permissions'],
  ['payments_storage_unavailable', 'firebase-storage'],
  ['PRIVATE-KEY secret refresh-one unexpected provider detail', 'server-session'],
]) {
  test(`callback reports safe category ${reason} when server session storage fails`, async t => {
    const f = fixture({
      envOverrides: { FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'private-account-json' },
      serverSessionStore: { save: async () => { throw new Error(message); } },
    });
    t.after(f.restore);
    const start = await f.call('authorize', { method: 'POST' });
    const { authorizationUrl } = await start.json();
    const state = new URL(authorizationUrl).searchParams.get('state');
    const stateCookie = cookieValue(start.headers.get('set-cookie'), '__Host-circ_toc_state');
    const response = await f.raw(new Request(`https://circ.local/api/fiscal/toconline/callback?code=auth-code&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: `__Host-circ_toc_state=${stateCookie}` },
    }));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `/admin/recibos-teste?toconline=error&toconline_reason=${reason}`);
    assert.equal(cookieValue(response.headers.get('set-cookie'), '__Host-circ_toc_session'), '');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch([...response.headers].join(' '), /auth-code|refresh-one|access-one|PRIVATE-KEY|private-account-json/);
    assert.equal(f.calls.length, 1);
    assert.ok(f.calls[0].href.endsWith('/token'));
  });
}

test('successful callback still stores the backend session before setting the browser session', async t => {
  let saved;
  const f = fixture({
    envOverrides: { FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'private-account-json' },
    serverSessionStore: { save: async (_env, session) => { saved = session; } },
  });
  t.after(f.restore);
  await authorizeAndCallback(f);
  assert.equal(saved.accessToken, 'access-one');
  assert.equal(saved.refreshToken, 'refresh-one');
});

test('disconnect only clears the browser OAuth session', async t => {
  const f = fixture(); t.after(f.restore);
  const response = await f.call('disconnect', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') || '', /__Host-circ_toc_session=;/);
  assert.equal(f.calls.length, 0);
});

test('billing account discovery uses no caller-supplied bank ID, IBAN or URL and remains administrator-only', async t => {
  const f = fixture(); t.after(f.restore);
  const token = await authorizeAndCallback(f);
  const cookie = `__Host-circ_toc_session=${token}`;
  const response = await f.call('resources?iban=ATTACKER&bank_account_id=2&url=https://evil.invalid', { cookie });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.resources.billingBankAccount.account.id, '77');
  const request = f.calls.find(call => call.href.includes('company_bank_accounts'));
  assert.ok(request); assert.ok(!request.href.includes('ATTACKER')); assert.ok(!request.href.includes('evil.invalid'));
  assert.equal((await f.call('resources', { method: 'POST', cookie })).status, 405);
  f.setIdentity({ ...claims, email: 'participant@example.test' });
  const before = f.calls.length;
  assert.equal((await f.call('resources', { cookie })).status, 403);
  assert.equal(f.calls.length, before);
});
