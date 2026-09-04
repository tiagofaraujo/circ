import { getFirebaseFirestore } from './firebaseClient';
import { normalizeParticipantProfile } from './profileCompletion';

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
  const profile = {
    firebaseUid: user?.uid || '',
    photoURL: user?.photoURL || '',
    demoAccess: false,
  };

  // Empty authentication values must never erase a name or email stored in Firestore.
  if (user?.email) profile.email = user.email;
  if (user?.displayName) profile.name = user.displayName;

  return profile;
}

function serviceNotReady(error) {
  const code = error?.code || '';
  return [
    'failed-precondition',
    'not-found',
    'unavailable',
    'deadline-exceeded',
    'network-request-failed',
  ].includes(code);
}

function profileSaveError(error) {
  if (error?.code) return error;
  const nextError = new Error('profile/save-failed');
  nextError.code = 'profile/save-failed';
  return nextError;
}

export async function loadParticipantProfileResult(user) {
  const local = readLocalProfile();
  const base = normalizeParticipantProfile({ ...local, ...userBaseProfile(user) });

  if (!user?.uid) {
    return { profile: base, remoteAvailable: false, source: 'local' };
  }

  const db = getFirebaseFirestore();
  if (!db) {
    return { profile: base, remoteAvailable: false, source: 'unavailable' };
  }

  try {
    // A server read prevents an old empty browser cache from being mistaken for
    // the definitive profile and producing the misleading 36% result.
    const snapshot = await db.collection('users').doc(user.uid).get({ source: 'server' });
    if (!snapshot.exists) {
      return { profile: base, remoteAvailable: true, source: 'empty' };
    }

    const remote = snapshot.data() || {};
    const merged = normalizeParticipantProfile({
      ...local,
      ...remote,
      ...userBaseProfile(user),
      photoURL: user?.photoURL || '',
    });
    writeLocalProfile(merged);

    return { profile: merged, remoteAvailable: true, source: 'firestore' };
  } catch (error) {
    return {
      profile: base,
      remoteAvailable: false,
      source: serviceNotReady(error) ? 'unavailable' : 'error',
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

  const next = normalizeParticipantProfile({
    ...profile,
    firebaseUid: user.uid,
    email: user.email || profile.email || '',
    name: profile.name || user.displayName || '',
    photoURL: user.photoURL || '',
    demoAccess: false,
  });

  const db = getFirebaseFirestore();
  if (!db) {
    const unavailableError = new Error('profile/storage-unavailable');
    unavailableError.code = 'profile/storage-unavailable';
    throw unavailableError;
  }

  try {
    await db.collection('users').doc(user.uid).set(
      {
        ...next,
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    // Never report "Saved" when Firestore rejected or could not persist the profile.
    throw profileSaveError(error);
  }

  writeLocalProfile(next);
  return { ...next, __remoteSaved: true };
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
