import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
// Firestore may return map fields in a different order from the original write.
export const liveDataStamp = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const PILOT_CONFIRMATION = 'CRIAR REFERENCIA REAL';
// A present but invalid deadline must close creation, never turn into public checkout.
export const isPrivatePilotWindow = env => env.LIVE_PILOT_UNTIL !== undefined;
export function livePilotDeadline(env) {
  const value = env.LIVE_PILOT_UNTIL;
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace('.000Z', 'Z') === value ? value : null;
}
export function isLiveCheckoutEnabled(env, nowMs = Date.now()) {
  if (env.LIVE_CHECKOUT_ENABLED !== 'true') return false;
  if (!isPrivatePilotWindow(env)) return true;
  const deadline = livePilotDeadline(env);
  return deadline !== null && Number.isFinite(nowMs) && nowMs < Date.parse(deadline);
}
export function isLivePilotConfigured(env, nowMs = Date.now()) {
  return isLiveCheckoutEnabled(env, nowMs) && env.EUPAGO_LIVE_CHANNEL === 'CIRC 2027'
    && ['FIREBASE_PROJECT_ID', 'FIREBASE_PAYMENTS_SERVICE_ACCOUNT', 'EUPAGO_LIVE_API_KEY', 'EUPAGO_LIVE_WEBHOOK_KEY',
      'TOCONLINE_OAUTH_CLIENT_ID', 'TOCONLINE_OAUTH_CLIENT_SECRET', 'TOCONLINE_OAUTH_URL', 'TOCONLINE_API_URL',
      'TOCONLINE_SESSION_KEY'].every(key => typeof env[key] === 'string' && env[key].trim().length > 0);
}
