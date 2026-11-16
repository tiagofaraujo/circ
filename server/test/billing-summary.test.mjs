import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingSummaryApi, createBillingSummaryStore } from '../payments/billing-summary.mjs';
import { createWorker } from '../worker.mjs';

const ENV = { FIREBASE_PROJECT_ID: 'circ-test' };
const ROOT = 'projects/circ-test/databases/(default)/documents';
const URL = 'https://circ.test/api/admin/billing/summary';
const DATE = '2026-11-01T17:00:00.000Z';
const ADMIN = { sub: 'organiser', email: 'circ.chuc@gmail.com', email_verified: true };
const orderId = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

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
    storeFactory: ({ token, feeTokenProvider }) => {
      assert.equal(token, 'test-session');
      assert.equal(typeof feeTokenProvider, 'function');
      return { summary: async () => ({ totals: { receivedCents: 5500 }, methods: [] }) };
    },
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
  assert.equal(serviceReads, 0);
});

test('the Worker serves the private billing route and withholds internal storage errors', async () => {
  const worker = createWorker(async () => ADMIN);
  assert.equal((await worker.fetch(request({ headers: { Authorization: '' } }), ENV)).status, 401);
  const api = createBillingSummaryApi({ verify: async () => ADMIN,
    storeFactory: () => ({ summary: async () => { throw new Error('private detail'); } }) });
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
  return row('payments', orderId(id), {
    environment: 'production', status: 'paid', currency: 'EUR', provider: 'eupago', method: 'mbway',
    paidAt: DATE, transactionId: `private-transaction-${id}`, amountCents: 5500,
    fiscalStatus: 'issued', fiscalDocumentId: 20,
    ...data,
  });
}

function fee(id, data = {}) {
  return row('paymentFees', orderId(id), {
    environment: 'production', currency: 'EUR', provider: 'eupago', method: 'mbway',
    transactionId: `private-transaction-${id}`, providerFeeMicros: 430000, providerFeeSource: 'eupago-webhook',
    ...data,
  });
}

function fixture(payments, companies = [], fees = [], feeResponse = value => value) {
  const queries = [];
  const feeBatches = [];
  const datasets = { payments, companyPurchases: companies };
  let serviceReads = 0;
  const store = createBillingSummaryStore({ projectId: 'circ-test', token: 'mock-admin-token',
    feeTokenProvider: async () => { serviceReads++; return 'mock-service-token'; }, fetchImpl: async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    if (url.endsWith(':batchGet')) {
      assert.equal(url, `https://firestore.googleapis.com/v1/${ROOT}:batchGet`);
      assert.equal(options.headers.Authorization, 'Bearer mock-service-token');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.mask.fieldPaths, ['eventId', 'environment', 'currency', 'provider', 'method',
        'transactionId', 'providerFeeMicros', 'providerFeeSource']);
      assert.ok(body.documents.length > 0 && body.documents.length <= 100);
      feeBatches.push(body.documents);
      const response = body.documents.map(name => {
        assert.ok(name.startsWith(`${ROOT}/paymentFees/`));
        const found = fees.find(row => row.document.name === name)?.document;
        return found ? { found } : { missing: name };
      });
      // Firestore batchGet does not guarantee the requested document order.
      return Response.json(feeResponse(response.reverse()));
    }
    assert.equal(url, `https://firestore.googleapis.com/v1/${ROOT}:runQuery`);
    assert.equal(options.headers.Authorization, 'Bearer mock-admin-token');
    const { structuredQuery: query } = JSON.parse(options.body);
    assert.deepEqual(query.where.fieldFilter, { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: 'circ-2027' } });
    const fields = query.select.fields.map(field => field.fieldPath);
    assert.ok(!fields.some(field => /^(billingSnapshot|billingCustomer|company|refund\.(reason|recordedBy)|userId|customer|notes)/.test(field)));
    const collection = query.from[0].collectionId;
    queries.push(query);
    assert.ok(Object.hasOwn(datasets, collection));
    assert.ok(fields.every(field => !field.startsWith('providerFee')));
    const dataset = datasets[collection];
    const after = query.startAt?.values[0].referenceValue;
    const start = after ? dataset.findIndex(item => item.document.name === after) + 1 : 0;
    return Response.json(dataset.slice(start, start + query.limit));
  } });
  return { store, queries, feeBatches, serviceReads: () => serviceReads };
}

