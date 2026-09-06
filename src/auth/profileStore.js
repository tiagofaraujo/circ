import { getFirebaseFirestore } from './firebaseClient';
import { getProfileCompletion, normalizeParticipantProfile } from './profileCompletion';

const LOCAL_KEY = 'circ_demo_account';
const PROFILE_FIELDS = [
  'name',
  'email',
  'dateOfBirth',
  'gender',
  'taxNumber',
  'mobile',
  'country',
  'profession',
  'institution',
  'professionalId',
  'billingAddress',
  'billingPostalCode',
  'billingCity',
  'billingCountry',
];

function isFilled(value) {
  return String(value ?? '').trim().length > 0;
}

function validStoredCompletion(value) {
  if (!value || typeof value !== 'object') return null;
  const completed = Number(value.completed);
  const total = Number(value.total);
  const percentage = Number(value.percentage);
  if (!Number.isFinite(completed) || !Number.isFinite(total) || !Number.isFinite(percentage)) return null;
  if (total <= 0 || completed < 0 || completed > total || percentage < 0 || percentage > 100) return null;
  return { completed, total, percentage: Math.round(percentage) };
}

function validStoredPercentage(value, total = 14) {
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  const rounded = Math.round(percentage);
  return {
    completed: Math.round((rounded / 100) * total),
    total,
    percentage: rounded,
  };
}

function bestCompletion(profile, recalculated) {
  const candidates = [
    recalculated,
    validStoredCompletion(profile?.profileCompletion),
    validStoredPercentage(profile?.profileCompletionPercentage, recalculated.total || 14),
  ].filter(Boolean);

  return candidates.reduce(
    (best, candidate) => candidate.percentage > best.percentage ? candidate : best,
    recalculated
  );
}

function localProfileForUser(user) {
  const local = readLocalProfile();
  const expectedUid = user?.uid || user?.firebaseUid || '';
  const expectedEmail = String(user?.email || '').trim().toLowerCase();
  const localUid = local?.firebaseUid || '';
  const localEmail = String(local?.email || '').trim().toLowerCase();
  if (expectedUid && localUid && expectedUid !== localUid) return {};
  if (expectedEmail && localEmail && expectedEmail !== localEmail) return {};
  return local;
}

function mergeProfileSources(...sources) {
  const validSources = sources.filter((source) => source && typeof source === 'object');
  const normalizedSources = validSources.map((source) => normalizeParticipantProfile(source));
  const merged = Object.assign({}, ...validSources);

  PROFILE_FIELDS.forEach((field) => {
    for (let index = normalizedSources.length - 1; index >= 0; index -= 1) {
      const value = normalizedSources[index][field];
      if (isFilled(value)) {
        merged[field] = value;
        return;
      }
    }
  });

  return normalizeParticipantProfile(merged);
}

function profileFieldsForStorage(profile) {
  return PROFILE_FIELDS.reduce((fields, field) => {
    if (isFilled(profile[field])) fields[field] = profile[field];
    return fields;
  }, {});
}

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
  const existing = localProfileForUser(profile);
  const completion = bestCompletion(profile, getProfileCompletion(profile));
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
    profileCompletionPercentage: completion.percentage,
    demoAccess: false,
  };

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
  if (user?.email) profile.email = user.email;
  if (user?.displayName) profile.name = user.displayName;
  return profile;
}

function serviceNotReady(error) {
  const code = error?.code || '';
  return ['failed-precondition', 'not-found', 'unavailable', 'deadline-exceeded', 'network-request-failed'].includes(code);
}

function profileSaveError(error) {
  if (error?.code) return error;
  const nextError = new Error('profile/save-failed');
  nextError.code = 'profile/save-failed';
  return nextError;
}

export async function loadParticipantProfileResult(user) {
  const local = normalizeParticipantProfile(localProfileForUser(user));
  const authProfile = userBaseProfile(user);
  const base = mergeProfileSources(local, authProfile);
  const baseCompletion = bestCompletion(base, getProfileCompletion(base));

  if (!user?.uid) {
    return { profile: base, completion: baseCompletion, remoteAvailable: false, source: 'local' };
  }

  const db = getFirebaseFirestore();
  if (!db) {
    return { profile: base, completion: baseCompletion, remoteAvailable: false, source: 'unavailable' };
  }

  const documentRef = db.collection('users').doc(user.uid);
  let cached = {};
  let cachedExists = false;

  try {
    const cachedSnapshot = await documentRef.get({ source: 'cache' });
    cachedExists = cachedSnapshot.exists;
    if (cachedExists) cached = cachedSnapshot.data() || {};
  } catch (error) {
    cached = {};
  }

  try {
    const snapshot = await documentRef.get({ source: 'server' });
    const remote = snapshot.exists ? snapshot.data() || {} : {};
    const merged = mergeProfileSources(local, cached, remote, authProfile);
    const completion = bestCompletion(merged, getProfileCompletion(merged));
    const remoteProfile = mergeProfileSources(remote, authProfile);
    const remoteCompletion = bestCompletion(remote, getProfileCompletion(remoteProfile));

    if (completion.completed > remoteCompletion.completed) {
      try {
        await documentRef.set(
          {
            ...profileFieldsForStorage(merged),
            profileCompletion: { ...completion, schemaVersion: 1 },
            profileRecoveredAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (recoveryError) {
      }
    }

    writeLocalProfile({ ...merged, profileCompletion: completion });

    if (!snapshot.exists && completion.completed <= baseCompletion.completed) {
      return { profile: merged, completion, remoteAvailable: true, source: 'empty' };
    }

    return { profile: merged, completion, remoteAvailable: true, source: 'firestore' };
  } catch (error) {
    const fallback = mergeProfileSources(local, cached, authProfile);
    const completion = bestCompletion(fallback, getProfileCompletion(fallback));
    writeLocalProfile({ ...fallback, profileCompletion: completion });
    return {
      profile: fallback,
      completion,
      remoteAvailable: false,
      source: cachedExists ? 'cache' : (completion.percentage === 100 ? 'local' : (serviceNotReady(error) ? 'unavailable' : 'error')),
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

  const next = mergeProfileSources(profile, {
    firebaseUid: user.uid,
    email: user.email || profile.email || '',
    name: profile.name || user.displayName || '',
    photoURL: user.photoURL || '',
    demoAccess: false,
  });
  const completion = getProfileCompletion(next);
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
        profileCompletion: { ...completion, schemaVersion: 1 },
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    throw profileSaveError(error);
  }

  writeLocalProfile({ ...next, profileCompletion: completion });
  return { ...next, profileCompletion: completion, __remoteSaved: true };
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
