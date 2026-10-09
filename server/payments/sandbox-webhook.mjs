import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { createSandboxStore } from './sandbox-store.mjs';
import { createEupagoSandbox } from './eupago-sandbox.mjs';
import { createServiceTokenProvider } from './service-token.mjs';

const PREFIX = '/api/payments/sandbox/notifications/';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });
export function webhookConfiguration(env, uid) {
  return { signingKeyPresent: Boolean(env.EUPAGO_SANDBOX_WEBHOOK_KEY),
    channelPresent: Boolean(env.EUPAGO_SANDBOX_CHANNEL?.trim()),
    serviceAccountPresent: Boolean(env.FIREBASE_SANDBOX_SERVICE_ACCOUNT),
    path: `${PREFIX}${Buffer.from(uid).toString('base64url')}` };
}
async function boundedBody(request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error();
  const chunks = []; let length = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.length;
    if (length > 16384) { await reader.cancel(); throw new Error(); }
    chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks);
}
const digits = value => typeof value === 'string' && /^\d{1,30}$/.test(value) ? value
  : Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
function cents(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,5}(?:\.\d{1,2}0{0,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}
const paymentMethods = new Map([
  ['Multibanco', 'multibanco'], ['PC:PT', 'multibanco'],
  ['Mbway', 'mbway'], ['MW:PT', 'mbway'],
]);
function paymentDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?(Z|\+00:00)?$/.exec(value);
  if (!match) return null;
  // Validate calendar fields without depending on the runtime's local timezone.
  const date = new Date(`${match[1]}${match[2] || ''}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== match[1]) return null;
  // The support sample has no offset. Preserve it rather than inventing a UTC instant.
  return match[3] ? date.toISOString() : value;
}
// Webhook 2.0: cleartext JSON over HTTPS, base64 HMAC-SHA256 over exact body bytes.
// Encrypted payloads and webhook 1.0 are deliberately not accepted by this route.
export function parseSignedPayment(bytes, signature, key, channel) {
  if (typeof key !== 'string' || !key || typeof signature !== 'string'
    || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) throw new Error('invalid_signature');
  const expected = createHmac('sha256', key).update(bytes).digest();
  const supplied = Buffer.from(signature, 'base64');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('invalid_signature');
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  // Accept either single-object spelling, never both or a batch.
  if (!body || body.data != null || (body.transactions != null && body.transaction != null)) throw new Error('invalid_event');
  const tx = body.transactions ?? body.transaction;
  const method = paymentMethods.get(tx?.method);
  const paidAt = paymentDate(tx?.date);
  const entity = tx?.entity == null ? null : digits(tx.entity);
  if (!tx || Array.isArray(tx) || body.channel?.name !== channel || tx.status !== 'Paid'
    || !/^circ_test_[a-f0-9]{32}$/.test(tx.identifier || '')
    || !method || !digits(tx.reference) || !digits(tx.trid)
    || (tx.entity != null && !/^\d{5}$/.test(entity || ''))
    || (method === 'multibanco' && !entity)
    || tx.amount?.currency !== 'EUR' || cents(tx.amount?.value) !== 100
    || !paidAt) throw new Error('invalid_event');
  const hex = tx.identifier.slice(10);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (!UUID.test(id)) throw new Error('invalid_event');
  const event = { id, identifier: tx.identifier, method,
    reference: digits(tx.reference), entity,
    transactionId: digits(tx.trid), amountCents: 100, currency: 'EUR', paidAt };
  return { ...event, digest: createHash('sha256').update(JSON.stringify(event)).digest('hex') };
}
export function createSandboxWebhook({ tokenProvider = createServiceTokenProvider(), storeFactory = createSandboxStore,
  providerFactory = createEupagoSandbox, now = () => new Date().toISOString() } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) return null;
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (url.search || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return json({ error: 'invalid_request' }, 400);
    const encoded = url.pathname.slice(PREFIX.length);
    const uid = Buffer.from(encoded, 'base64url').toString('utf8');
    if (!/^[A-Za-z0-9_-]{1,172}$/.test(encoded) || !uid || uid.length > 128
      || Buffer.from(uid).toString('base64url') !== encoded || /[\u0000-\u001f/]/.test(uid)) return json({ error: 'not_found' }, 404);
    if (!env.EUPAGO_SANDBOX_WEBHOOK_KEY || !env.EUPAGO_SANDBOX_CHANNEL?.trim()
      || !env.FIREBASE_SANDBOX_SERVICE_ACCOUNT || !env.FIREBASE_PROJECT_ID || !env.EUPAGO_SANDBOX_API_KEY) return json({ error: 'webhook_not_configured' }, 503);
    let bytes;
    try { bytes = await boundedBody(request); } catch { return json({ error: 'invalid_request' }, 400); }
    let event;
    try { event = parseSignedPayment(bytes, request.headers.get('X-Signature'), env.EUPAGO_SANDBOX_WEBHOOK_KEY, env.EUPAGO_SANDBOX_CHANNEL); }
    catch (error) { return json({ error: error.message === 'invalid_signature' ? 'invalid_signature' : 'invalid_event' }, error.message === 'invalid_signature' ? 401 : 422); }
    // Authentication and bounded parsing precede ALL database and provider calls.
    try {
      const token = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid });
      const provider = providerFactory({ apiKey: env.EUPAGO_SANDBOX_API_KEY, environment: 'sandbox' });
      for (let retry = 0; retry < 3; retry++) {
        let saved = await store.read(event.id);
        if (!saved) return json({ error: 'attempt_not_found' }, 404);
        const r = saved.record;
        // MB WAY creation can omit entity, while the signed notification includes it.
        // Only this missing-field case may be reconciled; a known mismatch stays fatal.
        const reconcileEntity = r.method === 'mbway' && r.entity == null && event.entity !== null;
        if (r.kind !== 'gateway-test' || r.environment !== 'sandbox' || r.owner !== uid || r.id !== event.id
          || r.identifier !== event.identifier || r.reference !== event.reference
          || (!reconcileEntity && (r.entity || null) !== event.entity)
          || r.method !== event.method || r.amountCents !== event.amountCents || r.currency !== event.currency
          || !['pending', 'sandbox_paid'].includes(r.status)) return json({ error: 'attempt_mismatch' }, 422);
        if (r.notification && r.notification.digest !== event.digest) return json({ error: 'notification_conflict' }, 409);
        if (r.status === 'sandbox_paid' && r.notification?.verifiedAt) return json({ received: true, duplicate: true });
        try {
          const notification = r.notification || {
            digest: event.digest, transactionId: event.transactionId, paidAt: event.paidAt, receivedAt: now(), verifiedAt: null,
          };
          let verifiedHint;
          if (reconcileEntity) {
            // The existing authenticated adapter requires the API response to match
            // reference, full identifier AND entity. Do not trust the callback alone,
            // hard-code 10045, or persist an unverified entity/receipt on a mismatch.
            verifiedHint = await provider.inspectReference({ ...r, entity: event.entity });
            saved = await store.replace(event.id, { ...r, entity: event.entity, notification }, saved.version);
          } else if (!r.notification) {
            // Preserve the existing receipt-first path for already matched entities.
            saved = await store.replace(event.id, { ...r, notification }, saved.version);
          }
          const hint = verifiedHint || await provider.inspectReference(saved.record);
          if (!['paga', 'pago', 'transferida'].includes(hint.providerState)) return json({ error: 'reconciliation_pending' }, 503);
          await store.replace(event.id, { ...saved.record, status: 'sandbox_paid', providerState: hint.providerState,
            providerStateCode: hint.providerStateCode ?? null, inspectedAt: now(),
            notification: { ...saved.record.notification, verifiedAt: now() } }, saved.version);
          // No registration, entitlement, production payment or invoice writes.
          return json({ received: true, duplicate: false });
        } catch (error) {
          if (error.code === 'reference-mismatch') return json({ error: 'attempt_mismatch' }, 422);
          if (error.code !== 'conflict') throw error;
        }
      }
      return json({ error: 'retry_notification' }, 503);
    } catch { return json({ error: 'notification_unavailable' }, 503); }
  };
}
