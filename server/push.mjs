import { createHash, createECDH } from 'node:crypto';
import webpush from 'web-push';
import { createPaymentsServiceTokenProvider } from './payments/payments-service-token.mjs';

const ADMIN = 'circ.chuc@gmail.com';
const BASE = '/api/push/';
const id = endpoint => createHash('sha256').update(endpoint).digest('hex');
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });

// Push endpoints are capabilities. Never log them or send requests to arbitrary URLs.
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && ((url.hostname === 'fcm.googleapis.com' && /^\/(?:fcm\/send|wp)\/.+/.test(url.pathname))
        || (url.hostname === 'web.push.apple.com' && url.pathname.length > 1)
        || (url.hostname === 'updates.push.services.mozilla.com' && /^\/(?:wpush|push)\/.+/.test(url.pathname)));
  } catch { return false; }
}

function validKey(value, bytes) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
    && Buffer.from(value, 'base64url').length === bytes
    && Buffer.from(value, 'base64url').toString('base64url') === value;
}

export function normalizePushSubscription(value) {
  if (!validPushEndpoint(value?.endpoint) || !validKey(value.keys?.p256dh, 65)
    || Buffer.from(value.keys.p256dh, 'base64url')[0] !== 4 || !validKey(value.keys?.auth, 16)) {
    throw new Error('invalid-subscription');
  }
  return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

export function pushConfiguration(env) {
  let keysReady = false;
  try {
    if (validKey(env.PUSH_VAPID_PUBLIC_KEY, 65) && validKey(env.PUSH_VAPID_PRIVATE_KEY, 32)) {
      // Also validate the pair: a syntactically correct, unrelated key would break delivery.
      const pair = createECDH('prime256v1');
      pair.setPrivateKey(Buffer.from(env.PUSH_VAPID_PRIVATE_KEY, 'base64url'));
      keysReady = pair.getPublicKey().toString('base64url') === env.PUSH_VAPID_PUBLIC_KEY;
    }
  } catch { /* Misconfiguration must keep opt-in disabled. */ }
  const storageReady = Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_PAYMENTS_SERVICE_ACCOUNT);
  return { enabled: env.PUSH_ENABLED === 'true' && keysReady && storageReady,
    testOnly: env.PUSH_TEST_ONLY !== 'false', keysReady, storageReady,
    publicKey: keysReady ? env.PUSH_VAPID_PUBLIC_KEY : null };
}

async function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '') || !request.body) throw new Error('invalid-request');
  const reader = request.body.getReader();
  const parts = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw new Error('invalid-request'); }
    parts.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

