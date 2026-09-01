import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createGoogleProvider,
  createMicrosoftProvider,
  firebaseConfigured,
  microsoftAuthEnabled,
  getFirebaseAuth,
  getFirebaseFirestore,
  getUserAccess,
  isAdminUser,
} from './firebaseClient';
import { deleteParticipantData } from './profileStore';
import { setUserPresence } from './presenceStore';

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
      photoURL: user.photoURL || '',
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
  const [rolesLoading, setRolesLoading] = useState(true);
  const [accountRoles, setAccountRoles] = useState({});

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

  useEffect(() => {
    if (!user) {
      setAccountRoles({});
      setRolesLoading(false);
      return undefined;
    }

    const db = getFirebaseFirestore();
    if (!db) {
      setAccountRoles({});
      setRolesLoading(false);
      return undefined;
    }

    setRolesLoading(true);
    return db.collection('users').doc(user.uid).onSnapshot(
      (snapshot) => {
        setAccountRoles(snapshot.data()?.roles || {});
        setRolesLoading(false);
      },
      () => {
        setAccountRoles({});
        setRolesLoading(false);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return undefined;

    const markActive = () => {
      if (document.visibilityState === 'visible') {
        setUserPresence(user, 'online').catch(() => {});
      }
    };
    const handleVisibility = () => {
      setUserPresence(user, document.visibilityState === 'visible' ? 'online' : 'away').catch(() => {});
    };

    markActive();
    const heartbeat = window.setInterval(markActive, 45 * 1000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', markActive);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', markActive);
      setUserPresence(user, 'offline').catch(() => {});
    };
  }, [user]);

  const value = useMemo(() => {
    const access = getUserAccess(user, accountRoles);

    return {
      configured: firebaseConfigured,
      microsoftAuthEnabled,
      user,
      loading: loading || rolesLoading,
      access,
      isAdmin: isAdminUser(user),

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
      const credential = await auth.signInWithPopup(provider);
      syncLegacyAccount(credential.user);
      return credential.user;
    },

    async signInWithMicrosoft(language = 'pt') {
      if (!microsoftAuthEnabled) throw new Error('auth/microsoft-not-configured');
      const auth = getFirebaseAuth();
      const provider = createMicrosoftProvider();
      if (!auth || !provider) throw new Error('auth/not-configured');

      applyAuthLanguage(auth, language);
      await ensurePersistence(auth);
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
      const currentUser = auth.currentUser || credential.user;
      setUser(currentUser);
      syncLegacyAccount(currentUser);
      return currentUser;
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

    async updateDisplayName(name) {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) throw new Error('auth/user-not-found');
      await auth.currentUser.updateProfile({ displayName: name.trim() });
      await auth.currentUser.reload();
      const currentUser = auth.currentUser;
      setUser(currentUser);
      syncLegacyAccount(currentUser);
      return currentUser;
    },

    async changePassword(currentPassword, newPassword) {
      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;
      if (!currentUser?.email || !window.firebase) throw new Error('auth/user-not-found');

      const hasPasswordProvider = currentUser.providerData?.some((provider) => provider.providerId === 'password');
      if (!hasPasswordProvider) throw new Error('auth/provider-not-password');

      const credential = window.firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
      await currentUser.reauthenticateWithCredential(credential);
      await currentUser.updatePassword(newPassword);
    },

    async deleteAccount(currentPassword = '') {
      const auth = getFirebaseAuth();
      const currentUser = auth?.currentUser;
      if (!currentUser || !window.firebase) throw new Error('auth/user-not-found');

      const providers = currentUser.providerData?.map((provider) => provider.providerId) || [];
      if (providers.includes('password')) {
        if (!currentUser.email || !currentPassword) throw new Error('auth/wrong-password');
        const credential = window.firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
        await currentUser.reauthenticateWithCredential(credential);
      } else if (providers.includes('google.com')) {
        const provider = createGoogleProvider();
        if (!provider) throw new Error('auth/not-configured');
        await currentUser.reauthenticateWithPopup(provider);
      } else if (providers.includes('microsoft.com')) {
        const provider = createMicrosoftProvider();
        if (!provider) throw new Error('auth/not-configured');
        await currentUser.reauthenticateWithPopup(provider);
      }

      await deleteParticipantData(currentUser);
      await currentUser.delete();
      clearLegacyAccount();
      setUser(null);
    },

    async signOut() {
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        await setUserPresence(auth.currentUser, 'offline').catch(() => {});
      }
      clearLegacyAccount();
      if (auth) await auth.signOut();
      setUser(null);
    },
    };
  }, [accountRoles, loading, rolesLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.');
  }
  return context;
}
