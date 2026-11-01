import { liveDataStamp } from './live-pilot-contract.mjs';
import { randomUUID } from 'node:crypto';

export const RESUMABLE_AUTH_ERRORS = new Set(['toconline-background-session-missing', 'toconline-reauthorize-required']);
const paymentIdentity = ['id', 'userId', 'eventId', 'registrationId', 'environment', 'provider', 'method', 'amountCents', 'currency',
  'identifier', 'reference', 'entity', 'transactionId', 'paidAt', 'paymentDate', 'quote', 'fiscalQuote', 'billingSnapshot', 'bankTransfer', 'methodFingerprint', 'issuanceAttemptId'];
const registrationIdentity = ['userId', 'eventId', 'primaryRegistration', 'isTest', 'testMode'];
const jobIdentity = ['id', 'userId', 'eventId', 'registrationId', 'environment', 'provider', 'type', 'paymentMethod', 'amountCents',
  'externalReference', 'salesDocument', 'resumeAttemptId', 'issuanceProtocol', 'issuanceAttemptId', 'issuanceStartedAt'];
const pick = (data, keys) => Object.fromEntries(keys.map(key => [key, data?.[key] === undefined ? null : data[key]]));
const same = (left, right, keys) => liveDataStamp(pick(left, keys)) === liveDataStamp(pick(right, keys));
const hasId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id > 0);
function issuedPair(payment, job, expectedId) {
  return payment?.fiscalStatus === 'issued' && job?.status === 'issued' && hasId(job.providerDocumentId)
    && String(payment.fiscalDocumentId) === String(job.providerDocumentId)
    && (expectedId === undefined || String(expectedId) === String(job.providerDocumentId));
}
function immutableSourcesMatch(current, original) {
  return current.payment?.data && current.registration?.data && current.job?.data
    && same(current.payment.data, original.payment.data, paymentIdentity)
    && same(current.registration.data, original.registration.data, registrationIdentity)
    && same(current.job.data, original.job.data, jobIdentity);
}

export function isUnstartedClaimedBankJob(payment, job) {
  return payment?.status === 'paid' && payment.fiscalStatus === 'pending' && payment.method === 'bank_transfer'
    && payment.provider === 'internal_bank_transfer' && payment.environment === 'production' && payment.eventId === 'circ-2027'
    && job?.status === 'pending' && job.issuanceProtocol === 'claimed-v1' && job.provider === 'toconline'
    && job.type === 'invoice_receipt' && job.paymentMethod === 'bank_transfer' && job.environment === 'production'
    && job.id === payment.id && job.userId === payment.userId && job.registrationId === payment.registrationId
    && job.eventId === payment.eventId && job.amountCents === payment.amountCents
    && !payment.issuanceAttemptId && !job.issuanceAttemptId && !job.issuanceStartedAt && !job.resumeAttemptId && !job.resumeStartedAt
    && !hasId(payment.fiscalDocumentId) && !hasId(job.providerDocumentId) && !job.issuedAt;
}

export function canResumeLiveFiscalJob(payment, job) {
  if (payment?.status !== 'paid' || hasId(payment.fiscalDocumentId) || hasId(job?.providerDocumentId) || job?.issuedAt) return false;
  return isUnstartedClaimedBankJob(payment, job) || payment.fiscalStatus === 'pending_authorization'
    && job?.status === 'pending_authorization' && RESUMABLE_AUTH_ERRORS.has(job.errorCode);
}

// Only this invocation owns its freshly generated attempt ID. A lost write
// acknowledgement is resolved by reading that exact claim; another attempt's
// issuing state never authorizes a commercial POST.
export async function claimLiveFiscalJob({ store, orderId, payment, registration, job, now,
  attemptId = randomUUID(), jobUpdates = {} }) {
  const updatedAt = now();
  const claimed = {
    payment: { data: { ...payment.data, fiscalStatus: 'issuing', issuanceAttemptId: attemptId, updatedAt } },
    registration: { data: { ...registration.data, updatedAt } },
    job: { data: { ...job.data, ...jobUpdates, status: 'issuing', issuanceAttemptId: attemptId, issuanceStartedAt: updatedAt, updatedAt } },
  };
  try {
    await store.finalizeFiscalResult({ orderId,
      payment: claimed.payment.data, paymentVersion: payment.version,
      registration: claimed.registration.data, registrationVersion: registration.version,
      document: claimed.job.data, documentVersion: job.version,
    });
  } catch { /* The response can be lost after an accepted conditional commit. */ }
  let current;
  try {
    const [freshPayment, freshRegistration, freshJob] = await Promise.all([store.payment(orderId), store.registration(), store.document(orderId)]);
    current = { payment: freshPayment, registration: freshRegistration, job: freshJob };
  } catch { throw Object.assign(new Error('fiscal-claim-unavailable'), { code: 'fiscal-claim-unavailable', fiscalStatus: 'issuing' }); }
  if (!immutableSourcesMatch(current, claimed) || current.payment.data.status !== 'paid'
    || current.payment.data.fiscalStatus !== 'issuing' || current.job.data.status !== 'issuing'
    || current.payment.data.issuanceAttemptId !== attemptId || current.job.data.issuanceAttemptId !== attemptId) {
    throw Object.assign(new Error('fiscal-claim-not-owned'), { code: 'fiscal-claim-not-owned', fiscalStatus: current.payment.data?.fiscalStatus || 'pending' });
  }
  return { ...current, issuanceAttemptId: attemptId };
}

