import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationReportsApi, createRegistrationReportsStore } from '../payments/registration-reports.mjs';
import { createWorker } from '../worker.mjs';

const env = { FIREBASE_PROJECT_ID: 'circ-test' };
const ROOT = 'projects/circ-test/databases/(default)/documents';
const URL = 'https://circ.test/api/admin/registrations/report';
const orderId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-11-05T14:00:00.000Z';
const request = ({ method = 'GET', headers = {}, suffix = '' } = {}) => new Request(`${URL}${suffix}`, {
  method, headers: { Authorization: 'Bearer verified-session', ...headers },
});
function fixture(changes = {}) {
  const state = { verified: 0, tokenCalls: 0, reports: 0 };
  const api = createRegistrationReportsApi({
    verify: async (token, project) => {
      state.verified++;
      assert.equal(token, 'verified-session'); assert.equal(project, 'circ-test');
      return { sub: 'paulo', email: 'paulojaneiro77@gmail.com', email_verified: true, ...changes };
    },
    tokenProvider: async () => { state.tokenCalls++; return 'synthetic-service-token'; },
    storeFactory: args => { assert.deepEqual(args, { projectId: 'circ-test', token: 'synthetic-service-token' });
      return { report: async () => { state.reports++; return { registrations: [], payments: [] }; } }; },
    now: () => time,
  });
  return { api, state };
}

test('the named verified reader and original administrator can read the report with no caching', async () => {
  for (const email of ['paulojaneiro77@gmail.com', 'circ.chuc@gmail.com', ' PAULOJANEIRO77@GMAIL.COM ']) {
    const f = fixture({ email }); const response = await f.api(request(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { registrations: [], payments: [], generatedAt: time });
    assert.match(response.headers.get('Cache-Control'), /private, no-store/);
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Vary'), 'Authorization');
    assert.equal(f.state.reports, 1);
  }
});

test('unverified accounts, aliases, forged role claims and unrelated accounts cannot trigger service-account reads', async () => {
  for (const changes of [{ email_verified: false }, { email_verified: 'true' }, { email: 'paulojaneiro77+admin@gmail.com' },
    { email: 'paulojaneiro77@gmail.com.evil.test' }, { email: 'other@example.test', admin: true, roles: { registrations: true } },
    { email: '' }, { sub: '../somebody' }]) {
    const f = fixture(changes); const response = await f.api(request(), env);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'registration-report-forbidden' });
    assert.equal(f.state.tokenCalls, 0); assert.equal(f.state.reports, 0);
  }
});

test('missing and invalid sessions fail without service reads and request fields cannot authorize a reader', async () => {
  const f = fixture({ email: 'other@example.test' });
  assert.equal((await f.api(request({ headers: { Authorization: '' } }), env)).status, 401);
  assert.equal(f.state.verified, 0);
  assert.equal((await f.api(request({ suffix: '?email=paulojaneiro77@gmail.com', headers: { 'X-User-Email': 'paulojaneiro77@gmail.com' } }), env)).status, 403);
  assert.equal(f.state.tokenCalls, 0);
  const invalid = createRegistrationReportsApi({ verify: async () => { throw new Error('private auth detail'); } });
  const response = await invalid(request(), env);
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'invalid-session' });
});

test('only the exact GET endpoint is handled; mutations and foreign origins cannot read or write', async () => {
  const f = fixture();
  assert.equal(await f.api(new Request('https://circ.test/api/other'), env), null);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await f.api(request({ method }), env);
    assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'GET');
  }
  assert.equal((await f.api(request({ headers: { Origin: 'https://other.test' } }), env)).status, 403);
  assert.equal(f.state.verified, 0); assert.equal(f.state.tokenCalls, 0);
});

test('missing configuration or upstream failures produce only a generic unavailable message', async () => {
  const f = fixture();
  assert.equal((await f.api(request(), {})).status, 503);
  assert.equal(f.state.verified, 0);
  const api = createRegistrationReportsApi({ verify: async () => ({ sub: 'paulo', email: 'paulojaneiro77@gmail.com', email_verified: true }),
    tokenProvider: async () => { throw new Error('private-service-account-key'); } });
  const response = await api(request(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'registration-report-unavailable' });
});

