import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readBillingBankAccount } from './toconline-billing-bank-readonly.mjs';
import { createToconlineServerSessionStore } from './toconline-server-session-store.mjs';

const PREFIX = '/api/fiscal/toconline';
const ADMIN = 'circ.chuc@gmail.com';
const STATE_COOKIE = '__Host-circ_toc_state';
const TOKEN_COOKIE = '__Host-circ_toc_session';
const SCOPE = 'commercial';
const STATE_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 8 * 60 * 60;

const json = (body, status = 200, extraHeaders = {}) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization, Cookie',
  'X-Content-Type-Options': 'nosniff',
  ...extraHeaders,
} });

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}

const fail = (code, status = 503) => {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
};

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function unbase64url(value) {
  return Buffer.from(value, 'base64url');
}

function secureKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) fail('toconline-session-key-missing');
  return createHash('sha256').update(secret).digest();
}

function safeBaseUrl(raw, code) {
  if (typeof raw !== 'string' || !raw.trim()) fail(code);
  let url;
  try { url = new URL(raw.trim()); } catch { fail(code); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail(code);
  return url.toString().replace(/\/$/, '');
}

function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function cookie(name, value, { maxAge, sameSite = 'Strict' } = {}) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}; Priority=High`;
}

function clearCookie(name, sameSite = 'Strict') {
  return cookie(name, '', { maxAge: 0, sameSite });
}

function signState(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secureKey(secret)).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyState(value, secret, nowMs) {
  if (typeof value !== 'string' || value.length > 2048) fail('toconline-invalid-state', 400);
  const [encoded, supplied, extra] = value.split('.');
  if (!encoded || !supplied || extra) fail('toconline-invalid-state', 400);
  const expected = createHmac('sha256', secureKey(secret)).update(encoded).digest();
  const actual = unbase64url(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('toconline-invalid-state', 400);
  let payload;
  try { payload = JSON.parse(unbase64url(encoded).toString('utf8')); } catch { fail('toconline-invalid-state', 400); }
  if (!payload || typeof payload.nonce !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(payload.nonce)
    || typeof payload.uid !== 'string' || payload.uid.length > 128
    || !Number.isFinite(payload.exp) || payload.exp < nowMs) fail('toconline-invalid-state', 400);
  return payload;
}

function encryptSession(session, secret) {
  const key = secureKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptSession(value, secret) {
  if (typeof value !== 'string' || !value || value.length > 6000) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29) return null;
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const ciphertext = bytes.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', secureKey(secret), iv);
    decipher.setAuthTag(tag);
    const clear = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const session = JSON.parse(clear);
    if (!session || typeof session.accessToken !== 'string' || !session.accessToken
      || typeof session.refreshToken !== 'string' || !session.refreshToken
      || !Number.isFinite(session.expiresAt) || !Number.isFinite(session.refreshExpiresAt)) return null;
    return session;
  } catch {
    return null;
  }
}

function configuration(env) {
  const values = {
    clientId: env.TOCONLINE_OAUTH_CLIENT_ID,
    clientSecret: env.TOCONLINE_OAUTH_CLIENT_SECRET,
    oauthUrl: env.TOCONLINE_OAUTH_URL,
    apiUrl: env.TOCONLINE_API_URL,
    sessionKey: env.TOCONLINE_SESSION_KEY,
    redirectUrl: env.TOCONLINE_REDIRECT_URL,
  };
  const missing = Object.entries(values).filter(([, value]) => typeof value !== 'string' || !value.trim()).map(([name]) => name);
  if (!missing.length) {
    safeBaseUrl(values.oauthUrl, 'toconline-oauth-url-invalid');
    safeBaseUrl(values.apiUrl, 'toconline-api-url-invalid');
    const redirect = safeBaseUrl(values.redirectUrl, 'toconline-redirect-url-invalid');
    const parsed = new URL(redirect);
    if (parsed.pathname !== '/api/fiscal/toconline/callback' || parsed.search || parsed.hash) fail('toconline-redirect-url-invalid');
    secureKey(values.sessionKey);
  }
  return { ...values, missing, configured: missing.length === 0 };
}

async function verifyAdmin(request, env, verify) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) fail('sign-in-required', 401);
  if (!env.FIREBASE_PROJECT_ID) fail('service-unavailable');
  let claims;
  try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { fail('invalid-session', 401); }
  if (claims.email_verified !== true || claims.email !== ADMIN) fail('admin-required', 403);
  return claims;
}

function sameOrigin(request) {
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin) fail('invalid-origin', 403);
}

async function tokenRequest(env, params) {
  const cfg = configuration(env);
  if (!cfg.configured) fail('toconline-not-configured');
  const body = new URLSearchParams(params);
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`, 'utf8').toString('base64');
  let response;
  try {
    response = await fetch(`${safeBaseUrl(cfg.oauthUrl, 'toconline-oauth-url-invalid')}/token`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });
  } catch { fail('toconline-oauth-unavailable'); }
  if (!response.ok) fail(response.status === 401 ? 'toconline-oauth-unauthorized' : 'toconline-oauth-rejected', 502);
  let data;
  try { data = await response.json(); } catch { fail('toconline-oauth-invalid-response', 502); }
  if (typeof data.access_token !== 'string' || !data.access_token
    || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) fail('toconline-oauth-invalid-response', 502);
  return data;
}

