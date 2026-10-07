import { importPKCS8, SignJWT } from 'jose';

const ENDPOINT = 'https://oauth2.googleapis.com/token';
// One cached credential per Worker isolate; never persisted or sent to the browser.
export function createServiceTokenProvider({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let cached;
  return async function serviceToken(env) {
    const credential = env.FIREBASE_SANDBOX_SERVICE_ACCOUNT;
    if (cached?.credential === credential && cached.project === env.FIREBASE_PROJECT_ID && cached.expires > now() + 60000) return cached.token;
    try {
      const account = JSON.parse(credential);
      if (account.type !== 'service_account' || account.project_id !== env.FIREBASE_PROJECT_ID
        || typeof account.client_email !== 'string'
        || !account.client_email.endsWith(`@${env.FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`)) throw new Error();
      const key = await importPKCS8(account.private_key, 'RS256');
      const issued = Math.floor(now() / 1000);
      const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(account.client_email)
        .setAudience(ENDPOINT).setIssuedAt(issued).setExpirationTime(issued + 3600).sign(key);
      // Ignore token_uri from the credential: credentials go only to Google's fixed endpoint.
      const response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (typeof data.access_token !== 'string' || !data.access_token || data.token_type !== 'Bearer'
        || !Number.isSafeInteger(data.expires_in) || data.expires_in < 120 || data.expires_in > 3600) throw new Error();
      cached = { credential, project: env.FIREBASE_PROJECT_ID, token: data.access_token, expires: now() + data.expires_in * 1000 };
      return cached.token;
    } catch { throw new Error('service_identity_unavailable'); }
  };
}
