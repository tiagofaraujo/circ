import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFirestore } from './firebaseClient';
import { buildUlsIdentity, ULS_EVENT_ID, ULS_MATCH_METHOD } from './ulsIdentity';

export const ulsVerificationEnabled = process.env.REACT_APP_ULS_VERIFICATION_ENABLED === 'true';
const ulsPilotEmails = new Set((process.env.REACT_APP_ULS_PILOT_EMAILS || '')
  .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

export function isUlsPilotUser(user) {
  return Boolean(user?.email && ulsPilotEmails.has(user.email.trim().toLowerCase()));
}

function isValidEligibility(data, uid) {
  return Boolean(
    data
    && data.eventId === ULS_EVENT_ID
    && data.userId === uid
    && data.status === 'matched'
    && data.method === ULS_MATCH_METHOD
    && /^\d{1,12}$/.test(data.mec || '')
  );
}

function ulsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function useUlsEligibility(user) {
  const uid = user?.uid || null;
  const pilotUser = isUlsPilotUser(user);
  const [state, setState] = useState({ uid: null, status: 'idle', verified: false });
  useEffect(() => {
    if (!uid || !ulsVerificationEnabled || !pilotUser) {
      setState({ uid, status: 'idle', verified: false });
      return undefined;
    }
    const db = getFirebaseFirestore();
    if (!db) { setState({ uid, status: 'error', verified: false }); return undefined; }
    setState({ uid, status: 'loading', verified: false });
    let active = true;
    const unsubscribe = db.collection('ulsEligibility').doc(uid).onSnapshot((snapshot) => {
      if (!active) return;
      const data = snapshot.exists ? snapshot.data() : null;
      setState({
        uid,
        status: 'ready',
        verified: isValidEligibility(data, uid),
        mec: data?.mec || '',
        method: data?.method || '',
      });
    }, () => { if (active) setState({ uid, status: 'error', verified: false }); });
    return () => { active = false; unsubscribe(); };
  }, [uid, pilotUser]);
  // A previous user's snapshot must never unlock the next user's form.
  if (!ulsVerificationEnabled || !pilotUser) return { status: 'idle', verified: false };
  return state.uid === uid ? state : { status: 'loading', verified: false };
}

export async function claimUlsEligibility(mecValue) {
  if (!ulsVerificationEnabled) throw ulsError('uls/unavailable');
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw ulsError('uls/unauthenticated');
  if (!user.emailVerified) throw ulsError('uls/email-not-verified');
  if (!isUlsPilotUser(user)) throw ulsError('uls/not-authorised');

  const db = getFirebaseFirestore();
  if (!db || !window.firebase?.firestore?.FieldValue) throw ulsError('uls/unavailable');

  const userRef = db.collection('users').doc(user.uid);
  const eligibilityRef = db.collection('ulsEligibility').doc(user.uid);
  const [profileSnapshot, eligibilitySnapshot] = await Promise.all([
    userRef.get({ source: 'server' }),
    eligibilityRef.get({ source: 'server' }),
  ]);
  const existingEligibility = eligibilitySnapshot.exists ? eligibilitySnapshot.data() : null;
  if (isValidEligibility(existingEligibility, user.uid)) {
    return { verified: true, mec: existingEligibility.mec || '' };
  }
  if (!profileSnapshot.exists) throw ulsError('uls/missing-profile-name');

  const { mec, nameKey } = buildUlsIdentity(mecValue, profileSnapshot.data()?.name);
  const claimRef = db.collection('ulsMecClaims').doc(`${ULS_EVENT_ID}_${mec}`);
  const timestamp = window.firebase.firestore.FieldValue.serverTimestamp();
  const common = { userId: user.uid, eventId: ULS_EVENT_ID, mec, nameKey, method: ULS_MATCH_METHOD };
  const batch = db.batch();
  batch.set(userRef, { ulsNameKey: nameKey, updatedAt: timestamp }, { merge: true });
  batch.set(claimRef, { ...common, claimedAt: timestamp });
  batch.set(eligibilityRef, { ...common, status: 'matched', matchedAt: timestamp });

  try {
    await batch.commit();
  } catch (error) {
    if (error?.code === 'permission-denied') throw ulsError('uls/no-match');
    if (error?.code === 'unauthenticated') throw ulsError('uls/unauthenticated');
    throw ulsError('uls/unavailable');
  }
  return { verified: true, mec };
}
