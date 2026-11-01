import { getFirebaseFirestore } from './firebaseClient';
import { isSubmissionTypeOpen, SUBMISSION_LIMITS } from '../data/submissions2027';
import {
  abstractSectionsToText,
  hasCompleteAbstractSections,
  normalizeAbstractSections,
} from './submissionAbstract';

export const submissionStatuses = ['draft', 'submitted', 'under_review', 'revisions', 'accepted', 'rejected'];
export const reviewSubmissionStatuses = submissionStatuses.filter((status) => status !== 'draft');

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
    .where('status', 'in', reviewSubmissionStatuses)
    .limit(500)
    .onSnapshot(
      (snapshot) => onData(sortNewest(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.status !== 'draft' && item.isTest !== true && item.testMode !== true && item.archived !== true)
      )),
      onError
    );
}


export function subscribeToUserSubmissions(userId, onData, onError) {
  let db;
  try {
    if (!userId) throw new Error('submissions/auth-required');
    db = dbOrThrow();
  } catch (error) {
    onError(error);
    return () => {};
  }

  return db.collection('submissions')
    .where('eventId', '==', 'circ-2027')
    .where('userId', '==', userId)
    .limit(100)
    .onSnapshot(
      (snapshot) => onData(sortNewest(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter(item => item.isTest !== true && item.testMode !== true && item.archived !== true))),
      onError
    );
}

function submissionInput(user, form, status) {
  if (!user?.uid) throw new Error('submissions/auth-required');
  if (user.emailVerified !== true) throw new Error('submissions/verified-email-required');
  if (!['draft', 'submitted'].includes(status) || !['oral', 'poster'].includes(form?.type)) throw new Error('submissions/invalid-input');
  const fields = Object.fromEntries(['title', 'authors', 'affiliation'].map(key => [key, String(form[key] || '').trim()]));
  if (fields.title.length < 3 || fields.authors.length < 2) throw new Error('submissions/invalid-input');
  const abstractSections = normalizeAbstractSections(form.abstractSections);
  for (const [key, value] of Object.entries({ ...fields, ...abstractSections })) {
    if (value.length > SUBMISSION_LIMITS[key]) throw new Error('submissions/field-too-long');
  }
  if (status === 'submitted' && !hasCompleteAbstractSections(abstractSections)) throw new Error('submissions/incomplete-abstract');
  if (status === 'submitted' && !isSubmissionTypeOpen(form.type)) throw new Error('submissions/closed');
  return { type: form.type, ...fields, abstractSections, abstract: abstractSectionsToText(abstractSections), status };
}

export async function saveSubmission(user, form, status) {
  const data = submissionInput(user, form, status);
  const db = dbOrThrow();
  const ref = db.collection('submissions').doc();
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  await ref.set({
    ...data, eventId: 'circ-2027', code: `CIRC27-${ref.id.slice(0, 8).toUpperCase()}`,
    userId: user.uid, contactName: user.displayName || user.email?.split('@')[0] || '', contactEmail: user.email || '',
    isTest: false, createdAt: timestamp, updatedAt: timestamp, submittedAt: status === 'submitted' ? timestamp : null,
  });
  return ref.id;
}

export async function updateSubmissionDraft(user, submission, form, status) {
  const data = submissionInput(user, form, status);
  if (!submission?.id || submission.userId !== user.uid || submission.status !== 'draft' || submission.isTest === true) throw new Error('submissions/edit-not-allowed');
  const db = dbOrThrow(), ref = db.collection('submissions').doc(submission.id);
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), current = snapshot.data();
    if (!snapshot.exists || current.userId !== user.uid || current.eventId !== 'circ-2027' || current.status !== 'draft' || current.isTest === true || current.archived === true
      || timestampValue(current.updatedAt) !== timestampValue(submission.updatedAt)) throw new Error('submissions/draft-changed');
    tx.update(ref, { ...data, updatedAt: timestamp, submittedAt: status === 'submitted' ? timestamp : current.submittedAt || null });
  });
  return submission.id;
}

export async function deleteSubmissionDraft(user, submission) {
  if (!user?.uid || user.emailVerified !== true || !submission?.id || submission.userId !== user.uid || submission.status !== 'draft' || submission.isTest === true) throw new Error('submissions/delete-not-allowed');
  const db = dbOrThrow(), ref = db.collection('submissions').doc(submission.id);
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), current = snapshot.data();
    if (!snapshot.exists || current.userId !== user.uid || current.eventId !== 'circ-2027' || current.status !== 'draft' || current.isTest === true || current.archived === true
      || timestampValue(current.updatedAt) !== timestampValue(submission.updatedAt)) throw new Error('submissions/draft-changed');
    tx.delete(ref);
  });
}

export function submissionErrorMessage(error, language = 'pt') {
  const en = language === 'en';
  const messages = {
    'submissions/verified-email-required': ['Confirme primeiro o seu endereço de email no perfil.', 'Verify your email address in your profile first.'],
    'submissions/incomplete-abstract': ['Preencha todas as secções do resumo antes de submeter.', 'Complete every abstract section before submitting.'],
    'submissions/field-too-long': ['Um dos campos excede o limite de caracteres permitido.', 'A field exceeds the permitted character limit.'],
    'submissions/invalid-input': ['Verifique a tipologia, o título e os autores do trabalho.', 'Check the submission type, title and authors.'],
    'submissions/closed': ['O prazo de submissão desta tipologia já terminou.', 'The submission deadline for this type has passed.'],
    'submissions/draft-changed': ['O rascunho foi alterado. Atualize a página antes de voltar a guardar.', 'The draft changed. Refresh the page before saving again.'],
    'submissions/edit-not-allowed': ['Só pode editar os seus rascunhos ainda não submetidos.', 'You can only edit your own drafts before submission.'],
    'submissions/delete-not-allowed': ['Só pode eliminar os seus rascunhos ainda não submetidos.', 'You can only delete your own drafts before submission.'],
    'permission-denied': ['Não foi possível guardar. Verifique a sessão e a confirmação do email.', 'The submission could not be saved. Check your session and email verification.'],
  };
  return messages[error?.code || error?.message]?.[en ? 1 : 0]
    || (en ? 'The request could not be completed. Check your connection and try again.' : 'Não foi possível concluir o pedido. Verifique a ligação e tente novamente.');
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
