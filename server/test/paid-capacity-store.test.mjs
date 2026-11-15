import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPaidCapacityStore } from '../payments/paid-capacity-store.mjs';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { createCheckoutLiveStore } from '../payments/checkout-live-store.mjs';
import { createOrganizerVoucherLiveApi } from '../payments/organizer-voucher-live.mjs';
import { quotePrimary, quoteSupplementary } from '../payments/quote.mjs';
import { buildLivePaymentFR } from '../payments/toconline-live-payload.mjs';

const root = 'projects/circ-test/databases/(default)/documents';
const lockName = `${root}/settings/circ-2027-paid-capacity-v1`;
const registrationName = uid => `${root}/registrations/circ-2027-${uid}`;
const conflict = () => Object.assign(new Error('conflict'), { code: 'conflict' });
const unavailable = () => Object.assign(new Error('storage_unavailable'), { code: 'storage_unavailable' });
const encode = value => value === null ? { nullValue: null }
  : typeof value === 'string' ? { stringValue: value }
    : typeof value === 'boolean' ? { booleanValue: value }
      : typeof value === 'number' ? { integerValue: String(value) }
        : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
          : { mapValue: { fields: fields(value) } };
const fields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
const decode = value => 'nullValue' in value ? null
  : 'stringValue' in value ? value.stringValue
    : 'booleanValue' in value ? value.booleanValue
      : 'integerValue' in value ? Number(value.integerValue)
        : 'arrayValue' in value ? (value.arrayValue.values || []).map(decode)
          : Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
const reg = (uid, changes = {}) => ({
  userId: uid, eventId: 'circ-2027', registrationKey: `circ-2027:${uid}`, primaryRegistration: true,
  isTest: false, testMode: false, status: 'confirmed', payment: { status: 'paid' },
  entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false }, ...changes,
});
const pending = uid => reg(uid, { status: 'submitted', payment: { status: 'pending' },
  entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } });

// Firestore REST model with transaction snapshots, query projection/pagination,
// atomic preconditions, and explicit lost-response injection. It holds no
// financial/provider implementation and never leaves memory.
function fixture({ capacityEnabled = true, withLock = true, commitHook = null } = {}) {
  const documents = new Map(), transactions = new Map(), calls = [];
  let clock = 0, transactionId = 0;
  function put(name, data) {
    const document = { name, fields: fields(data), updateTime: `v${++clock}` };
    documents.set(name, document);
    return structuredClone(document);
  }
  const data = name => documents.has(name) ? decode({ mapValue: { fields: documents.get(name).fields } }) : null;
  function assertPrecondition(write) {
    const name = write.update?.name || write.delete, current = documents.get(name), condition = write.currentDocument;
    if (condition?.exists === false && current || condition?.exists === true && !current
      || condition?.updateTime !== undefined && current?.updateTime !== condition.updateTime) throw conflict();
  }
  async function call(url, method = 'GET', body) {
    calls.push({ url, method, body: structuredClone(body) });
    if (url.endsWith(':batchGet')) {
      const id = `transaction-${++transactionId}`;
      const snapshot = new Map([...documents].map(([name, doc]) => [name, structuredClone(doc)]));
      transactions.set(id, snapshot);
      return body.documents.map((name, index) => ({ ...(index === 0 ? { transaction: id } : {}),
        ...(snapshot.has(name) ? { found: snapshot.get(name) } : { missing: name }) }));
    }
    if (url.endsWith(':runQuery')) {
      const snapshot = body.transaction ? transactions.get(body.transaction) : documents;
      if (!snapshot) throw unavailable();
      const query = body.structuredQuery;
      assert.deepEqual(query.from, [{ collectionId: 'registrations' }]);
      assert.deepEqual(query.where, { fieldFilter: { field: { fieldPath: 'payment.status' }, op: 'EQUAL', value: { stringValue: 'paid' } } });
      assert.deepEqual(query.orderBy, [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
      const after = query.startAt?.values[0]?.referenceValue;
      if (after) assert.equal(query.startAt.before, false);
      const selected = [...snapshot.values()].filter(doc => doc.name.startsWith(`${root}/registrations/`)
        && decode({ mapValue: { fields: doc.fields } }).payment?.status === 'paid' && (!after || doc.name > after))
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).slice(0, query.limit);
      return selected.map(doc => {
        const source = decode({ mapValue: { fields: doc.fields } }), projected = {};
        for (const { fieldPath } of query.select.fields) {
          const path = fieldPath.split('.');
          let value = source;
          for (const part of path) value = value?.[part];
          if (value === undefined) continue;
          let target = projected;
          for (const part of path.slice(0, -1)) target = target[part] ||= {};
          target[path.at(-1)] = value;
        }
        return { document: { ...doc, fields: fields(projected) } };
      });
    }
    if (url.endsWith(':commit')) {
      if (body.transaction && !transactions.has(body.transaction)) throw unavailable();
      await commitHook?.({ body, documents, data, put, calls });
      // Check every write before applying any. In particular every admission
      // and rejection shares the lock CAS, even for different participants.
      for (const write of body.writes) assertPrecondition(write);
      const writeResults = body.writes.map(write => {
        if (write.delete) { documents.delete(write.delete); return {}; }
        const update = decode({ mapValue: { fields: write.update.fields } });
        const stored = put(write.update.name, write.updateMask ? {
          ...data(write.update.name), ...Object.fromEntries(write.updateMask.fieldPaths.map(key => [key, update[key]])),
        } : update);
        return { updateTime: stored.updateTime };
      });
      transactions.delete(body.transaction);
      if (body.writes.some(write => write.update?.fields?.loseAcknowledgement?.booleanValue)) throw unavailable();
      return { writeResults };
    }
    if (url.endsWith(':rollback')) {
      transactions.delete(body.transaction);
      return {};
    }
    throw new Error(`Unexpected capacity storage request: ${url}`);
  }
  if (withLock) put(lockName, { eventId: 'circ-2027', revision: 0 });
  const fetchImpl = async (url, options) => {
    if (options.method === 'GET') {
      const document = documents.get(url.split('/v1/')[1]);
      return document ? Response.json(document) : new Response('', { status: 404 });
    }
    try { return Response.json(await call(url, options.method, options.body ? JSON.parse(options.body) : undefined)); }
    catch (error) {
      if (error.code === 'conflict') return new Response('', { status: 409 });
      if (error.code === 'storage_unavailable') return new Response('', { status: 503 });
      throw error;
    }
  };
  return { documents, calls, put, data, fetchImpl, capacityEnabled,
    store: createPaidCapacityStore({ root, call, fields, decode, capacityEnabled }) };
}

function admission(f, uid, { nextRegistration = reg(uid), selection, loseAcknowledgement = false } = {}) {
  const name = registrationName(uid), previous = f.put(name, pending(uid));
  const paymentName = `${root}/payments/${uid}`, payment = f.put(paymentName, { status: 'pending' });
  const jobName = `${root}/documents/${uid}`;
  const checks = [{ name, version: previous.updateTime }, { name: paymentName, version: payment.updateTime }, { name: jobName, version: null }];
  const input = { checks, registrationName: name, nextRegistration, ...(selection ? { selection } : {}), onFull: 'hold',
    writes: decision => [
      { update: { name: paymentName, fields: fields({ status: 'paid', capacityReview: !decision.allocated,
        ...(loseAcknowledgement ? { loseAcknowledgement: true } : {}) }) }, currentDocument: { updateTime: payment.updateTime } },
      { update: { name, fields: fields(decision.allocated ? nextRegistration
        : { ...pending(uid), payment: { status: 'paid' }, capacityReview: decision.unavailable }) }, currentDocument: { updateTime: previous.updateTime } },
      { update: { name: jobName, fields: fields({ status: decision.allocated ? 'pending' : 'review_required' }) }, currentDocument: { exists: false } },
    ] };
  return { input, paymentName, jobName, name };
}

test('two concurrent payments competing for place 400 allocate one and hold the other atomically', async () => {
  let commitsWaiting = 0, release;
  const bothReady = new Promise(resolve => { release = resolve; });
  const f = fixture({ commitHook: async () => {
    if (++commitsWaiting <= 2) { if (commitsWaiting === 2) release(); await bothReady; }
  } });
  for (let i = 0; i < 399; i++) f.put(registrationName(`existing-${i}`), reg(`existing-${i}`));
  const a = admission(f, 'new-a'), b = admission(f, 'new-b');
  const results = await Promise.all([f.store.commit(a.input), f.store.commit(b.input)]);
  assert.deepEqual(results.map(result => result.allocated).sort(), [false, true]);
  assert.equal((await f.store.summary()).paid.onsite, 400);
  assert.equal(f.data(lockName).revision, 2);
  for (const attempt of [a, b]) {
    assert.equal(f.data(attempt.paymentName).status, 'paid');
    assert.equal(f.data(attempt.jobName).status, f.data(attempt.name).status === 'confirmed' ? 'pending' : 'review_required');
  }
  assert.equal(f.calls.filter(call => call.url.endsWith(':rollback')).length, 1);
  assert.equal(f.calls.filter(call => call.url.endsWith(':commit')).length, 3);
});

test('suspended capacity permits both concurrent allocations with no count or lock and retains order preconditions', async () => {
  let commitsWaiting = 0, release;
  const bothReady = new Promise(resolve => { release = resolve; });
  const f = fixture({ capacityEnabled: false, commitHook: async () => {
    if (++commitsWaiting <= 2) { if (commitsWaiting === 2) release(); await bothReady; }
  } });
  f.put(lockName, { revision: 'invalid' });
  for (let i = 0; i < 400; i++) f.put(registrationName(`existing-${i}`), reg(`existing-${i}`));
  const a = admission(f, 'new-a'), b = admission(f, 'new-b');
  const results = await Promise.all([f.store.commit(a.input), f.store.commit(b.input)]);
  assert.deepEqual(results.map(result => result.allocated), [true, true]);
  for (const attempt of [a, b]) {
    assert.equal(f.data(attempt.paymentName).status, 'paid');
    assert.equal(f.data(attempt.jobName).status, 'pending');
    assert.equal(f.data(attempt.name).status, 'confirmed');
  }
  await assert.rejects(f.store.commit(a.input), error => error.code === 'conflict');
  assert.equal(f.data(lockName).revision, 'invalid');
  assert.equal(f.calls.some(call => call.url.endsWith(':runQuery') || call.body.documents?.includes(lockName)
    || call.body.writes?.some(write => write.update?.name === lockName)), false);
});

test('a full course holds the entire paid bundle without granting other requested entitlements', async () => {
  const f = fixture();
  for (let i = 0; i < 170; i++) f.put(registrationName(`course-${i}`), reg(`course-${i}`, { entitlements: { morningCourse: true } }));
  const nextRegistration = reg('bundle', { entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true } });
  const a = admission(f, 'bundle', { nextRegistration });
  const result = await f.store.commit(a.input);
  assert.equal(result.allocated, false);
  assert.deepEqual(result.unavailable, ['morningCourse']);
  assert.deepEqual(f.data(a.name).entitlements, pending('bundle').entitlements);
  assert.equal(f.data(a.paymentName).status, 'paid');
  assert.equal(f.data(a.jobName).status, 'review_required');
  assert.deepEqual((await f.store.summary()).paid, { onsite: 0, morningCourse: 170, afternoonCourse: 0 });
});

