const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');

const source = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
const oralDeadline = 'timestamp.date(2027, 1, 16)';
const posterDeadline = 'timestamp.date(2027, 3, 1)';
let open, closed, oralClosed;
const mail = uid => `${uid}@example.test`;
function dbFor(env, uid = 'author', verified = true, email = mail(uid)) {
  return env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
}
const sections = { introduction: 'Introdução', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia' };
function submission(uid = 'author', status = 'submitted', extra = {}) {
  return { eventId: 'circ-2027', userId: uid, code: 'CIRC27-ABCD1234', title: 'Trabalho científico', type: 'oral',
    abstract: 'Resumo estruturado', abstractSections: sections, status, isTest: false, authors: 'Autora Exemplo',
    contactName: 'Autora Exemplo', contactEmail: mail(uid), affiliation: 'Instituição',
    updatedAt: serverTimestamp(), createdAt: serverTimestamp(), submittedAt: status === 'submitted' ? serverTimestamp() : null, ...extra };
}
// The emulator cannot override request.time. Only the two cutoff literals are
// moved in isolated test projects to exercise open/closed windows deterministically;
// the rule predicates, authentication, data validation and server timestamps are
// unchanged. Production always uses the actual January/March 2027 cutoffs above.
function withCutoffs(oralYear, posterYear) {
  assert(source.includes(oralDeadline)); assert(source.includes(posterDeadline));
  return source.replace(oralDeadline, `timestamp.date(${oralYear}, 1, 16)`)
    .replace(posterDeadline, `timestamp.date(${posterYear}, 3, 1)`);
}
before(async () => {
  open = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-open', firestore: { rules: withCutoffs(2099, 2099) } });
  closed = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-closed', firestore: { rules: withCutoffs(2000, 2000) } });
  oralClosed = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-oral-closed', firestore: { rules: withCutoffs(2000, 2099) } });
});
after(async () => { await Promise.all([open, closed, oralClosed].filter(Boolean).map(env => env.cleanup())); });
beforeEach(async () => { await Promise.all([open, closed, oralClosed].map(env => env.clearFirestore())); });

test('verified owners create real drafts and complete submissions using server timestamps', async () => {
  const db = dbFor(open);
  await assertSucceeds(setDoc(doc(db, 'submissions', 'draft'), submission('author', 'draft', { abstract: '', abstractSections: { introduction: '', objective: '', methods: '', results: '', conclusion: '', keywords: '' } })));
  await assertSucceeds(setDoc(doc(db, 'submissions', 'submitted'), submission()));
  await assertSucceeds(setDoc(doc(db, 'submissions', 'poster'), submission('author', 'submitted', { type: 'poster' })));
});

test('a verified owner can edit a draft and submit it, but cannot edit submitted content or another owner', async () => {
  const db = dbFor(open), ref = doc(db, 'submissions', 'work');
  await setDoc(ref, submission('author', 'draft'));
  await assertSucceeds(updateDoc(ref, { title: 'Título corrigido', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(dbFor(open, 'other'), 'submissions', 'work'), { title: 'Outro autor', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { userId: 'other', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'submitted', submittedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { title: 'Alteração posterior', updatedAt: serverTimestamp() }));
});

test('unverified or anonymous callers cannot create, edit or delete real drafts', async () => {
  await setDoc(doc(dbFor(open), 'submissions', 'draft'), submission('author', 'draft'));
  const unverified = dbFor(open, 'author', false);
  await assertFails(setDoc(doc(unverified, 'submissions', 'new'), submission()));
  await assertFails(updateDoc(doc(unverified, 'submissions', 'draft'), { title: 'Título alterado', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(unverified, 'submissions', 'draft')));
  await assertFails(setDoc(doc(open.unauthenticatedContext().firestore(), 'submissions', 'anonymous'), submission()));
});

test('invalid types, field limits, incomplete abstracts and forged metadata are rejected', async () => {
  const db = dbFor(open);
  const invalid = [{ type: 'other' }, { title: 'aa' }, { title: 'a'.repeat(241) }, { authors: 'a' },
    { authors: 'a'.repeat(3001) }, { affiliation: 'a'.repeat(501) }, { abstractSections: { ...sections, methods: 'a'.repeat(3001) } },
    { abstractSections: { ...sections, objective: '' } }, { userId: 'other' }, { contactEmail: mail('other') },
    { review: { status: 'accepted' } }, { code: 'TEST-WORK' }, { isTest: true }];
  for (let i = 0; i < invalid.length; i++) await assertFails(setDoc(doc(db, 'submissions', `invalid-${i}`), submission('author', 'submitted', invalid[i])));
  await setDoc(doc(db, 'submissions', 'draft'), submission('author', 'draft'));
  await assertFails(updateDoc(doc(db, 'submissions', 'draft'), { type: 'other', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'submissions', 'draft'), { title: 'a'.repeat(241), updatedAt: serverTimestamp() }));
});

test('server time enforces each type deadline, including draft-to-submission updates', async () => {
  const allClosed = dbFor(closed), mixed = dbFor(oralClosed);
  await assertFails(setDoc(doc(allClosed, 'submissions', 'oral'), submission()));
  await assertFails(setDoc(doc(allClosed, 'submissions', 'poster'), submission('author', 'submitted', { type: 'poster' })));
  await assertSucceeds(setDoc(doc(allClosed, 'submissions', 'draft'), submission('author', 'draft')));
  await assertSucceeds(updateDoc(doc(allClosed, 'submissions', 'draft'), { title: 'Rascunho conservado', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(allClosed, 'submissions', 'draft'), { status: 'submitted', submittedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(mixed, 'submissions', 'oral'), submission()));
  await assertSucceeds(setDoc(doc(mixed, 'submissions', 'poster'), submission('author', 'submitted', { type: 'poster' })));
});

test('only an active owned real draft can be removed by its author', async () => {
  const db = dbFor(open);
  await setDoc(doc(db, 'submissions', 'draft'), submission('author', 'draft'));
  await setDoc(doc(db, 'submissions', 'submitted'), submission());
  await open.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'submissions', 'archived'), submission('author', 'draft', { archived: true })));
  await assertFails(deleteDoc(doc(dbFor(open, 'other'), 'submissions', 'draft')));
  await assertFails(deleteDoc(doc(db, 'submissions', 'submitted')));
  await assertFails(deleteDoc(doc(db, 'submissions', 'archived')));
  await assertFails(updateDoc(doc(db, 'submissions', 'archived'), { title: 'Reaberto', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(db, 'submissions', 'draft')));
});

test('existing administrator and designated test permissions remain unchanged', async () => {
  const admin = dbFor(closed, 'admin', true, 'circ.chuc@gmail.com');
  await assertSucceeds(setDoc(doc(admin, 'submissions', 'admin-record'), { eventId: 'circ-2027', status: 'draft', legacy: true }));
  await closed.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'tester'), { roles: { submissions: true, submissionTesting: true } }));
  const tester = dbFor(closed, 'tester');
  await assertSucceeds(setDoc(doc(tester, 'submissions', 'legacy-test'), submission('tester', 'submitted', { code: 'TEST-LEGACY', isTest: true })));
});

test('production settings remain administrator-only, including former sandbox tester paths', async () => {
  const tester = dbFor(open, 'tester', true, 'araujotiagofc@gmail.com');
  const key = 'circ-checkout-sandbox-tester-11111111-1111-4111-8111-111111111111';
  await assertFails(setDoc(doc(tester, 'settings', key), { kind: 'sandbox-record' }));
  const admin = dbFor(open, 'admin', true, 'circ.chuc@gmail.com');
  await assertSucceeds(setDoc(doc(admin, 'settings', key), { kind: 'sandbox-record' }));
});

const correctionSource = () => submission('author', 'revisions', {
  revisionVersion: 0, submittedAt: serverTimestamp(),
  review: { note: 'Clarificar os métodos.', updatedAt: serverTimestamp(), updatedBy: { uid: 'manager', email: mail('manager') } },
});
async function seedCorrection(extra = {}) {
  await open.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'submissions', 'correction'), { ...correctionSource(), ...extra }));
  return (await getDoc(doc(dbFor(open), 'submissions', 'correction'))).data();
}
const correctionDraft = source => ({ eventId: 'circ-2027', submissionId: 'correction', userId: 'author',
  sourceVersion: source.revisionVersion, sourceUpdatedAt: source.updatedAt, updatedAt: serverTimestamp(),
  correction: { title: 'Trabalho corrigido', abstractSections: sections, abstract: 'Resumo corrigido' } });

