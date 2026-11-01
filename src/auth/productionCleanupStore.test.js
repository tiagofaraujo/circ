import { prepareProductionCleanup, archiveProductionCleanup, restoreProductionCleanup } from './productionCleanupStore';
import { getFirebaseFirestore, isAdminUser } from './firebaseClient';
import { assignScientificReviewers } from './scientificReviewStore';
jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn(), isAdminUser: jest.fn() }));
jest.mock('./scientificReviewStore', () => ({ assignScientificReviewers: jest.fn(async () => {}) }));
const user = { uid: 'admin', email: 'circ.chuc@gmail.com', emailVerified: true };
const EVENT = 'circ-2027';
const time = '2026-10-31T10:00:00Z';

function fakeDatabase(initial = {}) {
  const data = new Map(Object.entries(initial)); let counter = 0;
  const commits = [];
  const snapshot = (path, source = data) => ({ id: path.split('/').pop(), ref: ref(path), exists: source.has(path), data: () => source.get(path) });
  const ref = path => ({ path, id: path.split('/').pop(), get: async () => snapshot(path),
    set: async value => { data.set(path, value); }, update: async value => { data.set(path, { ...data.get(path), ...value }); } });
  function query(collection, filters = [], bounds = {}, count = Infinity) {
    return {
      doc: id => ref(`${collection}/${id || `generated${++counter}`}`),
      where: (field, operator, value) => query(collection, [...filters, [field, operator, value]], bounds, count),
      orderBy: () => query(collection, filters, bounds, count),
      startAt: start => query(collection, filters, { ...bounds, start }, count),
      endAt: end => query(collection, filters, { ...bounds, end }, count),
      limit: limit => query(collection, filters, bounds, limit),
      get: async () => ({ docs: [...data.keys()].filter(path => path.split('/').length === 2 && path.startsWith(`${collection}/`))
        .filter(path => filters.every(([field, , value]) => data.get(path)[field] === value))
        .filter(path => (!bounds.start || path.split('/').pop() >= bounds.start) && (!bounds.end || path.split('/').pop() <= bounds.end))
        .sort().slice(0, count).map(path => snapshot(path)) }),
    };
  }
  const db = { collection: collection => query(collection), doc: ref,
    runTransaction: async callback => {
      const staged = new Map(data);
      const tx = { get: async document => snapshot(document.path), set: (document, value) => staged.set(document.path, value),
        update: (document, value) => staged.set(document.path, { ...staged.get(document.path), ...value }),
        delete: document => staged.delete(document.path) };
      await callback(tx); data.clear(); staged.forEach((value, key) => data.set(key, value)); commits.push(new Map(data));
    },
  };
  return { db, data, commits };
}
const registration = (extras = {}) => ({ eventId: EVENT, userId: 'person', createdAt: time, isTest: true,
  payment: { status: 'paid', amountCents: 9500 }, ...extras });
const submission = (extras = {}) => ({ eventId: EVENT, userId: 'person', createdAt: time, status: 'submitted', isTest: true, title: 'Ensaio', ...extras });

beforeEach(() => {
  jest.clearAllMocks(); assignScientificReviewers.mockResolvedValue(undefined);
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
  isAdminUser.mockReturnValue(true);
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'SERVER-TIME' }, FieldPath: { documentId: () => '__name__' } } };
});
afterEach(() => jest.useRealTimers());

test('inventory includes drafts and tests but preserves real paid and pending financial records and linked reviews', async () => {
  const f = fakeDatabase({
    'registrations/test': registration(),
    'registrations/legacy-zero': registration({ isTest: false, payment: { status: 'paid', amountCents: 0 } }),
    'registrations/real': registration({ isTest: false }),
    'registrations/pending': registration({ isTest: false, payment: { status: 'pending', amountCents: 9500 } }),
    'payments/live': { eventId: EVENT, registrationId: 'pending', environment: 'production', status: 'pending', amountCents: 9500 },
    'submissions/draft': submission({ status: 'draft' }),
    'submissions/review': submission(),
    'scientificReviewAssignments/review': { eventId: EVENT, reviewerEmails: ['reviewer@example.test'] },
    'settings/circ-checkout-sandbox-admin-old': { payload: JSON.stringify({ kind: 'checkout-test', environment: 'sandbox', eventId: EVENT, createdAt: time }) },
    'settings/circ-toconline-server-session': { payload: 'PRIVATE-CREDENTIALS' },
  });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  expect(plan.eligible).toEqual({ registrations: 2, submissions: 1, sandbox: 1, related: 0 });
  expect(plan.protectedItems).toEqual(expect.arrayContaining([
    { type: 'registration', id: 'real', reason: 'financial-record' },
    { type: 'registration', id: 'pending', reason: 'financial-record' },
    { type: 'submission', id: 'review', reason: 'review-linked' },
  ]));
  expect(plan.groups.flatMap(group => group.sources.map(source => source.path))).not.toContain('settings/circ-toconline-server-session');
});