test('receipts include archived payments and add-ons, with confirmed refunds, fee coverage and review counted separately', async () => {
  const payments = [
    payment(1, { registrationArchiveId: 'historical' }),
    payment(2, { method: 'multibanco', amountCents: 9500, status: 'refunded',
      refund: { completedExternally: true, amountCents: 9500, currency: 'EUR', reason: 'private-reason' } }),
    payment(3, { method: 'multibanco', amountCents: 15000, status: 'refunded', fiscalStatus: 'review_required',
      refund: { completedExternally: true, amountCents: 4000, currency: 'EUR' } }),
    payment(4, { kind: 'supplementary', provider: 'stripe', method: 'stripe_card', amountCents: 1500, fiscalStatus: 'pending' }),
    payment(5, { provider: 'internal_bank_transfer', method: 'bank_transfer', amountCents: 2200 }),
    payment(6, { status: 'review_required', amountCents: 4000 }),
    payment(7, { status: 'review_required', paidAt: null, transactionId: null }),
    payment(8, { status: 'cancelled' }),
    payment(9, { isTest: true }),
    payment(10, { environment: 'sandbox' }),
    payment(11, { currency: 'USD' }),
    payment(12, { amountCents: 55.5 }),
  ];
  const purchase = { status: 'paid', quantity: 3, unitAmountCents: 5000, amountCents: 15000, confirmedAt: DATE,
    transferReference: 'private-transfer-reference', company: { name: 'private-company' } };
  const { store } = fixture(payments, [row('companyPurchases', 'paid', purchase),
    row('companyPurchases', 'unmatched', { ...purchase, amountCents: 20000 }),
    row('companyPurchases', 'pending', { ...purchase, status: 'pending' }),
  ], [fee(1), fee(2, { method: 'multibanco', providerFeeMicros: 836400 }),
    fee(3, { method: 'multibanco', providerFeeMicros: 150000001 }), fee(6),
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

test('only the exact private fee evidence for a production receipt affects commission coverage', async () => {
  const payments = [
    payment(1, { providerFeeMicros: 1, providerFeeSource: 'eupago-webhook' }),
    payment(2), payment(3), payment(4, { provider: 'legacy-provider' }),
    payment(5), payment(6), payment(7), payment(8),
  ];
  const { store } = fixture(payments, [], [
    fee(100, { transactionId: 'private-transaction-1' }),
    fee(2, { transactionId: 'private-mismatched-transaction' }),
    fee(3, { method: 'multibanco' }), fee(4), fee(5, { currency: 'USD' }),
    fee(6, { environment: 'sandbox' }), fee(7, { providerFeeSource: 'unknown' }), fee(8),
  ]);
  const summary = await store.summary();
  assert.equal(summary.totals.receivedCount, 8);
  assert.equal(summary.totals.feeKnownCount, 1);
  assert.equal(summary.totals.reportedFeeMicros, 430000);
  assert.equal(summary.methods.find(item => item.method === 'other').feeKnownCount, 0);
  assert.doesNotMatch(JSON.stringify(summary), /private-|providerFee/);
});

test('the complete payment ledger is read beyond the first page and zero fees require explicit evidence', async () => {
  const initial = Array.from({ length: 500 }, (_, index) => payment(index, { status: 'pending' }));
  const { store, queries } = fixture([...initial, payment(500), payment(501)], [], [fee(500, { providerFeeMicros: 0 })]);
  const summary = await store.summary();
  assert.equal(summary.totals.receivedCents, 11000);
  assert.equal(summary.totals.receivedCount, 2);
  assert.equal(summary.totals.reportedFeeMicros, 0);
  assert.equal(summary.totals.feeKnownCount, 1);
  const paymentQueries = queries.filter(query => query.from[0].collectionId === 'payments');
  assert.deepEqual(paymentQueries[1].startAt, { values: [{ referenceValue: initial.at(-1).document.name }], before: false });
});

test('the ledger fails closed for repeated rows instead of returning inflated totals', async () => {
  const first = payment(1);
  const { store } = fixture([first, first]);
  await assert.rejects(store.summary(), /billing-summary-unavailable/);
});

test('fee reads stay bounded and skip unrelated, test, pending and non-EuPago payments', async () => {
  const eligible = Array.from({ length: 205 }, (_, index) => payment(index + 1));
  const f = fixture([...eligible, payment(300, { status: 'pending' }), payment(301, { isTest: true }),
    payment(302, { status: 'review_required' }), payment(303, { environment: 'sandbox' }),
    payment(304, { provider: 'internal_bank_transfer', method: 'bank_transfer' }),
    payment(305, { provider: 'stripe', method: 'stripe_card' })], [], [fee(1)]);
  const summary = await f.store.summary();
  assert.equal(summary.totals.receivedCount, 207);
  assert.equal(summary.totals.feeKnownCount, 1);
  assert.deepEqual(f.feeBatches.map(batch => batch.length), [100, 100, 5]);
  assert.deepEqual(f.feeBatches.flat(), eligible.map(row => row.document.name.replace('/payments/', '/paymentFees/')));
  assert.equal(f.serviceReads(), 1);
});

test('bank-only and empty summaries do not depend on a service-account token', async () => {
  for (const payments of [[], [payment(1, { provider: 'internal_bank_transfer', method: 'bank_transfer' })]]) {
    const f = fixture(payments);
    const summary = await f.store.summary();
    assert.equal(summary.totals.receivedCount, payments.length);
    assert.equal(summary.totals.feeKnownCount, 0);
    assert.equal(f.serviceReads(), 0);
  }
});

test('incomplete, duplicate, foreign and ambiguous fee responses cannot produce misleading totals', async () => {
  const mutations = [
    () => [],
    rows => [...rows, rows[0]],
    rows => [{ ...rows[0], missing: `${ROOT}/paymentFees/${orderId(900)}` }],
    rows => [{ ...rows[0], found: fee(1).document }],
    () => [{ found: fee(1, { eventId: 'another-event' }).document }],
    () => [{ error: { message: 'private-error' } }],
  ];
  for (const mutate of mutations) {
    const f = fixture([payment(1)], [], [], mutate);
    await assert.rejects(f.store.summary(), /billing-summary-unavailable/);
  }
});

test('the administrative summary works without collection-list permission on the payments service account', async () => {
  const calls = [];
  const api = createBillingSummaryApi({
    verify: async () => ADMIN,
    tokenProvider: async () => 'mock-service-token',
    storeFactory: options => createBillingSummaryStore({ ...options, fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, authorization: init.headers.Authorization, body });
      if (url.endsWith(':runQuery')) {
        if (init.headers.Authorization !== 'Bearer test-session') return Response.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
        const collection = body.structuredQuery.from[0].collectionId;
        assert.ok(['payments', 'companyPurchases'].includes(collection));
        return Response.json(collection === 'payments' ? [payment(1)] : []);
      }
      assert.equal(url, `https://firestore.googleapis.com/v1/${ROOT}:batchGet`);
      assert.equal(init.headers.Authorization, 'Bearer mock-service-token');
      assert.deepEqual(body.documents, [`${ROOT}/paymentFees/${orderId(1)}`]);
      return Response.json([{ found: fee(1).document }]);
    } }),
    now: () => DATE,
  });
  const response = await api(request(), ENV);
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.totals.receivedCents, 5500);
  assert.equal(summary.totals.reportedFeeMicros, 430000);
  assert.equal(calls.length, 3);
  assert.doesNotMatch(JSON.stringify(summary), /private-|test-session|mock-service-token/);
});
