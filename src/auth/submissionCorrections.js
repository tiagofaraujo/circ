import { getFirebaseFirestore } from './firebaseClient';
import { normalizeAbstractSections, abstractSectionsToText, hasCompleteAbstractSections } from './submissionAbstract';
import { SUBMISSION_LIMITS } from '../data/submissions2027';

export function submissionTimestamp(value) {
  if (Number.isInteger(value?.seconds) && Number.isInteger(value?.nanoseconds)) {
    return `${new Date(value.seconds * 1000).toISOString().slice(0, 19)}.${String(value.nanoseconds).padStart(9, '0')}Z`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) {
    const [base, fraction = ''] = value.slice(0, -1).split('.');
    return `${base}.${fraction.padEnd(9, '0')}Z`;
  }
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().replace(/\.(\d{3})Z$/, (_, millis) => `.${millis}000000Z`) : null;
}
export function submissionVersion(submission) {
  return submission?.revisionVersion == null ? 0
    : Number.isSafeInteger(submission.revisionVersion) && submission.revisionVersion >= 0 ? submission.revisionVersion : -1;
}
export function hasEffectiveCorrectionRequest(submission) {
  return submission?.eventId === 'circ-2027' && submission.status === 'revisions' && submission.isTest === false && submission.testMode !== true
    && ['oral', 'poster'].includes(submission.type) && Boolean(submissionTimestamp(submission.submittedAt))
    && submission.archived !== true && submissionVersion(submission) >= 0
    && Boolean(submission.review?.updatedBy?.uid && submission.review.updatedBy.email && submissionTimestamp(submission.review.updatedAt));
}
function requireOwner(user, submission) {
  if (!user?.uid || user.emailVerified !== true) throw new Error('submissions/verified-email-required');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(submission?.id || '') || submission.userId !== user.uid || !hasEffectiveCorrectionRequest(submission)) throw new Error('submissions/corrections-not-allowed');
}
function correctionInput(form, complete) {
  const title = String(form.title || '').trim(), abstractSections = normalizeAbstractSections(form.abstractSections);
  if (title.length < 3 || title.length > SUBMISSION_LIMITS.title) throw new Error('submissions/invalid-input');
  if (Object.entries(abstractSections).some(([key, value]) => value.length > SUBMISSION_LIMITS[key])) throw new Error('submissions/field-too-long');
  if (complete && !hasCompleteAbstractSections(abstractSections)) throw new Error('submissions/incomplete-abstract');
  return { title, abstractSections, abstract: abstractSectionsToText(abstractSections) };
}
function database() {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('firestore/not-configured');
  return db;
}
export async function loadSubmissionCorrection(user, submission) {
  requireOwner(user, submission);
  const snapshot = await database().collection('submissionCorrectionDrafts').doc(submission.id).get();
  const data = snapshot.data();
  if (!snapshot.exists || data.userId !== user.uid) return null;
  if (data.sourceVersion !== submissionVersion(submission) || submissionTimestamp(data.sourceUpdatedAt) !== submissionTimestamp(submission.updatedAt)) {
    // Retain only the CAS basis: an outdated draft must be replaceable after a new management request,
    // without silently restoring content prepared for the previous request.
    return { stale: true, draftUpdatedAt: data.updatedAt };
  }
  return { ...data.correction, draftUpdatedAt: data.updatedAt };
}
export async function saveSubmissionCorrection(user, submission, form, expectedDraftUpdatedAt = null) {
  requireOwner(user, submission);
  const correction = correctionInput(form, false), db = database();
  await db.runTransaction(async tx => {
    const [sourceRecord, draftRecord] = await Promise.all([tx.get(db.collection('submissions').doc(submission.id)), tx.get(db.collection('submissionCorrectionDrafts').doc(submission.id))]);
    const source = sourceRecord.data();
    if (draftRecord.exists ? submissionTimestamp(draftRecord.data().updatedAt) !== submissionTimestamp(expectedDraftUpdatedAt) : expectedDraftUpdatedAt !== null) throw new Error('submissions/correction-request-changed');
    if (source?.userId !== user.uid || !hasEffectiveCorrectionRequest(source)
      || submissionVersion(source) !== submissionVersion(submission) || submissionTimestamp(source.updatedAt) !== submissionTimestamp(submission.updatedAt)) throw new Error('submissions/correction-request-changed');
    tx.set(db.collection('submissionCorrectionDrafts').doc(submission.id), {
      eventId: 'circ-2027', submissionId: submission.id, userId: user.uid,
      sourceVersion: submissionVersion(source), sourceUpdatedAt: source.updatedAt,
      correction, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  const saved = (await db.collection('submissionCorrectionDrafts').doc(submission.id).get()).data();
  if (!saved || JSON.stringify(correctionInput(saved.correction, false)) !== JSON.stringify(correction)
    || saved.sourceVersion !== submissionVersion(submission) || submissionTimestamp(saved.sourceUpdatedAt) !== submissionTimestamp(submission.updatedAt)) throw new Error('submissions/correction-request-changed');
  return saved.updatedAt;
}
export async function resubmitSubmissionCorrection(user, submission, form, requestId) {
  requireOwner(user, submission);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId || '')) throw new Error('submissions/resubmit-unconfirmed');
  const correction = correctionInput(form, true);
  const token = await user.getIdToken();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  let response, data;
  try {
    response = await fetch(`/api/submissions/${encodeURIComponent(submission.id)}/resubmit`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, expectedUpdatedAt: submissionTimestamp(submission.updatedAt), expectedVersion: submissionVersion(submission),
        correction: { title: correction.title, abstractSections: correction.abstractSections } }),
    });
    data = await response.json();
  } catch { throw new Error('submissions/resubmit-unconfirmed'); }
  finally { clearTimeout(timer); }
  if (!response.ok) {
    const code = [401, 403].includes(response.status) ? 'submissions/session-required'
      : [404, 409].includes(response.status) ? 'submissions/correction-request-changed'
      : response.status === 400 ? 'submissions/invalid-input' : 'submissions/resubmit-unconfirmed';
    throw new Error(code);
  }
  if (data.submission?.id !== submission.id || !Number.isSafeInteger(data.submission?.revisionVersion)
    || data.submission.revisionVersion !== submissionVersion(submission) + 1) throw new Error('submissions/resubmit-unconfirmed');
  return data.submission;
}
