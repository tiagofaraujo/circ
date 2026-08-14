import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';

const AuthContext = createContext(null);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function prefersRedirectForGoogle() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }

    setPersistence(auth, browserLocalPersistence).catch(() => undefined);

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured: firebaseConfigured,
      loginWithPassword: (email, password) => {
        if (!auth) throw new Error('auth/not-configured');
        return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      },
      registerWithPassword: async (name, email, password) => {
        if (!auth) throw new Error('auth/not-configured');
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim().toLowerCase(),
          password
        );

        if (name.trim()) {
          await updateProfile(credential.user, { displayName: name.trim() });
        }

        await sendEmailVerification(credential.user);
        return credential;
      },
      loginWithGoogle: async () => {
        if (!auth) throw new Error('auth/not-configured');
        if (prefersRedirectForGoogle()) {
          return signInWithRedirect(auth, googleProvider);
        }
        return signInWithPopup(auth, googleProvider);
      },
      resetPassword: (email) => {
        if (!auth) throw new Error('auth/not-configured');
        return sendPasswordResetEmail(auth, email.trim().toLowerCase());
      },
      logout: () => {
        if (!auth) return Promise.resolve();
        return signOut(auth);
      },
      updateAccountName: async (name) => {
        if (!auth?.currentUser) throw new Error('auth/no-current-user');
        await updateProfile(auth.currentUser, { displayName: name.trim() });
        setUser({ ...auth.currentUser });
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
