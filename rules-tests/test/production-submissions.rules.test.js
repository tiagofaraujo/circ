const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } = require('firebase/firestore');

const source = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
const oralDeadline = 'timestamp.date(2027, 1, 16)';
const posterDeadline = 'timestamp.date(2027, 3, 1)';
const opening = 'timestamp.date(2026, 11, 15)';
let open, closed, oralClosed, notOpened;
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
// The emulator cannot override request.time. Only the date literals are
// moved in isolated test projects to exercise open/closed windows deterministically;
// the rule predicates, authentication, data validation and server timestamps are
// unchanged. Production always uses the actual January/March 2027 cutoffs above.
function withCutoffs(oralYear, posterYear, openingYear = 2000) {
  assert(source.includes(oralDeadline)); assert(source.includes(posterDeadline)); assert(source.includes(opening));
  return source.replace(opening, `timestamp.date(${openingYear}, 11, 15)`)
    .replace(oralDeadline, `timestamp.date(${oralYear}, 1, 16)`)
    .replace(posterDeadline, `timestamp.date(${posterYear}, 3, 1)`);
}
before(async () => {
  open = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-open', firestore: { rules: withCutoffs(2099, 2099) } });
  closed = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-closed', firestore: { rules: withCutoffs(2000, 2000) } });
  oralClosed = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-oral-closed', firestore: { rules: withCutoffs(2000, 2099) } });
  notOpened = await initializeTestEnvironment({ projectId: 'demo-circ-submissions-not-open', firestore: { rules: withCutoffs(2099, 2099, 2099) } });
});
after(async () => { await Promise.all([open, closed, oralClosed, notOpened].filter(Boolean).map(env => env.cleanup())); });
beforeEach(async () => { await Promise.all([open, closed, oralClosed, notOpened].map(env => env.clearFirestore())); });

test('server time blocks all authoring before opening, including administrators and designated testers', async () => {
  for (const [uid, email] of [['author', mail('author')], ['admin', 'circ.chuc@gmail.com'], ['tester', 'acbdgomes@gmail.com']]) {
    const db = dbFor(notOpened, uid, true, email);
    for (const status of ['draft', 'submitted']) {
      await assertFails(setDoc(doc(db, 'submissions', `${uid}-${status}`), submission(uid, status, { contactEmail: email })));
    }
  }
  await assertFails(setDoc(doc(dbFor(notOpened, 'tester', true, 'acbdgomes@gmail.com'), 'submissions', 'test'), submission('tester', 'submitted', { isTest: true })));
  await notOpened.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'submissions', 'draft'), submission('author', 'draft'));
    await setDoc(doc(ctx.firestore(), 'submissions', 'review'), submission());
  });
  for (const db of [dbFor(notOpened), dbFor(notOpened, 'admin', true, 'circ.chuc@gmail.com')]) {
    await assertSucceeds(getDoc(doc(db, 'submissions', 'draft')));
    await assertFails(updateDoc(doc(db, 'submissions', 'draft'), { title: 'Alteração antes da abertura', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'submissions', 'draft'), { status: 'submitted', submittedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  }
  const admin = dbFor(notOpened, 'admin', true, 'circ.chuc@gmail.com');
  await assertSucceeds(updateDoc(doc(admin, 'submissions', 'review'), { status: 'under_review', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(admin, 'submissions', 'review'), { title: 'Conteúdo alterado', updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(admin, 'submissions', 'draft')));
});

test('the same opening blocks new registration and payment records while retaining existing operations', async () => {
  const admin = dbFor(notOpened, 'admin', true, 'circ.chuc@gmail.com');
  const pending = { eventId: 'circ-2027', userId: 'author', status: 'submitted', isTest: false,
    selection: { profile: 'external', congressMode: 'onsite' }, entitlements: {}, payment: { status: 'pending' } };
  await assertFails(setDoc(doc(admin, 'registrations', 'new'), pending));
  await assertFails(setDoc(doc(admin, 'registrationOrders', 'new'), { eventId: 'circ-2027', userId: 'author', selection: { profile: 'external' } }));
  await assertFails(setDoc(doc(admin, 'payments', 'new'), { status: 'pending' }));
  await notOpened.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'registrations', 'existing'), pending);
    await setDoc(doc(ctx.firestore(), 'payments', 'existing'), { eventId: 'circ-2027', userId: 'author', status: 'pending' });
  });
  await assertSucceeds(getDoc(doc(admin, 'registrations', 'existing')));
  await assertSucceeds(updateDoc(doc(admin, 'registrations', 'existing'), { internalNotes: 'Pedido existente conferido' }));
  await assertSucceeds(updateDoc(doc(admin, 'payments', 'existing'), { status: 'paid' }));
});

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

test('administrators retain archive restoration after opening while designated testers cannot recreate simulations', async () => {
  const admin = dbFor(closed, 'admin', true, 'circ.chuc@gmail.com');
  await assertSucceeds(setDoc(doc(admin, 'submissions', 'admin-record'), { eventId: 'circ-2027', status: 'draft', legacy: true }));
  await closed.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'tester'), { roles: { submissions: true, submissionTesting: true } }));
  const tester = dbFor(closed, 'tester');
  await assertFails(setDoc(doc(tester, 'submissions', 'legacy-test'), submission('tester', 'submitted', { code: 'TEST-LEGACY', isTest: true })));
  await assertSucceeds(setDoc(doc(admin, 'submissions', 'admin-test'), submission('admin', 'submitted', { isTest: true })));
  await assertSucceeds(setDoc(doc(admin, 'submissions', 'admin-test-mode'), submission('admin', 'submitted', { testMode: true })));
});

test('production settings remain administrator-only, including former sandbox tester paths', async () => {
  const tester = dbFor(open, 'tester', true, 'araujotiagofc@gmail.com');
  const key = 'circ-checkout-sandbox-tester-11111111-1111-4111-8111-111111111111';
  await assertFails(setDoc(doc(tester, 'settings', key), { kind: 'sandbox-record' }));
  const admin = dbFor(open, 'admin', true, 'circ.chuc@gmail.com');
  await assertSucceeds(setDoc(doc(admin, 'settings', key), { kind: 'sandbox-record' }));
});
