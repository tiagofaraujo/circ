import { randomUUID } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createToconlineLiveClient } from './toconline-live-client.mjs';
import { buildLiveOnsiteMultibancoFR } from './toconline-live-payload.mjs';
import { liveDataStamp } from './live-pilot-contract.mjs';
import { completeLiveFiscalJob, RESUMABLE_AUTH_ERRORS } from './live-fiscal-issue.mjs';

const CONFIRMATION = 'RETOMAR FATURACAO AUTORIZADA';
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const publicOrder = (id, payment, fiscalStatus) => ({ id, status: payment.status, amountCents: payment.amountCents,
  currency: payment.currency, method: payment.method, entity: payment.entity, reference: payment.reference, fiscalStatus });

export function createLiveFiscalResumeApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createCheckoutLiveStore, fiscalClient = createToconlineLiveClient(), now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)\/fiscal-resume$/);
    if (!match) return null;
    if (request.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405);
    if (url.search || request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email_verified !== true || claims?.email !== 'circ.chuc@gmail.com') return reply({ error: 'admin-required' }, 403);
    const id = match[1];
    if (!LIVE_ORDER_UUID.test(id)) return reply({ error: 'invalid-request' }, 400);
    let data;
    try { data = /^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '') ? await request.json() : null; }
    catch { return reply({ error: 'invalid-request' }, 400); }
    if (!data || Array.isArray(data) || Object.keys(data).length !== 1 || data.confirmation !== CONFIRMATION) return reply({ error: 'fiscal-confirmation-required' }, 400);
    try {
      const serviceToken = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: claims.sub, token: serviceToken });
      const [payment, registration, job] = await Promise.all([store.payment(id), store.registration(), store.document(id)]);
      const p = payment?.data, r = registration?.data, j = job?.data;
      if (!p || p.userId !== claims.sub || p.environment !== 'production') return reply({ error: 'not-found' }, 404);
      if (p.status !== 'paid' || p.fiscalStatus !== 'pending_authorization'
        || j?.status !== 'pending_authorization' || !RESUMABLE_AUTH_ERRORS.has(j.errorCode)
        || j.providerDocumentId || j.issuedAt) return reply({ error: 'fiscal-resume-not-allowed' }, 409);
      if (p.id !== id || p.eventId !== 'circ-2027' || p.registrationId !== store.registrationId
        || p.provider !== 'eupago' || p.method !== 'multibanco' || p.amountCents !== 9500 || p.currency !== 'EUR'
        || !p.paidAt || !p.transactionId || p.quote?.selection?.profile !== 'external'
        || p.quote?.amountCents !== p.amountCents || p.identifier !== `circ_live_${id.replaceAll('-', '')}`
        || r?.eventId !== 'circ-2027' || r.userId !== claims.sub || r.primaryRegistration !== true
        || r.isTest !== false || r.testMode !== false || r.status !== 'confirmed' || Number(r.documentCount || 0) !== 0
        || r.payment?.status !== 'paid' || r.payment.amountCents !== p.amountCents || r.payment.currency !== p.currency
        || r.payment.reference !== p.reference || r.payment.method !== p.method
        || j.id !== id || j.userId !== claims.sub || j.registrationId !== store.registrationId || j.eventId !== 'circ-2027'
        || j.environment !== 'production' || j.provider !== 'toconline' || j.type !== 'invoice_receipt'
        || j.amountCents !== p.amountCents || j.paymentMethod !== 'multibanco') return reply({ error: 'fiscal-job-mismatch' }, 409);
      let expected;
      try { expected = buildLiveOnsiteMultibancoFR({ orderId: id, quote: p.quote, billing: { customer: p.billingSnapshot }, paymentDate: p.paymentDate }); }
      catch { return reply({ error: 'fiscal-job-mismatch' }, 409); }
      if (j.externalReference !== expected.external_reference || liveDataStamp(j.salesDocument) !== liveDataStamp(expected)) return reply({ error: 'fiscal-job-mismatch' }, 409);
      const attemptId = randomUUID();
      await store.finalizeFiscalResult({ orderId: id,
        payment: { ...p, fiscalStatus: 'issuing', updatedAt: now() }, paymentVersion: payment.version,
        registration: { ...r, updatedAt: now() }, registrationVersion: registration.version,
        document: { ...j, status: 'issuing', resumeAttemptId: attemptId, resumeStartedAt: now(),
          resumedBy: { uid: claims.sub, email: claims.email }, updatedAt: now() }, documentVersion: job.version,
      });
      const [freshPayment, freshRegistration, freshJob] = await Promise.all([store.payment(id), store.registration(), store.document(id)]);
      if (freshPayment.data?.fiscalStatus !== 'issuing' || freshPayment.data.status !== 'paid'
        || freshRegistration.data?.status !== 'confirmed' || freshJob.data?.status !== 'issuing'
        || freshJob.data.resumeAttemptId !== attemptId) return reply({ error: 'fiscal-resume-conflict' }, 409);
      const fiscalStatus = await completeLiveFiscalJob({ store, orderId: id, payment: freshPayment,
        registration: freshRegistration, job: freshJob, fiscalClient, env, now });
      return reply({ order: publicOrder(id, p, fiscalStatus) });
    } catch (error) {
      return reply({ error: error?.code === 'conflict' ? 'fiscal-resume-conflict' : 'fiscal-resume-unavailable' }, error?.code === 'conflict' ? 409 : 503);
    }
  };
}