async function refreshSession(session, env, nowMs) {
  if (session.refreshExpiresAt <= nowMs) fail('toconline-reauthorize-required', 401);
  const data = await tokenRequest(env, {
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
    scope: SCOPE,
  });
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : session.refreshToken,
    expiresAt: nowMs + (Number(data.expires_in) * 1000),
    refreshExpiresAt: nowMs + SESSION_TTL_SECONDS * 1000,
    tokenType: data.token_type || 'Bearer',
  };
}

async function validSession(request, env, nowMs) {
  const cfg = configuration(env);
  if (!cfg.configured) fail('toconline-not-configured');
  const encrypted = parseCookies(request)[TOKEN_COOKIE];
  let session = decryptSession(encrypted, cfg.sessionKey);
  if (!session) fail('toconline-not-connected', 401);
  let refreshed = false;
  if (session.expiresAt <= nowMs + 90_000) {
    session = await refreshSession(session, env, nowMs);
    refreshed = true;
  }
  return { session, refreshed, cfg };
}

async function providerGet(apiBase, accessToken, resource) {
  const base = safeBaseUrl(apiBase, 'toconline-api-url-invalid');
  const url = new URL(`${base}/${resource}`);
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch { fail('toconline-api-unavailable', 502); }
  if (response.status === 401) {
    const error = new Error('toconline-api-unauthorized');
    error.code = 'toconline-api-unauthorized';
    error.status = 401;
    throw error;
  }
  if (!response.ok || response.status >= 300 && response.status < 400) {
    const error = new Error('toconline-api-resource-error');
    error.code = 'toconline-api-resource-error';
    error.status = response.status;
    throw error;
  }
  let data;
  try { data = await response.json(); } catch { fail('toconline-api-invalid-response', 502); }
  if (!data || !Array.isArray(data.data)) fail('toconline-api-invalid-response', 502);
  return data.data;
}

const attr = (row, key) => row?.attributes?.[key] ?? null;
const relationId = (row, key) => row?.relationships?.[key]?.data?.id ?? null;

function summarizeSeries(rows) {
  return rows.map(row => ({
    id: row.id,
    documentType: attr(row, 'document_type'),
    prefix: attr(row, 'prefix'),
    number: attr(row, 'number'),
    description: attr(row, 'description'),
    active: attr(row, 'is_active'),
  }));
}

function summarizeServices(rows) {
  return rows.map(row => ({
    id: row.id,
    code: attr(row, 'item_code'),
    description: attr(row, 'item_description'),
    price: attr(row, 'sales_price'),
    priceIncludesVat: attr(row, 'sales_price_includes_vat'),
    taxCode: attr(row, 'tax_code'),
    appliedTaxCode: attr(row, 'applied_tax_code'),
    exemptionReasonId: attr(row, 'applied_tax_exemption_reason_id'),
    unitOfMeasureId: relationId(row, 'unit_of_measure'),
    active: attr(row, 'is_active'),
  }));
}

function summarizeTaxes(rows) {
  return rows.map(row => ({
    id: row.id,
    region: attr(row, 'tax_country_region'),
    code: attr(row, 'tax_code'),
    description: attr(row, 'description'),
    percentage: attr(row, 'tax_percentage'),
    expiresAt: attr(row, 'tax_expiration_date'),
  }));
}

