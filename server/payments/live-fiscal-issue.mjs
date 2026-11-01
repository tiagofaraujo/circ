export const RESUMABLE_AUTH_ERRORS = new Set(['toconline-background-session-missing', 'toconline-reauthorize-required']);

// The caller has already durably confirmed payment (and, for a resume, claimed
// the fiscal job). A provider success followed by a storage failure is uncertain.
export async function completeLiveFiscalJob({ store, orderId, payment, registration, job, fiscalClient, env, now }) {
  let issued;
  try {
    issued = await fiscalClient.issueFinalizedSalesDocument(env, job.data.salesDocument);
    await store.finalizeFiscalResult({ orderId,
      payment: { ...payment.data, fiscalStatus: 'issued', fiscalDocumentId: issued.providerDocumentId,
        fiscalDocumentNo: issued.providerDocumentNo, updatedAt: now() }, paymentVersion: payment.version,
      registration: { ...registration.data, documentCount: Number(registration.data.documentCount || 0) + 1, updatedAt: now() }, registrationVersion: registration.version,
      document: { ...job.data, status: 'issued', errorCode: null, providerDocumentId: issued.providerDocumentId,
        providerDocumentNo: issued.providerDocumentNo, issuedAt: now(), updatedAt: now() }, documentVersion: job.version,
    });
    return 'issued';
  } catch (error) {
    const uncertain = Boolean(issued || error?.uncertain);
    const status = uncertain ? 'outcome_unknown' : RESUMABLE_AUTH_ERRORS.has(error?.code) ? 'pending_authorization' : 'review_required';
    try {
      await store.finalizeFiscalResult({ orderId,
        payment: { ...payment.data, fiscalStatus: status, updatedAt: now() }, paymentVersion: payment.version,
        registration: { ...registration.data, updatedAt: now() }, registrationVersion: registration.version,
        document: { ...job.data, status, errorCode: uncertain ? 'toconline-live-outcome-unknown' : error?.code || 'toconline-failed',
          ...(issued ? { providerDocumentId: issued.providerDocumentId, providerDocumentNo: issued.providerDocumentNo } : {}),
          updatedAt: now() }, documentVersion: job.version,
      });
    } catch { /* The paid registration remains durable; never repeat a POST here. */ }
    return status;
  }
}
