import { getFirebaseFirestore } from './firebaseClient';
import {
  assignScientificReviewers,
  saveScientificEvaluation,
  updateScientificDecision,
} from './scientificReviewStore';
import { anonymousReviewContent } from './scientificReview';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn() }));

const supervisor = { uid: 'super', email: 'super@example.test' };
const reviewer = { uid: 'reviewer', email: 'reviewer@example.test' };
const submission = {
  id: 'work',
  eventId: 'circ-2027',
  userId: 'author',
  contactEmail: 'author@example.test',
  authors: 'Private author',
  affiliation: 'Private institution',
  title: 'Anonymous title',
  abstract: 'Anonymous abstract',
  type: 'oral',
  status: 'under_review',
  updatedAt: 1000,
};
const evaluation = {
  scores: { quality: 5, originality: 7, methodology: 6, clinicalRelevance: 7, impact: 7 },
  comment: 'Original comment',
  updatedAt: 1200,
  reviewerUid: reviewer.uid,
};
const workPath = (email) => `scientificReviewers/${email}/works/work`;
function mockDatabase(data) {
  let didWrite = false;
  const ref = (path) => ({
    path,
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id || 'audit-id'}`),
  });
  const tx = {
    get: jest.fn(async (r) => {
      if (didWrite) throw new Error('Read after transaction write');
      return { exists: Boolean(data[r.path]), data: () => data[r.path] };
    }),
    set: jest.fn(() => {
      didWrite = true;
    }),
    update: jest.fn(() => {
      didWrite = true;
    }),
    delete: jest.fn(() => {
      didWrite = true;
    }),
  };
  getFirebaseFirestore.mockReturnValue({
    collection: (name) => ref(name),
    runTransaction: (fn) => fn(tx),
  });
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  return tx;
}
const baseData = () => ({
  'reviewConfiguration/circ-2027': { enabled: true },
  'submissions/work': submission,
  'scientificReviewAssignments/work': { reviewerEmails: [reviewer.email] },
  [`scientificReviewers/${reviewer.email}`]: { active: true },
  [workPath(reviewer.email)]: {
    ...anonymousReviewContent(submission, 'work'),
    active: true,
    evaluation,
  },
});
test('reassignment preserves saved scores, removes access and writes only anonymous content', async () => {
  const data = baseData(),
    second = 'second@example.test';
  data[`scientificReviewers/${second}`] = { active: true };
  const tx = mockDatabase(data);
  await assignScientificReviewers(supervisor, 'work', [second.toUpperCase(), second]);
  const writes = Object.fromEntries(tx.set.mock.calls.map(([ref, value]) => [ref.path, value]));
  expect(writes[workPath(reviewer.email)]).toMatchObject({ active: false, evaluation });
  expect(writes[workPath(second)]).toMatchObject({ active: true, evaluation: null });
  expect(JSON.stringify(writes[workPath(second)])).not.toMatch(
    /Private author|Private institution|author@example|userId/,
  );
  expect(writes['scientificReviewAssignments/work'].reviewerEmails).toEqual([second]);
  expect(tx.delete.mock.calls[0][0].path).toBe('scientificReviewIdentities/work');
});
test('acceptance atomically updates source, assigned copies and identity; reopening removes identity', async () => {
  let tx = mockDatabase(baseData());
  await updateScientificDecision(supervisor, submission, 'accepted', 'Accepted after review');
  expect(tx.update.mock.calls[0][1]).toMatchObject({ status: 'accepted' });
  expect(tx.set.mock.calls.find(([ref]) => ref.path === workPath(reviewer.email))[1]).toMatchObject(
    { status: 'accepted', evaluation },
  );
  expect(
    tx.set.mock.calls.find(([ref]) => ref.path === 'scientificReviewIdentities/work')[1],
  ).toEqual({ authors: 'Private author', contactName: '', affiliation: 'Private institution' });
  tx = mockDatabase(baseData());
  await updateScientificDecision(supervisor, submission, 'under_review');
  expect(tx.delete.mock.calls[0][0].path).toBe('scientificReviewIdentities/work');
});
test('another saved version is never overwritten by a stale supervisor or reviewer', async () => {
  const data = baseData(),
    tx = mockDatabase(data);
  await expect(
    updateScientificDecision(supervisor, { ...submission, updatedAt: 999 }, 'accepted'),
  ).rejects.toThrow('review/conflict');
  await expect(
    saveScientificEvaluation(
      reviewer,
      { submissionId: 'work', evaluation: { ...evaluation, updatedAt: 999 } },
      evaluation.scores,
      '',
    ),
  ).rejects.toThrow('review/conflict');
  expect(tx.set).not.toHaveBeenCalled();
  expect(tx.update).not.toHaveBeenCalled();
});
test('evaluation writes only five scores and the reviewer comment, including a zero score', async () => {
  const data = baseData(),
    tx = mockDatabase(data);
  await saveScientificEvaluation(
    reviewer,
    data[workPath(reviewer.email)],
    { ...evaluation.scores, quality: 0 },
    '  Methodology needs detail.  ',
  );
  expect(tx.set).not.toHaveBeenCalled();
  expect(tx.update.mock.calls[0][1]).toEqual({
    evaluation: {
      scores: { ...evaluation.scores, quality: 0 },
      comment: 'Methodology needs detail.',
      reviewerUid: 'reviewer',
      updatedAt: 'server-time',
    },
    updatedAt: 'server-time',
  });
});
test('disabled configuration, inactive reviewers and self-assignment do not write anything', async () => {
  for (const change of [
    (data) => {
      data['reviewConfiguration/circ-2027'].enabled = false;
    },
    (data) => {
      data[`scientificReviewers/${reviewer.email}`].active = false;
    },
    (data) => {
      data['submissions/work'] = { ...submission, contactEmail: reviewer.email };
    },
  ]) {
    const data = baseData();
    change(data);
    const tx = mockDatabase(data);
    await expect(assignScientificReviewers(supervisor, 'work', [reviewer.email])).rejects.toThrow();
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  }
});
