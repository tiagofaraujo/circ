import { sandboxBankAccount } from './bank-transfer-account.mjs';
import { createHash, createHmac } from 'node:crypto';
import { prepareBankTransfer, actOnBankTransfer, MAX_PROOF_BYTES, BANK_TRANSFER_ERRORS } from './bank-transfer-sandbox.mjs';
import { createCheckoutSandboxStore, CHECKOUT_UUID } from './checkout-sandbox-store.mjs';
import { createEupagoSandbox, safeProviderDiagnostic } from './eupago-sandbox.mjs';
import { createServiceTokenProvider } from './service-token.mjs';
import { quotePrimary, quoteSupplementary, quoteSandboxSupplementary } from './quote.mjs';
import { CONGRESS_RATES, COURSE_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE, getRegistrationPeriod } from '../../src/data/registration2027.js';

const PREFIX = '/api/checkout/sandbox';
const ADMIN = 'circ.chuc@gmail.com';
const EVENT = 'circ-2027';
const MAX_ORDERS = 20;
const MAX_DINNERS = 20; // Test safety limit, not an event capacity.
const pending = order => ['creating', 'creation_unknown', 'pending'].includes(order.status);
const paidHint = value => ['paga', 'pago', 'transferida'].includes(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = code => { throw new Error(`checkout/${code}`); };
const reply = (data, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
function exact(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key => !keys.includes(key))) fail('invalid-request');
}
async function readBody(request, limit = 4096) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail('invalid-request');
  const reader = request.body?.getReader(); if (!reader) fail('invalid-request');
  const chunks = []; let size = 0;
  while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length;
    if (size > limit) { await reader.cancel(); fail('invalid-request'); } chunks.push(Buffer.from(chunk.value)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid-request'); }
}
function selectionInput(selection, supplementary) {
  exact(selection, supplementary ? ['morningCourse', 'afternoonCourse', 'dinnerQuantity'] : ['profile', 'congressMode', 'morningCourse', 'afternoonCourse', 'dinnerQuantity']);
  for (const key of ['morningCourse', 'afternoonCourse']) if (selection[key] !== undefined && typeof selection[key] !== 'boolean') fail('invalid-selection');
  const quantity = selection.dinnerQuantity ?? 0;
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_DINNERS) fail('invalid-quantity');
  return { ...(!supplementary ? { profile: selection.profile, congressMode: selection.congressMode } : {}),
    morningCourse: selection.morningCourse === true, afternoonCourse: selection.afternoonCourse === true, dinnerQuantity: quantity };
}
const entitlement = selection => ({ congressMode: selection.congressMode,
  morningCourse: selection.morningCourse === true, afternoonCourse: selection.afternoonCourse === true,
  dinnerQuantity: selection.dinnerQuantity || 0 });
export function checkoutPublicRecord(record) {
  return { id: record.id, environment: 'sandbox', kind: 'checkout-test', createdAt: record.createdAt,
    registration: record.registration, source: record.source, invoiceStatus: 'disabled_sandbox',
    orders: record.orders.map(order => {
      const { fingerprint, ...visible } = order; // Never expose a phone fingerprint.
      return visible;
    }) };
}
function publicError(error) {
  const domain = error.message?.startsWith('checkout/') ? error.message.slice(9) : '';
  if (BANK_TRANSFER_ERRORS.has(domain)) return reply({ error: domain }, domain === 'transfer-proof-too-large' ? 413 : ['transfer-credit-used', 'transfer-stale-review', 'transfer-invalid-state'].includes(domain) ? 409 : 400);
  const allowed = new Set(['invalid-request', 'invalid-selection', 'invalid-quantity', 'invalid-profile', 'invalid-mode',
    'invalid-amount', 'sign-in-required', 'student-not-approved', 'uls-not-verified', 'course-required',
    'course-already-owned', 'paid-registration-required', 'sandbox-registration-required', 'invalid-addition',
    'quote-changed', 'pending-order', 'order-limit', 'not-found', 'idempotency-conflict', 'recovery-not-allowed',
    'reference-mismatch', 'review-required', 'source-registration-invalid', 'sandbox-not-configured']);
  if (allowed.has(domain)) return reply({ error: domain }, ['pending-order', 'quote-changed', 'idempotency-conflict', 'review-required', 'recovery-not-allowed'].includes(domain) ? 409 : domain === 'not-found' ? 404 : 400);
  if (['storage_forbidden', 'storage_session_expired', 'storage_unavailable', 'conflict'].includes(error.code)) return reply({ error: error.code }, error.code === 'conflict' ? 409 : 503);
  if (error.code === 'reference-mismatch') return reply({ error: 'reference-mismatch' }, 409);
  return reply({ error: 'service-unavailable' }, 503);
}
function quoteStamp(quote, registration) { return hash({ quote, registration }); }
export async function quoteSession(store, claims, record, rawSelection, now) {
  const supplementary = record.registration?.status === 'confirmed';
  if (record.orders.some(pending)) fail('pending-order');
  if (record.orders.some(order => order.status === 'review_required')) fail('review-required');
  const selection = selectionInput(rawSelection, supplementary);
  const profile = supplementary ? record.registration.selection.profile : selection.profile;
  const { context, guards } = await store.context(claims, profile);
  const quote = supplementary ? quoteSandboxSupplementary(selection, context, record, new Date(now)) : quotePrimary(selection, context, null, new Date(now));
  const dinnerTotal = (record.registration?.entitlements.dinnerQuantity || 0) + selection.dinnerQuantity;
  if (dinnerTotal > MAX_DINNERS) fail('invalid-quantity');
  return { quote, stamp: quoteStamp(quote, record.registration), guards, selection };
}

