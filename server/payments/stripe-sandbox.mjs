// Hosted Checkout only. No card data, live keys, Connect, invoices or bank calls.
import { createHash } from 'node:crypto';
import { CHECKOUT_UUID } from './checkout-sandbox-store.mjs';
export const STRIPE_API_VERSION = '2025-09-30.clover';
export const STRIPE_WEBHOOK_PATH = '/api/payments/stripe/sandbox/notifications';
export const STRIPE_SESSION_ID = /^cs_test_[A-Za-z0-9]{8,240}$/;
export const STRIPE_FLOW = 'circ-checkout-sandbox';
const testKey = value => typeof value === 'string' && /^(rk|sk)_test_[A-Za-z0-9]+$/.test(value) && !/\s/.test(value);
const UID = /^[A-Za-z0-9_-]{1,128}$/;
export class StripeSandboxError extends Error {
  constructor(code, definite = false) { super(code); this.code = code; this.definite = definite; }
}
const fail = code => { throw new StripeSandboxError(code); };
export function stripeConfiguration(env) {
  const apiKeyPresent = Boolean(env.STRIPE_SANDBOX_SECRET_KEY);
  const testKeyValid = testKey(env.STRIPE_SANDBOX_SECRET_KEY);
  const webhookKeyPresent = /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_SANDBOX_WEBHOOK_SECRET || '');
  const serviceAccountPresent = Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_SANDBOX_SERVICE_ACCOUNT);
  return { apiKeyPresent, testKeyValid, webhookKeyPresent, serviceAccountPresent,
    ready: testKeyValid && webhookKeyPresent && serviceAccountPresent, webhookPath: STRIPE_WEBHOOK_PATH,
    apiVersion: STRIPE_API_VERSION };
}
function metadataFor(order, context) {
  if (order.environment !== 'sandbox' || order.method !== 'stripe_card' || !CHECKOUT_UUID.test(order.id || '')
    || !CHECKOUT_UUID.test(context.sessionId || '') || !UID.test(context.uid || '')
    || !/^circ_stripe_[a-f0-9]{32}_[1-9]\d?$/.test(order.identifier || '')) fail('stripe/mismatch');
  return { integration: STRIPE_FLOW, environment: 'sandbox', event_id: 'circ-2027',
    owner: context.uid, session_id: context.sessionId, order_id: order.id, identifier: order.identifier };
}
export function safeCheckoutUrl(value, sessionId) {
  if (typeof value !== 'string' || value.length > 4096 || !STRIPE_SESSION_ID.test(sessionId || '')) return null;
  try {
    const u = new URL(value);
    return u.origin === 'https://checkout.stripe.com' && !u.username && !u.password
      && [ `/c/pay/${sessionId}`, `/pay/${sessionId}` ].includes(u.pathname) ? value : null;
  } catch { return null; }
}
export function matchStripeSession(session, order, context) {
  const meta = metadataFor(order, context);
  if (session?.object !== 'checkout.session' || session.livemode !== false || !STRIPE_SESSION_ID.test(session.id || '')
    || (order.reference && order.reference !== session.id)
    || session.mode !== 'payment' || session.currency !== 'eur' || order.currency !== 'EUR'
    || !Number.isSafeInteger(order.amountCents) || order.amountCents < 50 || order.amountCents > 9999900
    || session.client_reference_id !== order.identifier
    || session.amount_total !== order.amountCents || order.quote?.amountCents !== order.amountCents
    || !['open', 'complete', 'expired'].includes(session.status)
    || !['paid', 'unpaid', 'no_payment_required'].includes(session.payment_status)
    || !Array.isArray(session.payment_method_types) || session.payment_method_types.length !== 1 || session.payment_method_types[0] !== 'card'
    || Object.entries(meta).some(([key, value]) => session.metadata?.[key] !== value)) fail('stripe/mismatch');
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null;
  if (session.payment_status === 'paid' && !/^pi_[A-Za-z0-9]+$/.test(intent || '')) fail('stripe/mismatch');
  if (!Number.isSafeInteger(session.expires_at)) fail('stripe/mismatch');
  const url = session.status === 'open' ? safeCheckoutUrl(session.url, session.id) : null;
  if (session.status === 'open' && !url) fail('stripe/invalid-response');
  return { id: session.id, url, expiresAt: session.expires_at,
    status: session.status, paymentStatus: session.payment_status, paymentIntentId: intent };
}
async function boundedJson(response) {
  const reader = response.body?.getReader(); if (!reader) fail('stripe/invalid-response');
  const chunks = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 262144) { await reader.cancel(); fail('stripe/invalid-response'); }
    chunks.push(Buffer.from(part.value));
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { fail('stripe/invalid-response'); }
}
export function createStripeSandbox({ apiKey, fetchImpl = fetch }) {
  if (!testKey(apiKey)) fail('stripe/test-key-required');
  async function call(path, body, idempotencyKey) {
    let response;
    try {
      response = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Stripe-Version': STRIPE_API_VERSION,
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey } : {}) },
        ...(body ? { body: body.toString() } : {}),
      });
    } catch (error) { fail(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'stripe/timeout' : 'stripe/network'); }
    // Never expose Stripe's raw error body (which can echo submitted values).
    if (!response.ok) {
      const code = ({ 400: 'stripe/request-rejected', 401: 'stripe/authentication', 403: 'stripe/permissions',
        404: 'stripe/session-not-found', 409: 'stripe/conflict', 429: 'stripe/rate-limit' })[response.status] || 'stripe/unavailable';
      await response.body?.cancel();
      throw new StripeSandboxError(code, Boolean(body && [400, 401, 403].includes(response.status)));
    }
    return boundedJson(response);
  }
  return {
    async createPayment(order, context) {
      const meta = metadataFor(order, context);
      const names = { 'congress-onsite': 'Congresso presencial / Onsite congress', 'congress-virtual': 'Congresso online / Online congress',
        'course-morning': 'Curso da manhã / Morning course', 'course-afternoon': 'Curso da tarde / Afternoon course', dinner: 'Jantar / Dinner' };
      const lines = order.quote?.lines;
      if (!Array.isArray(lines) || !lines.length || lines.length > 5 || order.currency !== 'EUR'
        || !Number.isSafeInteger(order.amountCents) || order.amountCents < 50 || order.amountCents > 9999900
        || lines.some(l => !names[l.code] || !Number.isSafeInteger(l.quantity) || l.quantity < 1
          || !Number.isSafeInteger(l.unitAmountCents) || l.unitAmountCents <= 0 || l.amountCents !== l.quantity * l.unitAmountCents)
        || lines.reduce((sum, l) => sum + l.amountCents, 0) !== order.amountCents) fail('stripe/invalid-quote');
      const landing = `https://circ-coimbra.org/conta/inscricoes-teste?teste=${context.sessionId}`;
      const body = new URLSearchParams({ mode: 'payment', client_reference_id: order.identifier,
        success_url: `${landing}&stripe=return`, cancel_url: `${landing}&stripe=cancel`, locale: 'auto',
        'payment_method_types[0]': 'card', 'automatic_tax[enabled]': 'false', 'adaptive_pricing[enabled]': 'false',
        'invoice_creation[enabled]': 'false', customer_creation: 'if_required' });
      Object.entries(meta).forEach(([k, v]) => body.set(`metadata[${k}]`, v));
      lines.forEach((l, i) => {
        body.set(`line_items[${i}][quantity]`, String(l.quantity));
        body.set(`line_items[${i}][price_data][currency]`, 'eur');
        body.set(`line_items[${i}][price_data][unit_amount]`, String(l.unitAmountCents));
        body.set(`line_items[${i}][price_data][product_data][name]`, `CIRC 2027 TESTE — ${names[l.code]}`);
      });
      // One persisted order, one idempotency key; no automatic creation retry.
      const key = `circ-sandbox-${createHash('sha256').update(`${context.uid}/${context.sessionId}/${order.id}`).digest('hex')}`;
      const session = await call('', body, key);
      return { reference: session.id, entity: null, stripe: matchStripeSession(session, order, context) };
    },
    async inspectReference(order, context) {
      if (!STRIPE_SESSION_ID.test(order.reference || '')) fail('stripe/mismatch');
      const session = await call(`/${order.reference}`);
      return matchStripeSession(session, order, context);
    },
  };
}
