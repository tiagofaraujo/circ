import { createCheckoutLiveStore, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createToconlineLiveClient } from './toconline-live-client.mjs';

const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const reply = (error, status, diagnostic) => Response.json({ error, ...(diagnostic ? { diagnostic } : {}) }, { status, headers });
const pdfDiagnostics = new Set([
  'toconline-api-url-invalid', 'toconline-background-session-missing', 'toconline-not-configured',
  'toconline-oauth-invalid-response', 'toconline-oauth-rejected', 'toconline-oauth-unavailable',
  'toconline-oauth-url-invalid', 'toconline-reauthorize-required', 'toconline-print-json-invalid',
  'toconline-print-location-invalid', 'toconline-print-url-invalid', 'toconline-pdf-unavailable',
  'toconline-pdf-invalid-response', 'toconline-pdf-invalid-file',
]);

function pdfDiagnostic(code) {
  return typeof code === 'string' && (pdfDiagnostics.has(code)
    || /^toconline-(?:print|pdf)-http-[1-5][0-9]{2}$/.test(code)) ? code : null;
}

export function createLiveInvoicePdfApi({ verify, storeFactory = createCheckoutLiveStore,
  fiscalClient = createToconlineLiveClient(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)\/invoice\.pdf$/);
    if (!match) return null;
    if (request.method !== 'GET') return reply('method-not-allowed', 405);
    if (url.search || !LIVE_ORDER_UUID.test(match[1])) return reply('invalid-request', 400);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply('sign-in-required', 401);
    if (!env.FIREBASE_PROJECT_ID) return reply('service-unavailable', 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply('invalid-session', 401); }
    if (claims.email_verified !== true) return reply('verified-email-required', 403);
    try {
      // Read with the participant's Firebase token and existing ownership rules.
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: claims.sub, token });
      const id = match[1];
      const [payment, document] = await Promise.all([store.payment(id), store.document(id)]);
      const p = payment?.data, d = document?.data;
      if (!p || !d || p.userId !== claims.sub || d.userId !== claims.sub) return reply('not-found', 404);
      const matchingProvider = p.provider === 'internal_bank_transfer'
        ? p.method === 'bank_transfer' && d.paymentMethod === 'bank_transfer'
        :p.provider==='stripe'?p.method==='stripe_card'&&d.paymentMethod==='stripe_card'
        :p.provider === 'eupago' && p.method !== 'bank_transfer' && p.method!=='stripe_card' && d.paymentMethod !== 'bank_transfer'&&d.paymentMethod!=='stripe_card';
      if (p.id !== id || d.id !== id || p.environment !== 'production' || d.environment !== 'production'
        || p.eventId !== 'circ-2027' || d.eventId !== 'circ-2027' || p.registrationId !== store.registrationId
        || d.registrationId !== p.registrationId || !matchingProvider || d.provider !== 'toconline'
        || d.type !== 'invoice_receipt' || !['paid', 'refunded'].includes(p.status)
        || p.fiscalStatus !== 'issued' || d.status !== 'issued' || !d.issuedAt
        || String(p.fiscalDocumentId) !== String(d.providerDocumentId) || !/^[1-9][0-9]{0,17}$/.test(String(d.providerDocumentId))
        || !Number.isSafeInteger(p.amountCents) || p.amountCents <= 0 || d.amountCents !== p.amountCents) return reply('invoice-not-available', 409);
      let pdf;
      try {
        pdf = await fiscalClient.downloadSalesDocumentPdf(env, d.providerDocumentId);
      } catch (error) {
        return reply('invoice-download-unavailable', 503, pdfDiagnostic(error?.code) || 'invoice-provider-read-failed');
      }
      return new Response(pdf, { headers: { ...headers, 'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="CIRC2027-fatura-recibo-${id}.pdf"` } });
    } catch (error) {
      if (error?.code === 'storage_forbidden') return reply('not-found', 404);
      return reply('invoice-download-unavailable', 503, 'invoice-record-read-failed');
    }
  };
}
