import { createPaymentsServiceTokenProvider } from './payments/payments-service-token.mjs';
import { createPushStore, normalizePushSubscription, pushConfiguration, sendPushMessage } from './push.mjs';
import { birthdayIsToday, birthdayMessage, lisbonDate } from './birthday-message.mjs';

export function createBirthdayJob({ tokenProvider = createPaymentsServiceTokenProvider(), storeFactory = createPushStore,
  send = (subscription, payload, env) => sendPushMessage(subscription, payload, env, fetch, 3600), now = Date.now } = {}) {
  return async (scheduledTime, env) => {
    const config = pushConfiguration(env);
    const stats = { checked: 0, attempted: 0, accepted: 0, expired: 0, failed: 0 };
    if (!config.enabled || env.PUSH_BIRTHDAY_ENABLED !== 'true') return { ...stats, skipped: 'disabled' };
    const time = now();
    // Cron uses UTC. Only the invocation at 09:00 Lisbon runs, in summer or winter.
    // Delayed invocations must not send greetings on another day or late at night.
    const today = lisbonDate(time);
    if (!Number.isFinite(scheduledTime) || time < scheduledTime || time - scheduledTime > 15 * 60000
      || today.hour !== '09' || Number(today.minute) >= 15) return { ...stats, skipped: 'outside-window' };
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: await tokenProvider(env) });
    const eligible = record => record?.birthdayEnabled === true && Boolean(record.birthdayConsentedAt)
      && /^[\w-]{1,128}$/.test(record.uid || '') && Date.parse(record.expiresAt) > now()
      && (!config.testOnly || record.testAccount === true);
    let cursor = null;
    let pages = 0;
    do {
      const page = await store.birthdayCandidates(cursor);
      for (const candidate of page.records) {
        if (!eligible(candidate)) continue;
        stats.checked++;
        try {
          const profile = await store.birthdayProfile(candidate.uid);
          if (!profile || !birthdayIsToday(profile.dateOfBirth, time)) continue;
          // Re-read after scanning: do not dispatch to an unsubscribed or reassigned device.
          const record = await store.read(candidate.subscription.endpoint);
          if (!eligible(record) || record.uid !== candidate.uid) continue;
          normalizePushSubscription(record.subscription);
          if (now() - scheduledTime > 15 * 60000) throw new Error('birthday-window-ended');
          if (!await store.reserveBirthday(record, profile, today.year, time)) continue;
          stats.attempted++;
          // Reserve once per account/device/year before the external effect. An uncertain
          // provider result is not retried automatically, avoiding duplicate greetings.
          const result = await send(record.subscription, birthdayMessage(profile, record.locale, today.year), env);
          if (result.accepted) stats.accepted++;
          else if (result.expired) {
            stats.expired++;
            const current = await store.read(record.subscription.endpoint);
            if (current?.uid === record.uid && current.revision === record.revision) await store.remove(record.subscription.endpoint, current);
          } else stats.failed++;
        } catch { stats.failed++; } // Never log names, birth dates, endpoint capabilities or payloads.
      }
      cursor = page.cursor;
      pages++;
      if (cursor && (pages >= 100 || now() - scheduledTime > 15 * 60000)) throw new Error('birthday-scan-incomplete');
    } while (cursor);
    return stats;
  };
}
