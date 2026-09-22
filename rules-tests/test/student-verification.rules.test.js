'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { before, after, afterEach, test } = require('node:test');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch } = require('firebase/firestore');

const UID = 'student-a';
const NAME = 'Maria Leonor de Sá';
const EVENT = 'circ-2027';
const FILE = '/9j/QUJDREVGR0g=';
let env;
const email = (uid) => uid === 'admin' ? 'circ.chuc@gmail.com' : `${uid}@example.test`;
const dbFor = (uid = UID, verified = true) => env.authenticatedContext(uid, { email: email(uid), email_verified: verified }).firestore();
const requestData = (overrides = {}) => ({
  userId: UID, eventId: EVENT, email: email(UID), profileName: NAME,
  school: 'Escola de Saúde', course: 'Radiologia / Imagem Médica e Radioterapia', academicYear: '2026/2027',
  status: 'pending', revision: 1, proofAvailable: true, submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  reviewedAt: null, reviewedBy: null, reviewNote: '', ...overrides,
});
const proofData = (overrides = {}) => ({ userId: UID, eventId: EVENT, revision: 1, mimeType: 'image/jpeg', base64: FILE, updatedAt: serverTimestamp(), ...overrides });
async function seed(application = null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', UID), { name: NAME });
    await setDoc(doc(db, 'users', 'reviewer'), { roles: { secretariat: true } });
    await setDoc(doc(db, 'users', 'scientific'), { roles: { submissions: true } });
    if (application) {
      await setDoc(doc(db, 'studentVerifications', UID), requestData({ submittedAt: Timestamp.fromMillis(Date.now() - 120000), ...application }));
      await setDoc(doc(db, 'studentProofs', UID), proofData({ revision: application.revision || 1 }));
    }
  });
}
function submit(db = dbFor(), request = {}, proof = {}, uid = UID) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'studentVerifications', uid), requestData(request));
  batch.set(doc(db, 'studentProofs', uid), proofData(proof));
  return batch.commit();
}
function review(db = dbFor('reviewer'), status = 'approved', note = '', overrides = {}, actor = 'reviewer') {
  return updateDoc(doc(db, 'studentVerifications', UID), {
    status, reviewNote: note, reviewedBy: { uid: actor, email: email(actor) }, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
  });
}
function withdraw(db = dbFor(), profile = false) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'studentVerifications', UID));
  batch.delete(doc(db, 'studentProofs', UID));
  if (profile) batch.delete(doc(db, 'users', UID));
  return batch.commit();
}
function purge(db = dbFor('reviewer')) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'studentProofs', UID));
  batch.update(doc(db, 'studentVerifications', UID), { proofAvailable: false, updatedAt: serverTimestamp() });
  return batch.commit();
}
const registration = (overrides = {}) => ({ userId: UID, eventId: EVENT, isTest: false,
  selection: { profile: 'student', congressMode: 'onsite' }, entitlements: {}, status: 'submitted',
  payment: { status: 'pending', amountCents: 6000 }, ...overrides });

before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-circ-students', firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } }); });
afterEach(async () => env.clearFirestore());
after(async () => env.cleanup());