test('full prepayment checks reject before creating any order or provider work and roll back', async () => {
  const f = fixture();
  for (let i = 0; i < 400; i++) f.put(registrationName(`paid-${i}`), reg(`paid-${i}`));
  let writesBuilt = 0;
  await assert.rejects(f.store.commit({ checks: [{ name: registrationName('new'), version: null }],
    registrationName: registrationName('new'), selection: { congressMode: 'onsite' },
    writes: () => { writesBuilt++; return []; } }), error => error.code === 'capacity-full' && error.unavailable[0] === 'onsite');
  assert.equal(writesBuilt, 0);
  assert.equal(f.data(registrationName('new')), null);
  assert.equal(f.data(lockName).revision, 0);
  assert.equal(f.calls.some(call => call.url.endsWith(':commit')), false);
  assert.equal(f.calls.at(-1).url.endsWith(':rollback'), true);
});

test('the lock is created with exists:false and its updateTime is required on subsequent commits', async () => {
  const f = fixture({ withLock: false });
  const a = admission(f, 'first');
  await f.store.commit(a.input);
  const firstCommit = f.calls.find(call => call.url.endsWith(':commit')).body;
  assert.deepEqual(firstCommit.writes.at(-1).currentDocument, { exists: false });
  const lockVersion = f.documents.get(lockName).updateTime;
  const b = admission(f, 'second');
  await f.store.commit(b.input);
  const secondCommit = f.calls.filter(call => call.url.endsWith(':commit')).at(-1).body;
  assert.deepEqual(secondCommit.writes.at(-1).currentDocument, { updateTime: lockVersion });
  assert.equal(f.data(lockName).revision, 2);
});

test('storage failure before commit leaves every document unchanged and is not silently retried', async () => {
  const f = fixture({ commitHook: async () => { throw unavailable(); } });
  const a = admission(f, 'failure'), before = structuredClone([...f.documents]);
  await assert.rejects(f.store.commit(a.input), error => error.code === 'storage_unavailable');
  assert.deepEqual([...f.documents], before);
  assert.equal(f.calls.filter(call => call.url.endsWith(':commit')).length, 1);
  assert.equal(f.calls.filter(call => call.url.endsWith(':rollback')).length, 1);
});

