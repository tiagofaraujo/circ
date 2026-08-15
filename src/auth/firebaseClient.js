const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
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