// The caller has already durably confirmed payment and, on administrative
// recovery, claimed the fiscal job. Commercial POST is performed at most once.
// Conditional-storage conflicts may be retried using freshly read documents;
// none of these storage retries repeat the fiscal operation.
export async function completeLiveFiscalJob({ store, orderId, payment, registration, job, fiscalClient, env, now, issuanceAttemptId }) {
  if (issuedPair(payment.data, job.data)) return 'issued';
  if (job.data?.status === 'outcome_unknown' || payment.data?.fiscalStatus === 'outcome_unknown' || hasId(job.data?.providerDocumentId) || hasId(payment.data?.fiscalDocumentId)) return 'outcome_unknown';
  if (payment.data?.status !== 'paid' || !['pending', 'issuing'].includes(job.data?.status)) return 'review_required';
  if (job.data.issuanceProtocol === 'claimed-v1') {
    if (job.data.status === 'pending') {
      if (!isUnstartedClaimedBankJob(payment.data, job.data)) return 'review_required';
      try {
        const claimed = await claimLiveFiscalJob({ store, orderId, payment, registration, job, now });
        ({ payment, registration, job, issuanceAttemptId } = claimed);
      } catch (error) { return error.fiscalStatus || 'issuing'; }
    }
    if (!issuanceAttemptId || payment.data.fiscalStatus !== 'issuing' || payment.data.issuanceAttemptId !== issuanceAttemptId
      || job.data.status !== 'issuing' || job.data.issuanceAttemptId !== issuanceAttemptId) return 'issuing';
  }
  const original = { payment, registration, job };
  let issued, providerError;
  try { issued = await fiscalClient.issueFinalizedSalesDocument(env, job.data.salesDocument); }
  catch (error) { providerError = error; }
  if (!providerError && !hasId(issued?.providerDocumentId)) {
    issued = undefined; providerError = { code: 'toconline-live-outcome-unknown', uncertain: true };
  }
  const providerStatus = providerError?.uncertain ? 'outcome_unknown'
    : RESUMABLE_AUTH_ERRORS.has(providerError?.code) ? 'pending_authorization' : 'review_required';
  let current = original;
  let persistenceError = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      try {
        const [freshPayment, freshRegistration, freshJob] = await Promise.all([store.payment(orderId), store.registration(), store.document(orderId)]);
        current = { payment: freshPayment, registration: freshRegistration, job: freshJob };
      } catch { continue; }
    }
    if (!immutableSourcesMatch(current, original)) return issued ? 'outcome_unknown' : providerStatus;
    const p = current.payment.data, r = current.registration.data, j = current.job.data;
    if (issuedPair(p, j, issued?.providerDocumentId)) return 'issued';
    // A different persisted provider identity or an uncertain result is never
    // replaced. It requires read-only reconciliation, not another fiscal POST.
    if (hasId(j.providerDocumentId) || hasId(p.fiscalDocumentId) || j.status === 'outcome_unknown' || p.fiscalStatus === 'outcome_unknown') return 'outcome_unknown';
    const documentCount = r.documentCount ?? 0;
    const validCount = Number.isSafeInteger(documentCount) && documentCount >= 0 && documentCount < Number.MAX_SAFE_INTEGER;
    // Keep the total number of conditional commits bounded to three. After two
    // failed issued-result writes, retain the accepted ID in an uncertain job.
    const status = issued ? (!validCount || persistenceError && attempt === 2 ? 'outcome_unknown' : 'issued') : providerStatus;
    const updatedAt = now();
    const registrationNext = { ...r, ...(status === 'issued' ? { documentCount: documentCount + 1 } : {}), updatedAt };
    if (status === 'issued') {
      if (registrationNext.openSupplementaryOrderId === orderId) delete registrationNext.openSupplementaryOrderId;
      if (registrationNext.fiscalPendingOrderId === orderId) delete registrationNext.fiscalPendingOrderId;
    }
    try {
      await store.finalizeFiscalResult({ orderId,
        payment: { ...p, fiscalStatus: status, ...(issued ? { fiscalDocumentId: issued.providerDocumentId,
          fiscalDocumentNo: issued.providerDocumentNo ?? null } : {}), updatedAt }, paymentVersion: current.payment.version,
        registration: registrationNext, registrationVersion: current.registration.version,
        document: { ...j, status, errorCode: status === 'issued' ? null : status === 'outcome_unknown' ? 'toconline-live-outcome-unknown' : providerError?.code || 'toconline-failed',
          ...(issued ? { providerDocumentId: issued.providerDocumentId, providerDocumentNo: issued.providerDocumentNo ?? null } : {}),
          ...(status === 'issued' ? { issuedAt: updatedAt } : {}), updatedAt }, documentVersion: current.job.version,
      });
      return status;
    } catch { persistenceError = true; }
  }
  return issued ? 'outcome_unknown' : providerStatus;
}
