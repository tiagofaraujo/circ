import { getFirebaseFirestore, isAdminUser } from './firebaseClient';
import { DINNER_RATE, getCourseRate } from '../data/registration2027';

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

function testRegistrationId(user) {
  return `test-${user.uid}`;
}

export function subscribeToAdminTestRegistration(user, onData, onError) {
  if (!isAdminUser(user)) {
    onData(null);
    return () => {};
  }

  let db;
  try {
    db = dbOrThrow();
  } catch (error) {
    onError(error);
    return () => {};
  }

  return db.collection('registrations').doc(testRegistrationId(user)).onSnapshot(
    (snapshot) => onData(snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null),
    onError
  );
}

export function subscribeToAdminTestAddOnOrders(user, onData, onError) {
  if (!isAdminUser(user)) {
    onData([]);
    return () => {};
  }

  let db;
  try {
    db = dbOrThrow();
  } catch (error) {
    onError(error);
    return () => {};
  }

  return db.collection('registrationOrders')
    .where('registrationId', '==', testRegistrationId(user))
    .onSnapshot(
      (snapshot) => onData(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0))),
      onError
    );
}

export async function saveAdminTestRegistration(user, selection) {
  if (!isAdminUser(user)) throw new Error('registrations/admin-only');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const registrationId = testRegistrationId(user);
  const registrationRef = db.collection('registrations').doc(registrationId);
  const auditRef = db.collection('auditLogs').doc();
  const participantName = user.displayName || user.email?.split('@')[0] || 'Administrador CIRC';
  const amountCents = Math.round(Number(selection.total || 0) * 100);
  const studentProfile = selection.profile === 'student';
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(registrationRef);
    if (existing.exists) throw new Error('registrations/already-exists');

    const dinnerQuantity = Math.max(0, Math.floor(Number(selection.dinnerQuantity || 0)));
    const morningCourse = !studentProfile && Boolean(selection.morningCourse);
    const afternoonCourse = !studentProfile && Boolean(selection.afternoonCourse);

    transaction.set(registrationRef, {
    eventId: 'circ-2027',
    userId: user.uid,
    registrationKey: `circ-2027:${user.uid}`,
    primaryRegistration: true,
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
      morningCourse,
      afternoonCourse,
      dinner: dinnerQuantity > 0,
      dinnerQuantity,
      ratePeriod: selection.period,
    },
    entitlements: {
      congressMode: selection.congressMode,
      morningCourse,
      afternoonCourse,
      dinnerQuantity,
    },
    addOnOrderCount: 0,
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
    });

    transaction.set(auditRef, {
    action: 'registration.test.saved',
    eventId: 'circ-2027',
    registrationId,
    actor: { uid: user.uid, email: user.email || '' },
    amountCents,
    createdAt: timestamp,
    });
  });

  return registrationId;
}

export async function saveAdminTestAddOnOrder(user, additions) {
  if (!isAdminUser(user)) throw new Error('registrations/admin-only');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const registrationId = testRegistrationId(user);
  const registrationRef = db.collection('registrations').doc(registrationId);
  const orderRef = db.collection('registrationOrders').doc();
  const auditRef = db.collection('auditLogs').doc();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(registrationRef);
    if (!snapshot.exists) throw new Error('registrations/not-found');

    const registration = snapshot.data();
    const primarySelection = registration.selection || {};
    const current = registration.entitlements || {
      congressMode: primarySelection.congressMode || '',
      morningCourse: Boolean(primarySelection.morningCourse),
      afternoonCourse: Boolean(primarySelection.afternoonCourse),
      dinnerQuantity: Math.max(0, Number(primarySelection.dinnerQuantity || 0)),
    };
    const studentProfile = primarySelection.profile === 'student';
    const requestedMorning = !studentProfile && Boolean(additions.morningCourse);
    const requestedAfternoon = !studentProfile && Boolean(additions.afternoonCourse);
    const addMorning = requestedMorning && !current.morningCourse;
    const addAfternoon = requestedAfternoon && !current.afternoonCourse;
    const dinnerQuantity = Math.max(0, Math.floor(Number(additions.dinnerQuantity || 0)));

    if (studentProfile && (additions.morningCourse || additions.afternoonCourse)) {
      throw new Error('registrations/courses-not-available');
    }
    if (!addMorning && !addAfternoon && dinnerQuantity === 0) {
      throw new Error('registrations/no-new-additions');
    }

    const courseUnit = getCourseRate(primarySelection.profile, primarySelection.courseAffiliation);
    const amountCents = Math.round(((Number(addMorning) + Number(addAfternoon)) * courseUnit + dinnerQuantity * DINNER_RATE) * 100);
    const nextEntitlements = {
      congressMode: current.congressMode || primarySelection.congressMode || '',
      morningCourse: Boolean(current.morningCourse || addMorning),
      afternoonCourse: Boolean(current.afternoonCourse || addAfternoon),
      dinnerQuantity: Math.max(0, Number(current.dinnerQuantity || 0)) + dinnerQuantity,
    };

    transaction.set(orderRef, {
      eventId: 'circ-2027',
      registrationId,
      userId: user.uid,
      participantName: registration.participantName || '',
      participantEmail: registration.participantEmail || user.email || '',
      orderType: 'supplementary',
      status: 'submitted',
      isTest: true,
      testMode: true,
      items: {
        morningCourse: addMorning,
        afternoonCourse: addAfternoon,
        dinnerQuantity,
      },
      payment: {
        status: 'pending',
        amountCents,
        currency: 'EUR',
        method: 'teste administrativo',
        reference: 'TESTE-COMPLEMENTO-NAO-PAGAR',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.update(registrationRef, {
      entitlements: nextEntitlements,
      addOnOrderCount: window.firebase.firestore.FieldValue.increment(1),
      updatedAt: timestamp,
    });
    transaction.set(auditRef, {
      action: 'registration.test.addon.saved',
      eventId: 'circ-2027',
      registrationId,
      orderId: orderRef.id,
      actor: { uid: user.uid, email: user.email || '' },
      items: { morningCourse: addMorning, afternoonCourse: addAfternoon, dinnerQuantity },
      amountCents,
      createdAt: timestamp,
    });
  });

  return orderRef.id;
}
