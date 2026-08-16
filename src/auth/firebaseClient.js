const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyB_SQRRtWdODHk0Zll_EmK5NiWmOwUrHd8',
  authDomain: 'circ-coimbra.firebaseapp.com',
  projectId: 'circ-coimbra',
  messagingSenderId: '460712299823',
  appId: '1:460712299823:web:9744dcd5c386baa1e3a5da',
};

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: process.env.REACT_APP_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

export const firebaseConfigured = requiredKeys.every(
  (key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key].trim().length > 0
);

let authInstance = null;
let firestoreInstance = null;

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

export function createGoogleProvider() {
  if (typeof window === 'undefined' || !window.firebase?.auth) return null;
  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
