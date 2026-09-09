import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFirestore } from './firebaseClient';

export const ulsVerificationEnabled = process.env.REACT_APP_ULS_VERIFICATION_ENABLED === 'true';
const ulsPilotEmails = new Set((process.env.REACT_APP_ULS_PILOT_EMAILS || 'araujotiagofc@gmail.com')
  .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const EVENT_ID = 'circ-2027';

export function isUlsPilotUser(user) {
  return Boolean(user?.email && ulsPilotEmails.has(user.email.trim().toLowerCase()));
}

export function useUlsEligibility(user) {
  const [state, setState] = useState({ uid: null, status: 'idle', verified: false });
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !ulsVerificationEnabled || !isUlsPilotUser(user)) {
      setState({ uid, status: 'idle', verified: false });
      return undefined;
    }
    const db = getFirebaseFirestore();
    if (!db) { setState({ uid, status: 'error', verified: false }); return undefined; }
    setState({ uid, status: 'loading', verified: false });
    let active = true;
    const unsubscribe = db.collection('ulsEligibility').doc(uid).onSnapshot((snapshot) => {
      if (!active) return;
      const data = snapshot.exists ? snapshot.data() : null;
      setState({ uid, status: 'ready', verified: data?.eventId === EVENT_ID && data?.status === 'verified',
        institutionalEmail: data?.institutionalEmail || '' });
    }, () => { if (active) setState({ uid, status: 'error', verified: false }); });
    return () => { active = false; unsubscribe(); };
  }, [user?.uid, user?.email]);
  // A previous user's snapshot must never unlock the next user's form.
  if (!ulsVerificationEnabled || !isUlsPilotUser(user)) return { status: 'idle', verified: false };
  return state.uid === user?.uid ? state : { status: 'loading', verified: false };
}

async function callVerification(name, data) {
  if (!ulsVerificationEnabled) throw new Error('unavailable');
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) throw new Error('unauthenticated');
  if (!isUlsPilotUser(user)) throw new Error('permission-denied');
  const token = await user.getIdToken(true);
  const projectId = auth.app.options.projectId;
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error('unavailable');
  const region = process.env.REACT_APP_ULS_FUNCTIONS_REGION || 'europe-west1';
  if (!/^[a-z0-9-]+$/.test(region)) throw new Error('unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(`https://${region}-${projectId}.cloudfunctions.net/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }), signal: controller.signal, credentials: 'omit', cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error((payload.error?.status || 'unavailable').toLowerCase().replace(/_/g, '-'));
    }
    if (!payload.result || typeof payload.result !== 'object') throw new Error('unavailable');
    return payload.result;
  } finally { clearTimeout(timeout); }
}

export const requestUlsCode = (mec) => callVerification('requestUlsVerification', { mec });
export const confirmUlsCode = (challengeId, code) => callVerification('verifyUlsVerification', { challengeId, code });
