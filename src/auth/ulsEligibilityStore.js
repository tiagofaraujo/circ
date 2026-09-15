import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFirestore } from './firebaseClient';
import { buildUlsIdentity, ULS_EVENT_ID, ULS_MATCH_METHOD } from './ulsIdentity';

export const ulsVerificationEnabled = process.env.REACT_APP_ULS_VERIFICATION_ENABLED === 'true';
export const ULS_ELIGIBILITY_SNAPSHOT_OPTIONS = Object.freeze({ includeMetadataChanges: true });

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

export function isValidUlsRoster(data, eligibility) {
  return Boolean(
    data
    && eligibility
    && data.active === true
    && data.eventId === ULS_EVENT_ID
    && data.nameKey === eligibility.nameKey
  );
}

function ulsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function describeUlsEligibilitySnapshot(snapshot, uid) {
  const documentExists = Boolean(snapshot?.exists);
  const fromCache = snapshot?.metadata?.fromCache === true;
  const data = documentExists ? snapshot.data() : null;
  const verified = documentExists && isValidEligibility(data, uid);
  return {
    uid,
    status: fromCache ? 'loading' : 'ready',
    verified,
    documentExists,
    confirmedAbsent: !fromCache && !documentExists,
    revoked: !fromCache && documentExists && !verified,
    mec: data?.mec || '',
    nameKey: data?.nameKey || '',
    method: data?.method || '',
  };
}

export function describeUlsRosterSnapshot(snapshot, eligibility) {
  const fromCache = snapshot?.metadata?.fromCache === true;
  const data = snapshot?.exists ? snapshot.data() : null;
  const rosterValid = isValidUlsRoster(data, eligibility);
  return {
    ...eligibility,
    status: fromCache ? 'loading' : 'ready',
    verified: !fromCache && rosterValid,
    revoked: !fromCache && !rosterValid,
    rosterConfirmed: !fromCache,
  };
}

export function useUlsEligibility(user) {
  const uid = user?.uid || null;
  const [state, setState] = useState({ uid: null, status: 'idle', verified: false });
  useEffect(() => {
    if (!uid) {
      setState({ uid: null, status: 'idle', verified: false });
      return undefined;
    }
    const db = getFirebaseFirestore();
    if (!db) { setState({ uid, status: 'error', verified: false }); return undefined; }
    setState({ uid, status: 'loading', verified: false });
    let active = true;
    let rosterMec = '';
    let unsubscribeRoster = () => {};

    const stopRoster = () => {
      unsubscribeRoster();
      unsubscribeRoster = () => {};
      rosterMec = '';
    };

    const unsubscribeEligibility = db.collection('ulsEligibility').doc(uid).onSnapshot(
      ULS_ELIGIBILITY_SNAPSHOT_OPTIONS,
      (snapshot) => {
        if (!active) return;
        const eligibility = describeUlsEligibilitySnapshot(snapshot, uid);
        if (!eligibility.verified) {
          stopRoster();
          setState(eligibility);
          return;
        }
        if (rosterMec === eligibility.mec) return;

        stopRoster();
        rosterMec = eligibility.mec;
        setState({
          ...eligibility,
          status: 'loading',
          verified: false,
          revoked: false,
          rosterConfirmed: false,
        });
        unsubscribeRoster = db.collection('ulsRoster').doc(eligibility.mec).onSnapshot(
          ULS_ELIGIBILITY_SNAPSHOT_OPTIONS,
          (rosterSnapshot) => {
            if (active) setState(describeUlsRosterSnapshot(rosterSnapshot, eligibility));
          },
          () => {
            if (active) {
              setState({
                ...eligibility,
                status: 'error',
                verified: false,
                revoked: false,
                rosterConfirmed: false,
              });
            }
          }
        );
      },
      () => {
        stopRoster();
        if (active) {
          setState({
            uid,
            status: 'error',
            verified: false,
            documentExists: false,
            confirmedAbsent: false,
            revoked: false,
          });
        }
      }
    );
    return () => {
      active = false;
      stopRoster();
      unsubscribeEligibility();
    };
  }, [uid]);
  // Existing eligibility keeps the profile name locked. A participant is only
  // shown as verified after the private roster confirms that the match is active.
  return state.uid === uid
    ? state
    : {
      uid,
      status: 'loading',
      verified: false,
      documentExists: false,
      confirmedAbsent: false,
      revoked: false,
    };
}

export async function claimUlsEligibility(mecValue) {
  if (!ulsVerificationEnabled) throw ulsError('uls/unavailable');
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw ulsError('uls/unauthenticated');
  if (!user.emailVerified) throw ulsError('uls/email-not-verified');

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
    try {
      const rosterSnapshot = await db.collection('ulsRoster')
        .doc(existingEligibility.mec).get({ source: 'server' });
      if (rosterSnapshot.exists && isValidUlsRoster(rosterSnapshot.data(), existingEligibility)) {
        return { verified: true, mec: existingEligibility.mec || '' };
      }
      throw ulsError('uls/no-match');
    } catch (error) {
      if (error?.code === 'uls/no-match') throw error;
      if (error?.code === 'unauthenticated') throw ulsError('uls/unauthenticated');
      throw ulsError('uls/unavailable');
    }
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