test('verified student submits request and proof atomically', async () => {
  await seed(); await assertSucceeds(submit());
});
test('anonymous and unverified users cannot submit', async () => {
  await seed();
  await assertFails(submit(env.unauthenticatedContext().firestore()));
  await assertFails(submit(dbFor(UID, false)));
});
test('another account cannot submit on behalf of a student', async () => {
  await seed(); await assertFails(submit(dbFor('other')));
});
test('request must match the saved full profile name', async () => {
  await seed(); await assertFails(submit(dbFor(), { profileName: 'Outra Pessoa' }));
});
test('a saved profile is required', async () => { await assertFails(submit()); });
test('wrong year or event is rejected', async () => {
  await seed();
  await assertFails(submit(dbFor(), { academicYear: '2025/2026' }));
  await assertFails(submit(dbFor(), { eventId: 'another-event' }, { eventId: 'another-event' }));
});
test('students cannot grant approval or add arbitrary fields', async () => {
  await seed(); await assertFails(submit(dbFor(), { status: 'approved' }));
  await assertFails(submit(dbFor(), { roles: { secretariat: true } }));
});
test('proof and request must be created together', async () => {
  await seed();
  await assertFails(setDoc(doc(dbFor(), 'studentVerifications', UID), requestData()));
  await assertFails(setDoc(doc(dbFor(), 'studentProofs', UID), proofData()));
});
test('small PDF is accepted', async () => {
  await seed(); await assertSucceeds(submit(dbFor(), {}, { mimeType: 'application/pdf', base64: 'JVBERi0xLjQK' }));
});
test('invalid, active-content and oversized proofs are rejected', async () => {
  await seed();
  await assertFails(submit(dbFor(), {}, { base64: '/9j/' + 'A'.repeat(409600) }));
  await assertFails(submit(dbFor(), {}, { mimeType: 'image/svg+xml' }));
  await assertFails(submit(dbFor(), {}, { base64: '<script>alert(1)</script>' }));
});
test('the exact supported file size passes the rules', async () => {
  await seed(); await assertSucceeds(submit(dbFor(), {}, { base64: '/9j/' + 'A'.repeat(409596) }));
});
test('proof is readable only by its owner or secretariat', async () => {
  await seed({});
  for (const uid of [UID, 'reviewer', 'admin']) await assertSucceeds(getDoc(doc(dbFor(uid), 'studentProofs', UID)));
  for (const uid of ['other', 'scientific']) await assertFails(getDoc(doc(dbFor(uid), 'studentProofs', UID)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'studentProofs', UID)));
});
test('no client can list proof payloads, including secretariat', async () => {
  await seed({});
  await assertFails(getDocs(collection(dbFor('reviewer'), 'studentProofs')));
  await assertFails(getDocs(query(collection(dbFor('admin'), 'studentProofs'), limit(1))));
});
test('only secretariat can list metadata, at most 25 records per query', async () => {
  await seed({});
  const makeQuery = (db, n) => query(collection(db, 'studentVerifications'), where('eventId', '==', EVENT), where('status', '==', 'pending'), orderBy('updatedAt', 'desc'), limit(n));
  await assertSucceeds(getDocs(makeQuery(dbFor('reviewer'), 25)));
  await assertFails(getDocs(makeQuery(dbFor('reviewer'), 26)));
  await assertFails(getDocs(collection(dbFor('reviewer'), 'studentVerifications')));
  await assertFails(getDocs(makeQuery(dbFor(), 25)));
  await assertFails(getDocs(makeQuery(dbFor('scientific'), 25)));
});
test('secretariat can approve a matching request', async () => {
  await seed({}); await assertSucceeds(review());
});
test('ordinary and scientific accounts cannot approve', async () => {
  await seed({});
  await assertFails(review(dbFor('other'), 'approved', '', {}, 'other'));
  await assertFails(review(dbFor('scientific'), 'approved', '', {}, 'scientific'));
});
test('even a secretariat member cannot approve their own request', async () => {
  await seed({});
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'users', UID), { roles: { secretariat: true } }));
  await assertFails(review(dbFor(), 'approved', '', {}, UID));
});
test('a reviewer cannot change the submitted name, course or reviewer identity', async () => {
  await seed({});
  await assertFails(review(dbFor('reviewer'), 'approved', '', { profileName: 'Outro Nome' }));
  await assertFails(review(dbFor('reviewer'), 'approved', '', { course: 'Outro Curso' }));
  await assertFails(review(dbFor('reviewer'), 'approved', '', {}, 'admin'));
});
test('correction and rejection require a meaningful note', async () => {
  await seed({});
  await assertFails(review(dbFor('reviewer'), 'correction'));
  await assertFails(review(dbFor('reviewer'), 'rejected', '      '));
  await assertSucceeds(review(dbFor('reviewer'), 'correction', 'Falta o ano letivo.'));
  await assertSucceeds(review(dbFor('reviewer'), 'rejected', 'Curso não elegível.'));
});
test('profile name changes prevent approval of an old document', async () => {
  await seed({}); await updateDoc(doc(dbFor(), 'users', UID), { name: 'Outro Nome Completo' });
  await assertFails(review());
});
test('students cannot replace approved proof while retaining the approval', async () => {
  await seed({ status: 'approved' });
  await assertFails(setDoc(doc(dbFor(), 'studentProofs', UID), proofData()));
  await assertFails(submit(dbFor(), { status: 'approved', revision: 2 }, { revision: 2 }));
});
test('resubmission advances revision and resets the staff decision', async () => {
  await seed({ status: 'approved' });
  await assertSucceeds(submit(dbFor(), { revision: 2 }, { revision: 2 }));
  const data = (await getDoc(doc(dbFor(), 'studentVerifications', UID))).data();
  if (data.status !== 'pending' || data.reviewedBy !== null) throw new Error('Review was not reset');
  await assertFails(review(dbFor('reviewer'), 'approved', '', { revision: 1 }));
});
test('replaying the previous revision is rejected', async () => {
  await seed({}); await assertFails(submit());
});
test('resubmission within a minute is rejected', async () => {
  await seed(); await submit();
  await assertFails(submit(dbFor(), { revision: 2 }, { revision: 2 }));
});
test('withdrawal removes both request and proof atomically', async () => {
  await seed({});
  await assertFails(deleteDoc(doc(dbFor(), 'studentVerifications', UID)));
  await assertFails(deleteDoc(doc(dbFor(), 'studentProofs', UID)));
  await assertSucceeds(withdraw());
});
test('deleting an account can remove profile and student documents together', async () => {
  await seed({ status: 'approved' }); await assertSucceeds(withdraw(dbFor(), true));
});
test('reviewed proof may be purged without revoking the recorded decision', async () => {
  await seed({ status: 'approved' }); await assertSucceeds(purge());
  const data = (await getDoc(doc(dbFor(), 'studentVerifications', UID))).data();
  if (data.status !== 'approved' || data.proofAvailable !== false) throw new Error('Decision changed');
  await assertFails(review());
  await assertSucceeds(setDoc(doc(dbFor('admin'), 'registrations', 'registration-a'), registration()));
});
test('secretariat cannot purge pending proof or remove an entire request', async () => {
  await seed({}); await assertFails(purge());
  await assertFails(withdraw(dbFor('reviewer')));
});
test('real student registrations require approval even when written by admin', async () => {
  await seed({}); const ref = doc(dbFor('admin'), 'registrations', 'registration-a');
  await assertFails(setDoc(ref, registration()));
  await review(); await assertSucceeds(setDoc(ref, registration()));
});
test('a changed profile name invalidates the student rate', async () => {
  await seed({ status: 'approved' });
  await updateDoc(doc(dbFor(), 'users', UID), { name: 'Outro Nome Completo' });
  await assertFails(setDoc(doc(dbFor('admin'), 'registrations', 'registration-a'), registration()));
});
test('approved students may register for morning, afternoon or both courses with any congress mode', async () => {
  await seed({ status: 'approved' }); const db = dbFor('admin');
  for (const congressMode of ['onsite', 'virtual', 'courses-only']) {
    for (const courses of [{ morningCourse: true }, { afternoonCourse: true }, { morningCourse: true, afternoonCourse: true }]) {
      await assertSucceeds(setDoc(doc(db, 'registrations', 'registration-a'), registration({
        selection: { profile: 'student', courseAffiliation: 'external', congressMode, ...courses },
        entitlements: { congressMode, ...courses },
      })));
    }
  }
});
test('student supplementary courses remain subject to approval and account ownership', async () => {
  await seed({ status: 'approved' }); const db = dbFor('admin');
  const ref = doc(db, 'registrations', 'registration-a');
  await setDoc(ref, registration());
  const orderRef = doc(db, 'registrationOrders', 'order-a');
  const order = { userId: UID, registrationId: 'registration-a', isTest: false, items: { dinnerQuantity: 1 } };
  await assertSucceeds(setDoc(orderRef, order));
  await assertSucceeds(setDoc(orderRef, { ...order, items: { morningCourse: true, afternoonCourse: true } }));
  await assertFails(setDoc(orderRef, { ...order, userId: 'other', items: { morningCourse: true } }));
  await review(dbFor('reviewer'), 'rejected', 'Matrícula não comprovada.');
  await assertFails(setDoc(orderRef, { ...order, items: { morningCourse: true } }));
});
test('pending students cannot register for courses-only and participants cannot bypass the registration flow', async () => {
  await seed({});
  const data = registration({ selection: { profile: 'student', courseAffiliation: 'external', congressMode: 'courses-only', morningCourse: true } });
  await assertFails(setDoc(doc(dbFor('admin'), 'registrations', 'registration-a'), data));
  await review();
  await assertFails(setDoc(doc(dbFor(), 'registrations', 'registration-a'), data));
});
test('external registrations and explicitly marked admin simulations still work', async () => {
  await seed(); const db = dbFor('admin');
  await assertSucceeds(setDoc(doc(db, 'registrations', 'external'), registration({ selection: { profile: 'external' } })));
  await assertSucceeds(setDoc(doc(db, 'registrations', 'simulation'), registration({ isTest: true })));
  await assertFails(setDoc(doc(dbFor(), 'registrations', 'simulation-user'), registration({ isTest: true })));
});
test('historical update fallback cannot confirm or mark paid after student revocation', async () => {
  await seed({ status: 'approved' }); const db = dbFor('admin');
  const ref = doc(db, 'registrations', 'registration-a'); await setDoc(ref, registration());
  await review(dbFor('reviewer'), 'rejected', 'Comprovativo inválido.');
  const actor = { uid: 'admin', email: email('admin') };
  await assertFails(updateDoc(ref, { status: 'confirmed', updatedAt: serverTimestamp(), updatedBy: actor }));
  await assertFails(updateDoc(ref, { payment: { status: 'paid', amountCents: 6000, updatedAt: serverTimestamp(), updatedBy: actor }, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'cancelled', updatedAt: serverTimestamp(), updatedBy: actor }));
});