test('archive removes active test data with original copies and can restore it without changing profiles', async () => {
  const originalRegistration = registration(); const originalSubmission = submission();
  const f = fakeDatabase({
    'registrations/test': originalRegistration,
    'registrationOrders/addon': { eventId: EVENT, registrationId: 'test', createdAt: time, isTest: true },
    'submissions/draft': originalSubmission,
    'users/person': { name: 'Perfil preservado' },
  });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  const result = await archiveProductionCleanup(user, plan);
  expect(f.data.has('registrations/test')).toBe(false); expect(f.data.has('submissions/draft')).toBe(false);
  expect(f.data.get('users/person')).toEqual({ name: 'Perfil preservado' });
  const archives = [...f.data.values()].filter(value => value.kind === 'production-cleanup-item');
  expect(archives).toHaveLength(2); expect(archives.flatMap(value => value.sources).find(source => source.path === 'registrations/test').data).toEqual(originalRegistration);
  await restoreProductionCleanup(user, result.archiveId);
  expect(f.data.get('registrations/test')).toEqual(originalRegistration); expect(f.data.get('submissions/draft')).toEqual(originalSubmission);
});

test('a changed source, new related record or new assignment stops the frozen plan without deleting it', async () => {
  for (const change of ['source', 'related', 'review']) {
    const f = fakeDatabase({ 'registrations/test': registration(), 'submissions/draft': submission() });
    getFirebaseFirestore.mockReturnValue(f.db);
    const plan = await prepareProductionCleanup(user);
    if (change === 'source') f.data.set('registrations/test', registration({ updatedAt: 'new' }));
    if (change === 'related') f.data.set('payments/new', { registrationId: 'test', environment: 'production', amountCents: 9500 });
    if (change === 'review') f.data.set('scientificReviewAssignments/draft', { eventId: EVENT, reviewerEmails: ['reviewer@example.test'] });
    await expect(archiveProductionCleanup(user, plan)).rejects.toThrow(change === 'review' ? 'cleanup/review-linked' : 'cleanup/source-changed');
    expect(f.data.has(change === 'review' ? 'submissions/draft' : 'registrations/test')).toBe(true);
  }
});

test('later records stay outside the cutoff and an issued document protects even a test-labelled registration', async () => {
  const f = fakeDatabase({
    'registrations/recent': registration({ createdAt: '2026-11-01T12:01:00Z' }),
    'documents/recent-child': { eventId: EVENT, registrationId: 'recent', isTest: true, createdAt: time },
    'registrations/with-invoice': registration(),
    'documents/issued': { eventId: EVENT, registrationId: 'with-invoice', status: 'issued', providerDocumentId: 123 },
  });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  expect(plan.groups).toHaveLength(0); expect(plan.recent).toHaveLength(1);
  expect(plan.protectedItems).toEqual([{ type: 'registration', id: 'with-invoice', reason: 'financial-record' }]);
});

test('restore refuses to overwrite a newer record with the archived ID', async () => {
  const f = fakeDatabase({ 'registrations/test': registration() }); getFirebaseFirestore.mockReturnValue(f.db);
  const result = await archiveProductionCleanup(user, await prepareProductionCleanup(user));
  const newer = registration({ participantName: 'Novo participante' }); f.data.set('registrations/test', newer);
  await expect(restoreProductionCleanup(user, result.archiveId)).rejects.toThrow('cleanup/restore-conflict');
  expect(f.data.get('registrations/test')).toEqual(newer);
});

test('only the administrator can prepare or execute cleanup and stale inventories must be refreshed', async () => {
  const f = fakeDatabase({ 'registrations/test': registration() }); getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  jest.advanceTimersByTime(16 * 60 * 1000);
  await expect(archiveProductionCleanup(user, plan)).rejects.toThrow('cleanup/plan-expired');
  isAdminUser.mockReturnValue(false);
  await expect(prepareProductionCleanup(user)).rejects.toThrow('cleanup/admin-required');
  await expect(archiveProductionCleanup(user, plan)).rejects.toThrow('cleanup/admin-required');
});

