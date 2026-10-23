import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';

const DOC_ID = 'circ-toconline-server-session';
const isProject = value => typeof value === 'string' && /^[a-z0-9-]+$/.test(value);

function key(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('toconline_session_key_missing');
  return createHash('sha256').update(secret).digest();
}
function encrypt(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const clear = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function decrypt(value, secret) {
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length < 29) throw new Error('invalid_server_session');
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
function validate(session) {
  if (!session || typeof session.accessToken !== 'string' || !session.accessToken
    || typeof session.refreshToken !== 'string' || !session.refreshToken
    || !Number.isFinite(session.expiresAt) || !Number.isFinite(session.refreshExpiresAt)) throw new Error('invalid_server_session');
  return session;
}
export function createToconlineServerSessionStore({
  tokenProvider = createPaymentsServiceTokenProvider(),
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  async function resource(env) {
    if (!isProject(env.FIREBASE_PROJECT_ID)) throw new Error('payments_storage_unavailable');
    const token = await tokenProvider(env);
    return {
      token,
      url: `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/${DOC_ID}`,
    };
  }
  async function call(env, method = 'GET', body) {
    const target = await resource(env);
    let response;
    try {
      response = await fetchImpl(target.url, {
        method, redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
    } catch { throw new Error('payments_storage_unavailable'); }
    if (method === 'GET' && response.status === 404) return null;
    if (!response.ok) throw new Error(response.status === 403 ? 'payments_storage_forbidden' : 'payments_storage_unavailable');
    return response.json();
  }
  return {
    async save(env, session) {
      validate(session);
      const payload = encrypt(session, env.TOCONLINE_SESSION_KEY);
      const document = await call(env, 'PATCH', { fields: {
        kind: { stringValue: 'toconline-server-session' },
        environment: { stringValue: 'production' },
        payload: { stringValue: payload },
        refreshExpiresAt: { integerValue: String(Math.trunc(session.refreshExpiresAt)) },
        updatedAt: { timestampValue: now() },
      } });
      if (!document?.updateTime) throw new Error('payments_storage_unavailable');
      return { updateTime: document.updateTime };
    },
    async load(env) {
      const document = await call(env);
      if (!document) return null;
      const fields = document.fields || {};
      if (fields.kind?.stringValue !== 'toconline-server-session'
        || fields.environment?.stringValue !== 'production'
        || typeof fields.payload?.stringValue !== 'string') throw new Error('payments_storage_unavailable');
      return { session: validate(decrypt(fields.payload.stringValue, env.TOCONLINE_SESSION_KEY)), updateTime: document.updateTime || null };
    },
    async clear(env) {
      const target = await resource(env);
      let response;
      try {
        response = await fetchImpl(target.url, { method: 'DELETE', redirect: 'manual',
          headers: { Authorization: `Bearer ${target.token}` }, signal: AbortSignal.timeout(10000) });
      } catch { throw new Error('payments_storage_unavailable'); }
      if (![200, 204, 404].includes(response.status)) throw new Error('payments_storage_unavailable');
      return true;
    },
  };
}