test('the author saves private correction drafts only under an effective management request', async () => {
  const source = await seedCorrection(), db = dbFor(open), ref = doc(db, 'submissionCorrectionDrafts', 'correction');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, correctionDraft(source)));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(dbFor(open, 'other'), 'submissionCorrectionDrafts', 'correction')));
  await assertFails(setDoc(doc(dbFor(open, 'author', false), 'submissionCorrectionDrafts', 'correction'), correctionDraft(source)));
  await assertFails(updateDoc(doc(db, 'submissions', 'correction'), { title: 'Mutação direta', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'submissions', 'correction'), { status: 'submitted', updatedAt: serverTimestamp() }));
});

test('private correction drafts reject identity edits, stale versions and stale management requests', async () => {
  const source = await seedCorrection(), db = dbFor(open), ref = doc(db, 'submissionCorrectionDrafts', 'correction');
  for (const patch of [{ sourceVersion: 1 }, { sourceUpdatedAt: Timestamp.fromMillis(1000) }, { userId: 'other' },
    { correction: { title: 'Trabalho corrigido', abstractSections: sections, abstract: 'Resumo', authors: 'Autor alterado' } }]) {
    await assertFails(setDoc(ref, { ...correctionDraft(source), ...patch }));
  }
  for (const change of [{ status: 'accepted' }, { archived: true }, { isTest: true }, { review: {} }]) {
    await seedCorrection(change);
    await assertFails(setDoc(ref, correctionDraft(source)));
  }
});

