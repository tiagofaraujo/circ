const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, updateDoc, writeBatch, serverTimestamp } = require('firebase/firestore');
let env;
const manager = 'paulojaneiro77@gmail.com';
const paymentId = '649d2dbd-6125-4212-bfa8-22035a3a55e7';
const dbFor = (email = manager, verified = true) => env.authenticatedContext('paulo', { email, email_verified: verified }).firestore();
const registration = { eventId: 'circ-2027', userId: 'participant', primaryRegistration: true, isTest: false, testMode: false,
  status: 'confirmed', selection: { profile: 'external', congressMode: 'onsite' },
  entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
  payment: { status: 'paid', amountCents: 9500, currency: 'EUR', method: 'multibanco', reference: '123456789' } };
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-circ-registration-management',
  firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } }); });
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [key, value] of Object.entries({
      'users/participant': { name: 'Participante', roles: {} },
      'users/paulo': { roles: { admin: true, registrations: true, billing: true } },
      'registrations/circ-2027-participant': registration,
      [`payments/${paymentId}`]: { id: paymentId, registrationId: 'circ-2027-participant', reference: '123456789', paidAt: '2026-11-15T12:00:00Z', transactionId: '777', userId: 'participant', eventId: 'circ-2027', status: 'paid', environment: 'production', amountCents: 9500, currency: 'EUR', method: 'multibanco', provider: 'eupago', fiscalStatus: 'issued' },
      'documents/order': { userId: 'participant', eventId: 'circ-2027' },
      'companyPurchases/purchase': { eventId: 'circ-2027', status: 'paid' },
      'settings/circ-2027-registration-notes': { eventId: 'circ-2027', notes: {} },
      'paymentFees/order': { amountCents: 42 },
      'submissions/private': { userId: 'author', status: 'submitted' },
      'studentProofs/participant': { userId: 'participant' },
    })) await setDoc(doc(db, key), value);
  });
});
test('the verified manager can read registration, payment, document, statistics and billing sources', async () => {
  const db = dbFor();
  for (const name of ['registrations', 'payments', 'documents', 'registrationOrders', 'users', 'companyPurchases']) {
    await assertSucceeds(getDocs(collection(db, name)));
  }
  await assertSucceeds(getDoc(doc(db, 'settings/circ-2027-registration-notes')));
});
test('notes and a completed refund can be saved with the manager audit identity', async () => {
  const db = dbFor(), actor = { uid: 'paulo', email: manager };
  const batch = writeBatch(db);
  batch.set(doc(db, 'settings/circ-2027-registration-notes'), { eventId: 'circ-2027', notes: { 'circ-2027-participant': 'Contacto efetuado' }, updatedBy: actor, updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, 'auditLogs/note'), { action: 'registration.note.updated', eventId: 'circ-2027', registrationId: 'circ-2027-participant', actor, createdAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(writeRefund(db));
  assert.equal((await getDoc(doc(db, 'registrations/circ-2027-participant'))).data().payment.status, 'refunded');
});
test('management does not grant other modules, configuration changes, roles or forged audit actors', async () => {
  const db = dbFor();
  for (const key of ['submissions/private', 'studentProofs/participant', 'paymentFees/order']) await assertFails(getDoc(doc(db, key)));
  await assertFails(getDocs(collection(db, 'companyVouchers')));
  await assertFails(updateDoc(doc(db, 'companyPurchases/purchase'), { status: 'pending' }));
  await assertFails(updateDoc(doc(db, `payments/${paymentId}`), { amountCents: 1 }));
  await assertFails(updateDoc(doc(db, 'documents/order'), { status: 'issued' }));
  await assertFails(updateDoc(doc(db, 'users/participant'), { roles: { admin: true } }));
  await assertFails(updateDoc(doc(db, 'users/paulo'), { roles: { secretariat: true } }));
  await assertFails(setDoc(doc(db, 'settings/circ-2027-paid-capacity-v1'), { enabled: false }));
  await assertFails(setDoc(doc(db, 'settings/other'), { enabled: true }));
  await assertFails(setDoc(doc(db, 'auditLogs/forged'), { action: 'registration.note.updated', eventId: 'circ-2027', registrationId: 'circ-2027-participant', actor: { uid: 'owner', email: 'circ.chuc@gmail.com' }, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'auditLogs/unrelated'), { action: 'scientific.decision.updated', eventId: 'circ-2027', registrationId: 'circ-2027-participant', actor: { uid: 'paulo', email: manager }, createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'registrations/circ-2027-participant'), { 'entitlements.morningCourse': true }));
});
test('unverified, lookalike and unrelated accounts cannot use stored roles to grant these permissions', async () => {
  for (const [email, verified] of [[manager, false], ['paulojaneiro77+other@gmail.com', true], ['paulojaneiro77@gmail.com.attacker.test', true], ['other@example.test', true]]) {
    const db = dbFor(email, verified);
    await assertFails(getDocs(collection(db, 'registrations')));
    await assertFails(getDocs(collection(db, 'payments')));
    await assertFails(getDocs(collection(db, 'companyPurchases')));
    await assertFails(updateDoc(doc(db, 'settings/circ-2027-registration-notes'), { notes: {} }));
  }
});

function refundWrites(db) {
  const actor = { uid: 'paulo', email: manager };
  const refund = { paymentId, auditId: 'refund', kind: 'full_refund_record', completedExternally: true, amountCents: 9500,
    currency: 'EUR', reason: 'Desistência do participante', reference: 'REF-123', date: '2026-11-16',
    recordedAt: serverTimestamp(), recordedBy: actor, fiscalReviewRequired: true };
  return {
    payment: { status: 'refunded', updatedAt: serverTimestamp(), refund },
    registration: { refund, status: 'cancelled', 'payment.status': 'refunded', 'payment.updatedAt': serverTimestamp(),
      'payment.updatedBy': actor, updatedAt: serverTimestamp(), updatedBy: actor },
    audit: { action: 'payment.refund.recorded', eventId: 'circ-2027', userId: 'participant', registrationId: 'circ-2027-participant',
      paymentId, refund, actor, createdAt: serverTimestamp() },
  };
}
function writeRefund(db, { payment = true, registration = true, audit = true, change } = {}) {
  const writes = refundWrites(db), batch = writeBatch(db);
  if (change) change(writes);
  if (payment) batch.update(doc(db, `payments/${paymentId}`), writes.payment);
  if (registration) batch.update(doc(db, 'registrations/circ-2027-participant'), writes.registration);
  if (audit) batch.set(doc(db, 'auditLogs/refund'), writes.audit);
  return batch.commit();
}
test('delegated refunds require the payment, registration and audit to change atomically', async () => {
  const db = dbFor();
  for (const excluded of ['payment', 'registration', 'audit']) await assertFails(writeRefund(db, { [excluded]: false }));
  await assertFails(writeRefund(db, { change: w => { w.audit.paymentId = 'different-payment'; } }));
  await assertFails(writeRefund(db, { change: w => { w.registration.refund = { ...w.registration.refund, amountCents: 1 }; } }));
  assert.equal((await getDoc(doc(db, 'registrations/circ-2027-participant'))).data().status, 'confirmed');
  assert.equal((await getDoc(doc(db, `payments/${paymentId}`))).data().status, 'paid');
});
for (const [label, target, changes] of [
  ['non-Multibanco payment', `payments/${paymentId}`, { method: 'stripe_card' }],
  ['fiscal issuance in progress', `payments/${paymentId}`, { fiscalStatus: 'issuing' }],
  ['payment for another registration', `payments/${paymentId}`, { userId: 'another', registrationId: 'circ-2027-another' }],
  ['mismatched payment amount', `payments/${paymentId}`, { amountCents: 9600 }],
  ['additional orders', 'registrations/circ-2027-participant', { addOnOrderCount: 1 }],
  ['course entitlement', 'registrations/circ-2027-participant', { 'entitlements.morningCourse': true }],
  ['test registration', 'registrations/circ-2027-participant', { isTest: true }],
]) test(`delegated refund rejects ${label} even in a complete batch`, async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), target), changes));
  await assertFails(writeRefund(dbFor()));
});
