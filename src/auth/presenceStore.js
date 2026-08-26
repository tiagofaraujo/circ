import { getFirebaseFirestore } from './firebaseClient';

export const USER_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const USER_STATS_REFRESH_MS = 30 * 1000;

function getDatabase() {
  return getFirebaseFirestore();
}

export async function setUserPresence(user, state = 'online') {
  const db = getDatabase();
  if (!db || !user?.uid || !window.firebase?.firestore) return;

  await db.collection('users').doc(user.uid).set(
    {
      firebaseUid: user.uid,
      activity: {
        state,
        lastSeenAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}

async function getCollectionCount(collectionRef) {
  if (typeof collectionRef.count === 'function') {
    const aggregate = await collectionRef.count().get();
    return aggregate.data().count;
  }

  const snapshot = await collectionRef.get();
  return snapshot.size;
}

export async function getUserStats() {
  const db = getDatabase();
  if (!db || !window.firebase?.firestore) throw new Error('firestore/not-configured');

  const users = db.collection('users');
  const onlineSince = window.firebase.firestore.Timestamp.fromMillis(
    Date.now() - USER_ONLINE_WINDOW_MS
  );

  const [total, recentlyActive] = await Promise.all([
    getCollectionCount(users),
    users.where('activity.lastSeenAt', '>=', onlineSince).get(),
  ]);

  const online = recentlyActive.docs.filter(
    (document) => document.data()?.activity?.state === 'online'
  ).length;

  return { total, online };
}

export function subscribeToUserStats(onData, onError) {
  let active = true;

  const refresh = async () => {
    try {
      const stats = await getUserStats();
      if (active) onData(stats);
    } catch (error) {
      if (active) onError(error);
    }
  };

  refresh();
  const interval = window.setInterval(refresh, USER_STATS_REFRESH_MS);

  return () => {
    active = false;
    window.clearInterval(interval);
  };
}