test('a lost accepted commit response preserves one allocation and an identical stale replay cannot allocate again', async () => {
  const f = fixture(), a = admission(f, 'lost-ack', { loseAcknowledgement: true });
  await assert.rejects(f.store.commit(a.input), error => error.code === 'storage_unavailable');
  assert.equal(f.data(a.paymentName).status, 'paid');
  assert.equal(f.data(a.name).status, 'confirmed');
  assert.equal(f.data(a.jobName).status, 'pending');
  assert.equal(f.data(lockName).revision, 1);
  await assert.rejects(f.store.commit(a.input), error => error.code === 'conflict');
  assert.equal(f.calls.filter(call => call.url.endsWith(':commit')).length, 1);
  assert.equal((await f.store.summary()).paid.onsite, 1);
  assert.equal(f.data(lockName).revision, 1);
});

test('replaying an already committed delivery cannot overwrite registration or recreate its fiscal job', async () => {
  const f = fixture(), a = admission(f, 'duplicate');
  await f.store.commit(a.input);
  const before = structuredClone([...f.documents]);
  await assert.rejects(f.store.commit(a.input), error => error.code === 'conflict');
  assert.deepEqual([...f.documents], before);
  assert.equal(f.calls.filter(call => call.url.endsWith(':commit')).length, 1);
});

test('query projection and pagination derive counts from all existing paid registrations without exposing profile fields', async () => {
  const f = fixture();
  for (let i = 0; i < 501; i++) f.put(registrationName(`test-${String(i).padStart(3, '0')}`), reg(`test-${String(i).padStart(3, '0')}`, { isTest: true }));
  f.put(registrationName('active'), reg('active', { participantEmail: 'private@example.test', billingAddress: 'Private address' }));
  f.put(registrationName('voucher'), reg('voucher', { payment: { status: 'paid', amountCents: 0, coveredAmountCents: 9500, method: 'company_voucher' } }));
  f.put(registrationName('archived'), reg('archived', { registrationArchiveId: 'archive' }));
  f.put(registrationName('other-event'), reg('other-event', { eventId: 'another-event' }));
  f.put(registrationName('pending'), pending('pending'));
  const result = await f.store.summary();
  assert.equal(result.paid.onsite, 2);
  const queries = f.calls.filter(call => call.url.endsWith(':runQuery'));
  assert.equal(queries.length, 2);
  assert.equal(queries[0].body.structuredQuery.limit, 500);
  assert.ok(queries[1].body.structuredQuery.startAt.values[0].referenceValue.startsWith(`${root}/registrations/`));
  for (const query of queries) {
    const selection = query.body.structuredQuery.select.fields.map(field => field.fieldPath);
    assert.ok(selection.includes('entitlements'));
    assert.ok(selection.includes('registrationArchiveId'));
    assert.ok(selection.includes('registrationArchivedAt'));
    assert.ok(selection.includes('payment.status'));
    assert.ok(!selection.includes('payment'));
    assert.ok(!selection.includes('participantEmail'));
    assert.ok(!selection.includes('billingAddress'));
  }
});

test('a virtual-only purchase writes atomically without querying any paid-seat quota', async () => {
  const f = fixture(), a = admission(f, 'virtual', { nextRegistration: reg('virtual', { entitlements: { congressMode: 'virtual' } }) });
  const result = await f.store.commit(a.input);
  assert.equal(result.allocated, true);
  assert.equal(f.data(a.name).status, 'confirmed');
  assert.equal(f.calls.some(call => call.url.endsWith(':runQuery')), false);
  assert.equal(f.data(lockName).revision, 1);
});

test('malformed lock metadata fails closed before rights, financial or fiscal writes', async () => {
  const f = fixture();
  f.put(lockName, { revision: -1 });
  const a = admission(f, 'bad-lock');
  await assert.rejects(f.store.commit(a.input), error => error.code === 'capacity-unavailable');
  assert.equal(f.calls.some(call => call.url.endsWith(':commit')), false);
  assert.equal(f.data(a.name).status, 'submitted');
  assert.equal(f.data(a.paymentName).status, 'pending');
  assert.equal(f.data(a.jobName), null);
  assert.equal(f.calls.at(-1).url.endsWith(':rollback'), true);
});

const orderIdFor = index => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
const billing = { customer: { customer_business_name: 'Pessoa Modelo', customer_tax_registration_number: '203821432',
  customer_address_detail: 'Rua Modelo 1', customer_postcode: '3030-471', customer_city: 'Coimbra', customer_country: 'PT' } };