test('Worker routes expose only the read endpoint and preserve denial of administrative payment operations', async () => {
  const claims = { sub: 'paulo', email: 'paulojaneiro77@gmail.com', email_verified: true };
  const worker = createWorker(async () => claims);
  assert.equal((await worker.fetch(request({ method: 'POST' }), env)).status, 405);
  const diagnostics = await worker.fetch(new Request('https://circ.test/api/checkout/live/diagnostics', {
    headers: { Authorization: 'Bearer verified-session' },
  }), env);
  assert.equal(diagnostics.status, 403);
  assert.deepEqual(await diagnostics.json(), { error: 'admin-required' });
});

function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
}
const doc = (collection, id, data) => ({ name: `${ROOT}/${collection}/${id}`, fields: encode(data).mapValue.fields });
const registration = (uid, extra = {}) => ({ eventId: 'circ-2027', userId: uid, registrationKey: `circ-2027:${uid}`,
  primaryRegistration: true, isTest: false, testMode: false, status: 'confirmed', participantName: `Participante ${uid}`,
  participantEmail: `${uid}@example.test`, selection: { profile: 'external', congressMode: 'onsite', morningCourse: true, dinnerQuantity: 2 },
  entitlements: { congressMode: 'onsite', morningCourse: true, dinnerQuantity: 2 }, payment: { status: 'paid', amountCents: 15500, currency: 'EUR', method: 'multibanco' }, ...extra });
const payment = (uid, extra = {}) => ({ eventId: 'circ-2027', environment: 'production', userId: uid,
  registrationId: `circ-2027-${uid}`, kind: 'primary', status: 'pending', quote: { kind: 'primary', selection: { profile: 'external', congressMode: 'onsite' } }, ...extra });
function storeFixture(pages, payments = {}) {
  const calls = []; let page = 0;
  const store = createRegistrationReportsStore({ projectId: 'circ-test', token: 'synthetic-service-token',
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url, options, body });
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'manual'); assert.equal(options.cache, 'no-store');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-service-token');
      if (url.endsWith(':runQuery')) return Response.json(pages[page++]);
      assert.ok(url.endsWith(':batchGet'), `unexpected Firestore operation: ${url}`);
      return Response.json(body.documents.map(name => payments[name] ? { found: payments[name] } : { missing: name }));
    } });
  return { store, calls };
}

test('report projection retains dashboard fields and explicit grant semantics but strips private billing and fiscal data', async () => {
  const privateValue = 'DO-NOT-EXPOSE-private-fiscal-customer';
  const primary = orderId(1), supplement = orderId(2);
  const raw = registration('alice', { id: 'forged-id', participantName: 'Alice', registrationType: 'CIRC 2027 · Presencial',
    createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-05T12:00:00Z', documentCount: 1, addOnOrderCount: 1,
    selection: { profile: 'uls', congressMode: 'onsite', morningCourse: true, dinnerQuantity: 2, billingCustomer: privateValue },
    entitlements: {}, payment: { status: 'paid', amountCents: 5500, currency: 'EUR', method: 'mbway', orderId: primary, reference: 'REFERENCE', internal: privateValue },
    openSupplementaryOrderId: supplement, billingCustomer: privateValue, fiscalJob: privateValue, roles: { admin: true },
    internalNotes: privateValue });
  const r = doc('registrations', 'circ-2027-alice', raw);
  r.fields.createdAt = { timestampValue: raw.createdAt };
  const primaryDoc = doc('payments', primary, payment('alice', { status: 'paid', paidAt: '2026-11-03', transactionId: privateValue,
    quote: { kind: 'primary', selection: raw.selection, billingCustomer: privateValue }, fiscalJob: privateValue, stripe: { paymentIntentId: privateValue } }));
  const supplementDoc = doc('payments', supplement, payment('alice', { kind: 'supplementary', quote: { kind: 'supplementary',
    selection: { afternoonCourse: true, dinnerQuantity: 3 }, billingCustomer: privateValue }, fiscalDocument: privateValue }));
  const f = storeFixture([[{ document: r }]], { [primaryDoc.name]: primaryDoc, [supplementDoc.name]: supplementDoc });
  const result = await f.store.report();
  assert.equal(result.registrations.length, 1); assert.equal(result.payments.length, 2);
  assert.deepEqual(result.registrations[0].entitlements, {});
  assert.equal(result.registrations[0].id, 'circ-2027-alice');
  assert.equal(result.registrations[0].createdAt, raw.createdAt);
  assert.equal(result.registrations[0].payment.reference, 'REFERENCE');
  assert.deepEqual(result.registrations[0].selection, { profile: 'uls', congressMode: 'onsite', morningCourse: true, dinnerQuantity: 2 });
  assert.equal(result.payments[0].paidAt, true); assert.equal(result.payments[0].transactionId, true);
  assert.deepEqual(result.payments[1].quote.selection, { afternoonCourse: true, dinnerQuantity: 3 });
  assert.ok(!JSON.stringify(result).includes(privateValue));
  for (const { body } of f.calls) {
    const fields = body.structuredQuery?.select.fields.map(item => item.fieldPath) || body.mask.fieldPaths;
    assert.ok(!fields.some(field => /billing|fiscal|customer|notes|roles/i.test(field)));
  }
});

