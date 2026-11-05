import { createHash } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { createCheckoutLiveStore, readLivePaymentById, LIVE_ORDER_UUID } from './checkout-live-store.mjs';
import { createToconlineLiveClient } from './toconline-live-client.mjs';
import { buildLivePaymentFR } from './toconline-live-payload.mjs';
import { completeLiveFiscalJob } from './live-fiscal-issue.mjs';
import { publicLiveOrder } from './checkout-live.mjs';
import { liveDataStamp } from './live-pilot-contract.mjs';
import { proposedBankAccount } from './bank-transfer-account.mjs';
import { quotePrimary, quoteSupplementary } from './quote.mjs';
import { validateBillingCustomerSnapshot } from './toconline-billing-customer.mjs';

const EVENT = 'circ-2027', ADMIN = 'circ.chuc@gmail.com', PREFIX = '/api/checkout/live';
const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => Response.json(body, { status, headers });
const fail = (code, status = 400, details = {}) => { throw Object.assign(new Error(code), { code, status, details }); };
const exact = (value, fields) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => !fields.includes(key))) fail('invalid-request');
};
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail('invalid-request');
  const reader = request.body?.getReader();
  if (!reader) fail('invalid-request');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); fail('invalid-request'); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail('invalid-request'); }
}
function todayLisbon(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function realBankPayment(p, id) {
  return p?.id === id && p.eventId === EVENT && p.environment === 'production' && p.method === 'bank_transfer'
    && p.provider === 'internal_bank_transfer' && /^[A-Za-z0-9_-]{1,128}$/.test(p.userId || '')
    && p.registrationId === `${EVENT}-${p.userId}` && p.identifier === `circ_live_${id.replaceAll('-', '')}`
    && p.reference === id && p.currency === 'EUR' && Number.isSafeInteger(p.amountCents) && p.amountCents > 0
    && p.bankTransfer?.iban === proposedBankAccount.iban && p.bankTransfer.payee === proposedBankAccount.beneficiary
    && p.bankTransfer.paymentReference === id && Number.isSafeInteger(p.bankTransfer.revision) && p.bankTransfer.revision >= 0;
}
function assertPending(p) {
  if (!['pending', 'review_required'].includes(p.status)
    || !['awaiting_transfer', 'under_review', 'rejected'].includes(p.bankTransfer.status)) fail('bank-transfer-state-conflict', 409);
}
function realRegistration(r, uid) {
  return r?.eventId === EVENT && r.userId === uid && r.primaryRegistration === true && r.isTest === false && r.testMode === false;
}
function adminRow(id, p) {
  const transfer = p.bankTransfer;
  const confirmation = transfer.confirmation;
  const publicOrder = publicLiveOrder(id, p);
  return { ...publicOrder, ownerName: p.billingSnapshot?.customer_business_name || '', registrationId: p.registrationId,
    createdAt: p.createdAt || null, bankTransfer: { ...publicOrder.bankTransfer,
      reports: (Array.isArray(transfer.reports) ? transfer.reports : []).slice(-20).map(report => ({
        note: typeof report.note === 'string' ? report.note.slice(0, 500) : '', at: typeof report.at === 'string' ? report.at.slice(0, 40) : null,
      })), ...(confirmation ? { confirmation: {
        creditReference: typeof confirmation.creditReference === 'string' ? confirmation.creditReference.slice(0, 80) : '',
        bookingDate: confirmation.bookingDate || null, amountCents: confirmation.amountCents || null,
        currency: confirmation.currency || 'EUR', confirmedAt: confirmation.confirmedAt || null,
        confirmedByEmail: typeof confirmation.confirmedBy?.email === 'string' ? confirmation.confirmedBy.email.slice(0, 254) : '',
      } } : {}) } };
}
function approveBody(body, currentTime) {
  exact(body, ['id', 'expectedRevision', 'creditConfirmed', 'amountCents', 'currency', 'creditReference', 'bookingDate', 'reason']);
  if (!LIVE_ORDER_UUID.test(body.id || '') || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail('invalid-request');
  if (body.creditConfirmed !== true) fail('bank-transfer-credit-required');
  if (!Number.isSafeInteger(body.amountCents) || body.amountCents <= 0 || body.amountCents > 9999900 || body.currency !== 'EUR') fail('bank-transfer-invalid-credit');
  const creditReference = typeof body.creditReference === 'string' ? body.creditReference.trim().replace(/\s+/g, ' ').toUpperCase() : '';
  const bookingDate = body.bookingDate;
  const date = typeof bookingDate === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(bookingDate) ? new Date(`${bookingDate}T00:00:00Z`) : null;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!/^[A-Z0-9][A-Z0-9 /._:-]{2,79}$/.test(creditReference) || !date || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== bookingDate || bookingDate > todayLisbon(currentTime)
    || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason)) fail('bank-transfer-invalid-credit');
  const normalized = { id: body.id, expectedRevision: body.expectedRevision, creditConfirmed: true,
    amountCents: body.amountCents, currency: 'EUR', creditReference, bookingDate, reason };
  return { ...normalized, requestHash: liveDataStamp(normalized),
    creditKey: createHash('sha256').update(`${proposedBankAccount.iban}|${creditReference}`).digest('hex') };
}

