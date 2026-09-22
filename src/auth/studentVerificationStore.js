import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFirestore } from './firebaseClient';
import { isStudentApproved, STUDENT_EVENT_ID, STUDENT_ACADEMIC_YEAR, STUDENT_COURSE, studentError, validateStudentProof } from './studentVerification';

function context() {
  const user = getFirebaseAuth()?.currentUser;
  if (!user?.emailVerified) throw studentError('email-not-verified');
  const db = getFirebaseFirestore();
  if (!db || !window.firebase?.firestore?.FieldValue) throw studentError('unavailable');
  return { user, db, timestamp: () => window.firebase.firestore.FieldValue.serverTimestamp() };
}

export function describeStudentVerification(snapshot, profileSnapshot, uid, emailVerified) {
  const data = snapshot?.exists ? snapshot.data() : null;
  const profileName = profileSnapshot?.exists ? profileSnapshot.data()?.name || '' : '';
  const ready = Boolean(snapshot && profileSnapshot
    && !snapshot.metadata?.fromCache && !snapshot.metadata?.hasPendingWrites
    && !profileSnapshot.metadata?.fromCache && !profileSnapshot.metadata?.hasPendingWrites);
  return { uid, data, profileName, status: ready ? 'ready' : 'loading',
    approved: Boolean(ready && emailVerified && isStudentApproved(data, uid, profileName)),
    nameChanged: Boolean(data && data.profileName !== profileName) };
}

export function useStudentVerification(user, enabled = true) {
  const uid = user?.uid || null;
  const verified = Boolean(user?.emailVerified);
  const [state, setState] = useState({ uid: null, status: 'idle', approved: false });
  useEffect(() => {
    if (!enabled || !uid || !verified) {
      setState({ uid: null, status: 'idle', approved: false });
      return undefined;
    }
    const db = getFirebaseFirestore();
    if (!db) { setState({ uid, status: 'error', approved: false }); return undefined; }
    setState({ uid, status: 'loading', approved: false });
    let active = true;
    let failed = false;
    let application;
    let profile;
    const update = () => {
      if (active && !failed) setState(describeStudentVerification(application, profile, uid, verified));
    };
    const error = () => {
      failed = true;
      if (active) setState({ uid, status: 'error', approved: false });
    };
    const offRequest = db.collection('studentVerifications').doc(uid).onSnapshot(
      { includeMetadataChanges: true }, (s) => { application = s; update(); }, error
    );
    const offProfile = db.collection('users').doc(uid).onSnapshot(
      { includeMetadataChanges: true }, (s) => { profile = s; update(); }, error
    );
    return () => { active = false; offRequest(); offProfile(); };
  }, [uid, verified, enabled]);
  if (!enabled || !uid || !verified) return { uid, status: 'idle', approved: false };
  return state.uid === uid ? state : { uid, status: 'loading', approved: false };
}

export async function submitStudentVerification({ school, proof }) {
  const { user, db, timestamp } = context();
  // Keep the required legacy field compatible with the deployed rules. The
  // event defines the area; students only supply their school and document.
  const details = { school: typeof school === 'string' ? school.trim() : '', course: STUDENT_COURSE };
  if (details.school.length < 2 || details.school.length > 160) throw studentError('missing-details');
  const file = validateStudentProof(proof);
  const requestRef = db.collection('studentVerifications').doc(user.uid);
  await db.runTransaction(async (transaction) => {
    const profile = await transaction.get(db.collection('users').doc(user.uid));
    const existing = await transaction.get(requestRef);
    const profileName = profile.data()?.name;
    if (typeof profileName !== 'string' || profileName.trim().length < 5 || profileName.length > 200) {
      throw studentError('missing-profile-name');
    }
    const previous = existing.exists ? existing.data() : null;
    if (previous?.submittedAt?.toMillis() > Date.now() - 60000) throw studentError('too-soon');
    const revision = (previous?.revision || 0) + 1;
    transaction.set(requestRef, {
      userId: user.uid, eventId: STUDENT_EVENT_ID, email: user.email, profileName, ...details,
      academicYear: STUDENT_ACADEMIC_YEAR, status: 'pending', revision, proofAvailable: true,
      submittedAt: timestamp(), updatedAt: timestamp(), reviewedAt: null, reviewedBy: null, reviewNote: '',
    });
    transaction.set(db.collection('studentProofs').doc(user.uid), {
      userId: user.uid, eventId: STUDENT_EVENT_ID, revision, ...file, updatedAt: timestamp(),
    });
  });
}

export async function withdrawStudentVerification() {
  const { user, db } = context();
  const batch = db.batch();
  batch.delete(db.collection('studentProofs').doc(user.uid));
  batch.delete(db.collection('studentVerifications').doc(user.uid));
  await batch.commit();
}

export async function loadStudentRequests(status = 'pending', cursor = null) {
  const { db } = context();
  let query = db.collection('studentVerifications').where('eventId', '==', STUDENT_EVENT_ID);
  if (status !== 'all') query = query.where('status', '==', status);
  query = query.orderBy('updatedAt', 'desc').limit(25);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get({ source: 'server' });
  return { items: snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
    cursor: snapshot.docs.length === 25 ? snapshot.docs[24] : null };
}

export async function loadStudentProof(application) {
  const { db } = context();
  const doc = await db.collection('studentProofs').doc(application.id).get({ source: 'server' });
  if (!doc.exists || doc.data().revision !== application.revision) throw studentError('conflict');
  return validateStudentProof(doc.data());
}

export function assertStudentRequestCurrent(snapshot, expected) {
  const current = snapshot.exists ? snapshot.data() : null;
  if (!current || current.revision !== expected.revision || current.status !== expected.status
    || !current.updatedAt?.isEqual(expected.updatedAt)) throw studentError('conflict');
}

export async function reviewStudentRequest(expected, status, note) {
  const { user, db, timestamp } = context();
  const reviewNote = note.trim();
  if (!['approved', 'correction', 'rejected'].includes(status)) throw studentError('conflict');
  if (reviewNote.length > 1000 || (status !== 'approved' && reviewNote.length < 5)) throw studentError('note-required');
  if (expected.id === user.uid) throw studentError('conflict');
  const ref = db.collection('studentVerifications').doc(expected.id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    assertStudentRequestCurrent(snapshot, expected);
    if (status === 'approved' && !snapshot.data().proofAvailable) throw studentError('conflict');
    transaction.update(ref, { status, reviewNote, reviewedBy: { uid: user.uid, email: user.email },
      reviewedAt: timestamp(), updatedAt: timestamp() });
  });
}

export async function removeReviewedStudentProof(expected) {
  const { db, timestamp } = context();
  const ref = db.collection('studentVerifications').doc(expected.id);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    assertStudentRequestCurrent(snapshot, expected);
    if (snapshot.data().status === 'pending') throw studentError('conflict');
    transaction.delete(db.collection('studentProofs').doc(expected.id));
    transaction.update(ref, { proofAvailable: false, updatedAt: timestamp() });
  });
}
