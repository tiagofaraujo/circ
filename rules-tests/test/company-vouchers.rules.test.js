const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, updateDoc, writeBatch, serverTimestamp, runTransaction, deleteField } = require('firebase/firestore');
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
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-circ-companies', firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8').replace('timestamp.date(2026, 11, 15)', 'timestamp.date(2000, 11, 15)') } }); });
after(async () => env.cleanup());
beforeEach(async () => { await env.clearFirestore(); await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore(); await setDoc(doc(db, 'settings', 'circ-2027-company-vouchers'), { enabled: true });
  for (const uid of ['alice', 'bob']) await setDoc(doc(db, 'users', uid), { name: 'Pessoa Teste' });
}); });
async function serverRedeem(uid = 'alice', id = code) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), b = writeBatch(db);
    b.set(doc(db, 'registrations', `circ-2027-${uid}`), registration(uid, id));
    b.update(doc(db, 'companyVouchers', id), consumed(uid)); await b.commit();
  });
}
test('paid purchase issues codes but only the capacity-checked server may redeem them', async () => {
  await activate(); await assertFails(redeem(dbFor())); await assertFails(redeem(dbFor('admin'), 'admin'));
  await serverRedeem();
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
  await serverRedeem('alice', second);
  await assertFails(updateDoc(doc(db, 'companyVouchers', second), { status: 'available', updatedAt: serverTimestamp() }));
});
test('parallel client claims cannot bypass server capacity checks', async () => {
  await activate();
  const claim = (uid) => { const db = dbFor(uid); return runTransaction(db, async (tx) => {
    const v = doc(db, 'companyVouchers', code);
    const s = await tx.get(v); if (s.data().status !== 'available') throw new Error('used');
    tx.set(doc(db, 'registrations', `circ-2027-${uid}`), registration(uid)); tx.update(v, consumed(uid));
  }); };
  const results = await Promise.allSettled([claim('alice'), claim('bob')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 0);
});

test('administrators cannot create real paid, confirmed or already admitted registrations directly', async () => {
  const db = dbFor('admin');
  const base = { ...registration(), status: 'submitted', payment: { status: 'pending', amountCents: 9500 }, entitlements: {} };
  await assertSucceeds(setDoc(doc(db, 'registrations', 'pending'), base));
  const variants = [
    { status: 'confirmed' }, { payment: { ...base.payment, status: 'paid' } },
    { entitlements: { congressMode: 'onsite' } }, { entitlements: { congressMode: 'virtual' } },
    { entitlements: { morningCourse: true } }, { entitlements: { afternoonCourse: true } },
    { entitlements: { dinnerQuantity: 1 } },
  ];
  for (let i = 0; i < variants.length; i++) await assertFails(setDoc(doc(db, 'registrations', `blocked-${i}`), { ...base, ...variants[i] }));
  // Explicit administrative simulations retain their existing permissions.
  await assertSucceeds(setDoc(doc(db, 'registrations', 'test'), { ...registration(), isTest: true, testMode: true }));
  await assertFails(setDoc(doc(dbFor(), 'registrations', 'test-owner'), { ...registration(), isTest: true, testMode: true }));
});

test('real registration updates cannot grant paid rights, change mode or bypass guards by changing test flags', async () => {
  const db = dbFor('admin');
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'registrations', 'pending'), {
      ...registration(), status: 'submitted', payment: { status: 'pending', amountCents: 9500 }, entitlements: {},
    });
    await setDoc(doc(ctx.firestore(), 'registrations', 'paid'), registration());
    await setDoc(doc(ctx.firestore(), 'registrations', 'simulation'), { ...registration(), isTest: true, testMode: true });
  });
  for (const change of [{ status: 'confirmed' }, { 'payment.status': 'paid' }, { 'entitlements.congressMode': 'onsite' },
    { 'entitlements.morningCourse': true }, { 'entitlements.afternoonCourse': true }, { 'entitlements.dinnerQuantity': 1 },
    { isTest: true }, { isTest: true, testMode: true }, { eventId: 'other' }, { userId: 'bob' }, { primaryRegistration: false }]) {
    await assertFails(updateDoc(doc(db, 'registrations', 'pending'), change));
  }
  for (const change of [{ 'entitlements.congressMode': 'virtual' }, { 'entitlements.morningCourse': true },
    { isTest: true, testMode: true }, { status: 'cancelled', isTest: true }, { testMode: true }]) {
    await assertFails(updateDoc(doc(db, 'registrations', 'paid'), change));
  }
  await assertFails(updateDoc(doc(db, 'registrations', 'simulation'), { isTest: false, testMode: false }));
  await assertSucceeds(updateDoc(doc(db, 'registrations', 'pending'), { internalNotes: 'Conferência administrativa', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'registrations', 'paid'), {
    status: 'cancelled', 'payment.status': 'refunded', entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 }, updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(db, 'registrations', 'paid'), { status: 'confirmed', 'payment.status': 'paid', 'entitlements.congressMode': 'onsite' }));
});

