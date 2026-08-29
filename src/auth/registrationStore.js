import { getFirebaseFirestore, isAdminUser } from './firebaseClient';

function dbOrThrow() {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('firestore/not-configured');
  return db;
}

function registrationLabel(selection) {
  if (selection.congressMode === 'onsite') return 'CIRC 2027 · Presencial';
  if (selection.congressMode === 'virtual') return 'CIRC 2027 · Virtual';
  return 'Cursos Pré-Congresso';
}

export async function saveAdminTestRegistration(user, selection) {
  if (!isAdminUser(user)) throw new Error('registrations/admin-only');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const registrationId = `test-${user.uid}`;
  const registrationRef = db.collection('registrations').doc(registrationId);
  const auditRef = db.collection('auditLogs').doc();
  const participantName = user.displayName || user.email?.split('@')[0] || 'Administrador CIRC';
  const amountCents = Math.round(Number(selection.total || 0) * 100);
  const studentProfile = selection.profile === 'student';
  const batch = db.batch();

  batch.set(registrationRef, {
    eventId: 'circ-2027',
    userId: user.uid,
    participantName: `${participantName} · TESTE`,
    participantEmail: user.email || '',
    registrationType: `TESTE · ${registrationLabel(selection)}`,
    status: 'submitted',
    isTest: true,
    testMode: true,
    selection: {
      profile: selection.profile,
      courseAffiliation: selection.courseAffiliation || '',
      congressMode: selection.congressMode,
      morningCourse: !studentProfile && Boolean(selection.morningCourse),
      afternoonCourse: !studentProfile && Boolean(selection.afternoonCourse),
      dinner: Number(selection.dinnerQuantity || 0) > 0,
      dinnerQuantity: Math.max(0, Math.floor(Number(selection.dinnerQuantity || 0))),
      ratePeriod: selection.period,
    },
    payment: {
      status: 'pending',
      amountCents,
      currency: 'EUR',
      method: 'teste administrativo',
      reference: 'TESTE-NAO-PAGAR',
    },
    documentCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });

  batch.set(auditRef, {
    action: 'registration.test.saved',
    eventId: 'circ-2027',
    registrationId,
    actor: { uid: user.uid, email: user.email || '' },
    amountCents,
    createdAt: timestamp,
  });

  await batch.commit();
  return registrationId;
}
