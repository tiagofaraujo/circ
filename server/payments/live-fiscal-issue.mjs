import { liveDataStamp } from './live-pilot-contract.mjs';

export const RESUMABLE_AUTH_ERRORS = new Set(['toconline-background-session-missing', 'toconline-reauthorize-required']);
const paymentIdentity = ['id', 'userId', 'eventId', 'registrationId', 'environment', 'provider', 'method', 'amountCents', 'currency',
  'identifier', 'reference', 'entity', 'transactionId', 'paidAt', 'paymentDate', 'quote', 'billingSnapshot'];
const registrationIdentity = ['userId', 'eventId', 'primaryRegistration', 'isTest', 'testMode'];
const jobIdentity = ['id', 'userId', 'eventId', 'registrationId', 'environment', 'provider', 'type', 'paymentMethod', 'amountCents',
  'externalReference', 'salesDocument', 'resumeAttemptId'];
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

// The caller has already durably confirmed payment and, on administrative
// recovery, claimed the fiscal job. Commercial POST is performed at most once.
// Conditional-storage conflicts may be retried using freshly read documents;
// none of these storage retries repeat the fiscal operation.
export async function completeLiveFiscalJob({ store, orderId, payment, registration, job, fiscalClient, env, now }) {
  const original = { payment, registration, job };
  if (issuedPair(payment.data, job.data)) return 'issued';
  if (job.data?.status === 'outcome_unknown' || payment.data?.fiscalStatus === 'outcome_unknown' || hasId(job.data?.providerDocumentId) || hasId(payment.data?.fiscalDocumentId)) return 'outcome_unknown';
  if (payment.data?.status !== 'paid' || !['pending', 'issuing'].includes(job.data?.status)) return 'review_required';
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