test('the complete event is paginated beyond 500 without createdAt ordering or omissions', async () => {
  const first = Array.from({ length: 500 }, (_, i) => ({ document: doc('registrations', `circ-2027-person${String(i).padStart(4, '0')}`, registration(`person${String(i).padStart(4, '0')}`)) }));
  const last = doc('registrations', 'circ-2027-person0500', registration('person0500'));
  const f = storeFixture([first, [{ document: last }]]);
  const report = await f.store.report();
  assert.equal(report.registrations.length, 501); assert.equal(report.payments.length, 0);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0].body.structuredQuery.orderBy, [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
  assert.deepEqual(f.calls[1].body.structuredQuery.startAt, { values: [{ referenceValue: first.at(-1).document.name }], before: false });
  assert.equal(f.calls[0].body.structuredQuery.where.fieldFilter.field.fieldPath, 'eventId');
  assert.ok(!Object.hasOwn(report.registrations[0], 'createdAt'));
});

test('production reports exclude tests and archives, and preserve a zero-price company voucher', async () => {
  const rows = [registration('voucher', { payment: { status: 'paid', amountCents: 0, method: 'company_voucher' } }),
    registration('test', { isTest: true }), registration('mode', { testMode: true }), registration('archive', { archived: true }),
    registration('released', { registrationArchiveId: 'archive' }), registration('dated', { registrationArchivedAt: '2026-11-01' })];
  const f = storeFixture([rows.map(row => ({ document: doc('registrations', `circ-2027-${row.userId}`, row) }))]);
  const result = await f.store.report();
  assert.equal(result.registrations.length, 1); assert.equal(result.registrations[0].payment.amountCents, 0);
  assert.equal(result.registrations[0].userId, 'voucher');
});

test('only linked current payments for the same owner, registration, kind and production event are returned', async () => {
  const names = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`id${i}`, orderId(i)]));
  const rows = Array.from({ length: 6 }, (_, i) => registration(`person${i}`, { payment: { status: 'pending', orderId: names[`id${i}`] } }));
  const details = [payment('person0'), payment('other'), payment('person2', { registrationId: 'circ-2027-other' }),
    payment('person3', { environment: 'sandbox' }), payment('person4', { kind: 'supplementary' }), payment('person5', { registrationArchiveId: 'archive' })];
  const documents = details.map((p, i) => doc('payments', names[`id${i}`], p));
  // An unlinked old attempt is never fetched, even if it has matching participant data.
  const old = doc('payments', names.id6, payment('person0'));
  const f = storeFixture([rows.map(r => ({ document: doc('registrations', `circ-2027-${r.userId}`, r) }))],
    Object.fromEntries([...documents, old].map(item => [item.name, item])));
  const result = await f.store.report();
  assert.deepEqual(result.payments.map(p => p.id), [names.id0]);
  assert.ok(!f.calls[1].body.documents.includes(old.name));
});

