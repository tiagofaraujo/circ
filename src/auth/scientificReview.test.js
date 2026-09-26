import {
  acceptedReviewIdentity,
  anonymousReviewContent,
  emptyReviewScores,
  parseReviewScores,
  reviewMean,
  reviewTotal,
} from './scientificReview';
import { getUserAccess } from './firebaseClient';

const scores = (n = 0) => ({
  quality: n,
  originality: n,
  methodology: n,
  clinicalRelevance: n,
  impact: n,
});
test('zero is a score, but an empty criterion is not a score', () => {
  expect(reviewTotal(scores())).toBe(0);
  expect(reviewTotal({ ...scores(), quality: '' })).toBeNull();
  expect(reviewTotal(emptyReviewScores())).toBeNull();
});
test('scores accept decimal commas and enforce bounds and all criteria', () => {
  expect(parseReviewScores({ ...scores(8), quality: '7,5' }).quality).toBe(7.5);
  for (const value of [-1, 10.01, NaN, Infinity, null, undefined, ' '])
    expect(() => parseReviewScores({ ...scores(), quality: value })).toThrow();
});
test('totals and averages exclude missing and revoked evaluations', () => {
  expect(
    reviewTotal({ quality: 5, originality: 7, methodology: 6, clinicalRelevance: 7, impact: 7 }),
  ).toBe(32);
  expect(
    reviewMean([
      { active: true, evaluation: { scores: scores(8) } },
      { active: true, evaluation: null },
      { active: false, evaluation: { scores: scores(0) } },
    ]),
  ).toBe(8);
  expect(reviewMean([])).toBeNull();
});
test('anonymous projection excludes contact, author, private review and arbitrary nested metadata', () => {
  const submission = {
    title: 'Tema',
    status: 'submitted',
    userId: 'private-uid',
    authors: 'AUTOR SECRETO',
    contactEmail: 'private@example.test',
    contactName: 'Nome Privado',
    affiliation: 'Instituição',
    review: { note: 'PRIVATE NOTE' },
    abstractSections: { introduction: 'Texto', authors: 'NESTED SECRET' },
  };
  const blind = JSON.stringify(anonymousReviewContent(submission, 'work-1'));
  for (const secret of [
    'private-uid',
    'AUTOR SECRETO',
    'private@example.test',
    'Nome Privado',
    'Instituição',
    'PRIVATE NOTE',
    'NESTED SECRET',
  ])
    expect(blind).not.toContain(secret);
  expect(acceptedReviewIdentity(submission)).toEqual({
    authors: 'AUTOR SECRETO',
    contactName: 'Nome Privado',
    affiliation: 'Instituição',
  });
});
test('reviewer role never grants supervisor, registrations or secretariat access', () => {
  const access = getUserAccess(
    { uid: 'reviewer', email: 'reviewer@example.test', emailVerified: true },
    {},
    true,
  );
  expect(access.canReviewSubmissions).toBe(true);
  expect(access.canManageSubmissions).toBe(false);
  expect(access.canUseSecretariat).toBe(false);
  expect(access.canManageRegistrations).toBe(false);
  expect(
    getUserAccess({ email: 'reviewer@example.test', emailVerified: false }, {}, true)
      .canReviewSubmissions,
  ).toBe(false);
  expect(
    getUserAccess({ email: 'reviewer@example.test', emailVerified: true }, { reviewer: true })
      .canReviewSubmissions,
  ).toBe(false);
});
