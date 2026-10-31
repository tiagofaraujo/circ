import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
// Firestore may return map fields in a different order from the original write.
export const liveDataStamp = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const PILOT_CONFIRMATION = 'CRIAR REFERENCIA REAL';
export function isLivePilotConfigured(env) {
  return env.LIVE_CHECKOUT_ENABLED === 'true' && env.EUPAGO_LIVE_CHANNEL === 'CIRC 2027'
    && ['FIREBASE_PROJECT_ID', 'FIREBASE_PAYMENTS_SERVICE_ACCOUNT', 'EUPAGO_LIVE_API_KEY', 'EUPAGO_LIVE_WEBHOOK_KEY',
      'TOCONLINE_OAUTH_CLIENT_ID', 'TOCONLINE_OAUTH_CLIENT_SECRET', 'TOCONLINE_OAUTH_URL', 'TOCONLINE_API_URL',
      'TOCONLINE_SESSION_KEY'].every(key => typeof env[key] === 'string' && env[key].trim().length > 0);
}
