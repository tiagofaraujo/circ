import test from 'node:test';
import assert from 'node:assert/strict';
import { quotePrimary, quoteSupplementary } from '../payments/quote.mjs';

const now = new Date('2026-11-15T12:00:00Z');
const context = { uid: 'participant', emailVerified: true, profileName: 'Pessoa Exemplo' };
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: true, dinnerQuantity: 2 };
const quote = (s = selection, c = context, existing = null, date = now) => quotePrimary(s, c, existing, date);
const registration = { id: 'circ-2027-participant', eventId: 'circ-2027', userId: 'participant',
  status: 'confirmed', payment: { status: 'paid', method: 'company_voucher', amountCents: 0 },
  selection: { profile: 'external', congressMode: 'onsite' }, entitlements: { morningCourse: true, dinnerQuantity: 1 } };

test('server derives amount, profile affiliation and rate period; ignores browser prices', () => {
  const q = quote({ ...selection, amountCents: 1, total: 0, period: 'regular', courseAffiliation: 'uls' });
  assert.equal(q.amountCents, 19000);
  assert.equal(q.ratePeriod, 'early');
  assert.equal(q.selection.courseAffiliation, 'external');
});
test('early-rate boundary uses the existing catalogue date', () => {
  assert.equal(quote(selection, context, null, new Date('2027-01-31T23:59:59Z')).amountCents, 19000);
  assert.equal(quote(selection, context, null, new Date('2027-02-01T00:00:00Z')).amountCents, 24500);
});
test('organisation discounts use integer rounding and affect only congress admission', () => {
  const full = quote();
  const percentage = quotePrimary(selection, context, null, now, { type: 'percentage', value: 3333 });
  assert.deepEqual(percentage.discount, { type: 'percentage', value: 3333, amountCents: 3166 });
  assert.equal(percentage.amountCents, 15834);
  assert.deepEqual(percentage.lines[0], { code: 'congress-onsite', quantity: 1, unitAmountCents: 6334, amountCents: 6334 });
  assert.deepEqual(percentage.lines.slice(1), full.lines.slice(1));
  assert.deepEqual(percentage.selection, full.selection);
  assert.equal(Object.hasOwn(full, 'discount'), false);
  const virtual = quotePrimary({ ...selection, congressMode: 'virtual' }, context, null, now, { type: 'fixed', value: 1375 });
  assert.deepEqual(virtual.discount, { type: 'fixed', value: 1375, amountCents: 1375 });
  assert.equal(virtual.lines[0].unitAmountCents, 4625);
  assert.deepEqual(virtual.lines.slice(1), full.lines.slice(1));
});
test('ordinary discounts require a positive admission price and a payable balance of at least one euro', () => {
  const onsiteOnly = { profile: 'external', congressMode: 'onsite' };
  for (const discount of [null, { type: 'unsupported', value: 10 }, { type: 'percentage', value: 10000 },
    { type: 'percentage', value: 1.5 }, { type: 'fixed', value: '100' }]) {
    assert.throws(() => quotePrimary(onsiteOnly, context, null, now, discount), /invalid-discount/);
  }
  for (const value of [9401, 9500, 9501]) {
    assert.throws(() => quotePrimary(onsiteOnly, context, null, now, { type: 'fixed', value }), /discount-not-applicable/);
  }
  assert.equal(quotePrimary(onsiteOnly, context, null, now, { type: 'fixed', value: 9400 }).amountCents, 100);
  assert.equal(quotePrimary(selection, context, null, now, { type: 'fixed', value: 9499 }).lines[0].unitAmountCents, 1);
  assert.throws(() => quotePrimary({ ...selection, congressMode: 'courses-only' }, context, null, now,
    { type: 'fixed', value: 100 }), /discount-not-applicable/);
});
test('fixed €55 vouchers cover verified early ULS onsite admission while priced extras remain chargeable', () => {
  const base = { userId: context.uid, eventId: 'circ-2027', mec: '123', nameKey: 'PESSOA EXEMPLO', method: 'mec-name-match' };
  const verified = { ...context, uls: { ...base, status: 'matched' }, claim: base,
    roster: { active: true, eventId: 'circ-2027', nameKey: base.nameKey } };
  const onsite = { profile: 'uls', congressMode: 'onsite' };
  const discount = { type: 'fixed', value: 5500 };
  const fullyCovered = quotePrimary(onsite, verified, null, now, discount);
  assert.equal(fullyCovered.amountCents, 0);
  assert.deepEqual(fullyCovered.discount, { ...discount, amountCents: 5500 });
  assert.deepEqual(fullyCovered.lines, [{ code: 'congress-onsite', quantity: 1, unitAmountCents: 0, amountCents: 0 }]);
  const withExtras = quotePrimary({ ...onsite, morningCourse: true, afternoonCourse: true, dinnerQuantity: 1 }, verified, null, now, discount);
  assert.equal(withExtras.amountCents, 7000);
  assert.deepEqual(withExtras.lines.map(line => line.amountCents), [0, 2000, 2000, 3000]);
  const regular = quotePrimary(onsite, verified, null, new Date('2027-02-01T00:00:00Z'), discount);
  assert.equal(regular.amountCents, 3500);
  assert.throws(() => quotePrimary(onsite, context, null, now, discount), /uls-not-verified/);
  assert.throws(() => quotePrimary(onsite, verified, null, now, { ...discount, value: 5501 }), /discount-not-applicable/);
  assert.throws(() => quotePrimary({ ...onsite, congressMode: 'virtual' }, verified, null, now, { ...discount, value: 6000 }), /discount-not-applicable/);
});
test('no primary quote without a checked absence or verified login', () => {
  assert.throws(() => quote(selection, context, {}), /registration-exists/);
  assert.throws(() => quotePrimary(selection, context, undefined), /unchecked/);
  assert.throws(() => quote(selection, { ...context, emailVerified: false }), /sign-in/);
});
test('the organizer code covers both courses and one dinner in the same verified ULS onsite quote', () => {
  const identity = { userId: context.uid, eventId: 'circ-2027', mec: '123', nameKey: 'PESSOA EXEMPLO', method: 'mec-name-match' };
  const verified = { ...context, uls: { ...identity, status: 'matched' }, claim: identity,
    roster: { active: true, eventId: 'circ-2027', nameKey: identity.nameKey } };
  const onsite = { profile: 'uls', congressMode: 'onsite' };
  const included = quotePrimary(onsite, verified, null, now, undefined, true);
  assert.equal(included.amountCents, 5500);
  assert.deepEqual(included.organizerBenefit, { amountCents: 7000 });
  assert.deepEqual(included.selection, { ...onsite, courseAffiliation: 'uls', morningCourse: true, afternoonCourse: true, dinnerQuantity: 1 });
  assert.deepEqual(included.lines.map(line => [line.code, line.amountCents]), [
    ['congress-onsite', 5500], ['course-morning', 0], ['course-afternoon', 0],
  ]);
  const extraDinners = quotePrimary({ ...onsite, dinnerQuantity: 3 }, verified, null, now, undefined, true);
  assert.equal(extraDinners.selection.dinnerQuantity, 3);
  assert.equal(extraDinners.amountCents, 11500);
  assert.deepEqual(extraDinners.lines.at(-1), { code: 'dinner', quantity: 2, unitAmountCents: 3000, amountCents: 6000 });
  const afterTariffChange = quotePrimary(onsite, verified, null, new Date('2027-02-01T12:00:00Z'), undefined, true);
  assert.equal(afterTariffChange.amountCents, 9000);
  assert.throws(() => quotePrimary(onsite, context, null, now, undefined, true), /uls-not-verified/);
  assert.throws(() => quotePrimary({ ...onsite, congressMode: 'virtual' }, verified, null, now, undefined, true), /organizer-voucher-not-applicable/);
  assert.throws(() => quotePrimary(selection, verified, null, now, undefined, true), /organizer-voucher-not-applicable/);
  assert.throws(() => quotePrimary(onsite, verified, null, now, { type: 'fixed', value: 5500 }, true), /organizer-voucher-not-applicable/);
});
test('rejects malformed selections instead of coercing them into prices', () => {
  for (const dinnerQuantity of [-1, 1.5, '2', Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => quote({ ...selection, dinnerQuantity }));
  }
  assert.throws(() => quote({ ...selection, morningCourse: 'false' }));
  assert.throws(() => quote({ ...selection, profile: '__proto__' }));
  assert.throws(() => quote({ profile: 'external', congressMode: 'courses-only' }), /course-required/);
});
test('student approval is bound to participant, event, year and exact profile', () => {
  const student = { userId: context.uid, eventId: 'circ-2027', academicYear: '2026/2027',
    status: 'approved', profileName: context.profileName };
  const s = { profile: 'student', congressMode: 'onsite', afternoonCourse: true };
  assert.equal(quote(s, { ...context, student }).amountCents, 9500);
  for (const invalid of [{ status: 'rejected' }, { userId: 'other' }, { profileName: 'Outro Nome' }, { academicYear: '2025/2026' }]) {
    assert.throws(() => quote(s, { ...context, student: { ...student, ...invalid } }), /student-not-approved/);
  }
});
test('ULS discount requires eligibility, unique claim and active roster together', () => {
  const base = { userId: context.uid, eventId: 'circ-2027', mec: '123', nameKey: 'PESSOA EXEMPLO', method: 'mec-name-match' };
  const c = { ...context, uls: { ...base, status: 'matched' }, claim: base,
    roster: { active: true, eventId: 'circ-2027', nameKey: base.nameKey } };
  const s = { ...selection, profile: 'uls' };
  assert.equal(quote(s, c).amountCents, 13500);
  assert.throws(() => quote(s, { ...c, claim: { ...base, userId: 'other' } }), /uls-not-verified/);
  assert.throws(() => quote(s, { ...c, roster: { ...c.roster, active: false } }), /uls-not-verified/);
});
test('voucher holder pays only for additional items; quote does not grant access', () => {
  const before = structuredClone(registration);
  const q = quoteSupplementary({ afternoonCourse: true, dinnerQuantity: 2 }, context, registration, now);
  assert.equal(q.amountCents, 9500);
  assert.deepEqual(q.lines.map(l => l.code), ['course-afternoon', 'dinner']);
  assert.deepEqual(registration, before);
  assert.throws(() => quoteSupplementary({ morningCourse: true }, context, registration, now), /already-owned/);
});
test('unpaid, foreign, test or cancelled registrations cannot buy supplements', () => {
  for (const change of [{ payment: { status: 'pending' } }, { userId: 'other' }, { isTest: true }, { status: 'cancelled' }]) {
    assert.throws(() => quoteSupplementary({ dinnerQuantity: 1 }, context, { ...registration, ...change }, now), /paid-registration-required/);
  }
  assert.throws(() => quoteSupplementary({}, context, registration, now), /invalid-amount/);
  assert.throws(() => quoteSupplementary({ congressMode: 'onsite' }, context, registration, now), /invalid-addition/);
});