function discountCheckout(f) {
  const sentToProvider = [];
  const env = { FIREBASE_PROJECT_ID: 'circ-test', LIVE_CHECKOUT_ENABLED: 'true', EUPAGO_LIVE_API_KEY: 'live-key',
    FIREBASE_PAYMENTS_SERVICE_ACCOUNT: 'configured', EUPAGO_LIVE_WEBHOOK_KEY: 'webhook-key', EUPAGO_LIVE_CHANNEL: 'CIRC 2027',
    TOCONLINE_OAUTH_CLIENT_ID: 'client', TOCONLINE_OAUTH_CLIENT_SECRET: 'secret', TOCONLINE_OAUTH_URL: 'https://oauth.example.test',
    TOCONLINE_API_URL: 'https://api.example.test/api', TOCONLINE_SESSION_KEY: 'session-key', LIVE_MBWAY_ENABLED: 'true', LIVE_MBWAY_VALIDATION_ONLY: 'false' };
  const api = createCheckoutLiveApi({
    verify: async uid => ({ sub: uid, email: `${uid}@example.test`, email_verified: true }),
    tokenProvider: async () => 'in-memory-service',
    storeFactory: args => createCheckoutLiveStore({ ...args, fetchImpl: f.fetchImpl }),
    providerFactory: () => ({
      createPayment: async payment => { sentToProvider.push(payment); return { reference: '123456789', entity: '12345' }; },
      inspectReference: async () => ({ providerState: 'cancelled' }),
    }),
    now: () => '2026-11-15T12:00:00.000Z', capacityEnabled: f.capacityEnabled,
  });
  return {
    sentToProvider,
    addParticipant: uid => f.put(`${root}/users/${uid}`, { name: 'Pessoa Modelo', taxNumber: '203821432',
      billingAddress: 'Rua Modelo 1', billingPostalCode: '3030-471', billingCity: 'Coimbra', billingCountry: 'Portugal' }),
    verifyUls(uid, mec) {
      const eligibility = { userId: uid, eventId: 'circ-2027', mec, nameKey: 'PESSOA MODELO', method: 'mec-name-match' };
      f.put(`${root}/ulsEligibility/${uid}`, { ...eligibility, status: 'matched' });
      f.put(`${root}/ulsMecClaims/circ-2027_${mec}`, eligibility);
      f.put(`${root}/ulsRoster/${mec}`, { eventId: eligibility.eventId, nameKey: eligibility.nameKey, active: true });
    },
    async call(uid, path, body) {
      return api(new Request(`https://circ.test/api/checkout/live${path}`, { method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${uid}`, Origin: 'https://circ.test', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    },
  };
}

function discountVoucher(f, rawCode, discount, audience) {
  const hash = createHash('sha256').update(rawCode).digest('hex');
  const name = `${root}/organizationDiscountVouchers/${hash}`;
  const code = `CIRC27-D-${rawCode.match(/.{4}/g).join('-')}`;
  f.put(name, { eventId: 'circ-2027', status: 'available', batchId: orderIdFor(10), index: 1,
    createdAt: '2026-11-15T11:00:00.000Z', createdBy: 'admin', discount, ...(audience ? { audience } : {}) });
  return { name, code, hash };
}

const discountSelection = { profile: 'external', congressMode: 'onsite', morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 };
const paymentDoc = id => `${root}/payments/${id}`;

test('a scoped €55 voucher confirms one verified onsite ULS registration atomically with no payment provider or fiscal job', async () => {
  const f = fixture(), checkout = discountCheckout(f), uid = 'organizer-free', id = orderIdFor(60);
  const terms = { type: 'fixed', value: 5500 };
  const voucher = discountVoucher(f, '6'.repeat(32), terms, 'uls-onsite');
  const selection = { profile: 'uls', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
  const discountCode = voucher.code;
  checkout.addParticipant(uid);
  for (const incorrectSelection of [{ ...selection, profile: 'external' }, { ...selection, congressMode: 'virtual' }]) {
    const result = await checkout.call(uid, '/quote', { selection: incorrectSelection, discountCode });
    assert.equal(result.status, 409);
    assert.equal((await result.json()).error, 'discount-voucher-uls-onsite');
  }
  const unverified = await checkout.call(uid, '/quote', { selection, discountCode });
  assert.equal(unverified.status, 403);
  assert.equal((await unverified.json()).error, 'uls-not-verified');
  checkout.verifyUls(uid, '123');
  const preview = await checkout.call(uid, '/quote', { selection, discountCode });
  assert.equal(preview.status, 200);
  const { quote, stamp, billingStamp } = await preview.json();
  assert.equal(quote.amountCents, 0);
  assert.deepEqual(quote.discount, { ...terms, amountCents: 5500 });
  assert.equal(f.data(voucher.name).status, 'available');
  assert.equal(f.data(registrationName(uid)), null);
  const request = { id, selection, discountCode, stamp, billingStamp, method: 'organization_voucher' };
  const mismatchedMethod = await checkout.call(uid, '/orders', { ...request, method: 'multibanco' });
  assert.equal(mismatchedMethod.status, 409);
  assert.equal((await mismatchedMethod.json()).error, 'quote-changed');
  assert.equal(f.data(voucher.name).status, 'available');
  assert.equal(f.data(paymentDoc(id)), null);
  const confirmed = await checkout.call(uid, '/orders', request);
  assert.equal(confirmed.status, 201);
  const { order } = await confirmed.json();
  assert.equal(order.id, id);
  assert.equal(order.method, 'organization_voucher');
  assert.equal(order.status, 'paid');
  assert.equal(order.amountCents, 0);
  const registration = f.data(registrationName(uid));
  assert.equal(registration.status, 'confirmed');
  assert.equal(registration.selection.profile, 'uls');
  assert.deepEqual(registration.entitlements, { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  assert.equal(registration.payment.coveredAmountCents, 5500);
  assert.equal(registration.payment.amountCents, 0);
  assert.equal(f.data(voucher.name).status, 'claimed');
  assert.equal(f.data(voucher.name).userId, uid);
  assert.equal(f.data(voucher.name).orderId, id);
  assert.equal(f.data(paymentDoc(id)).provider, 'internal_organization_voucher');
  assert.equal(f.data(paymentDoc(id)).transactionId, null);
  assert.equal(f.data(`${root}/documents/${id}`), null);
  assert.equal(checkout.sentToProvider.length, 0);
  const replayed = await checkout.call(uid, '/orders', request);
  assert.equal(replayed.status, 200);
  assert.deepEqual((await replayed.json()).order, order);
  const recovered = await checkout.call(uid, '/primary-order');
  assert.equal(recovered.status, 200);
  assert.deepEqual((await recovered.json()).order, order);
  assert.equal(f.data(lockName).revision, 1);
  const extras = await checkout.call(uid, '/supplementary/quote', { selection: { morningCourse: true } });
  assert.equal(extras.status, 200);
  assert.equal((await extras.json()).quote.amountCents, 2000);
});

test('a scoped €55 voucher with extras cannot bypass payment and charges only the selected extras', async () => {
  const f = fixture({ capacityEnabled: false }), checkout = discountCheckout(f), uid = 'organizer-with-extras';
  checkout.addParticipant(uid);
  checkout.verifyUls(uid, '345');
  const voucher = discountVoucher(f, '7'.repeat(32), { type: 'fixed', value: 5500 }, 'uls-onsite');
  const selection = { profile: 'uls', congressMode: 'onsite', morningCourse: true, dinnerQuantity: 1 };
  const discountCode = voucher.code;
  const preview = await checkout.call(uid, '/quote', { selection, discountCode });
  assert.equal(preview.status, 200);
  const { quote, stamp, billingStamp } = await preview.json();
  assert.equal(quote.amountCents, 5000);
  const id = orderIdFor(61);
  const request = { id, selection, discountCode, stamp, billingStamp };
  const bypass = await checkout.call(uid, '/orders', { ...request, method: 'organization_voucher' });
  assert.equal(bypass.status, 409);
  assert.equal((await bypass.json()).error, 'quote-changed');
  assert.equal(f.data(voucher.name).status, 'available');
  assert.equal(f.data(registrationName(uid)), null);
  const created = await checkout.call(uid, '/orders', { ...request, method: 'multibanco' });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).order.amountCents, 5000);
  assert.equal(checkout.sentToProvider.length, 1);
  assert.equal(checkout.sentToProvider[0].amountCents, 5000);
  assert.equal(f.data(registrationName(uid)).status, 'submitted');
});

test('discount checkout previews without claiming and charges the reviewed amount only once', async () => {
  const f = fixture({ capacityEnabled: false });
  const checkout = discountCheckout(f), uid = 'voucher-participant', id = orderIdFor(11);
  checkout.addParticipant(uid);
  const terms = { type: 'percentage', value: 2500 };
  const first = discountVoucher(f, 'a'.repeat(32), terms);
  const other = discountVoucher(f, 'b'.repeat(32), terms);
  const preview = await checkout.call(uid, '/quote', { selection: discountSelection, discountCode: ` ${first.code.toLowerCase()} ` });
  assert.equal(preview.status, 200);
  const { quote, stamp, billingStamp } = await preview.json();
  const discount = { ...terms, amountCents: 2375 };
  assert.deepEqual(quote.discount, discount);
  assert.deepEqual(quote.lines.map(line => [line.code, line.amountCents]), [
    ['congress-onsite', 7125], ['course-morning', 3500], ['dinner', 3000],
  ]);
  assert.equal(quote.amountCents, 13625);
  assert.equal(f.data(first.name).status, 'available');
  assert.equal(f.data(registrationName(uid)), null);
  assert.equal(checkout.sentToProvider.length, 0);
  const order = { id, selection: discountSelection, stamp, billingStamp, method: 'multibanco', discountCode: first.code };
  for (const [discountCode, expected] of [[`CIRC27-D-${'c'.repeat(32)}`, 'discount-voucher-invalid'], [other.code, 'quote-changed']]) {
    const rejection = await checkout.call(uid, '/orders', { ...order, discountCode });
    assert.equal(rejection.status, 409);
    assert.equal((await rejection.json()).error, expected);
    assert.equal(f.data(first.name).status, 'available');
    assert.equal(f.data(other.name).status, 'available');
    assert.equal(f.data(paymentDoc(id)), null);
    assert.equal(checkout.sentToProvider.length, 0);
  }
  const created = await checkout.call(uid, '/orders', order);
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.deepEqual(payload.order.discount, discount);
  assert.equal(payload.order.amountCents, 13625);
  assert.ok(!JSON.stringify(payload).includes(first.hash));
  assert.equal(f.data(first.name).status, 'claimed');
  assert.equal(f.data(first.name).userId, uid);
  assert.equal(f.data(first.name).orderId, id);
  assert.equal(f.data(other.name).status, 'available');
  assert.equal(f.data(paymentDoc(id)).discountVoucherHash, first.hash);
  assert.ok(!JSON.stringify(f.data(paymentDoc(id))).includes(first.code));
  assert.equal((await checkout.call(uid, '/orders', order)).status, 200);
  assert.equal(checkout.sentToProvider.length, 1);
  assert.equal(checkout.sentToProvider[0].amountCents, 13625);
});

test('two participants cannot reserve one discount voucher concurrently with capacity suspended', async () => {
  let commitsWaiting = 0, release;
  const bothReady = new Promise(resolve => { release = resolve; });
  const f = fixture({ capacityEnabled: false, withLock: false, commitHook: async ({ body }) => {
    if (body.transaction && ++commitsWaiting <= 2) {
      if (commitsWaiting === 2) release();
      await bothReady;
    }
  } });
  const checkout = discountCheckout(f), terms = { type: 'fixed', value: 2000 };
  const voucher = discountVoucher(f, 'd'.repeat(32), terms);
  const participants = ['voucher-first', 'voucher-second'];
  const orders = await Promise.all(participants.map(async (uid, index) => {
    checkout.addParticipant(uid);
    const preview = await checkout.call(uid, '/quote', { selection: discountSelection, discountCode: voucher.code });
    assert.equal(preview.status, 200);
    const { stamp, billingStamp, quote } = await preview.json();
    assert.deepEqual(quote.discount, { ...terms, amountCents: 2000 });
    return { id: orderIdFor(index + 12), selection: discountSelection, discountCode: voucher.code, stamp, billingStamp, method: 'multibanco' };
  }));
  const responses = await Promise.all(orders.map((order, index) => checkout.call(participants[index], '/orders', order)));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(checkout.sentToProvider.length, 1);
  const winner = responses.findIndex(response => response.status === 201), loser = 1 - winner;
  assert.equal(f.data(voucher.name).userId, participants[winner]);
  assert.equal(f.data(voucher.name).orderId, orders[winner].id);
  assert.equal(f.data(paymentDoc(orders[loser].id)), null);
  assert.equal(f.data(registrationName(participants[loser])), null);
  const reuse = await checkout.call(participants[loser], '/quote', { selection: discountSelection, discountCode: voucher.code });
  assert.equal(reuse.status, 409);
  assert.equal((await reuse.json()).error, 'discount-voucher-invalid');
});

test('a confirmed unpaid MB WAY replacement retains the same discount voucher', async () => {
  const f = fixture({ capacityEnabled: false });
  const checkout = discountCheckout(f), uid = 'voucher-retry', id = orderIdFor(14), replaces = orderIdFor(15);
  checkout.addParticipant(uid);
  const first = discountVoucher(f, 'e'.repeat(32), { type: 'fixed', value: 2000 });
  const other = discountVoucher(f, 'f'.repeat(32), { type: 'fixed', value: 2000 });
  const preview = await checkout.call(uid, '/quote', { selection: discountSelection, discountCode: first.code });
  assert.equal(preview.status, 200);
  const { quote, stamp, billingStamp } = await preview.json();
  const originalOrder = { id: replaces, selection: discountSelection, discountCode: first.code, stamp, billingStamp, method: 'mbway', phone: '911111111' };
  assert.equal((await checkout.call(uid, '/orders', originalOrder)).status, 201);
  const previous = f.data(paymentDoc(replaces)), registration = f.data(registrationName(uid));
  f.put(paymentDoc(replaces), { ...previous, status: 'cancelled', retryAllowed: true,
    providerClosure: { source: 'eupago-reference-info', state: 'cancelled', reference: previous.reference,
      identifier: previous.identifier, checkedAt: '2026-11-15T12:00:00.000Z' } });
  f.put(registrationName(uid), { ...registration, payment: { ...registration.payment, closedUnpaidStatus: 'cancelled' } });
  const retryData = { selection: discountSelection, replacesOrderId: replaces };
  const retryPreview = await checkout.call(uid, '/quote', retryData);
  assert.equal(retryPreview.status, 200);
  const revised = await retryPreview.json();
  assert.deepEqual(revised.quote.discount, quote.discount);
  assert.equal(f.data(first.name).orderId, replaces);
  const replacement = { ...retryData, id, stamp: revised.stamp, billingStamp: revised.billingStamp, method: 'multibanco' };
  const reassign = await checkout.call(uid, '/orders', { ...replacement, discountCode: other.code });
  assert.equal(reassign.status, 409);
  assert.equal((await reassign.json()).error, 'discount-voucher-changed');
  assert.equal(f.data(other.name).status, 'available');
  assert.equal((await checkout.call(uid, '/orders', replacement)).status, 201);
  assert.equal((await checkout.call(uid, '/orders', replacement)).status, 200);
  assert.equal(f.data(first.name).orderId, id);
  assert.equal(f.data(first.name).userId, uid);
  assert.equal(f.data(paymentDoc(replaces)).replacementOrderId, id);
  assert.equal(f.data(paymentDoc(id)).discountVoucherHash, first.hash);
  assert.equal(checkout.sentToProvider.length, 2);
  assert.equal(checkout.sentToProvider[1].amountCents, quote.amountCents);
});

function actualSettlement(f, uid, { method = 'multibanco', kind = 'primary', index = 1, legacy = false,
  selection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } } = {}) {
  const orderId = orderIdFor(index), name = registrationName(uid), context = { uid, emailVerified: true };
  const previous = kind === 'primary' ? { ...pending(uid), selection }
    : reg(uid, { selection: { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: true, dinnerQuantity: 1 },
      payment: { status: 'paid', orderId: orderIdFor(900), method: 'multibanco', amountCents: 9500, reference: 'original-reference' },
      entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: true, dinnerQuantity: 1 },
      openSupplementaryOrderId: orderId, addOnOrderCount: 1 });
  if (legacy) delete previous.entitlements;
  const source = kind === 'primary' ? quotePrimary(selection, context, null, new Date('2026-11-05T12:00:00Z'))
    : quoteSupplementary(selection, context, { ...previous, id: `circ-2027-${uid}` }, new Date('2026-11-05T12:00:00Z'));
  const selected = source.selection, owned = previous.entitlements ?? previous.selection;
  const next = { ...previous, status: 'confirmed', fiscalPendingOrderId: orderId,
    entitlements: kind === 'primary' ? { congressMode: selected.congressMode === 'courses-only' ? '' : selected.congressMode,
      morningCourse: selected.morningCourse, afternoonCourse: selected.afternoonCourse, dinnerQuantity: selected.dinnerQuantity }
      : { congressMode: owned.congressMode, morningCourse: owned.morningCourse || selected.morningCourse,
        afternoonCourse: owned.afternoonCourse || selected.afternoonCourse, dinnerQuantity: owned.dinnerQuantity + selected.dinnerQuantity },
    ...(kind === 'primary' ? { payment: { orderId, status: 'paid', method, amountCents: source.amountCents, currency: 'EUR', reference: orderId } }
      : { paidSupplementaryOrderIds: [orderId], supplementaryPaidAmountCents: source.amountCents }) };
  const registrationVersion = f.put(name, previous).updateTime;
  const paymentName = `${root}/payments/${orderId}`, jobName = `${root}/documents/${orderId}`;
  const provider = method === 'bank_transfer' ? 'internal_bank_transfer' : 'eupago';
  const payment = { id: orderId, kind, eventId: 'circ-2027', environment: 'production', registrationId: `circ-2027-${uid}`,
    userId: uid, provider, method, status: 'paid', amountCents: source.amountCents, currency: 'EUR', quote: source,
    billingSnapshot: billing.customer, paidAt: '2026-11-05T12:00:00Z', transactionId: 'verified-transaction', fiscalStatus: 'pending' };
  const paymentVersion = f.put(paymentName, { ...payment, status: 'pending', paidAt: null, transactionId: null }).updateTime;
  const salesDocument = buildLivePaymentFR({ orderId, quote: source, billing, paymentDate: '2026-11-05', method,
    ...(method === 'bank_transfer' ? { bankAccountId: 2 } : {}) });
  const fiscalJob = { id: orderId, eventId: 'circ-2027', environment: 'production', userId: uid,
    registrationId: `circ-2027-${uid}`, type: 'invoice_receipt', orderKind: kind, provider: 'toconline', status: 'pending',
    amountCents: source.amountCents, paymentMethod: method, issuanceProtocol: 'claimed-v1', salesDocument };
  const input = { orderId, payment, paymentVersion, registration: next, registrationVersion, fiscalJob };
  if (method === 'bank_transfer') {
    const key = 'a'.repeat(64), decisionId = orderIdFor(index + 1000);
    input.creditClaim = { key, decisionId, kind: 'bank-credit-live', environment: 'production', eventId: 'circ-2027',
      orderId, creditReference: 'EXTERNAL-CREDIT-ENTRY', amountCents: source.amountCents, currency: 'EUR' };
    input.audit = { action: 'payment.bank-transfer.confirmed', orderId, registrationId: `circ-2027-${uid}`,
      actor: { uid: 'administrator', email: 'admin@example.test' }, details: { creditKey: key, amountCents: source.amountCents } };
  }
  const store = createCheckoutLiveStore({ projectId: 'circ-test', uid, token: 'in-memory-service', fetchImpl: f.fetchImpl, capacityEnabled: f.capacityEnabled });
  return { store, input, previous, paymentName, jobName, name };
}

test('actual primary settlement at full onsite capacity preserves paid money, previous rights and the frozen pending fiscal job', async () => {
  const f = fixture();
  for (let i = 0; i < 400; i++) f.put(registrationName(`onsite-${i}`), reg(`onsite-${i}`));
  const a = actualSettlement(f, 'paid-without-seat');
  const frozenJob = structuredClone(a.input.fiscalJob);
  const result = await a.store.confirmPrimaryPaid(a.input);
  assert.equal(result.allocated, false);
  assert.deepEqual(result.unavailable, ['onsite']);
  assert.deepEqual(f.data(a.paymentName), { ...a.input.payment, capacityStatus: 'review_required', capacityUnavailable: ['onsite'] });
  const held = f.data(a.name);
  assert.equal(held.status, a.previous.status);
  assert.deepEqual(held.entitlements, a.previous.entitlements);
  assert.equal(held.payment.status, 'paid');
  assert.equal(held.capacityReviewOrderId, a.input.orderId);
  assert.deepEqual(held.capacityUnavailable, ['onsite']);
  assert.deepEqual(f.data(a.jobName), frozenJob);
  assert.equal((await f.store.summary()).paid.onsite, 400);
  const durable = structuredClone([...f.documents]);
  await assert.rejects(a.store.confirmPrimaryPaid(a.input), error => error.code === 'conflict');
  assert.deepEqual([...f.documents], durable);
});

test('actual primary mixed bundle holds every new right if only the morning course is full', async () => {
  const f = fixture();
  for (let i = 0; i < 170; i++) f.put(registrationName(`morning-${i}`), reg(`morning-${i}`, { entitlements: { morningCourse: true } }));
  const a = actualSettlement(f, 'mixed-bundle', { selection: { profile: 'external', congressMode: 'onsite',
    morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 } });
  assert.equal((await a.store.confirmPrimaryPaid(a.input)).allocated, false);
  assert.deepEqual(f.data(a.name).entitlements, a.previous.entitlements);
  assert.equal(f.data(a.name).status, 'submitted');
  assert.equal(f.data(a.paymentName).status, 'paid');
  assert.equal(f.data(a.paymentName).capacityStatus, 'review_required');
  assert.deepEqual(f.data(a.jobName), a.input.fiscalJob);
  assert.equal(f.data(a.jobName).salesDocument.lines.length, 4);
  assert.deepEqual((await f.store.summary()).paid, { onsite: 0, morningCourse: 170, afternoonCourse: 0 });
});

test('suspended capacity settles paid congress and courses and a bank supplement without a quota scan', async () => {
  const f = fixture({ capacityEnabled: false, withLock: false });
  for (let i = 0; i < 400; i++) f.put(registrationName(`existing-${i}`), reg(`existing-${i}`, {
    entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true },
  }));
  const primary = actualSettlement(f, 'mixed-bundle', { index: 1, selection: { profile: 'external', congressMode: 'onsite',
    morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 } });
  const transfer = actualSettlement(f, 'bank-addition', { index: 2, method: 'bank_transfer', kind: 'supplementary',
    selection: { morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 } });
  const results = await Promise.all([primary.store.confirmPrimaryPaid(primary.input), transfer.store.confirmBankTransferPaid(transfer.input)]);
  assert.deepEqual(results.map(result => result.allocated), [true, true]);
  for (const settlement of [primary, transfer]) {
    assert.deepEqual(f.data(settlement.name), settlement.input.registration);
    assert.deepEqual(f.data(settlement.paymentName), settlement.input.payment);
    assert.deepEqual(f.data(settlement.jobName), settlement.input.fiscalJob);
  }
  assert.deepEqual(f.data(`${root}/settings/circ-bank-credit-live-${transfer.input.creditClaim.key}`), transfer.input.creditClaim);
  assert.equal(f.data(lockName), null);
  assert.equal(f.calls.some(call => call.url.endsWith(':runQuery') || call.body.documents?.includes(lockName)), false);
});

test('actual bank supplementary settlement holds full-course additions but retains the original paid registration, credit claim and audit', async () => {
  const f = fixture();
  for (let i = 0; i < 170; i++) f.put(registrationName(`morning-${i}`), reg(`morning-${i}`, { entitlements: { morningCourse: true } }));
  const a = actualSettlement(f, 'bank-addition', { method: 'bank_transfer', kind: 'supplementary',
    selection: { morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 } });
  assert.equal((await a.store.confirmBankTransferPaid(a.input)).allocated, false);
  const held = f.data(a.name);
  assert.equal(held.status, 'confirmed');
  assert.deepEqual(held.entitlements, a.previous.entitlements);
  assert.deepEqual(held.payment, a.previous.payment);
  assert.equal(held.capacityReviewOrderId, a.input.orderId);
  assert.deepEqual(held.capacityUnavailable, ['morningCourse']);
  assert.equal(f.data(a.paymentName).status, 'paid');
  assert.equal(f.data(a.paymentName).capacityStatus, 'review_required');
  assert.deepEqual(f.data(a.jobName), a.input.fiscalJob);
  assert.equal(f.data(a.jobName).salesDocument.payment_mechanism, 'TR');
  assert.equal(f.data(a.jobName).salesDocument.bank_account_id, 2);
  assert.deepEqual(f.data(`${root}/settings/circ-bank-credit-live-${a.input.creditClaim.key}`), a.input.creditClaim);
  assert.deepEqual(f.data(`${root}/auditLogs/bank-live-${a.input.orderId}-${a.input.creditClaim.decisionId}`),
    { ...a.input.audit, capacityStatus: 'review_required' });
  const durable = structuredClone([...f.documents]);
  await assert.rejects(a.store.confirmBankTransferPaid(a.input), error => error.code === 'conflict');
  assert.deepEqual([...f.documents], durable);
});

test('actual voucher redemption and PSP settlement serialize against the same final onsite place', async () => {
  let waiting = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const f = fixture({ commitHook: async () => { if (++waiting <= 2) { if (waiting === 2) release(); await ready; } } });
  for (let i = 0; i < 399; i++) f.put(registrationName(`existing-${i}`), reg(`existing-${i}`));
  const a = actualSettlement(f, 'psp-last-seat');
  const uid = 'voucher-last-seat', code = 'b'.repeat(32), voucherName = `${root}/companyVouchers/${code}`;
  const voucherVersion = f.put(voucherName, { status: 'available', eventId: 'circ-2027' }).updateTime;
  const registration = reg(uid, { voucherId: code, companyPurchaseId: 'company-purchase',
    payment: { status: 'paid', method: 'company_voucher', amountCents: 0, coveredAmountCents: 9500 } });
  const voucher = { status: 'redeemed', eventId: 'circ-2027', redeemedBy: uid, registrationId: `circ-2027-${uid}` };
  const voucherStore = createCheckoutLiveStore({ projectId: 'circ-test', uid, token: 'in-memory-service', fetchImpl: f.fetchImpl, capacityEnabled: f.capacityEnabled });
  const [psp, redeemed] = await Promise.allSettled([a.store.confirmPrimaryPaid(a.input),
    voucherStore.redeemCompanyVoucher({ code, registration, voucher, voucherVersion })]);
  assert.equal(psp.status, 'fulfilled');
  assert.equal(f.data(a.paymentName).status, 'paid');
  assert.equal((await f.store.summary()).paid.onsite, 400);
  if (psp.value.allocated) {
    assert.equal(redeemed.status, 'rejected');
    assert.equal(redeemed.reason.code, 'capacity-full');
    assert.equal(f.data(voucherName).status, 'available');
    assert.equal(f.data(registrationName(uid)), null);
  } else {
    assert.equal(redeemed.status, 'fulfilled');
    assert.equal(f.data(voucherName).status, 'redeemed');
    assert.equal(f.data(registrationName(uid)).payment.amountCents, 0);
    assert.equal(f.data(a.paymentName).capacityStatus, 'review_required');
    assert.equal(f.data(a.name).status, 'submitted');
  }
});

const organizerCode = '1abcdef00123456789abcdef01234567';
const organizerHash = createHash('sha256').update(organizerCode).digest('hex');
const organizerVoucherName = `${root}/organizerVouchers/${organizerHash}`;
const organizerDate = '2026-11-15T00:00:00.000Z';
function organizerRegistration(f, { uid = 'organizer', method = 'mbway', changes = {}, paymentChanges = {} } = {}) {
  const orderId = uid.endsWith('-b') ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111';
  const paymentName = `${root}/payments/${orderId}`, name = registrationName(uid);
  const reference = method === 'bank_transfer' ? orderId : method === 'stripe_card' ? 'cs_live_example' : '987654321';
  const provider = method === 'bank_transfer' ? 'internal_bank_transfer' : method === 'stripe_card' ? 'stripe' : 'eupago';
  const ledger = { orderId, status: 'paid', amountCents: 5500, currency: 'EUR', method, reference };
  const selection = { profile: 'uls', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
  const original = reg(uid, { payment: ledger, selection, documentCount: 1, ...changes });
  const payment = { id: orderId, kind: 'primary', registrationId: `circ-2027-${uid}`, userId: uid, eventId: 'circ-2027',
    environment: 'production', status: 'paid', transactionId: 'transaction', paidAt: organizerDate,
    amountCents: 5500, currency: 'EUR', method, provider, reference, quote: { selection }, ...paymentChanges };
  f.put(name, original);
  f.put(paymentName, payment);
  return { original, payment, paymentName, name };
}

function organizerRedemption(f, { start = organizerDate } = {}) {
  f.put(organizerVoucherName, { eventId: 'circ-2027', batchId: 'circ-2027-organizers-01', index: 1,
    status: 'available', createdBy: 'admin', createdAt: '2026-11-14T12:34:56.000Z' });
  const api = createOrganizerVoucherLiveApi({ verify: async token => ({ sub: token, email_verified: true }),
    tokenProvider: async () => 'service', storeFactory: args => createCheckoutLiveStore({ ...args, fetchImpl: f.fetchImpl, capacityEnabled: f.capacityEnabled }), now: () => start });
  return (uid = 'organizer', code = ` ${organizerCode.toUpperCase().match(/.{4}/g).join('-')} `) => api(new Request('https://circ.test/api/checkout/live/organizer-voucher/redeem', {
    method: 'POST', headers: { Origin: 'https://circ.test', Authorization: `Bearer ${uid}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }), { FIREBASE_PROJECT_ID: 'circ-test' });
}

test('an organizer voucher grants both courses and one additional dinner without changing primary payment or invoice', async () => {
  for (const method of ['mbway', 'multibanco', 'bank_transfer', 'stripe_card']) {
    const f = fixture();
    const redeem = organizerRedemption(f);
    const { original, name, payment, paymentName } = organizerRegistration(f, { method,
      changes: { entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 2 } } });
    const response = await redeem();
    assert.deepEqual(await response.json(), { registrationId: 'circ-2027-organizer', duplicate: false }, method);
    assert.equal(response.status, 200);
    assert.deepEqual(f.data(paymentName), payment);
    assert.deepEqual(f.data(name), { ...original, organizerVoucherRedeemed: true, updatedAt: organizerDate,
      entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 3 } });
    assert.equal(f.data(organizerVoucherName).status, 'redeemed');
    assert.equal(f.data(organizerVoucherName).redeemedBy, 'organizer');
    assert.equal(f.data(organizerVoucherName).createdBy, 'admin');
    assert.deepEqual((await f.store.summary()).paid, { onsite: 1, morningCourse: 1, afternoonCourse: 1 });
    assert.deepEqual(await (await redeem()).json(), { registrationId: 'circ-2027-organizer', duplicate: true });
    assert.equal(f.data(name).entitlements.dinnerQuantity, 3);
  }
});

