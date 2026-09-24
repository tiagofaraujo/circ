import { MemoryRouter } from 'react-router-dom';
import StudentVerification from '../components/js/StudentVerification';
import { act, renderHook, render, screen, fireEvent } from '@testing-library/react';
import { getFirebaseAuth, getFirebaseFirestore } from './firebaseClient';
import { assertStudentRequestCurrent, describeStudentVerification, reviewStudentRequest, submitStudentVerification, useStudentVerification } from './studentVerificationStore';
jest.mock('./firebaseClient', () => ({ getFirebaseAuth: jest.fn(), getFirebaseFirestore: jest.fn() }));

const user = { uid: 'student', emailVerified: true };
const approved = { userId: 'student', eventId: 'circ-2027', academicYear: '2026/2027', profileName: 'Maria Leonor de Sá', status: 'approved' };
const snapshot = (data, metadata = {}) => ({ exists: Boolean(data), data: () => data, metadata: { fromCache: false, hasPendingWrites: false, ...metadata } });
test('school-only submission saves a pending request and proof using the deployed schema', async () => {
  getFirebaseAuth.mockReturnValue({ currentUser: { ...user, email: 'student@example.test' } });
  const set = jest.fn();
  const transaction = {
    get: async (ref) => snapshot(ref === 'users/student' ? { name: approved.profileName } : null),
    set,
  };
  getFirebaseFirestore.mockReturnValue({
    collection: (name) => ({ doc: (uid) => `${name}/${uid}` }),
    runTransaction: (fn) => fn(transaction),
  });
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  const proof = { mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' };
  await submitStudentVerification({ school: '  Escola de Saúde  ', proof });
  expect(set).toHaveBeenCalledWith('studentVerifications/student', expect.objectContaining({
    school: 'Escola de Saúde', course: 'Radiologia / Imagem Médica e Radioterapia',
    profileName: approved.profileName, academicYear: '2026/2027',
    status: 'pending', revision: 1, reviewedBy: null, reviewedAt: null,
  }));
  expect(set).toHaveBeenCalledWith('studentProofs/student', {
    userId: 'student', eventId: 'circ-2027', revision: 1, ...proof, updatedAt: 'server-time',
  });
});
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

test('focus presence updates preserve the file input while the picker is open', async () => {
  const listeners = {};
  getFirebaseFirestore.mockReturnValue({ collection: (name) => ({ doc: () => ({ onSnapshot: (_options, next) => { listeners[name] = next; return () => {}; } }) }) });
  function Harness() { return <MemoryRouter><StudentVerification user={user} verification={useStudentVerification(user)} /></MemoryRouter>; }
  URL.createObjectURL = jest.fn(() => 'blob:proof');
  URL.revokeObjectURL = jest.fn();
  render(<Harness />);
  act(() => { listeners.studentVerifications(snapshot(null)); listeners.users(snapshot({ name: approved.profileName })); });
  const picker = screen.getByLabelText('Comprovativo de matrícula');
  // Returning from the native picker writes online presence to users/{uid}.
  act(() => listeners.users(snapshot({ name: approved.profileName, presence: 'online' }, { hasPendingWrites: true })));
  expect(screen.getByLabelText('Comprovativo de matrícula')).toBe(picker);
  fireEvent.change(picker, { target: { files: [new File(['%PDF-1.4\n'], 'proof.pdf', { type: 'application/pdf' })] } });
  expect(await screen.findByRole('checkbox')).toBeInTheDocument();
  act(() => listeners.users(snapshot({ name: approved.profileName })));
  expect(screen.getByLabelText('Comprovativo de matrícula')).toBe(picker);
  expect(screen.getByText('proof.pdf')).toBeInTheDocument();
});
