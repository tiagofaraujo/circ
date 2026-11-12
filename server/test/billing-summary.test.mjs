import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingSummaryApi, createBillingSummaryStore } from '../payments/billing-summary.mjs';
import { createWorker } from '../worker.mjs';

const ENV = { FIREBASE_PROJECT_ID: 'circ-test' };
const ROOT = 'projects/circ-test/databases/(default)/documents';
const URL = 'https://circ.test/api/admin/billing/summary';
const DATE = '2026-11-01T17:00:00.000Z';
const ADMIN = { sub: 'organiser', email: 'circ.chuc@gmail.com', email_verified: true };

const request = (options = {}) => new Request(URL, {
  method: options.method || 'GET',
  headers: { Authorization: 'Bearer test-session', ...options.headers },
});

test('only the exact verified organiser may read the aggregated report', async () => {
  let claims = ADMIN;
  let serviceReads = 0;
  const api = createBillingSummaryApi({
    verify: async (token, project) => {
      assert.equal(token, 'test-session');
      assert.equal(project, 'circ-test');
      return claims;
    },
    tokenProvider: async () => { serviceReads++; return 'mock-service-token'; },
    storeFactory: () => ({ summary: async () => ({ totals: { receivedCents: 5500 }, methods: [] }) }),
    now: () => DATE,
  });
  for (const disallowed of [
    { ...ADMIN, email_verified: false },
    { ...ADMIN, email: 'paulojaneiro77@gmail.com', roles: { registrations: true } },
    { ...ADMIN, email: 'circ.chuc+alias@gmail.com' },
    { ...ADMIN, email: 'CIRC.CHUC@GMAIL.COM' },
  ]) {
    claims = disallowed;
    assert.equal((await api(request(), ENV)).status, 403);
  }
  claims = ADMIN;
  assert.equal((await api(request({ headers: { Authorization: '' } }), ENV)).status, 401);
  assert.equal((await api(request({ headers: { Origin: 'https://elsewhere.test' } }), ENV)).status, 403);
  assert.equal((await api(request({ method: 'POST' }), ENV)).status, 405);
  assert.equal(serviceReads, 0);

  const response = await api(request(), ENV);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /private, no-store/);
  assert.equal(response.headers.get('Vary'), 'Authorization');
  assert.deepEqual(await response.json(), { currency: 'EUR', generatedAt: DATE, totals: { receivedCents: 5500 }, methods: [] });
  assert.equal(serviceReads, 1);
});

test('the Worker serves the private billing route and withholds internal storage errors', async () => {
  const worker = createWorker(async () => ADMIN);
  assert.equal((await worker.fetch(request({ headers: { Authorization: '' } }), ENV)).status, 401);
  const api = createBillingSummaryApi({ verify: async () => ADMIN, tokenProvider: async () => { throw new Error('private detail'); } });
  const response = await api(request(), ENV);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'billing-summary-unavailable' });
});

function encode(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (!value) return { nullValue: null };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, field]) => [key, encode(field)])) } };
}

function row(collection, id, data) {
  return { document: { name: `${ROOT}/${collection}/${id}`, fields: encode({ eventId: 'circ-2027', ...data }).mapValue.fields } };
}

function payment(id, data = {}) {
  return row('payments', id, {
    environment: 'production', status: 'paid', currency: 'EUR', provider: 'eupago', method: 'mbway',
    paidAt: DATE, transactionId: `private-transaction-${id}`, amountCents: 5500,
    fiscalStatus: 'issued', fiscalDocumentId: 20,
    ...data,
  });
}

function fixture(payments, companies = []) {
  const queries = [];
  const store = createBillingSummaryStore({ projectId: 'circ-test', token: 'mock-service-token', fetchImpl: async (url, options) => {
    assert.equal(url, `https://firestore.googleapis.com/v1/${ROOT}:runQuery`);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'Bearer mock-service-token');
    const { structuredQuery: query } = JSON.parse(options.body);
    assert.deepEqual(query.where.fieldFilter, { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: 'circ-2027' } });
    const fields = query.select.fields.map(field => field.fieldPath);
    assert.ok(!fields.some(field => /^(billingSnapshot|billingCustomer|company|refund\.(reason|recordedBy)|userId|customer|notes)/.test(field)));
    const collection = query.from[0].collectionId;
    queries.push(query);
    assert.ok(['payments', 'companyPurchases'].includes(collection));
    const dataset = collection === 'payments' ? payments : companies;
    const after = query.startAt?.values[0].referenceValue;
    const start = after ? dataset.findIndex(item => item.document.name === after) + 1 : 0;
    return Response.json(dataset.slice(start, start + query.limit));
  } });
  return { store, queries };
}

