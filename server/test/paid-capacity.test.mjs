import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPACITY_LIMITS, paidFootprint, selectionFootprint, capacitySummary, capacityDecision } from '../payments/paid-capacity.mjs';

const zero = { onsite: 0, morningCourse: 0, afternoonCourse: 0 };
const registered = (userId = 'participant', changes = {}) => ({
  id: `circ-2027-${userId}`, registrationKey: `circ-2027:${userId}`, userId, eventId: 'circ-2027',
  primaryRegistration: true, isTest: false, testMode: false, status: 'confirmed',
  payment: { status: 'paid', amountCents: 9500, currency: 'EUR', method: 'multibanco' },
  selection: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
  entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
  ...changes,
});
const summaryAt = (paid = {}) => ({ limits: { ...CAPACITY_LIMITS }, paid: { ...zero, ...paid }, remaining: {} });

test('capacity limits apply only to onsite congress and the two courses', () => {
  assert.deepEqual(CAPACITY_LIMITS, { onsite: 400, morningCourse: 170, afternoonCourse: 170 });
  assert.equal(Object.isFrozen(CAPACITY_LIMITS), true);
  assert.deepEqual(selectionFootprint({ congressMode: 'virtual', dinnerQuantity: 999 }), zero);
  assert.deepEqual(selectionFootprint({ congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 }),
    { onsite: 1, morningCourse: 1, afternoonCourse: 1 });
  assert.deepEqual(selectionFootprint({ congressMode: 'courses-only', morningCourse: true }), { ...zero, morningCourse: 1 });
});

test('virtual attendees still consume their paid course entitlements', () => {
  assert.deepEqual(paidFootprint(registered('virtual', { entitlements: { congressMode: 'virtual', morningCourse: true } })),
    { ...zero, morningCourse: 1 });
});

test('only confirmed paid real canonical registrations occupy places', () => {
  assert.deepEqual(paidFootprint(registered()), { ...zero, onsite: 1 });
  for (const changes of [
    { status: 'submitted' }, { status: 'cancelled' }, { payment: { status: 'pending' } },
    { payment: { status: 'awaiting_confirmation' } }, { payment: { status: 'refunded' } },
    { payment: { status: 'review_required' } }, { isTest: true }, { testMode: true },
    { isTest: undefined }, { testMode: undefined }, { primaryRegistration: false },
    { eventId: 'another-event' }, { id: 'test-participant' }, { userId: 'other' },
    { registrationKey: 'circ-2027:other' }, { registrationArchiveId: 'archive-id' }, { registrationArchivedAt: '2026-11-05T10:00:00Z' },
  ]) assert.deepEqual(paidFootprint(registered('participant', changes)), zero, JSON.stringify(changes));
  assert.deepEqual(paidFootprint(null), zero);
});

test('store data without an ID requires the matching canonical key', () => {
  const r = registered();
  delete r.id;
  assert.deepEqual(paidFootprint(r), { ...zero, onsite: 1 });
  delete r.registrationKey;
  assert.deepEqual(paidFootprint(r), zero);
  assert.deepEqual(paidFootprint(registered('participant', { registrationKey: undefined })), { ...zero, onsite: 1 });
});

test('voucher registrations occupy a place even though the participant amount is zero', () => {
  const r = registered('voucher', { voucherId: 'code', companyPurchaseId: 'purchase',
    payment: { status: 'paid', method: 'company_voucher', amountCents: 0, coveredAmountCents: 9500 } });
  assert.deepEqual(paidFootprint(r), { ...zero, onsite: 1 });
});

test('paid registrations occupy places while their fiscal document is pending or under review', () => {
  for (const fiscalStatus of ['pending', 'pending_authorization', 'issuing', 'review_required', 'outcome_unknown', 'issued']) {
    assert.deepEqual(paidFootprint(registered('participant', { fiscalPendingOrderId: 'order',
      payment: { status: 'paid', fiscalStatus } })), { ...zero, onsite: 1 });
  }
});

test('entitlements are authoritative and selection is a fallback only when absent', () => {
  const r = registered('participant', { selection: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true },
    entitlements: { congressMode: 'virtual', afternoonCourse: true } });
  assert.deepEqual(paidFootprint(r), { ...zero, afternoonCourse: 1 });
  delete r.entitlements;
  assert.deepEqual(paidFootprint(r), { onsite: 1, morningCourse: 1, afternoonCourse: 1 });
  assert.deepEqual(selectionFootprint({ congressMode: 'virtual', morningCourse: 'true', afternoonCourse: 1 }), zero);
});

test('summary counts each active participant once and ignores pending and historical records', () => {
  const records = [registered('onsite'), registered('courses', { entitlements: { morningCourse: true, afternoonCourse: true } }),
    registered('voucher', { payment: { status: 'paid', method: 'company_voucher', amountCents: 0 } }),
    registered('pending', { payment: { status: 'pending' } }), registered('archived', { registrationArchiveId: 'archive' })];
  assert.deepEqual(capacitySummary(records), { limits: { ...CAPACITY_LIMITS },
    paid: { onsite: 2, morningCourse: 1, afternoonCourse: 1 }, remaining: { onsite: 398, morningCourse: 169, afternoonCourse: 169 } });
});