export function createBankTransferLiveApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createCheckoutLiveStore, paymentLookup = readLivePaymentById,
  fiscalClient = createToconlineLiveClient(), now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    const listing = url.pathname === `${PREFIX}/bank-transfers`;
    const match = url.pathname.match(/^\/api\/checkout\/live\/orders\/([^/]+)\/bank-transfer-(report|review)$/);
    if (!listing && !match) return null;
    if (request.method !== (listing ? 'GET' : 'POST')) return reply({ error: 'method-not-allowed' }, 405);
    const queryKeys = [...url.searchParams.keys()];
    const orderLookup = listing && queryKeys.length === 1 && queryKeys[0] === 'orderId' ? url.searchParams.get('orderId') : null;
    const after = listing && queryKeys.length === 1 && queryKeys[0] === 'after' ? url.searchParams.get('after') : null;
    if (url.search && ((!orderLookup && !after) || (orderLookup && !LIVE_ORDER_UUID.test(orderLookup))
      || (after && !LIVE_ORDER_UUID.test(after)))) return reply({ error: 'invalid-request' }, 400);
    if (!listing && request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email_verified !== true) return reply({ error: 'verified-email-required' }, 403);
    const admin = String(claims.email || '').toLowerCase() === ADMIN;
    if ((listing || match?.[2] === 'review') && !admin) return reply({ error: 'admin-required' }, 403);
    try {
      if (listing) {
        if (orderLookup) {
          const serviceToken = await tokenProvider(env);
          const located = await paymentLookup({ projectId: env.FIREBASE_PROJECT_ID, token: serviceToken, orderId: orderLookup });
          const p = located?.data;
          return reply({ orders: realBankPayment(p, orderLookup) ? [adminRow(orderLookup, p)] : [], truncated: false, nextCursor: null });
        }
        // Existing admin Firestore rules authorize this bounded query. The
        // service account need not gain collection-list permissions.
        const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: claims.sub, token });
        const rows = await store.adminBankTransfers({ after });
        const scanned = rows.slice(0, 100);
        const valid = scanned.filter(row => LIVE_ORDER_UUID.test(row.id) && realBankPayment(row.data, row.id));
        return reply({ orders: valid.map(({ id, data: p }) => adminRow(id, p)), truncated: rows.length > 100,
          nextCursor: rows.length > 100 ? scanned.at(-1)?.id || null : null });
      }
      const id = match[1];
      if (!LIVE_ORDER_UUID.test(id)) fail('invalid-request');
      const input = await readBody(request);
      const serviceToken = await tokenProvider(env);
      const located = await paymentLookup({ projectId: env.FIREBASE_PROJECT_ID, token: serviceToken, orderId: id });
      const p = located?.data;
      if (!p || !realBankPayment(p, id) || (match[2] === 'report' && p.userId !== claims.sub)) return reply({ error: 'not-found' }, 404);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, uid: p.userId, token: serviceToken });
      if (match[2] === 'report') {
        exact(input, ['id', 'expectedRevision', 'note']);
        const note = typeof input.note === 'string' ? input.note.trim() : '';
        if (!LIVE_ORDER_UUID.test(input.id || '') || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
          || (input.note !== undefined && typeof input.note !== 'string') || note.length > 500 || /[\u0000-\u001f\u007f]/.test(note)) fail('invalid-request');
        const requestHash = liveDataStamp({ id: input.id, expectedRevision: input.expectedRevision, note });
        const reports = Array.isArray(p.bankTransfer.reports) ? p.bankTransfer.reports : [];
        const previous = reports.find(report => report.id === input.id);
        if (previous) {
          if (previous.requestHash !== requestHash) fail('idempotency-conflict', 409);
          return reply({ order: publicLiveOrder(id, p), duplicate: true });
        }
        assertPending(p);
        if (input.expectedRevision !== p.bankTransfer.revision) fail('bank-transfer-stale-review', 409);
        if (reports.length >= 20) fail('bank-transfer-report-limit', 409);
        const currentTime = now();
        const next = { ...p, bankTransfer: { ...p.bankTransfer, status: 'under_review', revision: p.bankTransfer.revision + 1,
          reportedAt: currentTime, reports: [...reports, { id: input.id, note, at: currentTime, actor: p.userId, requestHash }] }, updatedAt: currentTime };
        await store.updatePayment(id, next, located.version);
        return reply({ order: publicLiveOrder(id, next), duplicate: false });
      }
      const currentTime = now(), decision = approveBody(input, currentTime);
      if (p.status === 'paid') {
        const previous = p.bankTransfer.confirmation;
        if (previous?.decisionId === decision.id && previous.requestHash === decision.requestHash) return reply({ order: publicLiveOrder(id, p), duplicate: true });
        fail('bank-transfer-state-conflict', 409);
      }
      assertPending(p);
      if (typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt))) fail('bank-transfer-source-mismatch', 409);
      if (decision.bookingDate < todayLisbon(p.createdAt)) fail('bank-transfer-invalid-credit');
      if (decision.expectedRevision !== p.bankTransfer.revision) fail('bank-transfer-stale-review', 409);
      if ((await store.bankCredit(decision.creditKey))?.data) fail('bank-transfer-credit-used', 409);
      const registration = await store.registration(), r = registration?.data;
      const kind = p.kind || p.quote?.kind || 'primary';
      if (!realRegistration(r, p.userId) || p.quote?.kind !== kind || p.quote.eventId !== EVENT || !['primary', 'supplementary'].includes(kind)
        || r.selection?.profile !== p.quote.selection?.profile || (r.fiscalPendingOrderId && r.fiscalPendingOrderId !== id)
        || (kind === 'primary' ? r.status !== 'submitted' || !['pending', 'awaiting_confirmation'].includes(r.payment?.status)
          || r.payment.currency !== 'EUR' || r.payment.amountCents !== p.amountCents || r.payment?.method !== 'bank_transfer' || r.payment.reference !== id || r.payment.orderId !== id
          : r.status !== 'confirmed' || r.payment?.status !== 'paid' || r.openSupplementaryOrderId !== id
            || r.paidSupplementaryOrderIds?.includes(id))) fail('bank-transfer-source-mismatch', 409);
      const context = await store.context(p.quote.selection.profile);
      let expected;
      try {
        const date = new Date(`${decision.bookingDate}T12:00:00Z`);
        expected = kind === 'primary' ? quotePrimary(p.quote.selection, { ...context, emailVerified: true }, null, date)
          : quoteSupplementary({ morningCourse: p.quote.selection.morningCourse, afternoonCourse: p.quote.selection.afternoonCourse,
            dinnerQuantity: p.quote.selection.dinnerQuantity }, { ...context, emailVerified: true }, { ...r, id: store.registrationId }, date);
      } catch { fail('bank-transfer-source-mismatch', 409); }
      if (expected.amountCents !== decision.amountCents) fail('bank-transfer-tariff-mismatch', 409,
        { expectedAmountCents: expected.amountCents, receivedAmountCents: decision.amountCents, bookingDate: decision.bookingDate });
      const billing = validateBillingCustomerSnapshot(p.billingSnapshot);
      if (!billing.ok) fail('billing-customer-unconfirmed', 409, { issues: billing.issues });
      let billingAccount;
      try { billingAccount = await fiscalClient.resolveBillingBankAccount(env, proposedBankAccount.iban); }
      catch { fail('fiscal-bank-account-unconfirmed', 503); }
      if (billingAccount?.source !== 'company_bank_accounts' || !Number.isSafeInteger(billingAccount.id) || billingAccount.id <= 0
        || billingAccount.ibanLast4 !== proposedBankAccount.iban.slice(-4)) fail('fiscal-bank-account-unconfirmed', 503);
      billingAccount = { source: 'company_bank_accounts', id: billingAccount.id, ibanLast4: billingAccount.ibanLast4 };
      let salesDocument;
      try { salesDocument = buildLivePaymentFR({ orderId: id, quote: expected, billing: { customer: p.billingSnapshot },
        paymentDate: decision.bookingDate, method: 'bank_transfer', bankAccountId: billingAccount.id }); }
      catch { fail('bank-transfer-fiscal-unavailable', 503); }
      const changedBy = { uid: claims.sub, email: claims.email };
      const confirmation = { decisionId: decision.id, requestHash: decision.requestHash, creditKey: decision.creditKey,
        creditReference: decision.creditReference, bookingDate: decision.bookingDate, amountCents: decision.amountCents,
        currency: 'EUR', confirmedAt: currentTime, confirmedBy: changedBy, reason: decision.reason };
      const payment = { ...p, kind, status: 'paid', amountCents: decision.amountCents, transactionId: `bank_${decision.creditKey}`,
        paidAt: currentTime, paymentDate: decision.bookingDate, fiscalStatus: 'pending', fiscalQuote: expected,
        bankTransfer: { ...p.bankTransfer, status: 'confirmed', revision: p.bankTransfer.revision + 1, confirmation,
          billingAccount, confirmedAt: currentTime, bookingDate: decision.bookingDate }, updatedAt: currentTime };
      const ent = expected.selection, owned = r.entitlements || r.selection;
      const nextRegistration = kind === 'primary' ? { ...r, status: 'confirmed', fiscalPendingOrderId: id,
        entitlements: { congressMode: ent.congressMode === 'courses-only' ? '' : ent.congressMode, morningCourse: ent.morningCourse,
          afternoonCourse: ent.afternoonCourse, dinnerQuantity: ent.dinnerQuantity },
        payment: { orderId: id, status: 'paid', amountCents: decision.amountCents, currency: 'EUR', method: 'bank_transfer', reference: id }, updatedAt: currentTime }
        : { ...r, fiscalPendingOrderId: id, entitlements: { ...owned, morningCourse: Boolean(owned.morningCourse || ent.morningCourse),
          afternoonCourse: Boolean(owned.afternoonCourse || ent.afternoonCourse), dinnerQuantity: Number(owned.dinnerQuantity || 0) + ent.dinnerQuantity },
          paidSupplementaryOrderIds: [...(r.paidSupplementaryOrderIds || []), id],
          supplementaryPaidAmountCents: Number(r.supplementaryPaidAmountCents || 0) + decision.amountCents, updatedAt: currentTime };
      const fiscalJob = { id, eventId: EVENT, registrationId: p.registrationId, userId: p.userId, type: 'invoice_receipt', orderKind: kind,
        environment: 'production', status: 'pending', provider: 'toconline', issuanceProtocol: 'claimed-v1', externalReference: salesDocument.external_reference,
        amountCents: decision.amountCents, paymentMethod: 'bank_transfer', salesDocument, createdAt: currentTime, updatedAt: currentTime };
      const creditClaim = { key: decision.creditKey, kind: 'bank-credit-live', environment: 'production', eventId: EVENT, orderId: id,
        decisionId: decision.id, requestHash: decision.requestHash, creditReference: decision.creditReference, bookingDate: decision.bookingDate,
        amountCents: decision.amountCents, currency: 'EUR', recordedAt: currentTime, recordedBy: changedBy };
      await store.confirmBankTransferPaid({ orderId: id, payment, paymentVersion: located.version, registration: nextRegistration,
        registrationVersion: registration.version, fiscalJob, creditClaim, guards: context.guards || [],
        audit: { action: 'payment.bank-transfer.confirmed', eventId: EVENT, orderId: id, registrationId: p.registrationId,
          actor: changedBy, createdAt: currentTime, details: { creditKey: decision.creditKey, bookingDate: decision.bookingDate,
            originalAmountCents: p.amountCents, amountCents: decision.amountCents, orderKind: kind } } });
      const [freshPayment, freshRegistration, freshJob] = await Promise.all([store.payment(id), store.registration(), store.document(id)]);
      await completeLiveFiscalJob({ store, orderId: id, payment: freshPayment, registration: freshRegistration,
        job: freshJob, fiscalClient, env, now });
      const final = (await store.payment(id))?.data;
      return reply({ order: publicLiveOrder(id, final || payment), duplicate: false });
    } catch (error) {
      if (error?.code === 'conflict') return reply({ error: 'bank-transfer-conflict' }, 409);
      if (error?.status && error.code) return reply({ error: error.code, ...(error.details || {}) }, error.status);
      return reply({ error: 'bank-transfer-unavailable' }, 503);
    }
  };
}
