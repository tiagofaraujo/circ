import { canEditSubmissionPresenter, isSubmissionOpeningReached, isSubmissionTypeOpen, submissionAuthorOptions, submissionDateInLisbon, submissionPresenterName } from './submissions2027';

test('both scientific formats open at 00:00 Lisbon on 15 November 2026', () => {
  const before = new Date('2026-11-14T23:59:59.999Z');
  const opens = new Date('2026-11-15T00:00:00.000Z');
  expect(isSubmissionOpeningReached(before)).toBe(false);
  expect(isSubmissionOpeningReached(opens)).toBe(true);
  for (const type of ['oral', 'poster']) {
    expect(isSubmissionTypeOpen(type, before)).toBe(false);
    expect(isSubmissionTypeOpen(type, opens)).toBe(true);
  }
  expect(submissionDateInLisbon(opens)).toBe('2026-11-15');
});

test('the existing final deadlines stay inclusive and unsupported types stay closed', () => {
  expect(isSubmissionTypeOpen('oral', new Date('2027-01-15T23:59:59Z'))).toBe(true);
  expect(isSubmissionTypeOpen('oral', new Date('2027-01-16T00:00:00Z'))).toBe(false);
  expect(isSubmissionTypeOpen('poster', new Date('2027-02-28T23:59:59Z'))).toBe(true);
  expect(isSubmissionTypeOpen('poster', new Date('2027-03-01T00:00:00Z'))).toBe(false);
  expect(isSubmissionTypeOpen('other', new Date('2026-11-15T12:00:00Z'))).toBe(false);
});

test('selections use persisted author line indexes including blank lines and CRLF', () => {
  const authors = '\n  Ana Silva\r\n \r\n  Bruno Costa  \r\n';
  expect(submissionAuthorOptions(authors)).toEqual([
    { index: 0, name: 'Ana Silva' },
    { index: 2, name: 'Bruno Costa' },
  ]);
  expect(submissionPresenterName({ authors, presenterIndex: 2 })).toBe('Bruno Costa');
  for (const presenterIndex of [undefined, null, '0', -1, 1, 3]) {
    expect(submissionPresenterName({ authors, presenterIndex })).toBe('');
  }
});

test('presenter edits respect the same type deadline and ignore archived or test records', () => {
  const submission = { eventId: 'circ-2027', type: 'oral', status: 'accepted' };
  const lastDay = new Date('2027-01-15T23:59:59Z');
  expect(canEditSubmissionPresenter(submission, lastDay)).toBe(true);
  expect(canEditSubmissionPresenter(submission, new Date('2027-01-16T00:00:00Z'))).toBe(false);
  for (const patch of [{ status: 'draft' }, { status: 'rejected' }, { isTest: true }, { testMode: true }, { archived: true }, { eventId: 'other' }]) {
    expect(canEditSubmissionPresenter({ ...submission, ...patch }, lastDay)).toBe(false);
  }
});