test('the organizer voucher remains available before opening, with an incompatible registration, or with either course full', async () => {
  for (const [expected, option, change] of [
    ['organizer/registration-not-open', { start: '2026-11-14T23:59:59.999Z' }, {}],
    ['organizer/paid-registration-required', {}, { paymentChanges: { status: 'pending' } }],
    ['organizer/paid-registration-required', {}, { paymentChanges: { environment: 'sandbox' } }],
    ['organizer/paid-registration-required', {}, { changes: { status: 'submitted' } }],
    ['organizer/paid-registration-required', {}, { changes: { isTest: true } }],
    ['organizer/supplementary-pending', {}, { changes: { openSupplementaryOrderId: 'pending-addition' } }],
    ['organizer/course-already-owned', {}, { changes: { entitlements: { congressMode: 'onsite', morningCourse: true } } }],
    ['organizer/capacity-full', {}, {}],
  ]) {
    const f = fixture();
    if (expected === 'organizer/capacity-full') {
      for (let i = 0; i < 170; i++) f.put(registrationName(`afternoon-${i}`), reg(`afternoon-${i}`, { entitlements: { afternoonCourse: true } }));
    }
    const redeem = organizerRedemption(f, option);
    const { original, name } = organizerRegistration(f, change);
    const response = await redeem();
    assert.equal((await response.json()).error, expected);
    assert.deepEqual(f.data(name), original);
    assert.equal(f.data(organizerVoucherName).status, 'available');
  }
});

