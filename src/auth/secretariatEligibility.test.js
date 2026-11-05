import { admissionEntitlements, canAttendEventDay, canReceiveCredential } from './secretariatEligibility';

const registration = { id: 'circ-2027-participant', eventId: 'circ-2027', userId: 'participant',
  registrationKey: 'circ-2027:participant', primaryRegistration: true, isTest: false, testMode: false,
  status: 'confirmed', payment: { status: 'paid' },
  selection: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true },
  entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: false } };

test('an explicit empty grant cannot fall back to the requested onsite congress or courses', () => {
  for (const entitlements of [{ congressMode: '', morningCourse: false, afternoonCourse: false }, {}]) {
    const held = { ...registration, entitlements, capacityReviewOrderId: 'held-primary' };
    expect(admissionEntitlements(held)).toEqual({ congressMode: '', morningCourse: false, afternoonCourse: false });
    expect(canAttendEventDay(held, '2027-04-09')).toBe(false);
    expect(canAttendEventDay(held, '2027-04-08')).toBe(false);
    expect(canReceiveCredential(held)).toBe(false);
  }
});
test('a held supplement preserves granted congress and morning access without granting the requested afternoon', () => {
  const held = { ...registration, capacityReviewOrderId: 'held-supplement' };
  expect(admissionEntitlements(held)).toEqual({ congressMode: 'onsite', morningCourse: true, afternoonCourse: false });
  expect(canAttendEventDay(held, '2027-04-08')).toBe(true);
  expect(canAttendEventDay(held, '2027-04-09')).toBe(true);
  expect(canReceiveCredential(held)).toBe(true);
});
test('a confirmed paid legacy registration without a grant map retains its existing selection rights', () => {
  const legacy = { ...registration, entitlements: undefined };
  expect(canAttendEventDay(legacy, '2027-04-10')).toBe(true);
  expect(admissionEntitlements(legacy).afternoonCourse).toBe(true);
});
test('a canonical registration key can identify a valid paid registration when its document ID is absent', () => {
  const keyed = { ...registration, id: undefined, entitlements: undefined };
  expect(canAttendEventDay(keyed, '2027-04-09')).toBe(true);
  expect(canReceiveCredential(keyed)).toBe(true);
});
test.each([
  { primaryRegistration: undefined }, { primaryRegistration: false }, { isTest: undefined }, { testMode: undefined },
  { userId: undefined }, { userId: '' }, { userId: 'invalid/user' }, { userId: 'x'.repeat(129) },
  { id: 'noncanonical-id' }, { id: null }, { registrationKey: 'circ-2027:someone-else' },
  { id: undefined, registrationKey: undefined }, { id: undefined, registrationKey: 'circ-2027:someone-else' },
])('noncanonical or incompletely classified paid rows cannot grant admission (%j)', change => {
  for (const entitlements of [registration.entitlements, undefined]) {
    const invalid = { ...registration, ...change, entitlements };
    expect(canAttendEventDay(invalid, '2027-04-08')).toBe(false);
    expect(canAttendEventDay(invalid, '2027-04-09')).toBe(false);
    expect(canReceiveCredential(invalid)).toBe(false);
  }
});
test.each([
  { status: 'submitted' }, { status: 'cancelled' }, { payment: { status: 'pending' } }, { payment: { status: 'refunded' } },
  { archived: true }, { registrationArchiveId: 'archive' }, { registrationArchivedAt: '2026-11-05' },
  { isTest: true }, { testMode: true }, { eventId: 'other-event' },
])('inactive or unconfirmed registrations have no admission rights (%j)', change => {
  const invalid = { ...registration, ...change };
  expect(canAttendEventDay(invalid, '2027-04-08')).toBe(false);
  expect(canAttendEventDay(invalid, '2027-04-09')).toBe(false);
  expect(canReceiveCredential(invalid)).toBe(false);
});
test('virtual-only attendance does not authorize physical admission or a physical credential', () => {
  const virtual = { ...registration, entitlements: { congressMode: 'virtual', morningCourse: false, afternoonCourse: false } };
  expect(canAttendEventDay(virtual, '2027-04-09')).toBe(false);
  expect(canReceiveCredential(virtual)).toBe(false);
  expect(canAttendEventDay({ ...virtual, entitlements: { ...virtual.entitlements, morningCourse: true } }, '2027-04-08')).toBe(true);
});