test('an empty reviewer assignment permits archival while its control metadata stays in place', async () => {
  const assignment = { eventId: EVENT, reviewerEmails: [] };
  const f = fakeDatabase({ 'submissions/old': submission(), 'scientificReviewAssignments/old': assignment });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  expect(plan.eligible.submissions).toBe(1); expect(plan.protectedItems).toHaveLength(0);
  await archiveProductionCleanup(user, plan);
  expect(f.data.has('submissions/old')).toBe(false);
  expect(f.data.get('scientificReviewAssignments/old')).toEqual(assignment);
});

test('recent author edits are excluded and non-test legacy paid links and voucher coverage remain protected', async () => {
  const f = fakeDatabase({
    'submissions/edited': submission({ updatedAt: '2026-11-01T12:01:00Z' }),
    'registrations/legacy': registration({ isTest: false, payment: { status: 'pending', amountCents: 9500 } }),
    'payments/legacy': { eventId: EVENT, registrationId: 'legacy', status: 'paid', amountCents: 9500 },
    'registrations/voucher': registration({ isTest: false, voucherId: 'company-voucher', payment: { status: 'paid', amountCents: 0, coveredAmountCents: 9500 } }),
  });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  expect(plan.groups).toHaveLength(0); expect(plan.recent).toHaveLength(1);
  expect(plan.protectedItems).toHaveLength(2);
});

test('linked work is backed up and unlinked atomically before source deletion; scores and financial records are preserved', async () => {
  const evaluation = { scores: { quality: 8 }, comment: 'Pontuação preservada' };
  const assignment = { eventId: EVENT, reviewerEmails: ['reviewer@example.test'], updatedAt: time };
  const work = { eventId: EVENT, submissionId: 'linked', active: true, evaluation, updatedAt: time };
  const f = fakeDatabase({
    'reviewConfiguration/circ-2027': { enabled: true },
    'submissions/linked': submission(),
    'scientificReviewAssignments/linked': assignment,
    'scientificReviewers/reviewer@example.test/works/linked': work,
    'registrations/paid': registration({ isTest: false }),
    'payments/real': { eventId: EVENT, registrationId: 'paid', environment: 'production', amountCents: 9500, status: 'paid' },
  });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  expect(plan.eligible.submissions).toBe(1);
  const result = await archiveProductionCleanup(user, plan);
  expect(f.commits).toHaveLength(2);
  const first = f.commits[0];
  expect(first.has('submissions/linked')).toBe(true);
  expect(first.get('scientificReviewAssignments/linked').reviewerEmails).toEqual([]);
  expect(first.get('scientificReviewers/reviewer@example.test/works/linked').active).toBe(false);
  expect(first.get('scientificReviewers/reviewer@example.test/works/linked').evaluation).toEqual(evaluation);
  const item = [...first.values()].find(value => value.kind === 'production-cleanup-item');
  expect(item.phase).toBe('reviews-unlinked');
  expect(item.reviewBackup.assignment.data).toEqual(assignment);
  expect(item.reviewBackup.works[0].data).toEqual(work);
  expect(f.data.has('submissions/linked')).toBe(false);
  expect(f.data.has('registrations/paid')).toBe(true); expect(f.data.has('payments/real')).toBe(true);
  assignScientificReviewers.mockImplementation(async (_user, id, emails) => {
    expect(f.data.has(`submissions/${id}`)).toBe(true);
    expect(emails).toEqual(['reviewer@example.test']);
  });
  await restoreProductionCleanup(user, result.archiveId);
  expect(assignScientificReviewers).toHaveBeenCalledWith(user, 'linked', ['reviewer@example.test']);
  expect(f.data.get('submissions/linked')).toEqual(submission());
});

test('changed scores after the inventory stop unlinking before any reviewer or source content changes', async () => {
  const f = fakeDatabase({
    'reviewConfiguration/circ-2027': { enabled: true }, 'submissions/linked': submission(),
    'scientificReviewAssignments/linked': { eventId: EVENT, reviewerEmails: ['reviewer@example.test'], updatedAt: time },
    'scientificReviewers/reviewer@example.test/works/linked': { active: true, evaluation: { score: 1 }, updatedAt: time },
  });
  getFirebaseFirestore.mockReturnValue(f.db);
  const plan = await prepareProductionCleanup(user);
  f.data.set('scientificReviewers/reviewer@example.test/works/linked', { active: true, evaluation: { score: 2 }, updatedAt: time });
  await expect(archiveProductionCleanup(user, plan)).rejects.toThrow('cleanup/source-changed');
  expect(f.data.has('submissions/linked')).toBe(true);
  expect(f.data.get('scientificReviewers/reviewer@example.test/works/linked').active).toBe(true);
  expect(f.data.get('scientificReviewAssignments/linked').reviewerEmails).toEqual(['reviewer@example.test']);
});