test('revision history stays private to scientific management and cannot be forged by clients', async () => {
  await open.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'scientificRevisionHistory', 'historic'), { reviewers: ['private@example.test'], source: { authors: 'Identidade privada' } });
    await setDoc(doc(ctx.firestore(), 'users', 'manager'), { roles: { submissions: true } });
  });
  await assertFails(getDoc(doc(dbFor(open), 'scientificRevisionHistory', 'historic')));
  await assertSucceeds(getDoc(doc(dbFor(open, 'manager'), 'scientificRevisionHistory', 'historic')));
  await assertFails(setDoc(doc(dbFor(open), 'scientificRevisionHistory', 'forged'), { revisionVersion: 1 }));
  await assertFails(updateDoc(doc(dbFor(open, 'manager'), 'scientificRevisionHistory', 'historic'), { reviewers: [] }));
});

const reviewScores = { quality: 7, originality: 7, methodology: 7, clinicalRelevance: 7, impact: 7 };
const reviewCopy = (source, extra = {}) => ({ eventId: 'circ-2027', submissionId: 'versioned', code: source.code,
  title: source.title, type: source.type, abstract: source.abstract, abstractSections: source.abstractSections,
  status: source.status, isTest: false, active: true, revisionVersion: source.revisionVersion || 0,
  evaluation: null, evaluationHistory: [], updatedAt: serverTimestamp(), assignedBy: 'manager', ...extra });
async function seedVersioned(status = 'submitted', version = 1, copyExtra = {}) {
  const source = submission('author', status, { revisionVersion: version });
  await open.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'reviewConfiguration', 'circ-2027'), { enabled: true });
    await setDoc(doc(db, 'users', 'manager'), { roles: { submissions: true } });
    await setDoc(doc(db, 'scientificReviewers', mail('reviewer')), { active: true });
    await setDoc(doc(db, 'submissions', 'versioned'), source);
    await setDoc(doc(db, 'scientificReviewAssignments', 'versioned'), { reviewerEmails: [mail('reviewer')] });
    await setDoc(doc(db, 'scientificReviewers', mail('reviewer'), 'works', 'versioned'), reviewCopy(source, copyExtra));
  });
  return source;
}
function scoreVersion(version) {
  return { scores: reviewScores, comment: '', reviewerUid: 'reviewer', revisionVersion: version, updatedAt: serverTimestamp() };
}

test('stale evaluation versions and scoring during requested corrections are rejected', async () => {
  const ref = doc(dbFor(open, 'reviewer'), 'scientificReviewers', mail('reviewer'), 'works', 'versioned');
  await seedVersioned();
  await assertFails(updateDoc(ref, { evaluation: scoreVersion(0), updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { evaluation: scoreVersion(1), updatedAt: serverTimestamp() }));
  await seedVersioned('revisions', 1);
  await assertFails(updateDoc(ref, { evaluation: scoreVersion(1), updatedAt: serverTimestamp() }));
});

test('reassignment to a new version must preserve the old score in history and clear the current score', async () => {
  const oldEvaluation = { scores: reviewScores, comment: 'Avaliação anterior', reviewerUid: 'reviewer', updatedAt: Timestamp.fromMillis(1000), revisionVersion: 0 };
  const source = await seedVersioned('submitted', 1, { revisionVersion: 0, evaluation: oldEvaluation, active: false });
  const ref = doc(dbFor(open, 'manager'), 'scientificReviewers', mail('reviewer'), 'works', 'versioned');
  const updated = reviewCopy(source, { assignedBy: 'manager' });
  await assertFails(setDoc(ref, updated));
  await assertSucceeds(setDoc(ref, { ...updated, evaluationHistory: [{ revisionVersion: 0, evaluation: oldEvaluation }] }));
  await assertFails(updateDoc(ref, { evaluationHistory: [], updatedAt: serverTimestamp() }));
});
