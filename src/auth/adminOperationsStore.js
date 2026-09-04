import { getFirebaseFirestore, isAdminUser } from './firebaseClient';
import {
  abstractSectionsToText,
  hasCompleteAbstractSections,
  normalizeAbstractSections,
} from './submissionAbstract';

export const submissionStatuses = ['draft', 'submitted', 'under_review', 'revisions', 'accepted', 'rejected'];

export function attendanceKey(eventDay) {
  return `day_${String(eventDay || '').replace(/-/g, '_')}`;
}

function dbOrThrow() {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('firestore/not-configured');
  return db;
}

function actor(user) {
  return {
    uid: user.uid,
    email: user.email || '',
  };
}

function timestampValue(value) {
  if (value?.toDate) return value.toDate().getTime();
  if (value) return new Date(value).getTime() || 0;
  return 0;
}

function sortNewest(items) {
  return items.sort((a, b) => (
    timestampValue(b.submittedAt || b.updatedAt || b.createdAt)
    - timestampValue(a.submittedAt || a.updatedAt || a.createdAt)
  ));
}

export function subscribeToSubmissions(onData, onError) {
  let db;
  try {
    db = dbOrThrow();
  } catch (error) {
    onError(error);
    return () => {};
  }

  return db.collection('submissions')
    .where('eventId', '==', 'circ-2027')
    .limit(500)
    .onSnapshot(
      (snapshot) => onData(sortNewest(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))),
      onError
    );
}

export async function saveAdminTestSubmission(user, form, status, hasTestPermission = false) {
  if (!user || !hasTestPermission) throw new Error('submissions/test-not-allowed');
  if (!['draft', 'submitted'].includes(status)) throw new Error('submissions/invalid-status');

  const abstractSections = normalizeAbstractSections(form.abstractSections);
  if (status === 'submitted' && !hasCompleteAbstractSections(abstractSections)) {
    throw new Error('submissions/incomplete-abstract');
  }

  const db = dbOrThrow();
  const submissionRef = db.collection('submissions').doc();
  const auditRef = db.collection('auditLogs').doc();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const code = `TEST-${submissionRef.id.slice(0, 6).toUpperCase()}`;
  const changedBy = actor(user);
  const batch = db.batch();

  batch.set(submissionRef, {
    eventId: 'circ-2027',
    code,
    userId: user.uid,
    contactName: user.displayName || user.email?.split('@')[0] || 'Administrador CIRC',
    contactEmail: user.email || '',
    type: form.type,
    title: form.title,
    authors: form.authors,
    affiliation: form.affiliation || '',
    abstractSections,
    abstract: abstractSectionsToText(abstractSections),
    status,
    isTest: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: status === 'submitted' ? timestamp : null,
    createdBy: changedBy,
  });
  batch.set(auditRef, {
    action: 'submission.test.created',
    eventId: 'circ-2027',
    submissionId: submissionRef.id,
    submissionCode: code,
    after: status,
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
  return submissionRef.id;
}

export async function deleteAdminTestSubmission(user, submission, hasTestPermission = false) {
  const canDeleteOwnTest = hasTestPermission && submission?.userId === user?.uid;
  if (!user || !submission?.isTest || (!isAdminUser(user) && !canDeleteOwnTest)) {
    throw new Error('submissions/delete-not-allowed');
  }

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const batch = db.batch();

  batch.delete(db.collection('submissions').doc(submission.id));
  batch.set(db.collection('auditLogs').doc(), {
    action: 'submission.test.deleted',
    eventId: submission.eventId || 'circ-2027',
    submissionId: submission.id,
    submissionCode: submission.code || '',
    before: submission.status || '',
    actor: changedBy,
    createdAt: timestamp,
  });
  await batch.commit();
}

export async function updateSubmissionReview(user, submission, status, decisionNote = '') {
  if (!user) throw new Error('submissions/auth-required');
  if (!submissionStatuses.includes(status)) throw new Error('submissions/invalid-status');

  const normalizedNote = String(decisionNote || '').trim();
  if (normalizedNote.length > 1000) throw new Error('submissions/note-too-long');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const batch = db.batch();

  batch.update(db.collection('submissions').doc(submission.id), {
    status,
    'review.note': normalizedNote,
    'review.updatedAt': timestamp,
    'review.updatedBy': changedBy,
    updatedAt: timestamp,
  });
  batch.set(db.collection('auditLogs').doc(), {
    action: 'submission.review.updated',
    eventId: submission.eventId || 'circ-2027',
    submissionId: submission.id,
    submissionCode: submission.code || '',
    before: { status: submission.status || 'draft', note: submission.review?.note || '' },
    after: { status, note: normalizedNote },
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
}

export async function updateParticipantCheckIn(user, registration, eventDay, checkedIn) {
  if (!user) throw new Error('secretariat/auth-required');
  if (!['2027-04-08', '2027-04-09', '2027-04-10'].includes(eventDay)) throw new Error('secretariat/invalid-day');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const dayKey = attendanceKey(eventDay);
  const previous = registration.attendance?.[dayKey] || null;
  const batch = db.batch();

  batch.update(db.collection('registrations').doc(registration.id), {
    [`attendance.${dayKey}`]: {
      eventDay,
      checkedIn: Boolean(checkedIn),
      checkedInAt: timestamp,
      checkedInBy: changedBy,
    },
    updatedAt: timestamp,
  });
  batch.set(db.collection('auditLogs').doc(), {
    action: checkedIn ? 'attendance.checkin.completed' : 'attendance.checkin.reverted',
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    eventDay,
    before: previous,
    after: { checkedIn: Boolean(checkedIn) },
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
}

export async function updateCredentialDelivery(user, registration, delivered) {
  if (!user) throw new Error('secretariat/auth-required');

  const db = dbOrThrow();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const changedBy = actor(user);
  const previous = registration.credential || null;
  const batch = db.batch();

  batch.update(db.collection('registrations').doc(registration.id), {
    credential: {
      delivered: Boolean(delivered),
      deliveredAt: timestamp,
      deliveredBy: changedBy,
    },
    updatedAt: timestamp,
  });
  batch.set(db.collection('auditLogs').doc(), {
    action: delivered ? 'credential.delivered' : 'credential.delivery.reverted',
    eventId: registration.eventId || 'circ-2027',
    registrationId: registration.id,
    before: previous,
    after: { delivered: Boolean(delivered) },
    actor: changedBy,
    createdAt: timestamp,
  });

  await batch.commit();
}
