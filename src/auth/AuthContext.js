import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createGoogleProvider, firebaseConfigured, getFirebaseAuth } from './firebaseClient';

const AuthContext = createContext(null);
const LEGACY_ACCOUNT_KEY = 'circ_demo_account';

function syncLegacyAccount(user) {
  if (!user || typeof window === 'undefined') return;

  let existing = {};
  try {
    existing = JSON.parse(window.localStorage.getItem(LEGACY_ACCOUNT_KEY)) || {};
  } catch (error) {
    existing = {};
  }

  window.localStorage.setItem(
    LEGACY_ACCOUNT_KEY,
    JSON.stringify({
      ...existing,
      email: user.email || existing.email || '',
      name: user.displayName || existing.name || '',
      photoURL: user.photoURL || existing.photoURL || '',
      firebaseUid: user.uid,
      demoAccess: false,
    })
  );
}

function clearLegacyAccount() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_ACCOUNT_KEY);
  }
}

async function ensurePersistence(auth) {
  if (!auth || !window.firebase) return;
  await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
}

function applyAuthLanguage(auth, language = 'pt') {
  if (!auth) return;
  auth.languageCode = language === 'en' ? 'en' : 'pt';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();

    if (!auth) {
      setLoading(false);
      return undefined;
    }

    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) syncLegacyAccount(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(() => ({
    configured: firebaseConfigured,
    user,
    loading,

    async signInWithEmail(email, password, language = 'pt') {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('auth/not-configured');
      applyAuthLanguage(auth, language);
      await ensurePersistence(auth);
      const credential = await auth.signInWithEmailAndPassword(email.trim(), password);
      syncLegacyAccount(credential.user);
      return credential.user;
    },

    async signInWithGoogle(language = 'pt') {
      const auth = getFirebaseAuth();
      const provider = createGoogleProvider();
      if (!auth || !provider) throw new Error('auth/not-configured');

      applyAuthLanguage(auth, language);
      await ensurePersistence(auth);

      // The CIRC website is hosted on Cloudflare rather than Firebase Hosting.
      // Firebase recommends popup sign-in as the simplest production option in this setup,
      // avoiding third-party-storage limitations that affect signInWithRedirect.
      const credential = await auth.signInWithPopup(provider);
      syncLegacyAccount(credential.user);
      return credential.user;
    },

    async registerWithEmail(name, email, password, language = 'pt') {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('auth/not-configured');
      applyAuthLanguage(auth, language);
      await ensurePersistence(auth);
      const credential = await auth.createUserWithEmailAndPassword(email.trim(), password);
      if (name.trim()) {
        await credential.user.updateProfile({ displayName: name.trim() });
        await credential.user.reload();
      }
      await credential.user.sendEmailVerification();
      syncLegacyAccount(auth.currentUser || credential.user);
      return auth.currentUser || credential.user;
    },

    async sendPasswordReset(email, language = 'pt') {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error('auth/not-configured');
      applyAuthLanguage(auth, language);
      return auth.sendPasswordResetEmail(email.trim());
    },

    async resendVerification(language = 'pt') {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) throw new Error('auth/user-not-found');
      applyAuthLanguage(auth, language);
      return auth.currentUser.sendEmailVerification();
    },

    async signOut() {
      const auth = getFirebaseAuth();
      clearLegacyAccount();
      if (auth) await auth.signOut();
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return context;
}