function summarizeExemptions(rows) {
  return rows.map(row => ({
    id: row.id,
    code: attr(row, 'code'),
    description: attr(row, 'description'),
    legalReference: attr(row, 'legal_reference'),
  }));
}

function summarizeAccounts(rows) {
  return rows.map(row => ({
    id: row.id,
    name: attr(row, 'name'),
    iban: attr(row, 'iban'),
    swift: attr(row, 'swift'),
    accountType: attr(row, 'account_type'),
    connected: attr(row, 'is_connected'),
  }));
}

function summarizeUnits(rows) {
  return rows.map(row => ({
    id: row.id,
    code: attr(row, 'unit_of_measure'),
    default: attr(row, 'is_default'),
  }));
}

function summarizeCurrencies(rows) {
  return rows.map(row => ({
    id: row.id,
    isoCode: attr(row, 'iso_code'),
    name: attr(row, 'name'),
    symbol: attr(row, 'symbol'),
  }));
}

async function readResources(session, cfg) {
  const definitions = [
    ['series', 'commercial_document_series?filter[document_type]=FR&page[size]=100', summarizeSeries],
    ['services', 'services?page[size]=100', summarizeServices],
    ['taxes', 'taxes?filter[tax_country_region]=PT&page[size]=100', summarizeTaxes],
    ['exemptions', 'tax_exemption_reasons?page[size]=100', summarizeExemptions],
    ['bankAccounts', 'bank_accounts?page[size]=100', summarizeAccounts],
    ['units', 'units_of_measure?page[size]=100', summarizeUnits],
    ['currencies', 'currencies?filter[iso_code]=EUR&page[size]=20', summarizeCurrencies],
  ];
  const results = {};
  for (const [name, resource, summarize] of definitions) {
    try {
      const rows = await providerGet(cfg.apiUrl, session.accessToken, resource);
      results[name] = { ok: true, count: rows.length, items: summarize(rows) };
    } catch (error) {
      if (error.code === 'toconline-api-unauthorized') throw error;
      results[name] = { ok: false, count: 0, items: [], error: error.code || 'toconline-api-resource-error', status: error.status || 502 };
    }
  }
  results.billingBankAccount = await readBillingBankAccount(resource => providerGet(cfg.apiUrl, session.accessToken, resource));
  return results;
}


export async function withToconlineSession(request, env, nowMs, operation) {
  let current = await validSession(request, env, nowMs);
  let value;
  try {
    value = await operation(current.cfg.apiUrl, current.session.accessToken);
  } catch (error) {
    if (error?.code !== 'toconline-api-unauthorized') throw error;
    current = { ...current, session: await refreshSession(current.session, env, nowMs), refreshed: true };
    value = await operation(current.cfg.apiUrl, current.session.accessToken);
  }
  return {
    value,
    setCookie: current.refreshed
      ? cookie(TOKEN_COOKIE, encryptSession(current.session, current.cfg.sessionKey), { maxAge: SESSION_TTL_SECONDS })
      : null,
  };
}

function safeError(error) {
  const code = error.code || error.message || 'service-unavailable';
  const status = Number(error.status) || (code === 'sign-in-required' || code === 'invalid-session' || code === 'toconline-not-connected' || code === 'toconline-reauthorize-required' ? 401
    : code === 'admin-required' || code === 'invalid-origin' ? 403
    : code.includes('invalid') ? 400 : 503);
  return json({ error: code }, status);
}

