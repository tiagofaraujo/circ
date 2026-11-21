import { createPaymentsServiceTokenProvider } from './payments/payments-service-token.mjs';
import { createPushStore } from './push.mjs';

export function createPushRetentionJob({ tokenProvider = createPaymentsServiceTokenProvider(), storeFactory = createPushStore, now = Date.now } = {}) {
  return async (scheduledTime, env) => {
    // Once at each configured hour. Keep retention independent of delivery switches.
    if (env.PUSH_RETENTION_ENABLED !== 'true') return { skipped: 'disabled' };
    const time = now();
    if (!Number.isFinite(scheduledTime) || time < scheduledTime || time - scheduledTime > 15 * 60000
      || new Date(scheduledTime).getUTCMinutes() !== 0) return { skipped: 'outside-window' };
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: await tokenProvider(env) });
    return store.removeExpired(time);
  };
}