test('two paid organizers cannot redeem the same voucher concurrently during suspension', async () => {
  let waiting = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const f = fixture({ capacityEnabled: false, commitHook: async () => { if (++waiting <= 2) { if (waiting === 2) release(); await ready; } } });
  const redeem = organizerRedemption(f);
  const a = organizerRegistration(f, { uid: 'organizer-a' });
  const b = organizerRegistration(f, { uid: 'organizer-b' });
  const responses = await Promise.all([redeem('organizer-a'), redeem('organizer-b')]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal([a, b].filter(person => f.data(person.name).organizerVoucherRedeemed === true).length, 1);
  assert.deepEqual((await f.store.summary()).paid, { onsite: 2, morningCourse: 1, afternoonCourse: 1 });
  const retry = await redeem(f.data(organizerVoucherName).redeemedBy);
  assert.equal((await retry.json()).duplicate, true);
});

test('actual full-course settlement preserves all paid legacy selection rights when entitlements are absent', async () => {
  const f = fixture();
  for (let i = 0; i < 170; i++) f.put(registrationName(`morning-${i}`), reg(`morning-${i}`, { entitlements: { morningCourse: true } }));
  const a = actualSettlement(f, 'legacy-addition', { kind: 'supplementary', legacy: true,
    selection: { morningCourse: true, afternoonCourse: false, dinnerQuantity: 2 } });
  assert.equal(a.previous.entitlements, undefined);
  assert.equal((await a.store.confirmPrimaryPaid(a.input)).allocated, false);
  const held = f.data(a.name);
  assert.equal(held.status, 'confirmed');
  assert.deepEqual(held.entitlements, { congressMode: 'onsite', morningCourse: false, afternoonCourse: true, dinnerQuantity: 1 });
  assert.deepEqual(held.selection, a.previous.selection);
  assert.deepEqual(held.payment, a.previous.payment);
  assert.equal(held.capacityReviewOrderId, a.input.orderId);
  assert.equal(f.data(a.paymentName).status, 'paid');
  assert.equal(f.data(a.paymentName).capacityStatus, 'review_required');
  assert.deepEqual(f.data(a.jobName), a.input.fiscalJob);
  assert.deepEqual((await f.store.summary()).paid, { onsite: 1, morningCourse: 170, afternoonCourse: 1 });
});
