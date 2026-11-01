import { randomUUID } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, readLivePaymentById, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createToconlineLiveClient } from './toconline-live-client.mjs';
import { buildLivePaymentFR } from './toconline-live-payload.mjs';
import { liveDataStamp } from './live-pilot-contract.mjs';
import { getRegistrationPeriod } from '../../src/data/registration2027.js';
import { completeLiveFiscalJob, canResumeLiveFiscalJob, claimLiveFiscalJob } from './live-fiscal-issue.mjs';

const CONFIRMATION = 'RETOMAR FATURACAO AUTORIZADA';
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const publicOrder = (id, payment, fiscalStatus) => ({ id, status: payment.status, amountCents: payment.amountCents,
  currency: payment.currency, method: payment.method, entity: payment.entity, reference: payment.reference, fiscalStatus });

export function createLiveFiscalResumeApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createCheckoutLiveStore, paymentLookup = readLivePaymentById, fiscalClient = createToconlineLiveClient(), now = () => new Date().toISOString(),
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
      const located = await paymentLookup({ projectId: env.FIREBASE_PROJECT_ID, token: serviceToken, orderId: id });
      const ownerId = located?.data?.userId;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId || '') || located.data.environment !== 'production') return reply({ error: 'not-found' }, 404);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: ownerId, token: serviceToken });
      const [payment, registration, job] = await Promise.all([store.payment(id), store.registration(), store.document(id)]);
      const p = payment?.data, r = registration?.data, j = job?.data;
      if (!p || p.userId !== ownerId || p.environment !== 'production') return reply({ error: 'not-found' }, 404);
      if (!canResumeLiveFiscalJob(p,j)) return reply({ error: 'fiscal-resume-not-allowed' }, 409);
      const kind=p.kind||p.quote?.kind||'primary';
      const fiscalQuote=p.fiscalQuote||p.quote;
      const isTransfer=p.method==='bank_transfer';
      const account=isTransfer?p.bankTransfer?.billingAccount:null;
      const transfer=p.bankTransfer?.confirmation;
      if (p.id !== id || p.eventId !== 'circ-2027' || p.registrationId !== store.registrationId
        || !['multibanco','mbway','bank_transfer'].includes(p.method) || p.provider !== (isTransfer?'internal_bank_transfer':'eupago') || (!Number.isSafeInteger(p.amountCents) || p.amountCents <= 0 || p.amountCents > 9999900) || p.currency !== 'EUR'
        || !p.paidAt || !p.transactionId || !['external','uls','student'].includes(p.quote?.selection?.profile)
        || fiscalQuote?.amountCents !== p.amountCents || fiscalQuote.kind !== kind || !['primary','supplementary'].includes(kind) || p.identifier !== `circ_live_${id.replaceAll('-', '')}`
        || r?.eventId !== 'circ-2027' || r.userId !== ownerId || r.primaryRegistration !== true
        || r.isTest !== false || r.testMode !== false || r.status !== 'confirmed' || r.payment?.status !== 'paid'
        || r.payment.currency !== 'EUR' || (r.fiscalPendingOrderId && r.fiscalPendingOrderId !== id)
        || (kind==='primary' ? Number(r.documentCount||0)!==0 || r.payment.amountCents!==p.amountCents || r.payment.reference!==p.reference || r.payment.method!==p.method || (r.payment.orderId&&r.payment.orderId!==id)
          : r.openSupplementaryOrderId!==id || !Array.isArray(r.paidSupplementaryOrderIds) || !r.paidSupplementaryOrderIds.includes(id))
        || j.id !== id || j.userId !== ownerId || j.registrationId !== store.registrationId || j.eventId !== 'circ-2027'
        || j.environment !== 'production' || j.provider !== 'toconline' || j.type !== 'invoice_receipt'
        || j.amountCents !== p.amountCents || j.paymentMethod !== p.method) return reply({ error: 'fiscal-job-mismatch' }, 409);
      if(isTransfer){
        if(p.reference!==id||p.bankTransfer?.status!=='confirmed'||account?.source!=='company_bank_accounts'
          ||!Number.isSafeInteger(account.id)||account.id<=0||!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(p.bankTransfer.iban||'')
          ||account.ibanLast4!==p.bankTransfer.iban.slice(-4)||transfer?.bookingDate!==p.paymentDate
          ||transfer.amountCents!==p.amountCents||transfer.currency!=='EUR'||!/^[a-f0-9]{64}$/.test(transfer.creditKey||'')
          ||p.transactionId!==`bank_${transfer.creditKey}`)return reply({error:'fiscal-job-mismatch'},409);
        const credit=(await store.bankCredit(transfer.creditKey))?.data;
        if(!credit||credit.kind!=='bank-credit-live'||credit.environment!=='production'||credit.eventId!=='circ-2027'
          ||credit.orderId!==id||credit.decisionId!==transfer.decisionId||credit.requestHash!==transfer.requestHash
          ||credit.bookingDate!==p.paymentDate||credit.amountCents!==p.amountCents||credit.currency!=='EUR')return reply({error:'fiscal-job-mismatch'},409);
      }
      const date = new Date(`${p.paymentDate}T12:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== p.paymentDate) return reply({ error: 'fiscal-job-mismatch' }, 409);
      const period = getRegistrationPeriod(date);
      if (fiscalQuote.ratePeriod !== period || r.selection?.profile !== fiscalQuote.selection?.profile
        || (j.orderKind && j.orderKind !== kind)) return reply({ error: 'fiscal-job-mismatch' }, 409);
      let expected;
      try { expected = buildLivePaymentFR({ orderId: id, quote: fiscalQuote, billing: { customer: p.billingSnapshot }, paymentDate: p.paymentDate,method:p.method,...(isTransfer?{bankAccountId:account.id}:{}) }); }
      catch { return reply({ error: 'fiscal-job-mismatch' }, 409); }
      if (j.externalReference !== expected.external_reference || liveDataStamp(j.salesDocument) !== liveDataStamp(expected)) return reply({ error: 'fiscal-job-mismatch' }, 409);
      const attemptId = randomUUID();
      const claimed = await claimLiveFiscalJob({ store, orderId:id, payment, registration, job, now, attemptId,
        jobUpdates:{ resumeAttemptId:attemptId,resumeStartedAt:now(),resumedBy:{uid:claims.sub,email:claims.email} } });
      if(claimed.registration.data?.status!=='confirmed')return reply({error:'fiscal-resume-conflict'},409);
      const fiscalStatus = await completeLiveFiscalJob({ store, orderId: id, payment: claimed.payment,
        registration: claimed.registration, job: claimed.job, issuanceAttemptId:claimed.issuanceAttemptId, fiscalClient, env, now });
      return reply({ order: publicOrder(id, p, fiscalStatus) });
    } catch (error) {
      const conflict=['conflict','fiscal-claim-not-owned'].includes(error?.code);
      return reply({ error: conflict ? 'fiscal-resume-conflict' : 'fiscal-resume-unavailable' }, conflict ? 409 : 503);
    }
  };
}
