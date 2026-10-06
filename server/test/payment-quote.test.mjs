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
test('no primary quote without a checked absence or verified login', () => {
  assert.throws(() => quote(selection, context, {}), /registration-exists/);
  assert.throws(() => quotePrimary(selection, context, undefined), /unchecked/);
  assert.throws(() => quote(selection, { ...context, emailVerified: false }), /sign-in/);
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