test('capacity review holds and the shared transaction lock cannot be modified by a client administrator', async () => {
  const db = dbFor('admin');
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'settings', 'circ-2027-paid-capacity-v1'), { eventId: 'circ-2027', revision: 7 });
    await setDoc(doc(ctx.firestore(), 'registrations', 'held'), { ...registration(), status: 'submitted', entitlements: {},
      capacityReviewOrderId: 'payment-order', capacityUnavailable: ['onsite'] });
  });
  await assertFails(setDoc(doc(db, 'settings', 'circ-2027-paid-capacity-v1'), { eventId: 'circ-2027', revision: 0 }));
  await assertFails(updateDoc(doc(db, 'registrations', 'held'), { capacityReviewOrderId: null }));
  await assertFails(updateDoc(doc(db, 'registrations', 'held'), { capacityUnavailable: [] }));
  await assertFails(updateDoc(doc(db, 'registrations', 'held'), { status: 'confirmed', 'entitlements.congressMode': 'onsite' }));
  await assertSucceeds(updateDoc(doc(db, 'registrations', 'held'), { internalNotes: 'Organização contactada', 'payment.status': 'refunded', status: 'cancelled' }));
  await assertSucceeds(setDoc(doc(db, 'settings', 'unrelated-admin-setting'), { enabled: true }));
});

test('removing rights or changing a legacy selection cannot introduce a new fallback admission', async () => {
  const db = dbFor('admin');
  await env.withSecurityRulesDisabled(async ctx => {
    const explicit = { ...registration(), entitlements: {} };
    await setDoc(doc(ctx.firestore(), 'registrations', 'explicit'), explicit);
    const legacy = { ...registration(), selection: { profile: 'external', congressMode: 'virtual', morningCourse: false, afternoonCourse: false } };
    delete legacy.entitlements;
    await setDoc(doc(ctx.firestore(), 'registrations', 'legacy'), legacy);
    const missingFlags = { ...registration() }; delete missingFlags.testMode;
    await setDoc(doc(ctx.firestore(), 'registrations', 'missing-flags'), missingFlags);
  });
  await assertFails(updateDoc(doc(db, 'registrations', 'explicit'), { entitlements: deleteField() }));
  await assertFails(updateDoc(doc(db, 'registrations', 'explicit'), { entitlements: null, 'selection.congressMode': 'onsite' }));
  await assertFails(updateDoc(doc(db, 'registrations', 'legacy'), { 'selection.congressMode': 'onsite' }));
  await assertFails(updateDoc(doc(db, 'registrations', 'legacy'), { 'selection.morningCourse': true }));
  await assertSucceeds(updateDoc(doc(db, 'registrations', 'legacy'), { internalNotes: 'Sem alteração dos direitos' }));
  await assertFails(updateDoc(doc(db, 'registrations', 'missing-flags'), { testMode: false }));
});

test('archive markers and canonical registration identity cannot hide or reintroduce paid places', async () => {
  const db = dbFor('admin');
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'registrations', 'active'), registration());
    await setDoc(doc(ctx.firestore(), 'registrations', 'archived'), { ...registration(), registrationArchiveId: 'archive', registrationArchivedAt: '2026-11-05T12:00:00Z' });
    const missingKey = { ...registration() }; delete missingKey.registrationKey;
    await setDoc(doc(ctx.firestore(), 'registrations', 'missing-key'), missingKey);
    await setDoc(doc(ctx.firestore(), 'registrations', 'null-key'), { ...registration(), registrationKey: null });
  });
  for (const change of [{ registrationArchiveId: 'archive' }, { registrationArchivedAt: serverTimestamp() },
    { registrationKey: 'circ-2027:other' }, { registrationKey: deleteField() }]) {
    await assertFails(updateDoc(doc(db, 'registrations', 'active'), change));
  }
  await assertFails(updateDoc(doc(db, 'registrations', 'archived'), { registrationArchiveId: deleteField(), registrationArchivedAt: deleteField() }));
  await assertFails(updateDoc(doc(db, 'registrations', 'missing-key'), { registrationKey: null }));
  await assertFails(updateDoc(doc(db, 'registrations', 'null-key'), { registrationKey: deleteField() }));
  await assertSucceeds(updateDoc(doc(db, 'registrations', 'archived'), { internalNotes: 'Arquivo mantido' }));
});
