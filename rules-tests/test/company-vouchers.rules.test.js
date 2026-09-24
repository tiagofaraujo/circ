const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, updateDoc, writeBatch, serverTimestamp, runTransaction } = require('firebase/firestore');
let env;
const code = 'a'.repeat(32), second = 'b'.repeat(32);
const dbFor = (uid = 'alice', verified = true) => env.authenticatedContext(uid, { email: uid === 'admin' ? 'circ.chuc@gmail.com' : `${uid}@example.test`, email_verified: verified }).firestore();
const purchase = () => ({ eventId: 'circ-2027', company: { name: 'Empresa Teste', taxNumber: '123456789', address: 'Coimbra', email: 'empresa@example.test' },
  quantity: 2, unitAmountCents: 9500, amountCents: 19000, status: 'pending', codes: [], transferReference: '', fiscalReference: '',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: 'admin', confirmedBy: null, confirmedAt: null });
const voucher = (index = 0) => ({ eventId: 'circ-2027', purchaseId: 'purchase', index, companyName: 'Empresa Teste', unitAmountCents: 9500,
  status: 'available', redeemedBy: null, registrationId: null, redeemedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const registration = (uid = 'alice', id = code) => ({ eventId: 'circ-2027', userId: uid, registrationKey: `circ-2027:${uid}`, primaryRegistration: true,
  participantName: 'Pessoa Teste', participantEmail: `${uid}@example.test`, registrationType: 'CIRC 2027 · Presencial', status: 'confirmed', isTest: false, testMode: false,
  selection: { profile: 'external', courseAffiliation: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinner: false, dinnerQuantity: 0, ratePeriod: 'company' },
  entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
  payment: { status: 'paid', amountCents: 0, coveredAmountCents: 9500, currency: 'EUR', method: 'company_voucher', reference: 'purchase', payer: 'Empresa Teste' },
  voucherId: id, companyPurchaseId: 'purchase', addOnOrderCount: 0, documentCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const consumed = (uid) => ({ status: 'redeemed', redeemedBy: uid, registrationId: `circ-2027-${uid}`, redeemedAt: serverTimestamp(), updatedAt: serverTimestamp() });
function redeem(db, uid = 'alice', id = code, override = {}) {
  const b = writeBatch(db); b.set(doc(db, 'registrations', `circ-2027-${uid}`), { ...registration(uid, id), ...override });
  b.update(doc(db, 'companyVouchers', id), consumed(uid)); return b.commit();
}
async function activate() {
  const db = dbFor('admin');
  if (!(await getDoc(doc(db, 'companyPurchases', 'purchase'))).exists()) await setDoc(doc(db, 'companyPurchases', 'purchase'), purchase());
  const b = writeBatch(db);
  b.update(doc(db, 'companyPurchases', 'purchase'), { status: 'paid', codes: [code, second], transferReference: 'BANK-123', fiscalReference: '', confirmedAt: serverTimestamp(), confirmedBy: 'admin', updatedAt: serverTimestamp() });
  b.set(doc(db, 'companyVouchers', code), voucher()); b.set(doc(db, 'companyVouchers', second), voucher(1));
  await b.commit();
}
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-circ-companies', firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') } }); });
after(async () => env.cleanup());
beforeEach(async () => { await env.clearFirestore(); await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore(); await setDoc(doc(db, 'settings', 'circ-2027-company-vouchers'), { enabled: true });
  for (const uid of ['alice', 'bob']) await setDoc(doc(db, 'users', uid), { name: 'Pessoa Teste' });
}); });
test('paid purchase creates codes and atomic redemption grants only external onsite', async () => {
  await activate(); await assertSucceeds(redeem(dbFor()));
  const r = (await getDoc(doc(dbFor(), 'registrations', 'circ-2027-alice'))).data();
  assert.equal(r.payment.amountCents, 0); assert.equal(r.payment.coveredAmountCents, 9500);
  await assertFails(redeem(dbFor('bob'), 'bob')); await assertFails(redeem(dbFor(), 'alice', second));
});
test('private billing and voucher enumeration cannot be read by a participant', async () => {
  await activate(); await assertFails(getDoc(doc(dbFor(), 'companyPurchases', 'purchase')));
  await assertFails(getDocs(collection(dbFor(), 'companyVouchers')));
  await assertSucceeds(getDoc(doc(dbFor(), 'companyVouchers', code)));
  await assertSucceeds(getDoc(doc(dbFor(), 'registrations', 'circ-2027-alice')));
  await assertFails(getDoc(doc(dbFor(), 'registrations', 'circ-2027-bob')));
});
test('participants cannot issue codes, confirm bank transfers or enable redemption', async () => {
  await activate(); await assertFails(setDoc(doc(dbFor(), 'companyPurchases', 'forged'), purchase()));
  await assertFails(setDoc(doc(dbFor(), 'companyVouchers', 'c'.repeat(32)), voucher()));
  await assertFails(updateDoc(doc(dbFor(), 'companyPurchases', 'purchase'), { status: 'paid' }));
  await assertFails(updateDoc(doc(dbFor(), 'settings', 'circ-2027-company-vouchers'), { enabled: true }));
});
test('admin cannot issue codes against an unpaid purchase or outside its paid allocation', async () => {
  const db = dbFor('admin'); await setDoc(doc(db, 'companyPurchases', 'purchase'), purchase());
  await assertFails(setDoc(doc(db, 'companyVouchers', code), voucher()));
  await activate(); await assertFails(setDoc(doc(db, 'companyVouchers', 'c'.repeat(32)), voucher()));
});
test('code consumption and registration must be written together', async () => {
  await activate(); await assertFails(updateDoc(doc(dbFor(), 'companyVouchers', code), consumed('alice')));
  await assertFails(setDoc(doc(dbFor(), 'registrations', 'circ-2027-alice'), registration()));
});
for (const [name, override] of Object.entries({
  dinner: { entitlements: { ...registration().entitlements, dinnerQuantity: 1 } },
  course: { selection: { ...registration().selection, morningCourse: true } },
  virtual: { entitlements: { ...registration().entitlements, congressMode: 'virtual' } },
  student: { selection: { ...registration().selection, profile: 'student' } },
  amount: { payment: { ...registration().payment, amountCents: 9500 } },
  name: { participantName: 'Outra Pessoa' },
  email: { participantEmail: 'other@example.test' },
  extra: { roles: { admin: true } },
})) test(`rejects tampered registration: ${name}`, async () => { await activate(); await assertFails(redeem(dbFor(), 'alice', code, override)); });
test('disabled module and unverified accounts cannot redeem', async () => {
  await activate(); await assertFails(redeem(dbFor('alice', false)));
  await updateDoc(doc(dbFor('admin'), 'settings', 'circ-2027-company-vouchers'), { enabled: false });
  await assertFails(redeem(dbFor()));
});
test('cancelled codes stay cancelled; redeemed codes cannot be reset', async () => {
  await activate(); const db = dbFor('admin');
  await assertSucceeds(updateDoc(doc(db, 'companyVouchers', code), { status: 'cancelled', updatedAt: serverTimestamp() }));
  await assertFails(redeem(dbFor()));
  await assertFails(updateDoc(doc(db, 'companyVouchers', code), { status: 'available' }));
  await redeem(dbFor(), 'alice', second);
  await assertFails(updateDoc(doc(db, 'companyVouchers', second), { status: 'available', updatedAt: serverTimestamp() }));
});
test('two simultaneous claims allow exactly one registration', async () => {
  await activate();
  const claim = (uid) => { const db = dbFor(uid); return runTransaction(db, async (tx) => {
    const v = doc(db, 'companyVouchers', code);
    const s = await tx.get(v); if (s.data().status !== 'available') throw new Error('used');
    tx.set(doc(db, 'registrations', `circ-2027-${uid}`), registration(uid)); tx.update(v, consumed(uid));
  }); };
  const results = await Promise.allSettled([claim('alice'), claim('bob')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
