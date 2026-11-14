import { saveSubmission, updateSubmissionDraft, deleteSubmissionDraft, subscribeToUserSubmissions } from './adminOperationsStore';
import { getFirebaseFirestore } from './firebaseClient';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));
const user = { uid: 'author', email: 'author@example.com', displayName: 'Autora Exemplo', emailVerified: true };
const sections = { introduction: 'Contexto', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia' };
const form = { type: 'oral', title: 'Trabalho científico', authors: 'Autora Exemplo', affiliation: 'Instituição', abstractSections: sections };
let ref, db, current, tx;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-15T12:00:00Z'));
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } };
  current = { userId: user.uid, eventId: 'circ-2027', status: 'draft', isTest: false, updatedAt: 1000, submittedAt: null };
  ref = { id: 'abcdefgh1234', set: jest.fn(async () => {}) };
  tx = { get: jest.fn(async () => ({ exists: true, data: () => current })), update: jest.fn(), delete: jest.fn() };
  db = { collection: jest.fn(() => ({ doc: jest.fn(() => ref) })), runTransaction: jest.fn(callback => callback(tx)) };
  getFirebaseFirestore.mockReturnValue(db);
});
afterEach(() => jest.useRealTimers());
test('a verified participant creates a production submission without privileged test audit writes', async () => {
  await saveSubmission(user, form, 'submitted');
  expect(ref.set).toHaveBeenCalledWith(expect.objectContaining({ userId: 'author', contactEmail: user.email, isTest: false,
    code: 'CIRC27-ABCDEFGH', status: 'submitted', createdAt: 'SERVER_TIME', submittedAt: 'SERVER_TIME', abstractSections: sections }));
  expect(db.collection.mock.calls.every(([name]) => name === 'submissions')).toBe(true);
});
test('drafts can be incomplete, but submission needs every abstract section', async () => {
  await saveSubmission(user, { ...form, abstractSections: {} }, 'draft');
  expect(ref.set.mock.calls[0][0].submittedAt).toBeNull();
  await expect(saveSubmission(user, { ...form, abstractSections: {} }, 'submitted')).rejects.toThrow('submissions/incomplete-abstract');
});
test('drafts, definitive submissions and draft edits stay closed until the official opening, including admin authors', async () => {
  jest.setSystemTime(new Date('2026-11-14T23:59:59.999Z'));
  for (const identity of [user, { ...user, email: 'circ.chuc@gmail.com' }]) {
    await expect(saveSubmission(identity, form, 'draft')).rejects.toThrow('submissions/not-open');
    await expect(saveSubmission(identity, form, 'submitted')).rejects.toThrow('submissions/not-open');
    await expect(updateSubmissionDraft(identity, { id: ref.id, ...current }, form, 'submitted')).rejects.toThrow('submissions/not-open');
  }
  expect(ref.set).not.toHaveBeenCalled(); expect(tx.update).not.toHaveBeenCalled();
  jest.setSystemTime(new Date('2026-11-15T00:00:00.000Z'));
  await saveSubmission(user, form, 'draft');
  await saveSubmission(user, form, 'submitted');
  expect(ref.set).toHaveBeenCalledTimes(2);
});
test('unverified identities, unsupported types and oversized content are rejected before writing', async () => {
  await expect(saveSubmission({ ...user, emailVerified: false }, form, 'draft')).rejects.toThrow('verified-email-required');
  await expect(saveSubmission(user, { ...form, type: 'unsupported' }, 'submitted')).rejects.toThrow('invalid-input');
  await expect(saveSubmission(user, { ...form, title: 'a'.repeat(241) }, 'submitted')).rejects.toThrow('field-too-long');
  expect(ref.set).not.toHaveBeenCalled();
});
test('submission deadlines use the current date in Lisbon, including the last day', async () => {
  jest.setSystemTime(new Date('2027-01-15T23:59:59Z'));
  await saveSubmission(user, form, 'submitted');
  jest.setSystemTime(new Date('2027-01-16T00:00:00Z'));
  await expect(saveSubmission(user, form, 'submitted')).rejects.toThrow('submissions/closed');
  await saveSubmission(user, { ...form, type: 'poster' }, 'submitted');
});
test.each([
  ['oral', '2027-01-16T00:00:00Z'],
  ['poster', '2027-03-01T00:00:00Z'],
])('expired %s drafts cannot be created or updated through the store (%s)', async (type, date) => {
  jest.setSystemTime(new Date(date));
  const typedForm = { ...form, type };
  await expect(saveSubmission(user, typedForm, 'draft')).rejects.toThrow('submissions/closed');
  await expect(updateSubmissionDraft(user, { id: ref.id, ...current }, typedForm, 'draft')).rejects.toThrow('submissions/closed');
  expect(ref.set).not.toHaveBeenCalled();
  expect(db.runTransaction).not.toHaveBeenCalled();
  expect(tx.update).not.toHaveBeenCalled();
});
test('an oral deadline does not prevent a poster draft while its deadline is open', async () => {
  jest.setSystemTime(new Date('2027-01-16T00:00:00Z'));
  const posterForm = { ...form, type: 'poster' };
  await saveSubmission(user, posterForm, 'draft');
  await updateSubmissionDraft(user, { id: ref.id, ...current }, posterForm, 'draft');
  expect(ref.set).toHaveBeenCalledTimes(1);
  expect(tx.update).toHaveBeenCalledWith(ref, expect.objectContaining({ type: 'poster', status: 'draft' }));
});
test('editing rechecks the owned draft and preserves immutable ownership fields', async () => {
  await updateSubmissionDraft(user, { id: ref.id, ...current }, form, 'submitted');
  expect(tx.update).toHaveBeenCalledWith(ref, expect.objectContaining({ status: 'submitted', submittedAt: 'SERVER_TIME' }));
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty('userId');
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty('createdAt');
});
test('an already submitted, archived or concurrently changed draft cannot be edited', async () => {
  const initial = { id: ref.id, ...current };
  for (const change of [{ status: 'submitted' }, { archived: true }, { updatedAt: 2000 }, { userId: 'another-author' }]) {
    current = { ...initial, ...change };
    await expect(updateSubmissionDraft(user, initial, form, 'submitted')).rejects.toThrow('draft-changed');
  }
  expect(tx.update).not.toHaveBeenCalled();
});
test('draft removal rechecks ownership and never removes a submitted work', async () => {
  const initial = { id: ref.id, ...current };
  await deleteSubmissionDraft(user, initial);
  expect(tx.delete).toHaveBeenCalledWith(ref);
  current = { ...current, status: 'submitted' }; tx.delete.mockClear();
  await expect(deleteSubmissionDraft(user, initial)).rejects.toThrow('draft-changed');
  expect(tx.delete).not.toHaveBeenCalled();
});
test('active author lists exclude test and archived records', () => {
  const records = [{ isTest: false, code: 'real' }, { isTest: true, code: 'test' }, { archived: true, code: 'archived' }];
  const query = { where: jest.fn(() => query), limit: jest.fn(() => query), onSnapshot: callback => {
    callback({ docs: records.map((data, index) => ({ id: String(index), data: () => data })) }); return () => {};
  } };
  getFirebaseFirestore.mockReturnValue({ collection: () => query });
  const next = jest.fn(); subscribeToUserSubmissions(user.uid, next, jest.fn());
  expect(next).toHaveBeenCalledWith([expect.objectContaining({ code: 'real' })]);
});
