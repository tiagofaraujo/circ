const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where, updateDoc, writeBatch, serverTimestamp, Timestamp } = require('firebase/firestore');
let env;
const sid = 'scientific-work';
const mail = uid => `${uid}@example.test`;
const dbFor = (uid = 'reviewer-a', verified = true) => env.authenticatedContext(uid, { email: uid === 'admin' ? 'circ.chuc@gmail.com' : mail(uid), email_verified: verified }).firestore();
const scores = n => ({ quality: n, originality: n, methodology: n, clinicalRelevance: n, impact: n });
const sections = { introduction: 'Introdução anónima', objective: 'Objetivo', methods: 'Métodos', results: 'Resultados', conclusion: 'Conclusão', keywords: 'Radiologia' };
const sourceData = status => ({ eventId: 'circ-2027', userId: 'author', code: 'CIRC-100', title: 'Trabalho científico', type: 'oral', abstract: 'Resumo anónimo', abstractSections: sections, status, isTest: false, authors: 'Nome Confidencial', contactName: 'Nome Confidencial', contactEmail: mail('author'), affiliation: 'Hospital Confidencial', updatedAt: Timestamp.fromMillis(1000), createdAt: Timestamp.fromMillis(1000) });
const reviewerData = uid => ({ eventId: 'circ-2027', name: uid, email: mail(uid), active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: 'super' });
const work = (db, uid, id = sid) => doc(db, 'scientificReviewers', mail(uid), 'works', id);
const control = db => doc(db, 'scientificReviewAssignments', sid);
const identity = db => doc(db, 'scientificReviewIdentities', sid);
const projection = (status = 'under_review', evaluation = null) => ({ eventId: 'circ-2027', submissionId: sid, code: 'CIRC-100', title: 'Trabalho científico', type: 'oral', abstract: 'Resumo anónimo', abstractSections: sections, status, isTest: false, active: true, evaluation, updatedAt: serverTimestamp(), assignedBy: 'super' });
async function assign(uids = ['reviewer-a', 'reviewer-b', 'reviewer-c']) {
  const db = dbFor('super'), batch = writeBatch(db);
  batch.set(control(db), { eventId: 'circ-2027', reviewerEmails: uids.map(mail), updatedAt: serverTimestamp(), updatedBy: 'super' });
  for (const uid of uids) batch.set(work(db, uid), projection());
  return batch.commit();
}
function score(db = dbFor(), values = scores(7), extras = {}) {
  return updateDoc(work(db, 'reviewer-a'), { evaluation: { scores: values, comment: 'Comentário privado do revisor', reviewerUid: 'reviewer-a', updatedAt: serverTimestamp(), ...extras }, updatedAt: serverTimestamp() });
}
async function decide(status, uids = ['reviewer-a', 'reviewer-b', 'reviewer-c']) {
  const db = dbFor('super'), batch = writeBatch(db);
  const records = await Promise.all(uids.map(uid => getDoc(work(db, uid))));
  batch.update(doc(db, 'submissions', sid), { status, review: { note: '', updatedBy: { uid: 'super', email: mail('super') }, updatedAt: serverTimestamp() }, updatedAt: serverTimestamp() });
  uids.forEach((uid, i) => batch.set(work(db, uid), { ...records[i].data(), status, assignedBy: 'super', updatedAt: serverTimestamp() }));
  if (status === 'accepted') batch.set(identity(db), { authors: 'Nome Confidencial', contactName: 'Nome Confidencial', affiliation: 'Hospital Confidencial' });
  else batch.delete(identity(db));
  return batch.commit();
}
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-circ-scientific-review', firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } }); });
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'super'), { roles: { submissions: true } });
    await setDoc(doc(db, 'reviewConfiguration', 'circ-2027'), { enabled: true, version: 1 });
    await setDoc(doc(db, 'submissions', sid), sourceData('under_review'));
    for (const uid of ['reviewer-a', 'reviewer-b', 'reviewer-c', 'reviewer-d', 'author']) await setDoc(doc(db, 'scientificReviewers', mail(uid)), reviewerData(uid));
  });
});
test('supervisor assigns three reviewers; each lists only their own anonymous works', async () => {
  await assertSucceeds(assign());
  const db = dbFor();
  const items = await assertSucceeds(getDocs(query(collection(db, 'scientificReviewers', mail('reviewer-a'), 'works'), where('active', '==', true))));
  assert.equal(items.size, 1);
  const content = JSON.stringify(items.docs[0].data());
  for (const secret of ['Nome Confidencial', 'Hospital Confidencial', mail('author'), 'userId']) assert(!content.includes(secret));
  await assertFails(getDoc(doc(db, 'submissions', sid)));
  await assertFails(getDoc(work(db, 'reviewer-b')));
  await assertFails(getDoc(control(db)));
  await assertFails(getDocs(collection(db, 'scientificReviewers')));
});
test('unassigned, unverified and anonymous callers cannot read a manuscript or score it', async () => {
  await assign();
  await assertFails(getDoc(work(dbFor('reviewer-d'), 'reviewer-a')));
  await assertFails(getDoc(work(dbFor('reviewer-a', false), 'reviewer-a')));
  await assertFails(getDoc(work(env.unauthenticatedContext().firestore(), 'reviewer-a')));
  await assertFails(score(dbFor('reviewer-b')));
});
test('reviewers cannot grant a role or change assignments, manuscript content, decisions or another score', async () => {
  await assign(); const db = dbFor();
  await assertFails(setDoc(doc(db, 'scientificReviewers', mail('reviewer-d')), reviewerData('reviewer-d')));
  await assertFails(updateDoc(control(db), { reviewerEmails: [mail('reviewer-a')] }));
  await assertFails(updateDoc(work(db, 'reviewer-a'), { title: 'Alterado' }));
  await assertFails(updateDoc(work(db, 'reviewer-a'), { status: 'accepted' }));
  await assertFails(updateDoc(doc(db, 'submissions', sid), { status: 'accepted' }));
  await assertFails(updateDoc(doc(db, 'reviewConfiguration', 'circ-2027'), { enabled: true }));
});
test('anonymous copies reject author metadata and arbitrary nested fields even from supervisors', async () => {
  await assign(); const db = dbFor('super');
  await assertFails(setDoc(work(db, 'reviewer-a'), { ...projection(), authors: 'Nome Confidencial' }));
  await assertFails(setDoc(work(db, 'reviewer-a'), { ...projection(), contactEmail: mail('author') }));
  await assertFails(setDoc(work(db, 'reviewer-a'), { ...projection(), abstractSections: { ...sections, authors: 'Nome Confidencial' } }));
});
test('zero and decimal scores save; all five scores and the optional bounded comment are enforced', async () => {
  await assign();
  await assertSucceeds(score(dbFor(), scores(0), { comment: '' }));
  await assertSucceeds(score(dbFor(), { ...scores(10), quality: 7.5 }));
  for (const value of [-1, 10.01, null, '7', NaN, Infinity]) await assertFails(score(dbFor(), { ...scores(7), quality: value }));
  const incomplete = scores(7); delete incomplete.impact;
  await assertFails(score(dbFor(), incomplete));
  await assertFails(score(dbFor(), scores(7), { comment: 'x'.repeat(4001) }));
  await assertFails(score(dbFor(), scores(7), { reviewerUid: 'someone-else' }));
});
test('supervisor sees every reviewer score and comment, while reviewers cannot compare peers', async () => {
  await assign(); await score();
  const record = (await assertSucceeds(getDoc(work(dbFor('super'), 'reviewer-a')))).data();
  assert.equal(record.evaluation.scores.quality, 7);
  assert.equal(record.evaluation.comment, 'Comentário privado do revisor');
  await assertFails(getDoc(work(dbFor('reviewer-b'), 'reviewer-a')));
  await assertFails(score(dbFor('super')));
});
test('identity stays inaccessible until atomic acceptance, and scoring closes on acceptance', async () => {
  await assign(); await score();
  await assertFails(setDoc(identity(dbFor('super')), { authors: 'Nome Confidencial', contactName: 'Nome Confidencial', affiliation: 'Hospital Confidencial' }));
  await env.withSecurityRulesDisabled(ctx => setDoc(identity(ctx.firestore()), { authors: 'Nome Confidencial', contactName: 'Nome Confidencial', affiliation: 'Hospital Confidencial' }));
  await assertFails(getDoc(identity(dbFor())));
  await assertSucceeds(decide('accepted'));
  assert.equal((await assertSucceeds(getDoc(identity(dbFor())))).data().authors, 'Nome Confidencial');
  await assertFails(getDoc(identity(dbFor('reviewer-d'))));
  await assertFails(score());
});
test('reopening removes author access and permits evaluation updates again', async () => {
  await assign(); await decide('accepted'); await assertSucceeds(decide('under_review'));
  await assertFails(getDoc(identity(dbFor())));
  await assertSucceeds(score());
});
test('an old client cannot change an assigned decision without syncing the anonymous copies', async () => {
  await assign();
  for (const uid of ['super', 'admin']) await assertFails(updateDoc(doc(dbFor(uid), 'submissions', sid), { status: 'accepted', review: { note: '', updatedBy: { uid, email: uid === 'admin' ? 'circ.chuc@gmail.com' : mail(uid) } } }));
});
test('deactivation immediately revokes reviewer access and preserves scores for the supervisor', async () => {
  await assign(); await score();
  const db = dbFor('super');
  await assertSucceeds(updateDoc(doc(db, 'scientificReviewers', mail('reviewer-a')), { active: false, updatedAt: serverTimestamp(), updatedBy: 'super' }));
  await assertFails(getDoc(work(dbFor(), 'reviewer-a'))); await assertFails(score());
  assert((await assertSucceeds(getDoc(work(db, 'reviewer-a')))).data().evaluation);
  await assertSucceeds(decide('accepted'));
  await assertFails(getDoc(identity(dbFor())));
});
test('removing a reviewer revokes work and identity access while keeping the saved evaluation', async () => {
  await assign(); await score(); await decide('accepted');
  const db = dbFor('super'), old = (await getDoc(work(db, 'reviewer-a'))).data(), batch = writeBatch(db);
  batch.update(control(db), { reviewerEmails: [mail('reviewer-b'), mail('reviewer-c')], updatedAt: serverTimestamp(), updatedBy: 'super' });
  batch.set(work(db, 'reviewer-a'), { ...old, active: false, assignedBy: 'super', updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertFails(getDoc(work(dbFor(), 'reviewer-a'))); await assertFails(getDoc(identity(dbFor())));
  assert((await getDoc(work(db, 'reviewer-a'))).data().evaluation);
});
test('own submissions, drafts, inactive reviewers and more than three reviewers cannot be evaluated', async () => {
  await assign(['author']);
  await assertFails(updateDoc(work(dbFor('author'), 'author'), { evaluation: { scores: scores(10), comment: '', reviewerUid: 'author', updatedAt: serverTimestamp() }, updatedAt: serverTimestamp() }));
  await assertFails(assign(['reviewer-a', 'reviewer-b', 'reviewer-c', 'reviewer-d']));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'submissions', sid), { status: 'draft' }));
  await assertFails(assign(['reviewer-a']));
});
test('assignment changes must revoke removed copies atomically', async () => {
  await assign(); const db = dbFor('super');
  await assertFails(updateDoc(control(db), { reviewerEmails: [], updatedAt: serverTimestamp(), updatedBy: 'super' }));
  assert.equal((await getDoc(work(dbFor(), 'reviewer-a'))).data().active, true);
});
test('three reviewers can be replaced atomically within Firestore access limits', async () => {
  await assign(); await score(); const db = dbFor('super');
  for (const uid of ['reviewer-e', 'reviewer-f']) await assertSucceeds(setDoc(doc(db, 'scientificReviewers', mail(uid)), reviewerData(uid)));
  const batch = writeBatch(db), selected = ['reviewer-d', 'reviewer-e', 'reviewer-f'];
  for (const uid of ['reviewer-a', 'reviewer-b', 'reviewer-c']) {
    const old = (await getDoc(work(db, uid))).data();
    batch.set(work(db, uid), { ...old, active: false, assignedBy: 'super', updatedAt: serverTimestamp() });
  }
  batch.set(control(db), { eventId: 'circ-2027', reviewerEmails: selected.map(mail), updatedAt: serverTimestamp(), updatedBy: 'super' });
  for (const uid of selected) batch.set(work(db, uid), projection());
  batch.set(doc(collection(db, 'auditLogs')), { action: 'scientific.assignment.updated', eventId: 'circ-2027', submissionId: sid, actor: { uid: 'super', email: mail('super') }, createdAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertFails(getDoc(work(dbFor(), 'reviewer-a')));
  await assertSucceeds(getDoc(work(dbFor('reviewer-d'), 'reviewer-d')));
});
test('an assigned submission cannot be deleted while reviewer access remains active', async () => {
  await assign(); await assertFails(deleteDoc(doc(dbFor('admin'), 'submissions', sid)));
  const db = dbFor('super'), batch = writeBatch(db);
  batch.update(control(db), { reviewerEmails: [], updatedAt: serverTimestamp(), updatedBy: 'super' });
  for (const uid of ['reviewer-a', 'reviewer-b', 'reviewer-c']) batch.set(work(db, uid), { ...projection(), active: false });
  await assertSucceeds(batch.commit());
  await assertSucceeds(deleteDoc(doc(dbFor('admin'), 'submissions', sid)));
  await assertFails(getDoc(work(dbFor(), 'reviewer-a')));
});
