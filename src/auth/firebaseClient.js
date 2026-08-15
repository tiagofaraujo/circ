const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyB_SQRRtWdODHk0Zll_EmK5NiWmOwUrHd8',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'circ-coimbra.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'circ-coimbra',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'circ-coimbra.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '460712299823',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:460712299823:web:9744dcd5c386baa1e3a5da',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || 'G-YWMJ0P9LZJ',
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

export const firebaseConfigured = requiredKeys.every(
  (key) => typeof firebaseConfig[key] === 'string' && firebaseConfig[key].trim().length > 0
);

let authInstance = null;

export function getFirebaseAuth() {
  if (!firebaseConfigured || typeof window === 'undefined' || !window.firebase) {
    return null;
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  if (!authInstance) {
    authInstance = window.firebase.auth();
    authInstance.useDeviceLanguage();
  }

  return authInstance;
}

export function createGoogleProvider() {
  if (typeof window === 'undefined' || !window.firebase) return null;

  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