export function createToconlineReadonlyApi({ verify, now = () => Date.now(), serverSessionStore = createToconlineServerSessionStore() }) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return null;

    if (url.pathname === `${PREFIX}/callback`) {
      if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
      try {
        const cfg = configuration(env);
        if (!cfg.configured) fail('toconline-not-configured');
        const cookies = parseCookies(request);
        const payload = verifyState(url.searchParams.get('state'), cfg.sessionKey, now());
        if (!cookies[STATE_COOKIE] || cookies[STATE_COOKIE] !== payload.nonce) fail('toconline-invalid-state', 400);
        const code = url.searchParams.get('code');
        if (typeof code !== 'string' || !code || code.length > 2048) fail('toconline-oauth-code-missing', 400);
        const data = await tokenRequest(env, { grant_type: 'authorization_code', code, scope: SCOPE });
        if (typeof data.refresh_token !== 'string' || !data.refresh_token) fail('toconline-oauth-invalid-response', 502);
        const current = now();
        const session = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: current + Number(data.expires_in) * 1000,
          refreshExpiresAt: current + SESSION_TTL_SECONDS * 1000,
          tokenType: data.token_type || 'Bearer',
        };
        if (env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT) await serverSessionStore.save(env, session);
        return redirect('/admin/recibos-teste?toconline=connected', [
          cookie(TOKEN_COOKIE, encryptSession(session, cfg.sessionKey), { maxAge: SESSION_TTL_SECONDS }),
          clearCookie(STATE_COOKIE, 'Lax'),
        ]);
      } catch {
        return redirect('/admin/recibos-teste?toconline=error', [clearCookie(STATE_COOKIE, 'Lax')]);
      }
    }

    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);

    try {
      const claims = await verifyAdmin(request, env, verify);
      const cfg = configuration(env);
      const encrypted = parseCookies(request)[TOKEN_COOKIE];
      const existing = cfg.configured ? decryptSession(encrypted, cfg.sessionKey) : null;

      if (url.pathname === `${PREFIX}/config`) {
        if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
        let backgroundSession = null;
        if (env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT) {
          try { backgroundSession = await serverSessionStore.load(env); } catch { backgroundSession = null; }
        }
        return json({
          provider: 'toconline',
          configured: cfg.configured,
          missing: cfg.missing,
          connected: Boolean(existing && existing.refreshExpiresAt > now()),
          accessExpiresAt: existing?.expiresAt || null,
          sessionExpiresAt: existing?.refreshExpiresAt || null,
          scope: SCOPE,
          redirectUrl: cfg.redirectUrl || 'https://circ-coimbra.org/api/fiscal/toconline/callback',
          mode: 'read-only',
          commercialWritesEnabled: false,
          backgroundAutomation: {
            serviceIdentityConfigured: Boolean(env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT),
            sessionStored: Boolean(backgroundSession?.session?.refreshExpiresAt > now()),
            sessionExpiresAt: backgroundSession?.session?.refreshExpiresAt || null,
          },
        });
      }

      if (url.pathname === `${PREFIX}/authorize`) {
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
        sameOrigin(request);
        if (!cfg.configured) fail('toconline-not-configured');
        const nonce = randomBytes(24).toString('base64url');
        const state = signState({ nonce, uid: claims.sub, exp: now() + STATE_TTL_SECONDS * 1000 }, cfg.sessionKey);
        const authorize = new URL(`${safeBaseUrl(cfg.oauthUrl, 'toconline-oauth-url-invalid')}/auth`);
        authorize.searchParams.set('client_id', cfg.clientId);
        authorize.searchParams.set('redirect_uri', cfg.redirectUrl);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('scope', SCOPE);
        authorize.searchParams.set('state', state);
        return json({ authorizationUrl: authorize.toString() }, 200, {
          'Set-Cookie': cookie(STATE_COOKIE, nonce, { maxAge: STATE_TTL_SECONDS, sameSite: 'Lax' }),
        });
      }

      if (url.pathname === `${PREFIX}/disconnect`) {
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
        sameOrigin(request);
        return json({ disconnected: true }, 200, { 'Set-Cookie': clearCookie(TOKEN_COOKIE) });
      }

      if (url.pathname === `${PREFIX}/resources`) {
        if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);
        let current = await validSession(request, env, now());
        let resources;
        try {
          resources = await readResources(current.session, current.cfg);
        } catch (error) {
          if (error.code !== 'toconline-api-unauthorized') throw error;
          current = { ...current, session: await refreshSession(current.session, env, now()), refreshed: true };
          resources = await readResources(current.session, current.cfg);
        }
        const headers = current.refreshed
          ? { 'Set-Cookie': cookie(TOKEN_COOKIE, encryptSession(current.session, cfg.sessionKey), { maxAge: SESSION_TTL_SECONDS }) }
          : {};
        return json({
          provider: 'toconline',
          mode: 'read-only',
          commercialWritesEnabled: false,
          fetchedAt: new Date(now()).toISOString(),
          resources,
        }, 200, headers);
      }

      return json({ error: 'not-found' }, 404);
    } catch (error) {
      return safeError(error);
    }
  };
}
