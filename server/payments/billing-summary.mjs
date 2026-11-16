import { hasRegistrationManagementAccess } from '../../src/auth/registrationPermissions.js';
import { Buffer } from 'node:buffer';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { LIVE_ORDER_UUID } from './checkout-live-store.mjs';

const PATH = '/api/admin/billing/summary';
const EVENT = 'circ-2027';
const PAGE_SIZE = 500;
const MAX_PAGES = 40;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const FEE_BATCH_SIZE = 100;
const METHODS = ['multibanco', 'mbway', 'stripe_card', 'bank_transfer', 'company_voucher_purchase', 'other'];
const PAYMENT_FIELDS = [
  'eventId', 'environment', 'isTest', 'testMode', 'currency', 'provider', 'method', 'status',
  'amountCents', 'paidAt', 'transactionId', 'refund.completedExternally', 'refund.amountCents',
  'refund.currency', 'fiscalStatus', 'fiscalDocumentId',
];
const FEE_FIELDS = [
  'eventId', 'environment', 'currency', 'provider', 'method', 'transactionId',
  'providerFeeMicros', 'providerFeeSource',
];
const COMPANY_FIELDS = [
  'eventId', 'environment', 'isTest', 'testMode', 'currency', 'status', 'amountCents',
  'quantity', 'unitAmountCents', 'confirmedAt', 'transferReference',
];
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
};
const reply = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...HEADERS, ...extra } });
const unavailable = () => { throw new Error('billing-summary-unavailable'); };
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const recordedDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function emptyMetrics() {
  return {
    receivedCents: 0, receivedCount: 0, refundedCents: 0, unresolvedRefundCount: 0,
    reportedFeeMicros: 0, feeKnownCount: 0, reviewCents: 0, reviewCount: 0,
    issuedCount: 0, fiscalPendingCount: 0,
  };
}

function methodOf(payment) {
  if (payment.provider === 'eupago' && ['mbway', 'multibanco'].includes(payment.method)) return payment.method;
  if (payment.provider === 'stripe' && payment.method === 'stripe_card') return 'stripe_card';
  if (payment.provider === 'internal_bank_transfer' && payment.method === 'bank_transfer') return 'bank_transfer';
  return 'other';
}

function paymentMetrics(payment, fee) {
  if (payment.environment !== 'production' || payment.currency !== 'EUR' || !positiveInteger(payment.amountCents)
    || !recordedDate(payment.paidAt) || typeof payment.transactionId !== 'string' || !payment.transactionId.trim()) return null;
  if (payment.status === 'review_required') return { reviewCents: payment.amountCents, reviewCount: 1 };
  if (!['paid', 'refunded'].includes(payment.status)) return null;

  const metrics = { receivedCents: payment.amountCents, receivedCount: 1 };
  if (payment.status === 'refunded') {
    const refund = payment.refund;
    if (refund?.completedExternally === true && refund.currency === 'EUR' && refund.amountCents === payment.amountCents) {
      metrics.refundedCents = refund.amountCents;
    } else {
      metrics.unresolvedRefundCount = 1;
    }
  }
  if (fee && fee.provider === payment.provider && fee.method === payment.method && fee.transactionId === payment.transactionId
    && fee.providerFeeMicros <= payment.amountCents * 10000) {
    metrics.reportedFeeMicros = fee.providerFeeMicros;
    metrics.feeKnownCount = 1;
  }
  if (payment.fiscalStatus === 'issued' && /^[1-9]\d{0,17}$/.test(String(payment.fiscalDocumentId))) {
    metrics.issuedCount = 1;
  } else {
    metrics.fiscalPendingCount = 1;
  }
  return metrics;
}

function validFee(fee) {
  return fee.environment === 'production' && fee.currency === 'EUR' && fee.provider === 'eupago'
    && ['mbway', 'multibanco'].includes(fee.method) && typeof fee.transactionId === 'string' && Boolean(fee.transactionId.trim())
    && fee.providerFeeSource === 'eupago-webhook' && Number.isSafeInteger(fee.providerFeeMicros) && fee.providerFeeMicros >= 0;
}

function companyMetrics(purchase) {
  // Company transfers use a separate ledger in EUR. Redemption does not receive money again.
  if (purchase.status !== 'paid' || (purchase.currency != null && purchase.currency !== 'EUR')
    || (purchase.environment != null && purchase.environment !== 'production')
    || !positiveInteger(purchase.quantity) || purchase.quantity > 50
    || !positiveInteger(purchase.unitAmountCents) || purchase.unitAmountCents > 100000
    || purchase.amountCents !== purchase.quantity * purchase.unitAmountCents
    || !recordedDate(purchase.confirmedAt) || typeof purchase.transferReference !== 'string'
    || purchase.transferReference.trim().length < 2 || purchase.transferReference.length > 200) return null;
  return { receivedCents: purchase.amountCents, receivedCount: 1 };
}

function addMetrics(target, values) {
  for (const [key, value] of Object.entries(values)) {
    target[key] += value;
    if (!Number.isSafeInteger(target[key])) unavailable();
  }
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => {
    if (!value || typeof value !== 'object') return [key, null];
    if ('stringValue' in value) return [key, value.stringValue];
    if ('booleanValue' in value) return [key, value.booleanValue];
    if ('integerValue' in value) return [key, Number(value.integerValue)];
    if ('timestampValue' in value) return [key, value.timestampValue];
    if ('mapValue' in value) return [key, decodeFields(value.mapValue?.fields)];
    return [key, null];
  }));
}

