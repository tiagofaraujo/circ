import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaidCapacityStore } from '../payments/paid-capacity-store.mjs';
import { createCheckoutLiveStore } from '../payments/checkout-live-store.mjs';
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
function fixture({ withLock = true, commitHook = null } = {}) {
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
      if (!transactions.has(body.transaction)) throw unavailable();
      await commitHook?.({ body, documents, data, put, calls });
      // Check every write before applying any. In particular every admission
      // and rejection shares the lock CAS, even for different participants.
      for (const write of body.writes) assertPrecondition(write);
      const writeResults = body.writes.map(write => {
        if (write.delete) { documents.delete(write.delete); return {}; }
        const stored = put(write.update.name, decode({ mapValue: { fields: write.update.fields } }));
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
    try { return Response.json(await call(url, options.method, options.body ? JSON.parse(options.body) : undefined)); }
    catch (error) {
      if (error.code === 'conflict') return new Response('', { status: 409 });
      if (error.code === 'storage_unavailable') return new Response('', { status: 503 });
      throw error;
    }
  };
  return { documents, calls, put, data, fetchImpl, store: createPaidCapacityStore({ root, call, fields, decode }) };
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
  const store = createCheckoutLiveStore({ projectId: 'circ-test', uid, token: 'in-memory-service', fetchImpl: f.fetchImpl });
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
  const voucherStore = createCheckoutLiveStore({ projectId: 'circ-test', uid, token: 'in-memory-service', fetchImpl: f.fetchImpl });
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