test('null and missing entitlements remain distinct from an explicitly empty grant map', async () => {
  const nullGrant = registration('null', { entitlements: null });
  const noGrant = registration('missing'); delete noGrant.entitlements;
  const f = storeFixture([[nullGrant, noGrant].map(row => ({ document: doc('registrations', `circ-2027-${row.userId}`, row) }))]);
  const result = await f.store.report();
  assert.equal(result.registrations[0].entitlements, null);
  assert.ok(!Object.hasOwn(result.registrations[1], 'entitlements'));
});

test('truthy malformed closure and review markers remain conservative without disclosing their contents', async () => {
  const hidden = 'private-marker-'.repeat(30), id = orderId(1);
  const raw = registration('alice', { capacityReviewOrderId: hidden, payment: { status: 'pending', orderId: id } });
  const p = doc('payments', id, payment('alice', { replacementOrderId: hidden, capacityStatus: { private: hidden } }));
  const f = storeFixture([[{ document: doc('registrations', 'circ-2027-alice', raw) }]], { [p.name]: p });
  const result = await f.store.report();
  assert.equal(result.registrations[0].capacityReviewOrderId, 'review_required');
  assert.equal(result.payments[0].replacementOrderId, 'unconfirmed');
  assert.equal(result.payments[0].capacityStatus, 'review_required');
  assert.ok(!JSON.stringify(result).includes(hidden));
});

test('payment batch reads are bounded to 100 names and missing current orders remain missing for honest review', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => registration(`person${i}`, { payment: { status: 'pending', orderId: orderId(i) } }));
  const f = storeFixture([rows.map(row => ({ document: doc('registrations', `circ-2027-${row.userId}`, row) }))]);
  const result = await f.store.report();
  assert.equal(result.registrations.length, 101); assert.equal(result.payments.length, 0);
  assert.deepEqual(f.calls.slice(1).map(call => call.body.documents.length), [100, 1]);
  assert.ok(f.calls.every(call => call.url.endsWith(':runQuery') || call.url.endsWith(':batchGet')));
});

test('malformed or incomplete upstream pages fail rather than returning partial statistics or foreign documents', async () => {
  for (const pages of [[{}], [[{ document: { name: `${ROOT}/users/private`, fields: {} } }]],
    [[{ document: doc('registrations', 'wrong-event', { eventId: 'another-event' }) }]],
    [[{ error: { message: 'private-google-error' } }]]]) {
    const f = storeFixture(pages);
    await assert.rejects(f.store.report(), /registration-report-unavailable/);
  }
  const repeated = doc('registrations', 'circ-2027-duplicate', registration('duplicate'));
  const f = storeFixture([[{ document: repeated }, { document: repeated }]]);
  await assert.rejects(f.store.report(), /registration-report-unavailable/);
});

test('an incomplete batchGet response is a service failure, not a silent undercount', async () => {
  let call = 0;
  const store = createRegistrationReportsStore({ projectId: 'circ-test', token: 'synthetic-token', fetchImpl: async () => {
    if (call++ === 0) return Response.json([{ document: doc('registrations', 'circ-2027-alice', registration('alice', { payment: { orderId: orderId(1) } })) }]);
    return Response.json([]);
  } });
  await assert.rejects(store.report(), /registration-report-unavailable/);
});

test('raw upstream HTTP errors and oversized JSON responses are not exposed or accepted', async () => {
  for (const response of [new Response('private-service-credential-details', { status: 403 }),
    new Response('x'.repeat(4 * 1024 * 1024 + 1))]) {
    const store = createRegistrationReportsStore({ projectId: 'circ-test', token: 'synthetic-token', fetchImpl: async () => response });
    await assert.rejects(store.report(), /^Error: registration-report-unavailable$/);
  }
});
