import { getFirebaseFirestore, isAdminUser } from './firebaseClient';

export const paymentStatuses = ['pending', 'awaiting_confirmation', 'paid', 'refunded', 'cancelled'];
export const registrationStatuses = ['draft', 'submitted', 'confirmed', 'cancelled'];

function dbOrThrow() {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('firestore/not-configured');
  return db;
}

export function subscribeToRegistrations(onData, onError) {
  let db;
  try {
    db = dbOrThrow();
  } catch (error) {
    onError(error);
    return () => {};
  }

  return db.collection('registrations')
    .where('eventId', '==', 'circ-2027')
    .orderBy('createdAt', 'desc')
    .limit(500)
    .onSnapshot(
      (snapshot) => {
        onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      onError
    );
}

export function subscribeToRegistrationNotes(onData, onError) {
  let db;
  try {
    db = dbOrThrow();
  } catch (error) {
    onError(error);
    return () => {};
  }

  return db.collection('settings').doc('circ-2027-registration-notes').onSnapshot(
    (snapshot) => onData(snapshot.data()?.notes || {}),
    onError
  );
}

function actor(user) {
  return {
    uid: user.uid,
    email: user.email || '',
  };
}

export async function updatePaymentStatus(user, registration, status) {
  if (!paymentStatuses.includes(status)) throw new Error('payments/invalid-status');
  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const registrationRef = db.collection('registrations').doc(registration.id);
  const paymentRef = db.collection('payments').doc(registration.id);
  const auditRef = db.collection('auditLogs').doc();
  const changedBy = actor(user);
  const payment = registration.payment || {};
  const batch = db.batch();

  batch.update(registrationRef, {
    'payment.status': status,
    'payment.updatedAt': timestamp,
    'payment.updatedBy': changedBy,
    updatedAt: timestamp,
  });
  batch.set(paymentRef, {
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    userId: registration.userId || '',
    participantEmail: registration.participantEmail || '',
    amountCents: Number(payment.amountCents || 0),
    currency: payment.currency || 'EUR',
    method: payment.method || '',
    reference: payment.reference || '',
    status,
    updatedAt: timestamp,
    updatedBy: changedBy,
  }, { merge: true });
  batch.set(auditRef, {
    action: 'payment.status.updated',
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    before: payment.status || 'pending',
    after: status,
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
}

export async function updateRegistrationStatus(user, registration, status) {
  if (!registrationStatuses.includes(status)) throw new Error('registrations/invalid-status');
  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const batch = db.batch();

  batch.update(db.collection('registrations').doc(registration.id), {
    status,
    updatedAt: timestamp,
    updatedBy: changedBy,
  });
  batch.set(db.collection('auditLogs').doc(), {
    action: 'registration.status.updated',
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    before: registration.status || 'draft',
    after: status,
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
}

export async function updateRegistrationNote(user, registration, note, previousNote = '') {
  const normalizedNote = String(note || '').trim();
  if (normalizedNote.length > 500) throw new Error('registrations/note-too-long');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const batch = db.batch();

  batch.set(db.collection('settings').doc('circ-2027-registration-notes'), {
    eventId: 'circ-2027',
    notes: { [registration.id]: normalizedNote },
    updatedAt: timestamp,
    updatedBy: changedBy,
  }, { merge: true });
  batch.set(db.collection('auditLogs').doc(), {
    action: 'registration.note.updated',
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    before: String(previousNote || '').trim(),
    after: normalizedNote,
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
}


const REGISTRATION_RESET_TEST_EMAIL = 'araujotiagofc@gmail.com';

export async function resetDesignatedParticipantRegistration(user, registration) {
  if (!isAdminUser(user)) throw new Error('registrations/admin-only');
  const email = String(registration?.participantEmail || '').trim().toLowerCase();
  if (!registration?.id || email !== REGISTRATION_RESET_TEST_EMAIL) throw new Error('registrations/reset-not-allowed');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const [ordersSnapshot, documentsSnapshot] = await Promise.all([
    db.collection('registrationOrders').where('registrationId', '==', registration.id).limit(100).get(),
    db.collection('documents').where('registrationId', '==', registration.id).limit(100).get(),
  ]);

  const batch = db.batch();
  batch.delete(db.collection('registrations').doc(registration.id));
  batch.delete(db.collection('payments').doc(registration.id));
  ordersSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  documentsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  batch.set(db.collection('auditLogs').doc(), {
    action: 'registration.test-account.reset',
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    participantEmail: email,
    deletedOrders: ordersSnapshot.size,
    deletedDocuments: documentsSnapshot.size,
    actor: changedBy,
    createdAt: timestamp,
  });
  await batch.commit();
}
