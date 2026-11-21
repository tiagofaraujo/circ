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
    const day = `${today.year}-${today.month}-${today.day}`;
    const previous = await store.birthdayProgress();
    if (previous?.day === day && previous.done) return { ...stats, skipped: 'complete' };
    const eligible = record => record?.birthdayEnabled === true && Boolean(record.birthdayConsentedAt)
      && /^[\w-]{1,128}$/.test(record.uid || '') && Date.parse(record.expiresAt) > now()
      && (!config.testOnly || record.testAccount === true);
    let cursor = previous?.day === day ? previous.cursor : null;
    let pages = 0;
    let budget = 38; // Leaves room within Workers Free's 50 requests for auth, cursor and retention.
    let done = false;
    let paused = false;
    do {
      const page = await store.birthdayCandidates(cursor);
      const profiles = await store.birthdayProfiles(page.records.filter(eligible).map(record => record.uid));
      budget -= 2;
      for (const candidate of page.records) {
        // Resume before this candidate next minute. A cursor is saved only after processing.
        if (budget < 5 || stats.attempted >= 5 || now() - scheduledTime > 50 * 1000) { paused = true; break; }
        if (eligible(candidate)) {
          stats.checked++;
          const profile = profiles.get(candidate.uid);
          if (profile && birthdayIsToday(profile.dateOfBirth, time, today)) {
            budget -= 5; // Worst case: read + reservation + provider + reread + expired delete.
            try {
              // Re-read after scanning: do not dispatch to an unsubscribed or reassigned device.
              const record = await store.read(candidate.subscription.endpoint);
              if (eligible(record) && record.uid === candidate.uid) {
                normalizePushSubscription(record.subscription);
                if (now() - scheduledTime > 15 * 60000) throw new Error('birthday-window-ended');
                if (await store.reserveBirthday(record, profile, today.year, time)) {
                  stats.attempted++;
                  // Reserve before the external effect. Uncertain deliveries are not retried.
                  const result = await send(record.subscription, birthdayMessage(profile, record.locale, today.year), env);
                  if (result.accepted) stats.accepted++;
                  else if (result.expired) {
                    stats.expired++;
                    const current = await store.read(record.subscription.endpoint);
                    if (current?.uid === record.uid && current.revision === record.revision) await store.remove(record.subscription.endpoint, current);
                  } else stats.failed++;
                }
              }
            } catch { stats.failed++; } // Never log names, birth dates, endpoint capabilities or payloads.
          }
        }
        cursor = candidate.documentName;
      }
      pages++;
      if (paused) break;
      if (!page.cursor) { done = true; break; }
      cursor = page.cursor;
    } while (pages < 3 && budget >= 7 && stats.attempted < 5 && now() - scheduledTime < 50 * 1000);
    const saved = await store.saveBirthdayProgress({ day, cursor, done }, previous);
    return { ...stats, complete: done, progressSaved: saved,
      ...(!done && Number(today.minute) === 14 ? { incomplete: true } : {}) };
  };
}
