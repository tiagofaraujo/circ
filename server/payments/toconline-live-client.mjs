import { Buffer } from 'node:buffer';
import { createToconlineServerSessionStore } from './toconline-server-session-store.mjs';

function fail(code, status = 503, uncertain = false) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.uncertain = uncertain;
  throw error;
}
function baseUrl(raw, code) {
  if (typeof raw !== 'string' || !raw.trim()) fail(code);
  let url;
  try { url = new URL(raw.trim()); } catch { fail(code); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail(code);
  return url.toString().replace(/\/$/, '');
}
async function refresh(session, env, fetchImpl, nowMs) {
  if (!session?.refreshToken || session.refreshExpiresAt <= nowMs) fail('toconline-reauthorize-required', 401);
  const oauth = baseUrl(env.TOCONLINE_OAUTH_URL, 'toconline-oauth-url-invalid');
  const clientId = env.TOCONLINE_OAUTH_CLIENT_ID;
  const clientSecret = env.TOCONLINE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) fail('toconline-not-configured');
  let response;
  try {
    response = await fetchImpl(`${oauth}/token`, {
      method: 'POST', redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken, scope: 'commercial' }).toString(),
      signal: AbortSignal.timeout(10000),
    });
  } catch { fail('toconline-oauth-unavailable', 502); }
  if (!response.ok) fail(response.status === 401 ? 'toconline-reauthorize-required' : 'toconline-oauth-rejected', response.status === 401 ? 401 : 502);
  let data;
  try { data = await response.json(); } catch { fail('toconline-oauth-invalid-response', 502); }
  if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(Number(data.expires_in))) fail('toconline-oauth-invalid-response', 502);
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : session.refreshToken,
    expiresAt: nowMs + Number(data.expires_in) * 1000,
    refreshExpiresAt: session.refreshExpiresAt,
    tokenType: data.token_type || 'Bearer',
  };
}

export function createToconlineLiveClient({
  sessionStore = createToconlineServerSessionStore(),
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  async function activeSession(env) {
    const saved = await sessionStore.load(env);
    if (!saved?.session) fail('toconline-background-session-missing', 503);
    let session = saved.session;
    if (session.expiresAt <= now() + 90_000) {
      session = await refresh(session, env, fetchImpl, now());
      await sessionStore.save(env, session);
    }
    return session;
  }
  return {
    async issueFinalizedSalesDocument(env, payload) {
      if (!payload || payload.document_type !== 'FR' || payload.document_series_id !== 244
        || typeof payload.external_reference !== 'string' || !/^CIRC27-[A-Z0-9-]{8,80}$/.test(payload.external_reference)
        || !Array.isArray(payload.lines) || payload.lines.length < 1) fail('toconline-live-payload-invalid', 400);
      const session = await activeSession(env);
      const api = baseUrl(env.TOCONLINE_API_URL, 'toconline-api-url-invalid');
      let response;
      try {
        response = await fetchImpl(`${api}/v1/commercial_sales_documents`, {
          method: 'POST', redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
      } catch {
        // A transport error after POST is ambiguous. Never retry automatically.
        fail('toconline-live-outcome-unknown', 502, true);
      }
      if (response.status === 401) {
        // 401 is safe to recover because the provider rejected authorization.
        const renewed = await refresh(session, env, fetchImpl, now());
        await sessionStore.save(env, renewed);
        try {
          response = await fetchImpl(`${api}/v1/commercial_sales_documents`, {
            method: 'POST', redirect: 'manual',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${renewed.accessToken}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(12000),
          });
        } catch { fail('toconline-live-outcome-unknown', 502, true); }
      }
      if (!response.ok || (response.status >= 300 && response.status < 400)) {
        if (response.status >= 500) fail('toconline-live-outcome-unknown', 502, true);
        fail('toconline-live-rejected', response.status || 502, false);
      }
      // A successful HTTP status alone does not identify a finalized FR.
      // The POST may have issued it even if its response is incomplete: never
      // repeat that POST or record an unidentifiable document as issued.
      if (![200, 201].includes(response.status)) fail('toconline-live-outcome-unknown', 502, true);
      let provider;
      try { provider = await response.json(); }
      catch { fail('toconline-live-outcome-unknown', 502, true); }
      const documentId = provider?.id ?? provider?.data?.id;
      const hasDocumentId = (Number.isSafeInteger(documentId) && documentId > 0)
        || (typeof documentId === 'string' && documentId.trim().length > 0 && documentId.length <= 128);
      if (!hasDocumentId || (Array.isArray(provider?.errors) && provider.errors.length > 0)) {
        fail('toconline-live-outcome-unknown', 502, true);
      }
      return {
        accepted: true,
        finalized: true,
        externalReference: payload.external_reference,
        providerDocumentId: documentId,
        providerDocumentNo: provider?.document_no ?? provider?.data?.attributes?.document_no ?? null,
      };
    },
  };
}