export function createPushStore({ projectId, token, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || !token) throw new Error('storage-unavailable');
  const root = `projects/${projectId}/databases/(default)/documents/pushSubscriptions`;
  const origin = 'https://firestore.googleapis.com/v1/';
  const init = () => ({ redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return {
    async read(endpoint) {
      const name = `${root}/${id(endpoint)}`;
      const response = await fetchImpl(origin + name, init());
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('storage-unavailable');
      const doc = await response.json();
      const value = JSON.parse(doc.fields?.record?.stringValue || 'null');
      if (doc.name !== name || !doc.updateTime || !value?.uid || value.subscription?.endpoint !== endpoint) throw new Error('storage-unavailable');
      return { ...value, revision: doc.updateTime };
    },
    async save(record, previous) {
      const { revision, ...data } = record;
      const condition = previous ? `currentDocument.updateTime=${encodeURIComponent(previous.revision)}` : 'currentDocument.exists=false';
      const response = await fetchImpl(`${origin}${root}/${id(record.subscription.endpoint)}?${condition}`, {
        ...init(), method: 'PATCH', body: JSON.stringify({ fields: { record: { stringValue: JSON.stringify(data) },
          // Configure Firestore TTL on this field before public activation.
          expiresAt: { timestampValue: data.expiresAt } } }),
      });
      if (!response.ok) throw new Error(response.status === 409 || response.status === 400 ? 'concurrent-update' : 'storage-unavailable');
    },
    async remove(endpoint, previous) {
      if (!previous) return;
      const response = await fetchImpl(`${origin}${root}/${id(endpoint)}?currentDocument.updateTime=${encodeURIComponent(previous.revision)}`, {
        ...init(), method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) throw new Error('storage-unavailable');
    },
  };
}

export async function sendPushTest(subscription, locale, env, fetchImpl = fetch) {
  normalizePushSubscription(subscription);
  const request = webpush.generateRequestDetails(subscription, JSON.stringify({
    title: 'My CIRC',
    body: locale === 'en' ? 'Test notification. Your device can receive CIRC alerts.' : 'Notificação de teste. O seu dispositivo pode receber avisos do CIRC.',
    url: '/conta/notificacoes', tag: 'circ-push-test',
  }), { TTL: 300, urgency: 'normal', contentEncoding: 'aes128gcm', vapidDetails: {
    subject: 'mailto:circ.chuc@gmail.com', publicKey: env.PUSH_VAPID_PUBLIC_KEY, privateKey: env.PUSH_VAPID_PRIVATE_KEY,
  } });
  // Fetch supports Workers directly; never follow a provider redirect with credentials.
  const response = await fetchImpl(request.endpoint, { method: request.method, headers: request.headers,
    body: request.body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  return { accepted: response.status === 201 || response.status === 202,
    expired: response.status === 404 || response.status === 410 };
}

export function createPushApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(), storeFactory = createPushStore,
  send = sendPushTest, now = () => Date.now() } = {}) {
  return async (request, env) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(BASE)) return null;
    const action = url.pathname.slice(BASE.length);
    const methods = { config: ['GET'], status: ['POST'], subscriptions: ['POST', 'DELETE'], test: ['POST'] };
    if (!methods[action]) return reply({ error: 'not-found' }, 404);
    if (!methods[action].includes(request.method)) return reply({ error: 'method-not-allowed' }, 405);
    if (url.search) return reply({ error: 'invalid-request' }, 400);
    const config = pushConfiguration(env);
    if (action === 'config') return reply({ enabled: config.enabled, testOnly: config.testOnly,
      publicKey: config.enabled ? config.publicKey : null });
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return reply({ error: 'sign-in-required' }, 401);
    let claims;
    try { claims = await verify(bearer, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid-session' }, 401); }
    if (!/^[\w-]{1,128}$/.test(claims?.sub || '') || claims.email_verified !== true) return reply({ error: 'verified-account-required' }, 403);
    const admin = claims.email === ADMIN;
    if (action === 'test' && !admin) return reply({ error: 'admin-required' }, 403);
    const enrolling = action === 'subscriptions' && request.method === 'POST';
    if ((enrolling || action === 'test') && (!config.enabled || (config.testOnly && !admin))) return reply({ error: 'push-not-enabled' }, 503);
    let data, subscription;
    try {
      data = await readBody(request);
      if (enrolling) {
        subscription = normalizePushSubscription(data.subscription);
        if (!['pt', 'en'].includes(data.locale) || data.consent !== true) throw new Error();
      } else if (!validPushEndpoint(data?.endpoint)) throw new Error();
    } catch { return reply({ error: 'invalid-request' }, 400); }
    try {
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: await tokenProvider(env) });
      const endpoint = subscription?.endpoint || data.endpoint;
      const previous = await store.read(endpoint);
      const owned = previous?.uid === claims.sub;
      if (action === 'status') return reply({ subscribed: owned && Date.parse(previous.expiresAt) > now() });
      if (previous && !owned) return reply({ error: 'device-linked-to-another-account' }, 409);
      if (request.method === 'DELETE') { await store.remove(endpoint, previous); return reply({ removed: true }); }
      if (enrolling) {
        await store.save({ uid: claims.sub, subscription, locale: data.locale,
          consentedAt: previous?.consentedAt || new Date(now()).toISOString(),
          updatedAt: new Date(now()).toISOString(), expiresAt: new Date(now() + 90 * 86400000).toISOString(),
          lastTestAt: previous?.lastTestAt || null }, previous);
        return reply({ subscribed: true });
      }
      if (!owned || Date.parse(previous.expiresAt) <= now()) return reply({ error: 'subscription-not-found' }, 404);
      if (previous.lastTestAt && now() - Date.parse(previous.lastTestAt) < 60000) return reply({ error: 'test-rate-limited' }, 429);
      // Reserve before contacting the provider; concurrent/retried requests cannot send twice.
      await store.save({ ...previous, lastTestAt: new Date(now()).toISOString() }, previous);
      const result = await send(previous.subscription, previous.locale, env);
      if (result.expired) {
        const current = await store.read(endpoint);
        if (current?.uid === claims.sub) await store.remove(endpoint, current);
        return reply({ error: 'subscription-expired' }, 410);
      }
      return result.accepted ? reply({ accepted: true }) : reply({ error: 'push-provider-rejected' }, 502);
    } catch (error) {
      return reply({ error: error?.message === 'concurrent-update' ? 'retry-later' : 'push-unavailable' }, 503);
    }
  };
}
