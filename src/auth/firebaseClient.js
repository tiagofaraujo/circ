const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyB_SQRRtWdODHk0Zll_EmK5NiWmOwUrHd8',
  authDomain: 'circ-coimbra.firebaseapp.com',
  projectId: 'circ-coimbra',
  storageBucket: '',
  messagingSenderId: '460712299823',
  appId: '1:460712299823:web:9744dcd5c386baa1e3a5da',
};

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: process.env.REACT_APP_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

export const firebaseConfigured = requiredKeys.every(
  (key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key].trim().length > 0
);

// Microsoft stays hidden until the provider has been configured in Firebase.
export const microsoftAuthEnabled = process.env.REACT_APP_MICROSOFT_AUTH_ENABLED === 'true';
export const adminEmail = (process.env.REACT_APP_ADMIN_EMAIL || 'circ.chuc@gmail.com').trim().toLowerCase();

// Temporary test assignments. Future assignments live in users/{uid}.roles.
export const submissionsManagerEmails = [
  'araujotiagofc@gmail.com',
  'acbdgomes@gmail.com',
  'afsilvacarvalho@gmail.com',
];
export const submissionTesterEmails = [
  'acbdgomes@gmail.com',
  'afsilvacarvalho@gmail.com',
];
export const secretariatEmails = ['tiago_araujo@hotmail.com'];

export function isAdminUser(user) {
  return Boolean(
    user?.emailVerified
    && user?.email
    && user.email.trim().toLowerCase() === adminEmail
  );
}

export function getUserAccess(user, storedRoles = {}) {
  const email = user?.email?.trim().toLowerCase() || '';
  const verified = Boolean(user?.emailVerified && email);
  const isAdmin = verified && email === adminEmail;
  const canManageSubmissions = Boolean(
    isAdmin
    || (verified && storedRoles?.submissions === true)
    || (verified && submissionsManagerEmails.includes(email))
  );
  const canUseSecretariat = Boolean(
    isAdmin
    || (verified && storedRoles?.secretariat === true)
    || (verified && secretariatEmails.includes(email))
  );
  const canTestSubmissions = Boolean(
    canManageSubmissions
    && (
      isAdmin
      || (verified && storedRoles?.submissionTesting === true)
      || (verified && submissionTesterEmails.includes(email))
    )
  );
  const canManageRegistrations = isAdmin;

  return {
    isAdmin,
    canManageRegistrations,
    canManageSubmissions,
    canTestSubmissions,
    canUseSecretariat,
    hasBackOfficeAccess: canManageRegistrations || canManageSubmissions || canUseSecretariat,
  };
}

let authInstance = null;
let firestoreInstance = null;
let storageInstance = null;

function ensureFirebaseApp() {
  if (!firebaseConfigured || typeof window === 'undefined' || !window.firebase) return null;
  if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
  return window.firebase.app();
}

export function getFirebaseAuth() {
  if (!ensureFirebaseApp() || !window.firebase.auth) return null;
  if (!authInstance) {
    authInstance = window.firebase.auth();
    authInstance.useDeviceLanguage();
  }
  return authInstance;
}

export function getFirebaseFirestore() {
  if (!ensureFirebaseApp() || !window.firebase.firestore) return null;
  if (!firestoreInstance) firestoreInstance = window.firebase.firestore();
  return firestoreInstance;
}

export function getFirebaseStorage() {
  if (!firebaseConfig.storageBucket || !ensureFirebaseApp() || !window.firebase.storage) return null;
  if (!storageInstance) storageInstance = window.firebase.storage();
  return storageInstance;
}

export function createGoogleProvider() {
  if (typeof window === 'undefined' || !window.firebase?.auth) return null;
  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function createMicrosoftProvider() {
  if (typeof window === 'undefined' || !window.firebase?.auth) return null;
  const provider = new window.firebase.auth.OAuthProvider('microsoft.com');
  provider.setCustomParameters({
    tenant: 'common',
    prompt: 'select_account',
  });
  return provider;
}
