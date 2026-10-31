import { getFirebaseFirestore, isAdminUser } from './firebaseClient';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail = code => { throw new Error(`refund/${code}`); };
const hasControlCharacters = value => Array.from(value).some(character => character.codePointAt(0) < 32 || character.codePointAt(0) === 127);

export function canRecordRegistrationRefund(registration) {
  return Boolean(registration?.id === `circ-2027-${registration.userId}` && registration.eventId === 'circ-2027'
    && registration.primaryRegistration === true && registration.isTest === false && registration.testMode === false
    && registration.status === 'confirmed' && registration.payment?.status === 'paid'
    && Number.isSafeInteger(registration.payment.amountCents) && registration.payment.amountCents > 0
    && registration.payment.currency === 'EUR' && registration.payment.method === 'multibanco'
    && Number(registration.addOnOrderCount || 0) === 0
    && !registration.entitlements?.morningCourse && !registration.entitlements?.afternoonCourse
    && Number(registration.entitlements?.dinnerQuantity || 0) === 0);
}

export function lisbonToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Records an already completed full refund. Never calls a bank, payment provider
// or fiscal API. Both statuses and the audit entry change in one transaction.
export async function recordRegistrationRefund(user, registration, input) {
  if (!isAdminUser(user)) fail('admin-required');
  if (!canRecordRegistrationRefund(registration)) fail('registration-not-eligible');
  const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
  const reference = typeof input?.reference === 'string' ? input.reference.trim() : '';
  const date = input?.date;
  if (input?.completed !== true || reason.length < 5 || reason.length > 500
    || reference.length < 3 || reference.length > 100 || hasControlCharacters(reason + reference)
    || typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || date > lisbonToday()) fail('details-required');
  const db = getFirebaseFirestore();
  if (!db) fail('unavailable');
  const matches = await db.collection('payments').where('registrationId', '==', registration.id)
    .where('environment', '==', 'production').limit(2).get();
  if (matches.docs.length !== 1 || !UUID.test(matches.docs[0].id)) fail('source-not-unique');
  const paymentRef = matches.docs[0].ref;
  const registrationRef = db.collection('registrations').doc(registration.id);
  const auditRef = db.collection('auditLogs').doc();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const actor = { uid: user.uid, email: user.email };
  return db.runTransaction(async transaction => {
    const [registrationDoc, paymentDoc] = await Promise.all([transaction.get(registrationRef), transaction.get(paymentRef)]);
    const current = registrationDoc.exists ? { ...registrationDoc.data(), id: registrationDoc.id } : null;
    const payment = paymentDoc.exists ? paymentDoc.data() : null;
    if (!canRecordRegistrationRefund(current) || !payment || payment.id !== paymentDoc.id
      || payment.environment !== 'production' || payment.eventId !== 'circ-2027' || payment.userId !== current.userId
      || payment.registrationId !== current.id || payment.provider !== 'eupago' || payment.method !== 'multibanco'
      || payment.identifier !== `circ_live_${paymentDoc.id.replaceAll('-', '')}`
      || payment.status !== 'paid' || !payment.paidAt || !payment.transactionId || payment.fiscalStatus === 'pending'
      || payment.amountCents !== current.payment.amountCents || payment.currency !== current.payment.currency
      || payment.reference !== current.payment.reference || payment.method !== current.payment.method
      || payment.amountCents !== registration.payment.amountCents || payment.reference !== registration.payment.reference) fail('state-changed');
    if (date < String(payment.paidAt).slice(0, 10)) fail('details-required');
    const refund = { kind: 'full_refund_record', completedExternally: true, amountCents: payment.amountCents,
      currency: 'EUR', reason, reference, date, recordedAt: timestamp, recordedBy: actor,
      fiscalReviewRequired: true };
    transaction.update(paymentRef, { status: 'refunded', refund, updatedAt: timestamp });
    transaction.update(registrationRef, { status: 'cancelled', 'payment.status': 'refunded',
      'payment.updatedAt': timestamp, 'payment.updatedBy': actor, updatedAt: timestamp, updatedBy: actor });
    transaction.set(auditRef, { action: 'payment.refund.recorded', eventId: 'circ-2027', registrationId: current.id,
      paymentId: paymentDoc.id, userId: current.userId, before: { registration: 'confirmed', payment: 'paid' },
      after: { registration: 'cancelled', payment: 'refunded' }, refund, actor, createdAt: timestamp });
    return { recorded: true };
  });
}
