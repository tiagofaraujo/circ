import { getFirebaseFirestore, getFirebaseStorage } from './firebaseClient';

const LOCAL_KEY = 'circ_demo_account';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

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
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(profile));
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
  return [
    'failed-precondition',
    'not-found',
    'unavailable',
    'storage/bucket-not-found',
    'storage/object-not-found',
  ].includes(code);
}

export async function loadParticipantProfile(user) {
  const local = readLocalProfile();
  const base = { ...local, ...userBaseProfile(user) };
  if (!user?.uid) return base;

  const db = getFirebaseFirestore();
  if (!db) return base;

  try {
    const snapshot = await db.collection('users').doc(user.uid).get();
    if (!snapshot.exists) return base;
    const remote = snapshot.data() || {};
    const merged = { ...local, ...remote, ...userBaseProfile(user), photoURL: remote.photoURL || user?.photoURL || local.photoURL || '' };
    writeLocalProfile(merged);
    return merged;
  } catch (error) {
    return base;
  }
}

export async function saveParticipantProfile(user, profile) {
  if (!user?.uid) throw new Error('auth/user-not-found');
  const next = {
    ...profile,
    firebaseUid: user.uid,
    email: user.email || profile.email || '',
    name: profile.name || user.displayName || '',
    photoURL: profile.photoURL || user.photoURL || '',
    demoAccess: false,
  };

  writeLocalProfile(next);

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
    } catch (error) {
      // Keep a local fallback until Firestore is enabled/configured in the Firebase project.
      if (!serviceNotReady(error) && error?.code !== 'permission-denied') throw error;
    }
  }

  return next;
}

export function validateProfilePhoto(file) {
  if (!file) throw new Error('profile/photo-required');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('profile/photo-type');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('profile/photo-size');
  return true;
}

export async function uploadParticipantPhoto(user, file) {
  if (!user?.uid) throw new Error('auth/user-not-found');
  validateProfilePhoto(file);

  const storage = getFirebaseStorage();
  if (!storage) throw new Error('profile/storage-not-configured');

  const reference = storage.ref().child(`users/${user.uid}/profile/avatar`);
  try {
    await reference.put(file, {
      contentType: file.type,
      cacheControl: 'public,max-age=3600',
      customMetadata: { ownerUid: user.uid },
    });
  } catch (error) {
    if (serviceNotReady(error)) throw new Error('profile/storage-not-configured');
    throw error;
  }

  const photoURL = await reference.getDownloadURL();
  await user.updateProfile({ photoURL });
  await user.reload();

  const current = await loadParticipantProfile(user);
  await saveParticipantProfile(user, { ...current, photoURL });
  return photoURL;
}

export async function removeParticipantPhoto(user) {
  if (!user?.uid) throw new Error('auth/user-not-found');

  const storage = getFirebaseStorage();
  if (storage) {
    try {
      await storage.ref().child(`users/${user.uid}/profile/avatar`).delete();
    } catch (error) {
      if (!serviceNotReady(error)) throw error;
    }
  }

  await user.updateProfile({ photoURL: null });
  await user.reload();

  const current = await loadParticipantProfile(user);
  await saveParticipantProfile(user, { ...current, photoURL: '' });
}

export async function deleteParticipantData(user) {
  if (!user?.uid) return;

  const storage = getFirebaseStorage();
  if (storage) {
    try {
      await storage.ref().child(`users/${user.uid}/profile/avatar`).delete();
    } catch (error) {
      if (!serviceNotReady(error)) throw error;
    }
  }

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