test('summary starts empty and reports zero remaining if existing paid records exceed a limit', () => {
  assert.deepEqual(capacitySummary([]), { limits: { ...CAPACITY_LIMITS }, paid: zero, remaining: { ...CAPACITY_LIMITS } });
  const records = Array.from({ length: 401 }, (_, i) => registered(`person-${i}`));
  assert.equal(capacitySummary(records).paid.onsite, 401);
  assert.equal(capacitySummary(records).remaining.onsite, 0);
});

test('the last place is available but a subsequent confirmation is rejected', () => {
  const nextRegistration = registered();
  assert.deepEqual(capacityDecision(summaryAt({ onsite: 399 }), { nextRegistration }),
    { allocated: true, unavailable: [], delta: { ...zero, onsite: 1 } });
  assert.deepEqual(capacityDecision(summaryAt({ onsite: 400 }), { nextRegistration }),
    { allocated: false, unavailable: ['onsite'], delta: { ...zero, onsite: 1 } });
  for (const key of ['morningCourse', 'afternoonCourse']) {
    const next = registered('course', { entitlements: { [key]: true } });
    assert.equal(capacityDecision(summaryAt({ [key]: 169 }), { nextRegistration: next }).allocated, true);
    assert.deepEqual(capacityDecision(summaryAt({ [key]: 170 }), { nextRegistration: next }).unavailable, [key]);
  }
});

test('a bundle is declined as a whole when any requested place is unavailable', () => {
  const selection = { congressMode: 'onsite', morningCourse: true, afternoonCourse: true };
  assert.deepEqual(capacityDecision(summaryAt({ morningCourse: 170 }), { selection }),
    { allocated: false, unavailable: ['morningCourse'], delta: { onsite: 1, morningCourse: 1, afternoonCourse: 1 } });
  assert.deepEqual(capacityDecision(summaryAt({ onsite: 400, morningCourse: 170, afternoonCourse: 170 }), { selection }).unavailable,
    ['onsite', 'morningCourse', 'afternoonCourse']);
});

test('supplementary confirmation checks only newly paid rights and preserves the existing onsite place', () => {
  const previousRegistration = registered();
  const nextRegistration = registered('participant', { entitlements: { congressMode: 'onsite', morningCourse: true } });
  assert.deepEqual(capacityDecision(summaryAt({ onsite: 400, morningCourse: 169 }), { previousRegistration, nextRegistration }),
    { allocated: true, unavailable: [], delta: { ...zero, morningCourse: 1 } });
  assert.deepEqual(capacityDecision(summaryAt({ onsite: 400, morningCourse: 170 }), { previousRegistration, nextRegistration }).unavailable,
    ['morningCourse']);
});

test('duplicate confirmations and fiscal-only changes consume no additional capacity', () => {
  const previousRegistration = registered('participant', { entitlements: { congressMode: 'onsite', morningCourse: true } });
  const nextRegistration = { ...previousRegistration, documentCount: 1, fiscalPendingOrderId: null };
  assert.deepEqual(capacityDecision(summaryAt({ onsite: 400, morningCourse: 170 }), { previousRegistration, nextRegistration }),
    { allocated: true, unavailable: [], delta: zero });
});

test('refunds and archive removal release the previous rights even if existing usage exceeds the limit', () => {
  const previousRegistration = registered('participant', { entitlements: { congressMode: 'onsite', morningCourse: true } });
  const expected = { allocated: true, unavailable: [], delta: { onsite: -1, morningCourse: -1, afternoonCourse: 0 } };
  const full = summaryAt({ onsite: 401, morningCourse: 171 });
  assert.deepEqual(capacityDecision(full, { previousRegistration, nextRegistration: { ...previousRegistration,
    status: 'cancelled', payment: { status: 'refunded' } } }), expected);
  assert.deepEqual(capacityDecision(full, { previousRegistration, nextRegistration: null }), expected);
  assert.deepEqual(capacityDecision(full, { previousRegistration: null, nextRegistration: null }).delta, zero);
});

test('prepayment checks never mutate the summary or reserve places', () => {
  const summary = summaryAt({ onsite: 399 });
  const selection = { congressMode: 'onsite' };
  const before = structuredClone({ summary, selection });
  assert.equal(capacityDecision(summary, { selection }).allocated, true);
  assert.equal(capacityDecision(summary, { selection }).allocated, true);
  assert.deepEqual({ summary, selection }, before);
  assert.equal(capacityDecision(summaryAt({ onsite: 400 }), { selection: { congressMode: 'virtual', dinnerQuantity: 20 } }).allocated, true);
});

test('capacity decisions use fixed limits and verified counts rather than mutable remaining or limits hints', () => {
  const summary = { limits: { onsite: 100000 }, remaining: { onsite: 100000 }, paid: { ...zero, onsite: 400 } };
  assert.equal(capacityDecision(summary, { selection: { congressMode: 'onsite' } }).allocated, false);
  assert.throws(() => capacitySummary(null), /invalid-registrations/);
  for (const summary of [null, {}, { paid: {} }, summaryAt({ onsite: -1 }), summaryAt({ onsite: '399' }), summaryAt({ onsite: Infinity })]) {
    assert.throws(() => capacityDecision(summary, { selection: { congressMode: 'onsite' } }), /invalid-summary/);
  }
});
