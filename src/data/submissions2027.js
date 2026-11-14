export const SUBMISSION_OPEN_DATE = '2026-11-15';
export const SUBMISSION_DEADLINES = { oral: '2027-01-15', poster: '2027-02-28' };
export const SUBMISSION_LIMITS = {
  title: 240, authors: 3000, affiliation: 500,
  introduction: 2500, objective: 1500, methods: 3000, results: 3000, conclusion: 2000, keywords: 500,
};

export function submissionDateInLisbon(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isSubmissionOpeningReached(now = new Date()) {
  return submissionDateInLisbon(now) >= SUBMISSION_OPEN_DATE;
}

export function isSubmissionTypeOpen(type, now = new Date()) {
  const date = submissionDateInLisbon(now);
  return Boolean(SUBMISSION_DEADLINES[type] && date >= SUBMISSION_OPEN_DATE && date <= SUBMISSION_DEADLINES[type]);
}

export function submissionAuthorOptions(authors) {
  return String(authors ?? '').trim().split('\n')
    .map((name, index) => ({ index, name: name.trim() }))
    .filter(({ name }) => name);
}

export function submissionPresenterName(submission) {
  return submissionAuthorOptions(submission?.authors)
    .find(({ index }) => index === submission?.presenterIndex)?.name || '';
}

export function canEditSubmissionPresenter(submission, now = new Date()) {
  return Boolean(submission?.eventId === 'circ-2027'
    && submission.archived !== true && submission.isTest !== true && submission.testMode !== true
    && ['submitted', 'under_review', 'revisions', 'accepted'].includes(submission.status)
    && isSubmissionTypeOpen(submission.type, now));
}