test('receipts include archived payments and add-ons, with confirmed refunds, fee coverage and review counted separately', async () => {
  const payments = [
    payment('historic', { registrationArchiveId: 'historical', providerFeeMicros: 430000, providerFeeSource: 'eupago-webhook' }),
    payment('refunded', { method: 'multibanco', amountCents: 9500, status: 'refunded', providerFeeMicros: 836400,
      providerFeeSource: 'eupago-webhook', refund: { completedExternally: true, amountCents: 9500, currency: 'EUR', reason: 'private-reason' } }),
    payment('unresolved', { method: 'multibanco', amountCents: 15000, status: 'refunded', fiscalStatus: 'review_required',
      providerFeeMicros: 150000001, providerFeeSource: 'eupago-webhook',
      refund: { completedExternally: true, amountCents: 4000, currency: 'EUR' } }),
    payment('add-on', { kind: 'supplementary', provider: 'stripe', method: 'stripe_card', amountCents: 1500,
      providerFeeMicros: 200000, providerFeeSource: 'eupago-webhook', fiscalStatus: 'pending' }),
    payment('transfer', { provider: 'internal_bank_transfer', method: 'bank_transfer', amountCents: 2200 }),
    payment('review', { status: 'review_required', amountCents: 4000 }),
    payment('not-captured', { status: 'review_required', paidAt: null, transactionId: null }),
    payment('cancelled', { status: 'cancelled' }),
    payment('test', { isTest: true }),
    payment('sandbox', { environment: 'sandbox' }),
    payment('non-euro', { currency: 'USD' }),
    payment('malformed', { amountCents: 55.5 }),
  ];
  const purchase = { status: 'paid', quantity: 3, unitAmountCents: 5000, amountCents: 15000, confirmedAt: DATE,
    transferReference: 'private-transfer-reference', company: { name: 'private-company' } };
  const { store } = fixture(payments, [row('companyPurchases', 'paid', purchase),
    row('companyPurchases', 'unmatched', { ...purchase, amountCents: 20000 }),
    row('companyPurchases', 'pending', { ...purchase, status: 'pending' }),
  ]);
  const summary = await store.summary();
  assert.deepEqual(summary.totals, {
    receivedCents: 48700, receivedCount: 6, refundedCents: 9500, unresolvedRefundCount: 1,
    reportedFeeMicros: 1266400, feeKnownCount: 2, reviewCents: 4000, reviewCount: 1,
    issuedCount: 3, fiscalPendingCount: 2,
  });
  assert.equal(summary.methods.find(item => item.method === 'company_voucher_purchase').receivedCents, 15000);
  assert.equal(summary.methods.find(item => item.method === 'bank_transfer').feeKnownCount, 0);
  assert.equal(summary.methods.find(item => item.method === 'stripe_card').feeKnownCount, 0);
  assert.doesNotMatch(JSON.stringify(summary), /private-|historic|add-on/);
});

test('the complete payment ledger is read beyond the first page and zero fees require explicit evidence', async () => {
  const initial = Array.from({ length: 500 }, (_, index) => payment(`p-${index}`, { status: 'pending' }));
  const { store, queries } = fixture([...initial,
    payment('known-zero', { providerFeeMicros: 0, providerFeeSource: 'eupago-webhook' }), payment('unknown')]);
  const summary = await store.summary();
  assert.equal(summary.totals.receivedCents, 11000);
  assert.equal(summary.totals.receivedCount, 2);
  assert.equal(summary.totals.reportedFeeMicros, 0);
  assert.equal(summary.totals.feeKnownCount, 1);
  assert.deepEqual(queries[1].startAt, { values: [{ referenceValue: initial.at(-1).document.name }], before: false });
});

test('the ledger fails closed for repeated rows instead of returning inflated totals', async () => {
  const first = payment('duplicate');
  const { store } = fixture([first, first]);
  await assert.rejects(store.summary(), /billing-summary-unavailable/);
});
