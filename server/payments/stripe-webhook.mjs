import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createCheckoutSandboxStore, CHECKOUT_UUID } from './checkout-sandbox-store.mjs';
import { createServiceTokenProvider } from './service-token.mjs';
import { applyEntitlements } from './checkout-sandbox.mjs';
import { createStripeSandbox, matchStripeSession, stripeConfiguration, STRIPE_FLOW, STRIPE_WEBHOOK_PATH } from './stripe-sandbox.mjs';
const json = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });
async function readBytes(request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error('body');
  const chunks = []; let total = 0;
  while (true) { const part = await reader.read(); if (part.done) break;
    total += part.value.length; if (total > 65536) { await reader.cancel(); throw new Error('body'); }
    chunks.push(Buffer.from(part.value)); }
  return Buffer.concat(chunks);
}
// Stripe snapshot signature v1: HMAC-SHA256(timestamp + '.' + exact body).
// Multiple v1 values support key rotation. Reject stale AND future timestamps.
export function verifyStripeEvent(bytes, signature, secret, clock = Date.now()) {
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret || '') || typeof signature !== 'string' || signature.length > 2048) throw new Error('signature');
  const parts = signature.split(',').map(p => p.trim().split('='));
  const times = parts.filter(p => p[0] === 't');
  if (times.length !== 1 || !/^\d{1,12}$/.test(times[0][1] || '')) throw new Error('signature');
  const ts = times[0][1];
  if (!Number.isFinite(clock) || Math.abs(Math.floor(clock / 1000) - Number(ts)) > 300) throw new Error('signature');
  const expected = createHmac('sha256', secret).update(`${ts}.`).update(bytes).digest();
  const matches = parts.filter(p => p[0] === 'v1' && /^[a-f0-9]{64}$/.test(p[1] || ''))
    .some(p => timingSafeEqual(expected, Buffer.from(p[1], 'hex')));
  if (!matches) throw new Error('signature');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function createStripeSandboxWebhook({ storeFactory = createCheckoutSandboxStore,
  providerFactory = createStripeSandbox, tokenProvider = createServiceTokenProvider(), now = () => new Date().toISOString() } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== STRIPE_WEBHOOK_PATH) return null;
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (url.search || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return json({ error: 'invalid_request' }, 400);
    if (!stripeConfiguration(env).ready) return json({ error: 'stripe_not_configured' }, 503);
    let event;
    try { event = verifyStripeEvent(await readBytes(request), request.headers.get('Stripe-Signature'), env.STRIPE_SANDBOX_WEBHOOK_SECRET, Date.parse(now())); }
    catch { return json({ error: 'invalid_signature_or_body' }, 400); }
    if (event?.object !== 'event' || event.livemode !== false || event.account || !/^evt_[A-Za-z0-9]+$/.test(event.id || '')
      || !Number.isSafeInteger(event.created)) return json({ error: 'invalid_event' }, 422);
    const supportedEvents = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'];
    if (!supportedEvents.includes(event.type)) return json({ received: true, ignored: true });
    const snapshot = event.data?.object, meta = snapshot?.metadata;
    // Dashboard sample events and other integrations must never create records.
    if (meta?.integration !== STRIPE_FLOW) return json({ received: true, ignored: true });
    if (!CHECKOUT_UUID.test(meta.session_id || '') || !CHECKOUT_UUID.test(meta.order_id || '')
      || !/^[A-Za-z0-9_-]{1,128}$/.test(meta.owner || '') || meta.environment !== 'sandbox' || meta.event_id !== 'circ-2027') return json({ error: 'invalid_event' }, 422);
    const context = { sessionId: meta.session_id, uid: meta.owner };
    try {
      const token = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid: context.uid });
      const provider = providerFactory({ apiKey: env.STRIPE_SANDBOX_SECRET_KEY });
      for (let retry = 0; retry < 4; retry++) {
        const saved = await store.read(context.sessionId); if (!saved) return json({ error: 'attempt_not_found' }, 404);
        const r = saved.record, order = r.orders.find(o => o.id === meta.order_id);
        if (r.id !== context.sessionId || r.owner !== context.uid || r.kind !== 'checkout-test'
          || r.environment !== 'sandbox' || r.eventId !== 'circ-2027' || !order
          || !['creating', 'creation_unknown', 'pending', 'closed', 'confirmed', 'review_required'].includes(order.status)) return json({ error: 'attempt_mismatch' }, 422);
        let signed;
        try { signed = matchStripeSession(snapshot, order, context); }
        catch { return json({ error: 'attempt_mismatch' }, 422); }
        if (order.notification?.verifiedAt && ['confirmed', 'review_required'].includes(order.status)) {
          if (order.reference !== signed.id || (signed.paymentIntentId && signed.paymentIntentId !== order.notification.transactionId)) return json({ error: 'notification_conflict' }, 409);
          return json({ received: true, duplicate: true });
        }
        let current;
        try { current = await provider.inspectReference({ ...order, reference: signed.id }, context); }
        catch (error) { return json({ error: error.code === 'stripe/mismatch' ? 'attempt_mismatch' : 'reconciliation_pending' }, error.code === 'stripe/mismatch' ? 422 : 503); }
        if (event.type === 'checkout.session.expired') {
          if (current.status !== 'expired' || current.paymentStatus !== 'unpaid') return json({ error: 'reconciliation_pending' }, 503);
          if (order.status === 'closed' && order.stripe?.status === 'expired') return json({ received: true, duplicate: true });
          try {
            await store.replace(r.id, { ...r, orders: r.orders.map(o => o.id === order.id ? {
              ...o, reference: current.id, stripe: current, status: 'closed', providerState: 'expired', inspectedAt: now(),
            } : o) }, saved.version);
            return json({ received: true, expired: true });
          } catch (error) { if (error.code === 'conflict') continue; throw error; }
        }
        if (event.type === 'checkout.session.async_payment_failed') {
          if (current.status !== 'complete' || current.paymentStatus !== 'unpaid') return json({ error: 'reconciliation_pending' }, 503);
          try {
            await store.replace(r.id, { ...r, orders: r.orders.map(o => o.id === order.id ? {
              ...o, reference: current.id, stripe: current, status: 'closed', providerState: 'failed', inspectedAt: now(),
            } : o) }, saved.version);
            return json({ received: true, failed: true });
          } catch (error) { if (error.code === 'conflict') continue; throw error; }
        }
        if (event.type === 'checkout.session.completed' && (signed.paymentStatus !== 'paid' || current.paymentStatus !== 'paid')) {
          // Delayed methods complete Checkout before funds are final. The later
          // async success/failure event decides the order; do not force retries.
          return json({ received: true, pending: true });
        }
        if (signed.status !== 'complete' || signed.paymentStatus !== 'paid'
          || current.status !== 'complete' || current.paymentStatus !== 'paid'
          || signed.paymentIntentId !== current.paymentIntentId) return json({ error: 'reconciliation_pending' }, 503);
        const registration = applyEntitlements(r, order, now());
        const digest = createHash('sha256').update(JSON.stringify([current.id, current.paymentIntentId, order.id, order.amountCents, 'EUR'])).digest('hex');
        const next = { ...order, reference: current.id, stripe: current, status: registration ? 'confirmed' : 'review_required',
          providerState: 'paid', inspectedAt: now(), notification: { provider: 'stripe', eventId: event.id,
            digest, transactionId: current.paymentIntentId, receivedAt: now(), verifiedAt: now(),
            paidAt: new Date(event.created * 1000).toISOString() } };
        try {
          // Receipt and test entitlements are committed together, exactly once.
          await store.replace(r.id, { ...r, registration: registration || r.registration,
            orders: r.orders.map(o => o.id === order.id ? next : o) }, saved.version);
          return json({ received: true, duplicate: false, reviewRequired: !registration });
        } catch (error) { if (error.code !== 'conflict') throw error; }
      }
      return json({ error: 'retry_notification' }, 503);
    } catch { return json({ error: 'notification_unavailable' }, 503); }
  };
}
