import { act, renderHook } from '@testing-library/react';
import { getFirebaseAuth, getFirebaseFirestore } from './firebaseClient';
import { assertStudentRequestCurrent, describeStudentVerification, reviewStudentRequest, useStudentVerification } from './studentVerificationStore';
jest.mock('./firebaseClient', () => ({ getFirebaseAuth: jest.fn(), getFirebaseFirestore: jest.fn() }));

const user = { uid: 'student', emailVerified: true };
const approved = { userId: 'student', eventId: 'circ-2027', academicYear: '2026/2027', profileName: 'Maria Leonor de Sá', status: 'approved' };
const snapshot = (data, metadata = {}) => ({ exists: Boolean(data), data: () => data, metadata: { fromCache: false, hasPendingWrites: false, ...metadata } });
test('cached or locally pending approval never unlocks the student rate', () => {
  const profile = snapshot({ name: approved.profileName });
  expect(describeStudentVerification(snapshot(approved), profile, user.uid, true).approved).toBe(true);
  for (const metadata of [{ fromCache: true }, { hasPendingWrites: true }]) {
    expect(describeStudentVerification(snapshot(approved, metadata), profile, user.uid, true).approved).toBe(false);
    expect(describeStudentVerification(snapshot(approved), snapshot({ name: approved.profileName }, metadata), user.uid, true).approved).toBe(false);
  }
  expect(describeStudentVerification(snapshot(approved), profile, user.uid, false).approved).toBe(false);
  expect(describeStudentVerification(snapshot(null), profile, user.uid, true).approved).toBe(false);
  expect(describeStudentVerification(snapshot(approved), snapshot({ name: 'Outro Nome' }), user.uid, true)).toMatchObject({ approved: false, nameChanged: true });
});
test('listener failure remains closed and changing accounts never reuses previous approval', () => {
  const listeners = {};
  const stop = jest.fn();
  getFirebaseFirestore.mockReturnValue({ collection: (name) => ({ doc: () => ({ onSnapshot: (_options, next, error) => { listeners[name] = { next, error }; return stop; } }) }) });
  const { result, rerender, unmount } = renderHook(({ account }) => useStudentVerification(account), { initialProps: { account: user } });
  act(() => { listeners.studentVerifications.next(snapshot(approved)); listeners.users.next(snapshot({ name: approved.profileName })); });
  expect(result.current.approved).toBe(true);
  act(() => listeners.studentVerifications.error());
  act(() => listeners.users.next(snapshot({ name: approved.profileName })));
  expect(result.current).toMatchObject({ status: 'error', approved: false });
  rerender({ account: { uid: 'different', emailVerified: true } });
  expect(result.current.approved).toBe(false);
  expect(stop).toHaveBeenCalledTimes(2);
  unmount();
  expect(stop).toHaveBeenCalledTimes(4);
});
test('a review is rejected if the document changed after it was opened', async () => {
  const expected = { id: 'student', revision: 1, status: 'pending', updatedAt: { marker: 'old' } };
  const current = snapshot({ ...expected, updatedAt: { isEqual: () => false }, proofAvailable: true });
  expect(() => assertStudentRequestCurrent(current, expected)).toThrow('conflict');
  getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'reviewer', email: 'reviewer@example.test', emailVerified: true } });
  const update = jest.fn();
  getFirebaseFirestore.mockReturnValue({ collection: () => ({ doc: () => ({}) }), runTransaction: (fn) => fn({ get: async () => current, update }) });
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  await expect(reviewStudentRequest(expected, 'approved', '')).rejects.toMatchObject({ code: 'student/conflict' });
  expect(update).not.toHaveBeenCalled();
});
