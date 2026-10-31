import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore } from './checkout-live-store.mjs';
import { billingCustomerFromProfile } from './toconline-billing-customer.mjs';
import { quotePrimary } from './quote.mjs';
import { liveDataStamp, isLivePilotConfigured, isPrivatePilotWindow } from './live-pilot-contract.mjs';

const PATH = '/api/checkout/live/pilot-preview';
const ADMIN = 'circ.chuc@gmail.com';
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });

// Preparation only: own-account reads, existing quote rules, no provider or write methods.
export function createLivePilotPreviewApi({ verify,
  tokenProvider = createPaymentsServiceTokenProvider(), storeFactory = createCheckoutLiveStore,
  now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (request.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405);
    if (url.search || request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email_verified !== true || String(claims?.email || '').toLowerCase() !== ADMIN) {
      return reply({ error: 'admin-required' }, 403);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return reply({ error: 'invalid-request' }, 400);
    let data;
    try { data = await request.json(); } catch { return reply({ error: 'invalid-request' }, 400); }
    if (!data || Array.isArray(data) || typeof data !== 'object'
      || Object.keys(data).some(key => key !== 'profile') || !['external', 'uls', 'student'].includes(data.profile)) {
      return reply({ error: 'invalid-request' }, 400);
    }
    let serviceToken;
    try { serviceToken = await tokenProvider(env); }
    catch { return reply({ error: 'payments-service-unavailable' }, 503); }
    try {
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: claims.sub, token: serviceToken });
      const existing = await store.registration();
      if (!existing || existing.data !== null) return reply({ error: 'registration-exists-or-unchecked' }, 409);
      const [context, profile] = await Promise.all([store.context(data.profile), store.profile()]);
      const selection = { profile: data.profile, congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
      const preparedAt = now();
      const quote = quotePrimary(selection, { ...context, emailVerified: true }, null, new Date(preparedAt));
      const billing = billingCustomerFromProfile(profile?.data);
      if (!billing.ok) return reply({ error: 'billing-customer-unconfirmed' }, 409);
      const name = typeof profile?.data?.name === 'string' ? profile.data.name.replace(/\s+/g, ' ').trim() : '';
      if (name.length < 5 || name.length > 200) return reply({ error: 'profile-incomplete' }, 409);
      return reply({ previewOnly: true, paymentCreated: false, fiscalDocumentIssued: false,
        preparedAt, quote, billing: billing.customer, stamp: liveDataStamp(quote),
        billingStamp: liveDataStamp(billing.customer), creationEnabled: isLivePilotConfigured(env, Date.parse(preparedAt))
          && (!isPrivatePilotWindow(env) || quote.amountCents === 9500) });
    } catch (error) {
      const safe = new Set(['checkout/uls-not-verified', 'checkout/student-not-approved']);
      return reply({ error: safe.has(error?.message) ? error.message : 'preview-unavailable' }, safe.has(error?.message) ? 403 : 503);
    }
  };
}
