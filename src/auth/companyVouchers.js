import { getFirebaseAuth, getFirebaseFirestore, isAdminUser } from './firebaseClient';
export const COMPANY_CONFIG = 'circ-2027-company-vouchers';
export const companyRegistrationId = (uid) => `circ-2027-${uid}`;
export const formatVoucher = (code) => code.match(/.{1,4}/g)?.join('-') || code;
export function normalizeVoucher(value) {
  const code = String(value || '').replace(/[\s-]/g, '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('company/invalid-code');
  return code;
}
export function newVoucherCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function companyError(error) {
  return ({
    'company/invalid-code': 'Código inválido, cancelado ou já utilizado por outra conta.',
    'company/closed': 'A utilização de códigos ainda não está ativa.',
    'company/existing': 'Já existe uma inscrição nesta conta. Contacte a organização.',
    'company/profile': 'Guarde o nome completo no perfil antes de continuar.',
    'company/auth': 'Entre na sua conta e confirme o email.',
    'company/details': 'Verifique os dados da empresa, a quantidade e o preço por inscrição.',
    'company/conflict': 'O registo foi alterado. Atualize a lista antes de continuar.',
    'company/transfer': 'Indique a referência da transferência confirmada.',
    'permission-denied': 'Acesso recusado. Confirme a conta e a ativação das regras no Firebase.',
    'unavailable': 'Sem ligação ao servidor. A operação não foi confirmada; tente novamente.',
  })[error?.code || error?.message] || 'Não foi possível concluir a operação. Atualize e tente novamente.';
}
function context(admin = false) {
  const user = getFirebaseAuth()?.currentUser;
  if (!user?.emailVerified || (admin && !isAdminUser(user))) throw new Error('company/auth');
  const db = getFirebaseFirestore();
  if (!db) throw new Error('unavailable');
  return { user, db, stamp: () => window.firebase.firestore.FieldValue.serverTimestamp() };
}
export function subscribeCompanyConfig(next, fail) {
  const db = getFirebaseFirestore();
  if (!db) { next(false); return () => {}; }
  return db.collection('settings').doc(COMPANY_CONFIG).onSnapshot((s) => next(s.data()?.enabled === true), fail);
}
export function subscribeCompanyRegistration(user, next, fail) {
  const db = getFirebaseFirestore();
  if (!db || !user?.uid) { next(null); return () => {}; }
  return db.collection('registrations').doc(companyRegistrationId(user.uid)).onSnapshot(
    (s) => next(s.exists ? { id: s.id, ...s.data() } : null), fail);
}
export async function createCompanyPurchase(form) {
  const { user, db, stamp } = context(true);
  const company = Object.fromEntries(['name', 'taxNumber', 'address', 'email'].map((k) => [k, String(form[k] || '').trim()]));
  const quantity = Number(form.quantity);
  const unitAmountCents = Math.round(Number(String(form.unitPrice).replace(',', '.')) * 100);
  if (company.name.length < 2 || company.name.length > 160 || !company.taxNumber || company.taxNumber.length > 40
    || !company.address || company.address.length > 300 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)
    || company.email.length > 254 || !Number.isInteger(quantity) || quantity < 1 || quantity > 50
    || !Number.isSafeInteger(unitAmountCents) || unitAmountCents < 1 || unitAmountCents > 100000) throw new Error('company/details');
  const ref = db.collection('companyPurchases').doc();
  const batch = db.batch();
  batch.set(ref, { eventId: 'circ-2027', company, quantity, unitAmountCents, amountCents: quantity * unitAmountCents,
    status: 'pending', codes: [], transferReference: '', fiscalReference: '', createdAt: stamp(), updatedAt: stamp(),
    createdBy: user.uid, confirmedBy: null, confirmedAt: null });
  batch.set(db.collection('auditLogs').doc(), { action: 'company.purchase.created', purchaseId: ref.id,
    actor: { uid: user.uid, email: user.email }, eventId: 'circ-2027', createdAt: stamp() });
  await batch.commit();
  return ref.id;
}
export async function confirmCompanyTransfer(id, transferReference, fiscalReference = '') {
  const { user, db, stamp } = context(true);
  const reference = transferReference.trim();
  if (reference.length < 2 || reference.length > 200 || fiscalReference.length > 200) throw new Error('company/transfer');
  const ref = db.collection('companyPurchases').doc(id);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const p = snapshot.data();
    if (!p || p.status !== 'pending') throw new Error('company/conflict');
    const codes = Array.from({ length: p.quantity }, newVoucherCode);
    tx.update(ref, { status: 'paid', codes, transferReference: reference, fiscalReference: fiscalReference.trim(),
      confirmedBy: user.uid, confirmedAt: stamp(), updatedAt: stamp() });
    codes.forEach((code, index) => tx.set(db.collection('companyVouchers').doc(code), {
      eventId: 'circ-2027', purchaseId: id, index, companyName: p.company.name, unitAmountCents: p.unitAmountCents,
      status: 'available', redeemedBy: null, registrationId: null, redeemedAt: null, createdAt: stamp(), updatedAt: stamp(),
    }));
    tx.set(db.collection('auditLogs').doc(), { action: 'company.transfer.confirmed', purchaseId: id,
      amountCents: p.amountCents, actor: { uid: user.uid, email: user.email }, eventId: 'circ-2027', createdAt: stamp() });
  });
}
export async function cancelCompanyVoucher(code) {
  const { user, db, stamp } = context(true);
  const ref = db.collection('companyVouchers').doc(code);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.data()?.status !== 'available') throw new Error('company/conflict');
    tx.update(ref, { status: 'cancelled', updatedAt: stamp() });
    tx.set(db.collection('auditLogs').doc(), { action: 'company.voucher.cancelled', voucherId: code,
      actor: { uid: user.uid, email: user.email }, eventId: 'circ-2027', createdAt: stamp() });
  });
}
export async function setCompanyCodesEnabled(enabled) {
  const { user, db, stamp } = context(true);
  const batch = db.batch();
  batch.set(db.collection('settings').doc(COMPANY_CONFIG), { enabled, updatedAt: stamp(), updatedBy: user.uid });
  batch.set(db.collection('auditLogs').doc(), { action: 'company.codes.activation', enabled,
    actor: { uid: user.uid, email: user.email }, eventId: 'circ-2027', createdAt: stamp() });
  await batch.commit();
}
export async function loadCompanyPurchases(after = null) {
  const { db } = context(true);
  let q = db.collection('companyPurchases').orderBy('createdAt', 'desc').limit(25);
  if (after) q = q.startAfter(after);
  const s = await q.get({ source: 'server' });
  return { items: s.docs.map((d) => ({ id: d.id, ...d.data() })), cursor: s.docs.length === 25 ? s.docs[24] : null };
}
export async function loadCompanyVouchers(purchase) {
  const { db } = context(true);
  return Promise.all(purchase.codes.map(async (code) => {
    const s = await db.collection('companyVouchers').doc(code).get({ source: 'server' });
    return { code, ...s.data() };
  }));
}
export async function redeemCompanyVoucher(value) {
  const { user, db, stamp } = context();
  const code = normalizeVoucher(value);
  const ref = db.collection('companyVouchers').doc(code);
  const registrationId = companyRegistrationId(user.uid);
  const reg = db.collection('registrations').doc(registrationId);
  await db.runTransaction(async (tx) => {
    const config = await tx.get(db.collection('settings').doc(COMPANY_CONFIG));
    if (config.data()?.enabled !== true) throw new Error('company/closed');
    const existing = await tx.get(reg);
    if (existing.exists) {
      if (existing.data().voucherId === code) return; // Retry after a lost response is idempotent.
      throw new Error('company/existing');
    }
    const s = await tx.get(ref);
    const v = s.data();
    if (!v || v.status !== 'available') throw new Error('company/invalid-code');
    const profile = await tx.get(db.collection('users').doc(user.uid));
    const name = profile.data()?.name;
    if (typeof name !== 'string' || name.trim().length < 5 || name.length > 200) throw new Error('company/profile');
    tx.set(reg, { eventId: 'circ-2027', userId: user.uid, registrationKey: `circ-2027:${user.uid}`,
      primaryRegistration: true, participantName: name, participantEmail: user.email,
      registrationType: 'CIRC 2027 · Presencial', status: 'confirmed', isTest: false, testMode: false,
      selection: { profile: 'external', courseAffiliation: 'external', congressMode: 'onsite', morningCourse: false,
        afternoonCourse: false, dinner: false, dinnerQuantity: 0, ratePeriod: 'company' },
      entitlements: { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
      payment: { status: 'paid', amountCents: 0, coveredAmountCents: v.unitAmountCents, currency: 'EUR',
        method: 'company_voucher', reference: v.purchaseId, payer: v.companyName },
      voucherId: code, companyPurchaseId: v.purchaseId, addOnOrderCount: 0, documentCount: 0,
      createdAt: stamp(), updatedAt: stamp() });
    tx.update(ref, { status: 'redeemed', redeemedBy: user.uid, registrationId, redeemedAt: stamp(), updatedAt: stamp() });
  });
  return registrationId;
}
