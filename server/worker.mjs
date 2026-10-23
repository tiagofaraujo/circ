import { createStripeSandboxWebhook } from './payments/stripe-webhook.mjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { handleSocialMetadata } from './social-metadata.mjs';
import { handleMedia } from './media.mjs';
import { createSandboxApi } from './payments/sandbox-api.mjs';
import { createSandboxWebhook } from './payments/sandbox-webhook.mjs';
import { createCheckoutSandboxApi, createCheckoutSandboxNotification } from './payments/checkout-sandbox.mjs';
import { createToconlineRehearsalApi } from './payments/toconline-rehearsal.mjs';
import { createToconlineReadonlyApi } from './payments/toconline-readonly.mjs';
import { createCheckoutLiveApi } from './payments/checkout-live.mjs';
import { createLivePaymentWebhook } from './payments/live-webhook.mjs';
import { createToconlineDraftAcceptanceApi } from './payments/toconline-draft-acceptance.mjs';
import { hotels2027 } from './hotels2027.mjs';

const firebaseKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  { timeoutDuration: 5000 }
);

export async function verifyFirebaseToken(token, projectId, keys = firebaseKeys) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
  });
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || payload.sub.length > 128 || payload.iat > now
    || !Number.isFinite(payload.auth_time) || payload.auth_time < 0 || payload.auth_time > now
    || payload.firebase?.sign_in_provider === 'anonymous') {
    throw new Error('Invalid Firebase session');
  }
  return payload;
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Vary': 'Authorization',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  } });
}

// The injected verifier is only used by local tests. Production always uses Google's keys.
export function createWorker(verify = verifyFirebaseToken) {
  const stripeWebhook = createStripeSandboxWebhook();
  const sandbox = createSandboxApi({ verify });
  const sandboxWebhook = createSandboxWebhook({ checkoutHandler: createCheckoutSandboxNotification() });
  const sandboxCheckout = createCheckoutSandboxApi({ verify });
  const fiscalRehearsal = createToconlineRehearsalApi({ verify });
  const toconlineReadonly = createToconlineReadonlyApi({ verify });
  const liveCheckout = createCheckoutLiveApi({ verify });
  const livePaymentWebhook = createLivePaymentWebhook();
  const toconlineDraftAcceptance = createToconlineDraftAcceptanceApi({ verify });
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      const livePaymentResponse = await livePaymentWebhook(request, env);
      if (livePaymentResponse) return livePaymentResponse;
      const stripeResponse = await stripeWebhook(request, env);
      if (stripeResponse) return stripeResponse;
      const notificationResponse = await sandboxWebhook(request, env);
      if (notificationResponse) return notificationResponse;
      const mediaResponse = await handleMedia(request, env);
      if (mediaResponse) return mediaResponse;
      const socialResponse = await handleSocialMetadata(request, env);
      if (socialResponse) return socialResponse;
      const toconlineDraftResponse = await toconlineDraftAcceptance(request, env);
      if (toconlineDraftResponse) return toconlineDraftResponse;
      const toconlineResponse = await toconlineReadonly(request, env);
      if (toconlineResponse) return toconlineResponse;
      const fiscalResponse = await fiscalRehearsal(request, env);
      if (fiscalResponse) return fiscalResponse;
      const liveCheckoutResponse = await liveCheckout(request, env);
      if (liveCheckoutResponse) return liveCheckoutResponse;
      const checkoutResponse = await sandboxCheckout(request, env);
      if (checkoutResponse) return checkoutResponse;
      const sandboxResponse = await sandbox(request, env);
      if (sandboxResponse) return sandboxResponse;
      if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (pathname !== '/api/accommodation/hotels') return json({ error: 'not_found' }, 404);
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
      const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return json({ error: 'sign_in_required' }, 401, { 'WWW-Authenticate': 'Bearer' });
      if (!env.FIREBASE_PROJECT_ID) return json({ error: 'service_unavailable' }, 503);
      try {
        await verify(token, env.FIREBASE_PROJECT_ID);
      } catch {
        return json({ error: 'invalid_session' }, 401, { 'WWW-Authenticate': 'Bearer' });
      }
      return json({ hotels: hotels2027 });
    },
  };
}

export default createWorker();
