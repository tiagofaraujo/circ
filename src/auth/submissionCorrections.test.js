import { getFirebaseFirestore } from './firebaseClient';
import { submissionTimestamp, hasEffectiveCorrectionRequest, loadSubmissionCorrection, saveSubmissionCorrection, resubmitSubmissionCorrection } from './submissionCorrections';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));
const stamp = '2027-02-02T10:00:00.123456Z';
const source = { id: 'work', eventId: 'circ-2027', userId: 'author', status: 'revisions', type: 'oral', submittedAt: stamp, isTest: false, revisionVersion: 0, updatedAt: stamp,
  review: { updatedAt: stamp, updatedBy: { uid: 'manager', email: 'manager@example.test' } } };
const user = { uid: 'author', emailVerified: true, getIdToken: async () => 'private-token' };
const sections = { introduction: 'Contexto', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia' };
const form = { title: 'Trabalho corrigido', abstractSections: sections, authors: 'Spoofed author', type: 'poster' };
const rid = '11111111-1111-4111-8111-111111111111';
let stored, writes, current, db;
beforeEach(() => {
  jest.clearAllMocks(); stored = null; writes = []; current = { ...source };
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => stamp } } };
  const ref = (collection, id) => ({ collection, id, get: async () => ({ exists: Boolean(stored), data: () => stored }) });
  const tx = { get: async r => ({ exists: r.collection === 'submissions' || Boolean(stored), data: () => r.collection === 'submissions' ? current : stored }),
    set: (r, data) => { writes.push({ r, data }); stored = data; } };
  db = { collection: collection => ({ doc: id => ref(collection, id) }), runTransaction: cb => cb(tx) };
  getFirebaseFirestore.mockReturnValue(db);
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ submission: { id: 'work', revisionVersion: 1, status: 'submitted' } }) }));
});
test('timestamps retain Firestore nanoseconds and canonicalise equivalent fractions', () => {
  expect(submissionTimestamp({ seconds: 1793505600, nanoseconds: 123456789 })).toBe('2026-11-01T04:00:00.123456789Z');
  expect(submissionTimestamp(stamp)).toBe('2027-02-02T10:00:00.123456000Z');
});
test('only an active effective management request allows author corrections', () => {
  expect(hasEffectiveCorrectionRequest(source)).toBe(true);
  for (const change of [{ status: 'accepted' }, { review: null }, { archived: true }, { isTest: true }]) expect(hasEffectiveCorrectionRequest({ ...source, ...change })).toBe(false);
});
test('a correction draft writes only private scientific content and never changes the original', async () => {
  await saveSubmissionCorrection(user, source, form);
  expect(writes).toHaveLength(1); expect(writes[0].r.collection).toBe('submissionCorrectionDrafts');
  expect(writes[0].data.correction).not.toHaveProperty('authors'); expect(writes[0].data.correction).not.toHaveProperty('type');
  expect(writes[0].data.sourceUpdatedAt).toBe(stamp);
});
test('another saved draft or a changed management request cannot be overwritten by an old tab', async () => {
  stored = { userId: 'author', updatedAt: '2027-02-02T10:05:00Z' };
  await expect(saveSubmissionCorrection(user, source, form)).rejects.toThrow('correction-request-changed');
  stored = null; current = { ...source, status: 'accepted' };
  await expect(saveSubmissionCorrection(user, source, form)).rejects.toThrow('correction-request-changed');
  expect(writes).toHaveLength(0);
});
test('only a draft belonging to the current request is recovered', async () => {
  stored = { userId: 'author', sourceVersion: 0, sourceUpdatedAt: stamp, correction: { title: form.title, abstractSections: sections }, updatedAt: stamp };
  expect(await loadSubmissionCorrection(user, source)).toMatchObject({ title: form.title, draftUpdatedAt: stamp });
  stored.sourceVersion = 1; expect(await loadSubmissionCorrection(user, source)).toEqual({ stale: true, draftUpdatedAt: stamp });
});
test('resubmission sends only content and concurrency guards, preserving the UUID and timestamp precision', async () => {
  await resubmitSubmissionCorrection(user, source, form, rid);
  const [url, options] = fetch.mock.calls[0], body = JSON.parse(options.body);
  expect(url).toBe('/api/submissions/work/resubmit'); expect(options.headers.Authorization).toBe('Bearer private-token');
  expect(body).toEqual({ requestId: rid, expectedVersion: 0, expectedUpdatedAt: '2027-02-02T10:00:00.123456000Z', correction: { title: form.title, abstractSections: sections } });
  expect(options.method).toBe('POST');
});
test('incomplete content, another owner and missing management metadata never send an API request', async () => {
  await expect(resubmitSubmissionCorrection(user, source, { ...form, abstractSections: {} }, rid)).rejects.toThrow('incomplete-abstract');
  await expect(resubmitSubmissionCorrection({ ...user, uid: 'other' }, source, form, rid)).rejects.toThrow('corrections-not-allowed');
  await expect(resubmitSubmissionCorrection(user, { ...source, review: null }, form, rid)).rejects.toThrow('corrections-not-allowed');
  expect(fetch).not.toHaveBeenCalled();
});
test('an ambiguous network response or invalid identity is never reported as successful', async () => {
  fetch.mockRejectedValueOnce(new Error('private-transport-detail'));
  await expect(resubmitSubmissionCorrection(user, source, form, rid)).rejects.toThrow('submissions/resubmit-unconfirmed');
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ submission: { id: 'other', revisionVersion: 1 } }) });
  await expect(resubmitSubmissionCorrection(user, source, form, rid)).rejects.toThrow('submissions/resubmit-unconfirmed');
});

test('a draft from an older management request can be replaced using its exact saved basis', async () => {
  const previousStamp = '2027-02-01T10:00:00Z';
  stored = { userId: 'author', sourceVersion: 0, sourceUpdatedAt: previousStamp, correction: { title: 'Previous title', abstractSections: sections }, updatedAt: previousStamp };
  const stale = await loadSubmissionCorrection(user, source);
  expect(stale).toEqual({ stale: true, draftUpdatedAt: previousStamp });
  expect(stale).not.toHaveProperty('title');
  await saveSubmissionCorrection(user, source, form, stale.draftUpdatedAt);
  expect(stored.sourceUpdatedAt).toBe(stamp);
  expect(stored.correction.title).toBe(form.title);
});
