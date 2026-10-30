import { importPKCS8, SignJWT } from 'jose';

const ENDPOINT = 'https://oauth2.googleapis.com/token';

function identityFailure(reason) {
  const error = new Error('payments_service_identity_unavailable');
  error.code = `payments_service_identity_${reason}`;
  throw error;
}

export function createPaymentsServiceTokenProvider({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cached;
  return async function paymentsServiceToken(env) {
    const credential = env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT;
    if (cached?.credential === credential && cached.project === env.FIREBASE_PROJECT_ID && cached.expires > now() + 60000) return cached.token;
    let account;
    try { account = JSON.parse(credential); } catch { identityFailure('json_invalid'); }
    if (!account || account.type !== 'service_account' || account.project_id !== env.FIREBASE_PROJECT_ID
      || typeof account.client_email !== 'string'
      || !account.client_email.endsWith(`@${env.FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`)) identityFailure('account_invalid');
    let key;
    try { key = await importPKCS8(account.private_key, 'RS256'); } catch { identityFailure('key_invalid'); }
    const issued = Math.floor(now() / 1000);
    let assertion;
    try {
      assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(account.client_email)
        .setAudience(ENDPOINT).setIssuedAt(issued).setExpirationTime(issued + 3600).sign(key);
    } catch { identityFailure('signing_failed'); }
    let response;
    try {
      response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        signal: AbortSignal.timeout(8000) });
    } catch { identityFailure('network_failed'); }
    let data;
    try { data = await response.json(); } catch { identityFailure(response.ok ? 'response_invalid' : 'token_rejected'); }
    if (!response.ok) {
      // Recognise documented Google errors, but never return their raw contents.
      if (data?.error === 'invalid_grant' && data.error_description === 'Invalid JWT Signature.') identityFailure('signature_rejected');
      if (data?.error === 'invalid_grant' && typeof data.error_description === 'string'
        && data.error_description.startsWith('Invalid JWT: Token must be a short-lived token')) identityFailure('clock_rejected');
      identityFailure('token_rejected');
    }
    if (!data || typeof data.access_token !== 'string' || !data.access_token || data.token_type !== 'Bearer'
      || !Number.isSafeInteger(data.expires_in) || data.expires_in < 120 || data.expires_in > 3600) identityFailure('response_invalid');
    cached = { credential, project: env.FIREBASE_PROJECT_ID, token: data.access_token, expires: now() + data.expires_in * 1000 };
    return cached.token;
  };
}
