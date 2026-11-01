import { getFirebaseFirestore } from './firebaseClient';

export const paymentStatuses = ['pending', 'awaiting_confirmation', 'paid', 'refunded', 'cancelled'];

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
        onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter(item => item.isTest !== true && item.archived !== true));
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