/** Administrative queries use the verified Firebase session and existing rules.
 * The service identity only gets specific private fee documents; it never lists collections. */
export function createBillingSummaryStore({ projectId, token, feeTokenProvider, fetchImpl = fetch } = {}) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || typeof token !== 'string' || !token) unavailable();
  const root = `projects/${projectId}/databases/(default)/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;

  async function read(operation, body, bearer = token) {
    const response = await fetchImpl(`${endpoint}:${operation}`, {
      method: 'POST', redirect: 'manual', cache: 'no-store',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      unavailable();
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        unavailable();
      }
      chunks.push(Buffer.from(value));
    }
    const rows = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(rows) || rows.some(row => !row || row.error)) unavailable();
    return rows;
  }

  async function readPage(collection, fields, after) {
    const rows = await read('runQuery', { structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: EVENT } } },
      select: { fields: fields.map(fieldPath => ({ fieldPath })) },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
      limit: PAGE_SIZE,
    } });
    const documents = rows.filter(row => row.document).map(row => row.document);
    if (documents.length > PAGE_SIZE) unavailable();
    return documents;
  }

  async function forEachPage(collection, fields, consume) {
    const prefix = `${root}/${collection}/`;
    const seen = new Set();
    let after = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const documents = await readPage(collection, fields, after);
      const entries = [];
      for (const { name, fields: encoded } of documents) {
        if (typeof name !== 'string' || !name.startsWith(prefix) || seen.has(name)) unavailable();
        const id = name.slice(prefix.length);
        if (!id || id.includes('/')) unavailable();
        seen.add(name);
        const entry = decodeFields(encoded);
        if (entry.eventId !== EVENT) unavailable();
        if (entry.isTest !== true && entry.testMode !== true) entries.push({ entry, id });
      }
      await consume(entries);
      if (documents.length < PAGE_SIZE) return;
      after = documents.at(-1).name;
    }
    // Never return a partial financial summary after exhausting the page bound.
    unavailable();
  }

  let feeToken;
  async function readFees(entries) {
    const ids = entries.filter(({ entry, id }) => LIVE_ORDER_UUID.test(id)
      && ['mbway', 'multibanco'].includes(methodOf(entry)) && paymentMetrics(entry)?.receivedCount === 1).map(({ id }) => id);
    const fees = new Map();
    if (!ids.length) return fees;
    feeToken ||= typeof feeTokenProvider === 'function' ? await feeTokenProvider() : null;
    if (typeof feeToken !== 'string' || !feeToken) unavailable();
    for (let offset = 0; offset < ids.length; offset += FEE_BATCH_SIZE) {
      const names = ids.slice(offset, offset + FEE_BATCH_SIZE).map(id => `${root}/paymentFees/${id}`);
      const rows = await read('batchGet', { documents: names, mask: { fieldPaths: FEE_FIELDS } }, feeToken);
      const accounted = new Set();
      for (const row of rows) {
        const name = row.found?.name || row.missing;
        if (!names.includes(name) || accounted.has(name) || Boolean(row.found) === Boolean(row.missing)) unavailable();
        accounted.add(name);
        if (!row.found) continue;
        const fee = decodeFields(row.found.fields);
        if (fee.eventId !== EVENT) unavailable();
        if (validFee(fee)) fees.set(name.slice(`${root}/paymentFees/`.length), fee);
      }
      // Explicitly absent evidence is unknown commission, not a zero fee.
      if (accounted.size !== names.length) unavailable();
    }
    return fees;
  }

  return {
    async summary() {
      const totals = emptyMetrics();
      const grouped = new Map();
      function record(method, values) {
        if (!values) return;
        const methodMetrics = grouped.get(method) || emptyMetrics();
        addMetrics(methodMetrics, values);
        addMetrics(totals, values);
        grouped.set(method, methodMetrics);
      }
      await forEachPage('payments', PAYMENT_FIELDS, async entries => {
        const fees = await readFees(entries);
        for (const { entry, id } of entries) record(methodOf(entry), paymentMetrics(entry, fees.get(id)));
      });
      await forEachPage('companyPurchases', COMPANY_FIELDS, entries => {
        for (const { entry } of entries) record('company_voucher_purchase', companyMetrics(entry));
      });
      return { totals, methods: METHODS.filter(method => grouped.has(method)).map(method => ({ method, ...grouped.get(method) })) };
    },
  };
}

export function createBillingSummaryApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createBillingSummaryStore, now = () => new Date().toISOString() } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (request.method !== 'GET') return reply({ error: 'method-not-allowed' }, 405, { Allow: 'GET' });
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401, { 'WWW-Authenticate': 'Bearer' });
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'billing-summary-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid-session' }, 401); }
    if (!hasRegistrationManagementAccess(claims?.email, claims?.email_verified)) return reply({ error: 'admin-required' }, 403);
    try {
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, feeTokenProvider: () => tokenProvider(env) });
      const { totals, methods } = await store.summary();
      return reply({ currency: 'EUR', generatedAt: now(), totals, methods });
    } catch { return reply({ error: 'billing-summary-unavailable' }, 503); }
  };
}
