import { getFirebaseFirestore } from './firebaseClient';

const LOCAL_KEY = 'circ_demo_account';

function readLocalProfile() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function writeLocalProfile(profile) {
  if (typeof window === 'undefined') return;
  const existing = readLocalProfile();
  const safeProfile = {
    ...existing,
    firebaseUid: profile.firebaseUid || existing.firebaseUid || '',
    email: profile.email || existing.email || '',
    name: profile.name || existing.name || '',
    photoURL: profile.photoURL || '',
    profession: profile.profession || existing.profession || '',
    professionLabel: profile.professionLabel || existing.professionLabel || '',
    institution: profile.institution || existing.institution || '',
    professionalId: profile.professionalId || existing.professionalId || '',
    demoAccess: false,
  };

  // Sensitive billing and identity fields are deliberately not persisted in localStorage.
  delete safeProfile.taxNumber;
  delete safeProfile.mobile;
  delete safeProfile.dateOfBirth;
  delete safeProfile.gender;
  delete safeProfile.billingAddress;
  delete safeProfile.billingPostalCode;
  delete safeProfile.billingCity;
  delete safeProfile.billingCountry;

  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(safeProfile));
}

function userBaseProfile(user) {
  return {
    firebaseUid: user?.uid || '',
    email: user?.email || '',
    name: user?.displayName || '',
    photoURL: user?.photoURL || '',
    demoAccess: false,
  };
}

function serviceNotReady(error) {
  const code = error?.code || '';
  return ['failed-precondition', 'not-found', 'unavailable'].includes(code);
}

export async function loadParticipantProfileResult(user) {
  const local = readLocalProfile();
  const base = { ...local, ...userBaseProfile(user) };

  if (!user?.uid) {
    return { profile: base, remoteAvailable: false, source: 'local' };
  }

  const db = getFirebaseFirestore();
  if (!db) {
    return { profile: base, remoteAvailable: false, source: 'unavailable' };
  }

  try {
    const snapshot = await db.collection('users').doc(user.uid).get();
    if (!snapshot.exists) {
      return { profile: base, remoteAvailable: true, source: 'empty' };
    }

    const remote = snapshot.data() || {};
    const merged = {
      ...local,
      ...remote,
      ...userBaseProfile(user),
      photoURL: user?.photoURL || '',
    };
    writeLocalProfile(merged);

    return { profile: merged, remoteAvailable: true, source: 'firestore' };
  } catch (error) {
    return {
      profile: base,
      remoteAvailable: false,
      source: 'fallback',
      errorCode: error?.code || 'unknown',
    };
  }
}

export async function loadParticipantProfile(user) {
  const result = await loadParticipantProfileResult(user);
  return result.profile;
}

export async function saveParticipantProfile(user, profile) {
  if (!user?.uid) throw new Error('auth/user-not-found');
  const next = {
    ...profile,
    firebaseUid: user.uid,
    email: user.email || profile.email || '',
    name: profile.name || user.displayName || '',
    photoURL: user.photoURL || '',
    demoAccess: false,
  };

  writeLocalProfile(next);

  let remoteSaved = false;
  const db = getFirebaseFirestore();
  if (db) {
    try {
      await db.collection('users').doc(user.uid).set(
        {
          ...next,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      remoteSaved = true;
    } catch (error) {
      if (!serviceNotReady(error) && error?.code !== 'permission-denied') throw error;
    }
  }

  return { ...next, __remoteSaved: remoteSaved };
}

export async function deleteParticipantData(user) {
  if (!user?.uid) return;

  const db = getFirebaseFirestore();
  if (db) {
    try {
      await db.collection('users').doc(user.uid).delete();
    } catch (error) {
      if (!serviceNotReady(error) && error?.code !== 'permission-denied') throw error;
    }
  }

  if (typeof window !== 'undefined') window.localStorage.removeItem(LOCAL_KEY);
}
