import { useEffect, useState } from 'react';
import { getFirebaseFirestore } from './firebaseClient';
import {
  acceptedReviewIdentity,
  anonymousReviewContent,
  MAX_REVIEWERS,
  parseReviewScores,
  REVIEW_COMMENT_LIMIT,
  reviewableStatuses,
  reviewerEmail,
  validReviewerEmail,
} from './scientificReview';

const database = () => {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('firestore/not-configured');
  return db;
};
const timestamp = () => window.firebase.firestore.FieldValue.serverTimestamp();
const workRef = (db, email, id) =>
  db.collection('scientificReviewers').doc(email).collection('works').doc(id);
const controlRef = (db, id) => db.collection('scientificReviewAssignments').doc(id);
const identityRef = (db, id) => db.collection('scientificReviewIdentities').doc(id);
const dataItems = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const sameTime = (a, b) => (a?.toMillis?.() ?? a ?? null) === (b?.toMillis?.() ?? b ?? null);
function listen(query, onData, onError) {
  try {
    return query(database()).onSnapshot(onData, onError);
  } catch (error) {
    onError(error);
    return () => {};
  }
}
export function useScientificReviewConfig() {
  const [state, setState] = useState({ loading: true, enabled: false });
  useEffect(
    () =>
      listen(
        (db) => db.collection('reviewConfiguration').doc('circ-2027'),
        (s) => setState({ loading: false, enabled: s.data()?.enabled === true }),
        () => setState({ loading: false, enabled: false }),
      ),
    [],
  );
  return state;
}
export function subscribeReviewers(onData, onError) {
  return listen(
    (db) => db.collection('scientificReviewers').orderBy('name').limit(200),
    (s) => onData(dataItems(s)),
    onError,
  );
}
export function subscribeReviewerWorks(email, onData, onError) {
  return listen(
    (db) =>
      db
        .collection('scientificReviewers')
        .doc(reviewerEmail(email))
        .collection('works')
        .where('active', '==', true)
        .limit(500),
    (s) => onData(dataItems(s)),
    onError,
  );
}
export function subscribeReviewAssignment(id, onData, onError) {
  return listen(
    (db) => controlRef(db, id),
    (s) => onData(s.data() || { reviewerEmails: [] }),
    onError,
  );
}
export function subscribeReviewerWork(email, id, onData, onError) {
  return listen(
    (db) => workRef(db, email, id),
    (s) => onData(s.exists ? { id: s.id, ...s.data() } : null),
    onError,
  );
}
export function subscribeAcceptedIdentity(id, onData, onError) {
  return listen(
    (db) => identityRef(db, id),
    (s) => onData(s.data() || null),
    onError,
  );
}
async function requireEnabled(tx, db) {
  const config = await tx.get(db.collection('reviewConfiguration').doc('circ-2027'));
  if (config.data()?.enabled !== true) throw new Error('review/disabled');
}
function audit(tx, db, user, action, id, details = {}) {
  tx.set(db.collection('auditLogs').doc(), {
    action,
    eventId: 'circ-2027',
    submissionId: id || '',
    details,
    actor: { uid: user.uid, email: user.email },
    createdAt: timestamp(),
  });
}
export async function saveScientificReviewer(user, form) {
  const email = reviewerEmail(form.email),
    name = String(form.name || '').trim();
  if (!validReviewerEmail(email) || name.length < 2 || name.length > 160)
    throw new Error('review/invalid-reviewer');
  const db = database(),
    ref = db.collection('scientificReviewers').doc(email);
  await db.runTransaction(async (tx) => {
    await requireEnabled(tx, db);
    const existing = await tx.get(ref);
    tx.set(ref, {
      eventId: 'circ-2027',
      email,
      name,
      active: form.active !== false,
      createdAt: existing.data()?.createdAt || timestamp(),
      updatedAt: timestamp(),
      updatedBy: user.uid,
    });
    audit(tx, db, user, 'scientific.reviewer.updated', '', {
      email,
      active: form.active !== false,
    });
  });
}
export async function assignScientificReviewers(user, submissionId, selectedEmails) {
  const emails = [...new Set(selectedEmails.map(reviewerEmail))];
  if (emails.length > MAX_REVIEWERS || !emails.every(validReviewerEmail))
    throw new Error('review/invalid-assignment');
  const db = database();
  await db.runTransaction(async (tx) => {
    await requireEnabled(tx, db);
    const submission = await tx.get(db.collection('submissions').doc(submissionId));
    const source = submission.data();
    if (!source || source.status === 'draft' || source.eventId !== 'circ-2027')
      throw new Error('review/closed');
    if (emails.includes(reviewerEmail(source.contactEmail))) throw new Error('review/self-review');
    const previous = await tx.get(controlRef(db, submissionId));
    const allEmails = [...new Set([...(previous.data()?.reviewerEmails || []), ...emails])];
    const reviewers = await Promise.all(
      emails.map((email) => tx.get(db.collection('scientificReviewers').doc(email))),
    );
    if (reviewers.some((r) => r.data()?.active !== true))
      throw new Error('review/invalid-assignment');
    const existing = await Promise.all(
      allEmails.map((email) => tx.get(workRef(db, email, submissionId))),
    );
    tx.set(controlRef(db, submissionId), {
      eventId: 'circ-2027',
      reviewerEmails: emails,
      updatedAt: timestamp(),
      updatedBy: user.uid,
    });
    allEmails.forEach((email, index) =>
      tx.set(workRef(db, email, submissionId), {
        ...anonymousReviewContent(source, submissionId),
        active: emails.includes(email),
        evaluation: existing[index].data()?.evaluation || null,
        updatedAt: timestamp(),
        assignedBy: user.uid,
      }),
    );
    if (source.status === 'accepted')
      tx.set(identityRef(db, submissionId), acceptedReviewIdentity(source));
    else tx.delete(identityRef(db, submissionId));
    audit(tx, db, user, 'scientific.assignment.updated', submissionId, { reviewerEmails: emails });
  });
}
export async function saveScientificEvaluation(user, work, input, comment) {
  const scores = parseReviewScores(input),
    note = String(comment || '').trim();
  if (note.length > REVIEW_COMMENT_LIMIT) throw new Error('review/comment-too-long');
  const db = database(),
    ref = workRef(db, reviewerEmail(user.email), work.submissionId);
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const data = current.data();
    if (!data?.active || !reviewableStatuses.includes(data.status))
      throw new Error('review/closed');
    if (!sameTime(data.evaluation?.updatedAt, work.evaluation?.updatedAt))
      throw new Error('review/conflict');
    tx.update(ref, {
      evaluation: { scores, comment: note, reviewerUid: user.uid, updatedAt: timestamp() },
      updatedAt: timestamp(),
    });
  });
}
export async function updateScientificDecision(user, submission, status, note = '') {
  if (![...reviewableStatuses, 'accepted', 'rejected'].includes(status))
    throw new Error('submissions/invalid-status');
  const normalizedNote = String(note || '').trim();
  if (normalizedNote.length > 1000) throw new Error('submissions/note-too-long');
  const db = database(),
    ref = db.collection('submissions').doc(submission.id);
  await db.runTransaction(async (tx) => {
    await requireEnabled(tx, db);
    const source = (await tx.get(ref)).data();
    const control = await tx.get(controlRef(db, submission.id));
    const emails = control.data()?.reviewerEmails || [];
    const works = await Promise.all(
      emails.map((email) => tx.get(workRef(db, email, submission.id))),
    );
    if (!source || source.status === 'draft' || !sameTime(source.updatedAt, submission.updatedAt))
      throw new Error('review/conflict');
    tx.update(ref, {
      status,
      review: {
        note: normalizedNote,
        updatedAt: timestamp(),
        updatedBy: { uid: user.uid, email: user.email },
      },
      updatedAt: timestamp(),
    });
    emails.forEach((email, index) => {
      if (works[index].exists)
        tx.set(workRef(db, email, submission.id), {
          ...works[index].data(),
          ...anonymousReviewContent({ ...source, status }, submission.id),
          updatedAt: timestamp(),
          assignedBy: user.uid,
        });
    });
    if (emails.length && status === 'accepted')
      tx.set(identityRef(db, submission.id), acceptedReviewIdentity(source));
    else tx.delete(identityRef(db, submission.id));
    audit(tx, db, user, 'scientific.decision.updated', submission.id, {
      before: source.status,
      after: status,
    });
  });
}