export function createCheckoutSandboxApi({ verify, storeFactory = createCheckoutSandboxStore,
  providerFactory = createEupagoSandbox, now = () => new Date().toISOString() }) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${PREFIX}/`)) return null;
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method-not-allowed' }, 405);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims.email_verified !== true || claims.email !== ADMIN) return reply({ error: 'admin-required' }, 403);
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const configured = Boolean(env.EUPAGO_SANDBOX_API_KEY?.trim() && env.EUPAGO_SANDBOX_WEBHOOK_KEY
      && env.EUPAGO_SANDBOX_CHANNEL?.trim() && env.FIREBASE_SANDBOX_SERVICE_ACCOUNT);
    if (url.pathname === `${PREFIX}/config` && request.method === 'GET') return reply({ configured: true, eupagoConfigured: configured, bankTransferConfigured: true, bankTransferAccount: sandboxBankAccount(), environment: 'sandbox',
      period: getRegistrationPeriod(new Date(now())), rates: { congress: CONGRESS_RATES, courses: COURSE_RATES, dinner: DINNER_RATE, virtual: VIRTUAL_CONGRESS_RATE },
      maxDinners: MAX_DINNERS, maxOrders: MAX_ORDERS });
    const collection = url.pathname === `${PREFIX}/sessions`;
    const match = url.pathname.match(/^\/api\/checkout\/sandbox\/sessions\/([^/]+)(?:\/(quote|orders)(?:\/([^/]+)\/(inspect|recover|proof|proof-download|review|report))?)?$/);
    if (!collection && (!match || !CHECKOUT_UUID.test(match[1]) || (match[3] && !CHECKOUT_UUID.test(match[3]))
      || (match[2] === 'quote' && match[3]))) return reply({ error: 'not-found' }, 404);
    if (!collection && (match[2] ? request.method !== 'POST' : request.method !== 'GET')) return reply({ error: 'method-not-allowed' }, 405);
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid: claims.sub });
    // The bank-transfer rehearsal needs no gateway credentials or API calls.
    const gateway = () => {
      if (!configured) throw new Error('checkout/sandbox-not-configured');
      return providerFactory({ apiKey: env.EUPAGO_SANDBOX_API_KEY, environment: 'sandbox' });
    };
    try {
      if (collection && request.method === 'GET') {
        const { records, truncated } = await store.list();
        return reply({ sessions: records.map(r => ({ id: r.id, createdAt: r.createdAt, confirmed: r.registration?.status === 'confirmed',
          orderCount: r.orders.length, latestStatus: r.orders.at(-1)?.status || 'draft',
          bankTransfers: r.orders.filter(o => o.method === 'bank_transfer' && o.bankTransfer?.simulated === true).map(o => ({
            id: o.id, memo: o.bankTransfer.memo, status: o.bankTransfer.status, amountCents: o.amountCents,
            createdAt: o.createdAt, proofCount: o.bankTransfer.proofs.length,
          })) })), truncated });
      }
      const body = request.method === 'POST' ? await readBody(request, match?.[4] === 'proof' ? Math.ceil(MAX_PROOF_BYTES / 3) * 4 + 4096 : 4096) : null;
      if (collection) {
        exact(body, ['id', 'source']);
        if (!CHECKOUT_UUID.test(body.id || '') || !['new', 'registration-copy'].includes(body.source)) fail('invalid-request');
        const previous = await store.read(body.id);
        if (previous) {
          if (previous.record.source !== body.source) fail('idempotency-conflict');
          return reply({ session: checkoutPublicRecord(previous.record) });
        }
        let registration = null;
        if (body.source === 'registration-copy') {
          const source = (await store.sourceRegistration()).data;
          const profile = source?.selection?.profile;
          const { context } = await store.context(claims, profile);
          // Reuse the strict real-registration guard, including paid vouchers.
          quoteSupplementary({ dinnerQuantity: 1 }, context, source, new Date(now()));
          const owned = source.entitlements || source.selection;
          registration = { status: 'confirmed', selection: source.selection, entitlements: entitlement({ ...source.selection, ...owned }),
            confirmedAt: now(), source: 'read_only_snapshot', sourceRegistrationId: source.id };
          if (!['onsite', 'virtual', 'courses-only'].includes(registration.entitlements.congressMode)
            || !Number.isSafeInteger(registration.entitlements.dinnerQuantity) || registration.entitlements.dinnerQuantity < 0
            || registration.entitlements.dinnerQuantity > MAX_DINNERS) fail('source-registration-invalid');
        }
        const record = { kind: 'checkout-test', environment: 'sandbox', eventId: EVENT, id: body.id,
          owner: claims.sub, source: body.source, createdAt: now(), registration, orders: [] };
        try { const saved = await store.create(body.id, record); return reply({ session: checkoutPublicRecord(saved.record) }, 201); }
        catch (error) {
          if (error.code !== 'conflict') throw error;
          const concurrent = await store.read(body.id);
          if (!concurrent || concurrent.record.source !== body.source) fail('idempotency-conflict');
          return reply({ session: checkoutPublicRecord(concurrent.record) });
        }
      }
      const sessionId = match[1];
      let saved = await store.read(sessionId); if (!saved) fail('not-found');
      if (request.method === 'GET') return reply({ session: checkoutPublicRecord(saved.record) });
      if (match[2] === 'quote') {
        exact(body, ['selection']);
        const result = await quoteSession(store, claims, saved.record, body.selection, now());
        return reply({ quote: result.quote, stamp: result.stamp });
      }
      if (match[3] && ['proof', 'proof-download', 'review', 'report'].includes(match[4])) {
        const result = await actOnBankTransfer({ store, saved, orderId: match[3], action: match[4], body,
          actor: claims.sub, now: now(), applyEntitlements });
        return result instanceof Response ? result : reply({ session: checkoutPublicRecord(result.record) });
      }
      if (match[3]) {
        exact(body, match[4] === 'recover' ? ['reference'] : []);
        const order = saved.record.orders.find(o => o.id === match[3]); if (!order) fail('not-found');
        if (order.method === 'bank_transfer') fail('transfer-invalid-state');
        const recovery = match[4] === 'recover';
        if (recovery && (!['creating', 'creation_unknown'].includes(order.status) || order.reference
          || typeof body.reference !== 'string' || !/^\d{1,30}$/.test(body.reference))) fail('recovery-not-allowed');
        if (!recovery && !order.reference) fail('recovery-not-allowed');
        const reference = recovery ? body.reference : order.reference;
        const hint = await gateway().inspectReference({ ...order, reference });
        // A manual query never confirms payment or grants test entitlements.
        const changed = { ...order, reference, providerState: hint.providerState, providerStateCode: hint.providerStateCode,
          inspectedAt: now(), status: recovery ? 'pending' : order.status };
        if (['pending', 'creating', 'creation_unknown'].includes(changed.status) && ['expirado', 'cancelado', 'erro'].includes(hint.providerState)) changed.status = 'closed';
        const updated = { ...saved.record, orders: saved.record.orders.map(o => o.id === order.id ? changed : o) };
        saved = await store.replace(sessionId, updated, saved.version);
        return reply({ session: checkoutPublicRecord(saved.record) });
      }
      exact(body, ['id', 'selection', 'stamp', 'method', 'phone', 'sandboxAcknowledged']);
      if (!CHECKOUT_UUID.test(body.id || '') || !['mbway', 'multibanco', 'bank_transfer'].includes(body.method) || body.sandboxAcknowledged !== true
        || (body.method === 'mbway' && (typeof body.phone !== 'string' || !/^9\d{8}$/.test(body.phone))) || (body.method !== 'mbway' && body.phone !== undefined)) fail('invalid-request');
      // Keyed fingerprint is not reversible by enumerating nine-digit phone numbers.
      if (body.method !== 'bank_transfer' && !configured) fail('sandbox-not-configured');
      const fingerprint = (body.method === 'bank_transfer' ? createHash('sha256') : createHmac('sha256', env.EUPAGO_SANDBOX_API_KEY)).update(JSON.stringify({
        selection: body.selection, stamp: body.stamp, method: body.method, phone: body.phone || '', sandboxAcknowledged: true,
      })).digest('hex');
      const existing = saved.record.orders.find(o => o.id === body.id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) fail('idempotency-conflict');
        return reply({ session: checkoutPublicRecord(saved.record) });
      }
      if (saved.record.orders.length >= MAX_ORDERS) fail('order-limit');
      const result = await quoteSession(store, claims, saved.record, body.selection, now());
      if (body.stamp !== result.stamp) fail('quote-changed');
      const order = { id: body.id, environment: 'sandbox', identifier: `circ_order_${sessionId.replaceAll('-', '')}_${saved.record.orders.length + 1}`,
        method: body.method, amountCents: result.quote.amountCents, currency: 'EUR', quote: result.quote,
        fingerprint, status: 'creating', createdAt: now(), reference: null, entity: null, notification: null };
      if (body.method === 'bank_transfer') {
        const transfer = prepareBankTransfer(order, sessionId, saved.record.orders.length + 1);
        saved = await store.replace(sessionId, { ...saved.record, orders: [...saved.record.orders, transfer] }, saved.version, result.guards);
        return reply({ session: checkoutPublicRecord(saved.record) }, 201);
      }
      // The only creation call occurs after an atomic, version-guarded reservation.
      saved = await store.replace(sessionId, { ...saved.record, orders: [...saved.record.orders, order] }, saved.version, result.guards);
      let created, diagnostic;
      try { created = await gateway().createPayment({ ...order, phone: body.phone }); }
      catch (error) { diagnostic = safeProviderDiagnostic(error?.diagnostic) || 'provider/unknown'; }
      // Webhooks can overtake creation responses. Never overwrite their result.
      for (let retry = 0; retry < 4; retry++) {
        saved = await store.read(sessionId); if (!saved) fail('not-found');
        const current = saved.record.orders.find(o => o.id === order.id); if (!current) fail('not-found');
        if (created && current.reference && created.reference !== current.reference) fail('reference-mismatch');
        if (!['creating', 'creation_unknown'].includes(current.status)) return reply({ session: checkoutPublicRecord(saved.record) });
        const next = created ? { ...current, reference: created.reference, entity: created.entity, status: 'pending' }
          : { ...current, status: 'creation_unknown', creationDiagnostic: diagnostic };
        try {
          saved = await store.replace(sessionId, { ...saved.record, orders: saved.record.orders.map(o => o.id === order.id ? next : o) }, saved.version);
          return reply({ session: checkoutPublicRecord(saved.record), ...(diagnostic ? { error: 'creation-unknown' } : {}) }, diagnostic ? 502 : 201);
        } catch (error) { if (error.code !== 'conflict') throw error; }
      }
      return reply({ error: 'storage_unavailable' }, 503);
    } catch (error) { return publicError(error); }
  };
}

function applyEntitlements(record, order, now) {
  const selection = order.quote.selection;
  if (order.quote.kind === 'primary') {
    if (record.registration) return null;
    return { status: 'confirmed', selection, entitlements: entitlement(selection), confirmedAt: now,
      source: 'sandbox_payment', sourceOrderId: order.id };
  }
  const previous = record.registration;
  if (order.quote.kind !== 'supplementary' || previous?.status !== 'confirmed'
    || selection.profile !== previous.selection.profile || (selection.morningCourse && previous.entitlements.morningCourse)
    || (selection.afternoonCourse && previous.entitlements.afternoonCourse)) return null;
  const dinnerQuantity = previous.entitlements.dinnerQuantity + selection.dinnerQuantity;
  if (dinnerQuantity > MAX_DINNERS) return null;
  return { ...previous, entitlements: { ...previous.entitlements,
    morningCourse: previous.entitlements.morningCourse || selection.morningCourse,
    afternoonCourse: previous.entitlements.afternoonCourse || selection.afternoonCourse, dinnerQuantity }, updatedAt: now };
}
export function createCheckoutSandboxNotification({ storeFactory = createCheckoutSandboxStore,
  providerFactory = createEupagoSandbox, tokenProvider = createServiceTokenProvider(), now = () => new Date().toISOString() } = {}) {
  // Called ONLY after the existing route validates exact-body HMAC and payload.
  return async function handle(event, uid, env) {
    try {
      const token = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid });
      const provider = providerFactory({ apiKey: env.EUPAGO_SANDBOX_API_KEY, environment: 'sandbox' });
      for (let retry = 0; retry < 4; retry++) {
        let saved = await store.read(event.id); if (!saved) return reply({ error: 'attempt_not_found' }, 404);
        const r = saved.record;
        const order = r.orders.find(o => o.identifier === event.identifier);
        if (r.kind !== 'checkout-test' || r.environment !== 'sandbox' || r.owner !== uid || r.id !== event.id || !order
          || order.environment !== 'sandbox' || order.method !== event.method || order.currency !== event.currency
          || order.amountCents !== event.amountCents || order.quote?.amountCents !== event.amountCents
          || (order.reference && order.reference !== event.reference)
          || (order.entity != null && order.entity !== event.entity)
          || (order.method === 'multibanco' && order.reference && order.entity !== event.entity)) return reply({ error: 'attempt_mismatch' }, 422);
        if (order.notification && order.notification.digest !== event.digest) return reply({ error: 'notification_conflict' }, 409);
        if (['confirmed', 'review_required'].includes(order.status) && order.notification?.verifiedAt) return reply({ received: true, duplicate: true });
        if (!['creating', 'creation_unknown', 'pending', 'closed'].includes(order.status)) return reply({ error: 'attempt_mismatch' }, 422);
        // For MB WAY missing entity, and callbacks overtaking creation, the
        // authenticated lookup must match identifier/reference/entity first.
        const candidate = { ...order, reference: event.reference, entity: event.entity };
        let hint;
        try { hint = await provider.inspectReference(candidate); }
        catch (error) { return reply({ error: error.code === 'reference-mismatch' ? 'attempt_mismatch' : 'reconciliation_pending' }, error.code === 'reference-mismatch' ? 422 : 503); }
        const notification = { digest: event.digest, transactionId: event.transactionId, paidAt: event.paidAt,
          receivedAt: order.notification?.receivedAt || now(), verifiedAt: null };
        const verified = paidHint(hint.providerState);
        const registration = verified ? applyEntitlements(r, order, now()) : r.registration;
        const next = { ...order, reference: event.reference, entity: event.entity,
          providerState: hint.providerState, providerStateCode: hint.providerStateCode ?? null, inspectedAt: now(),
          notification: { ...notification, verifiedAt: verified ? now() : null },
          status: verified ? (registration ? 'confirmed' : 'review_required') : order.status };
        const updated = { ...r, orders: r.orders.map(o => o.id === order.id ? next : o),
          registration: registration || r.registration };
        try {
          // Payment receipt and test entitlements are one atomic document write.
          saved = await store.replace(event.id, updated, saved.version);
          if (!verified) return reply({ error: 'reconciliation_pending' }, 503);
          return reply({ received: true, duplicate: false, reviewRequired: next.status === 'review_required' });
        } catch (error) { if (error.code !== 'conflict') throw error; }
      }
      return reply({ error: 'retry_notification' }, 503);
    } catch { return reply({ error: 'notification_unavailable' }, 503); }
  };
}
