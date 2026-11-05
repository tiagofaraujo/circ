import { getFirebaseFirestore } from './firebaseClient';
import { attendanceKey, updateCredentialDelivery, updateParticipantCheckIn } from './adminOperationsStore';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));

const operator = { uid: 'staff', email: 'staff@example.test' };
const registration = { id: 'circ-2027-participant', eventId: 'circ-2027', userId: 'participant', primaryRegistration: true,
  isTest: false, testMode: false, status: 'confirmed', payment: { status: 'paid' },
  selection: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true },
  entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: false } };
const primaryHold = { ...registration, status: 'submitted', capacityReviewOrderId: 'held-primary',
  entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false } };
const actions = [
  ['course check-in', (value, enabled = true) => updateParticipantCheckIn(operator, value, '2027-04-08', enabled)],
  ['onsite check-in', (value, enabled = true) => updateParticipantCheckIn(operator, value, '2027-04-09', enabled)],
  ['credential delivery', (value, enabled = true) => updateCredentialDelivery(operator, value, enabled)],
];
let current, exists, transaction, db;
const registrationRef = { path: 'registrations/circ-2027-participant' }, auditRef = { path: 'auditLogs/audit' };
beforeEach(() => {
  current = registration; exists = true;
  transaction = { get: jest.fn(async () => ({ exists, data: () => current })), update: jest.fn(), set: jest.fn() };
  db = { collection: jest.fn(name => ({ doc: () => name === 'registrations' ? registrationRef : auditRef })),
    runTransaction: jest.fn(work => work(transaction)), batch: jest.fn() };
  getFirebaseFirestore.mockReturnValue(db);
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } };
});
test.each(actions)('a held primary blocks a new %s even when the UI supplies stale eligible rights', async (_, perform) => {
  current = primaryHold;
  await expect(perform(registration)).rejects.toThrow('secretariat/admission-not-allowed');
  expect(transaction.get).toHaveBeenCalledWith(registrationRef);
  expect(transaction.update).not.toHaveBeenCalled(); expect(transaction.set).not.toHaveBeenCalled(); expect(db.batch).not.toHaveBeenCalled();
});
test.each([
  ['unclassified', { isTest: undefined }],
  ['noncanonical owner', { userId: 'someone-else' }],
  ['noncanonical key', { registrationKey: 'circ-2027:someone-else' }],
])('a fresh %s snapshot blocks attendance and credentials despite eligible caller data', async (_, change) => {
  current = { ...registration, ...change };
  await expect(updateParticipantCheckIn(operator, registration, '2027-04-09', true)).rejects.toThrow('secretariat/admission-not-allowed');
  await expect(updateCredentialDelivery(operator, registration, true)).rejects.toThrow('secretariat/admission-not-allowed');
  expect(transaction.update).not.toHaveBeenCalled(); expect(transaction.set).not.toHaveBeenCalled();
});
test.each(actions)('a held supplement keeps its granted old rights for %s', async (_, perform) => {
  current = { ...registration, capacityReviewOrderId: 'held-supplement' };
  await perform(current);
  expect(db.runTransaction).toHaveBeenCalledTimes(1);
  expect(transaction.update).toHaveBeenCalledTimes(1); expect(transaction.set).toHaveBeenCalledWith(auditRef, expect.objectContaining({
    eventId: 'circ-2027', registrationId: registration.id, actor: operator,
  }));
  expect(Object.keys(transaction.update.mock.calls[0][1]).every(key => key === 'updatedAt' || key === 'credential' || key.startsWith('attendance.'))).toBe(true);
});
test.each(actions)('a held supplement cannot use requested unallocated physical rights for %s', async (_, perform) => {
  current = { ...registration, capacityReviewOrderId: 'held-supplement', entitlements: { congressMode: 'virtual', morningCourse: false, afternoonCourse: false } };
  await expect(perform(current)).rejects.toThrow('secretariat/admission-not-allowed');
  expect(transaction.update).not.toHaveBeenCalled();
});
test('explicit empty grants remain authoritative even on a confirmed paid registration', async () => {
  current = { ...registration, entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false } };
  await expect(updateParticipantCheckIn(operator, registration, '2027-04-09', true)).rejects.toThrow('secretariat/admission-not-allowed');
  await expect(updateCredentialDelivery(operator, registration, true)).rejects.toThrow('secretariat/admission-not-allowed');
  expect(transaction.update).not.toHaveBeenCalled();
});
test('the fresh snapshot can authorize granted access while the caller still has the old held state', async () => {
  await updateParticipantCheckIn(operator, primaryHold, '2027-04-09', true);
  expect(transaction.update).toHaveBeenCalledWith(registrationRef, expect.objectContaining({
    [`attendance.${attendanceKey('2027-04-09')}`]: expect.objectContaining({ checkedIn: true }),
  }));
});
test('check-in reversal remains available after access is held and audits the current entry', async () => {
  const previous = { checkedIn: true, checkedInBy: { uid: 'previous-staff' } };
  current = { ...primaryHold, attendance: { [attendanceKey('2027-04-09')]: previous } };
  await updateParticipantCheckIn(operator, registration, '2027-04-09', false);
  expect(transaction.update).toHaveBeenCalledWith(registrationRef, expect.objectContaining({
    [`attendance.${attendanceKey('2027-04-09')}`]: expect.objectContaining({ checkedIn: false }),
  }));
  expect(transaction.set).toHaveBeenCalledWith(auditRef, expect.objectContaining({ action: 'attendance.checkin.reverted', before: previous }));
});
test('credential reversal remains available after access is held and audits the current entry', async () => {
  const previous = { delivered: true, deliveredBy: { uid: 'previous-staff' } };
  current = { ...primaryHold, credential: previous };
  await updateCredentialDelivery(operator, registration, false);
  expect(transaction.update).toHaveBeenCalledWith(registrationRef, expect.objectContaining({ credential: expect.objectContaining({ delivered: false }) }));
  expect(transaction.set).toHaveBeenCalledWith(auditRef, expect.objectContaining({ action: 'credential.delivery.reverted', before: previous }));
});
test('a missing registration cannot be recreated by an attendance or credential update', async () => {
  exists = false;
  await expect(updateParticipantCheckIn(operator, registration, '2027-04-09', true)).rejects.toThrow('secretariat/registration-not-found');
  await expect(updateCredentialDelivery(operator, registration, false)).rejects.toThrow('secretariat/registration-not-found');
  expect(transaction.update).not.toHaveBeenCalled(); expect(transaction.set).not.toHaveBeenCalled();
});
