import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';

const PATH = '/api/admin/registrations/report';
const EVENT = 'circ-2027';
const READERS = new Set(['circ.chuc@gmail.com', 'paulojaneiro77@gmail.com']);
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const ORDER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PAGE_SIZE = 500;
const MAX_PAGES = 40;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REGISTRATION_FIELDS = [
  'eventId', 'userId', 'registrationKey', 'primaryRegistration', 'isTest', 'testMode', 'status',
  'participantName', 'participantEmail', 'registrationType', 'createdAt', 'updatedAt', 'selection', 'entitlements',
  'payment.status', 'payment.amountCents', 'payment.currency', 'payment.method', 'payment.reference',
  'payment.orderId', 'payment.closedUnpaidStatus', 'addOnOrderCount', 'documentCount',
  'openSupplementaryOrderId', 'capacityReviewOrderId', 'capacityUnavailable',
  'archived', 'registrationArchiveId', 'registrationArchivedAt',
];
const PAYMENT_FIELDS = [
  'eventId', 'environment', 'userId', 'registrationId', 'kind', 'status', 'isTest', 'testMode',
  'quote.kind', 'quote.selection', 'paidAt', 'transactionId', 'capacityStatus', 'replacementOrderId',
  'archived', 'registrationArchiveId', 'registrationArchivedAt',
];
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const reply = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...HEADERS, ...extra } });
const unavailable = () => { throw new Error('registration-report-unavailable'); };

function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return null;
}
const map = value => value && typeof value === 'object' && !Array.isArray(value);
function strings(source, limits) {
  return Object.fromEntries(Object.entries(limits).filter(([key, max]) => typeof source?.[key] === 'string'
    && source[key].length <= max).map(([key]) => [key, source[key]]));
}
function booleans(source, keys) {
  return Object.fromEntries(keys.filter(key => typeof source?.[key] === 'boolean').map(key => [key, source[key]]));
}
function integers(source, keys) {
  return Object.fromEntries(keys.filter(key => Number.isSafeInteger(source?.[key]) && source[key] >= 0).map(key => [key, source[key]]));
}
function selection(source) {
  if (!map(source)) return {};
  return { ...strings(source, { profile: 30, congressMode: 30 }), ...booleans(source, ['morningCourse', 'afternoonCourse']),
    ...integers(source, ['dinnerQuantity']) };
}
function active(source) {
  return source.eventId === EVENT && source.isTest !== true && source.testMode !== true
    && source.archived !== true && !source.registrationArchiveId && !source.registrationArchivedAt;
}
function registrationProjection(source, id) {
  const result = { id,
    ...strings(source, { eventId: 50, userId: 128, registrationKey: 180, status: 60, participantName: 200,
      participantEmail: 254, registrationType: 200, createdAt: 60, updatedAt: 60, openSupplementaryOrderId: 100,
      capacityReviewOrderId: 100 }),
    ...booleans(source, ['primaryRegistration', 'isTest', 'testMode']),
    ...integers(source, ['addOnOrderCount', 'documentCount']),
    payment: { ...strings(source.payment, { status: 60, currency: 10, method: 60, reference: 180,
      orderId: 100, closedUnpaidStatus: 60 }), ...integers(source.payment, ['amountCents']) },
  };
  if (map(source.selection)) result.selection = selection(source.selection);
  // Explicitly empty/false grants are authoritative; never fall through to requested choices.
  if (Object.hasOwn(source, 'entitlements')) result.entitlements = source.entitlements === null ? null : selection(source.entitlements);
  if (Array.isArray(source.capacityUnavailable)) result.capacityUnavailable = source.capacityUnavailable
    .filter(key => ['onsite', 'morningCourse', 'afternoonCourse'].includes(key));
  if (source.capacityReviewOrderId && !result.capacityReviewOrderId) result.capacityReviewOrderId = 'review_required';
  return result;
}
function paymentProjection(source, id) {
  const result = { id, ...strings(source, { eventId: 50, environment: 30, userId: 128, registrationId: 180, kind: 30,
    status: 60, capacityStatus: 60, replacementOrderId: 100 }), ...booleans(source, ['isTest', 'testMode']),
  quote: { ...strings(source.quote, { kind: 30 }), ...(map(source.quote?.selection) ? { selection: selection(source.quote.selection) } : {}) },
  // The analytics needs only presence, not provider transaction identifiers or instrument data.
  paidAt: Boolean(source.paidAt), transactionId: Boolean(source.transactionId) };
  // Dropping a malformed but truthy marker could turn a closed/review order into a pending option.
  if (source.capacityStatus && !result.capacityStatus) result.capacityStatus = 'review_required';
  if (source.replacementOrderId && !result.replacementOrderId) result.replacementOrderId = 'unconfirmed';
  return result;
}

/** Read-only Firestore access with field masks; no user profile, note or fiscal-document reads. */
export function createRegistrationReportsStore({ projectId, token, fetchImpl = fetch } = {}) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || typeof token !== 'string' || !token) unavailable();
  const root = `projects/${projectId}/databases/(default)/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  async function read(operation, body) {
    let response;
    try {
      response = await fetchImpl(`${endpoint}:${operation}`, { method: 'POST', redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000) });
    } catch { unavailable(); }
    if (!response.ok || !response.body) { try { await response.body?.cancel(); } catch {} unavailable(); }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); unavailable(); } chunks.push(Buffer.from(part.value)); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { unavailable(); }
  }
  function document(doc, collection) {
    const prefix = `${root}/${collection}/`;
    if (typeof doc?.name !== 'string' || !doc.name.startsWith(prefix)) unavailable();
    const id = doc.name.slice(prefix.length);
    if (!id || id.includes('/') || id.length > 1500) unavailable();
    return { id, data: decode({ mapValue: { fields: doc.fields || {} } }) };
  }
  return {
    async report() {
      const registrations = [], seen = new Set(); let after = null, complete = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await read('runQuery', { structuredQuery: { from: [{ collectionId: 'registrations' }],
          where: { fieldFilter: { field: { fieldPath: 'eventId' }, op: 'EQUAL', value: { stringValue: EVENT } } },
          select: { fields: REGISTRATION_FIELDS.map(fieldPath => ({ fieldPath })) },
          orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}), limit: PAGE_SIZE } });
        if (!Array.isArray(rows)) unavailable();
        const docs = rows.filter(row => row.document).map(row => row.document);
        if (docs.length > PAGE_SIZE || rows.some(row => row.error)) unavailable();
        for (const doc of docs) {
          const item = document(doc, 'registrations');
          if (seen.has(item.id) || item.data.eventId !== EVENT) unavailable();
          seen.add(item.id);
          if (active(item.data)) registrations.push(registrationProjection(item.data, item.id));
        }
        if (docs.length < PAGE_SIZE) { complete = true; break; }
        after = docs.at(-1).name;
      }
      // Fail rather than presenting incomplete event-wide totals at the operational scan bound.
      if (!complete) unavailable();
      const linked = new Map();
      for (const registration of registrations) {
        for (const [id, kind] of [[registration.payment?.orderId, 'primary'], [registration.openSupplementaryOrderId, 'supplementary']]) {
          if (!ORDER_ID.test(id || '') || !UID.test(registration.userId || '')) continue;
          const links = linked.get(id) || []; links.push({ registration, kind }); linked.set(id, links);
        }
      }
      const ids = [...linked.keys()], payments = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const names = ids.slice(offset, offset + 100).map(id => `${root}/payments/${id}`);
        const rows = await read('batchGet', { documents: names, mask: { fieldPaths: PAYMENT_FIELDS } });
        if (!Array.isArray(rows) || rows.some(row => row.error)) unavailable();
        const accounted = new Set();
        for (const row of rows) {
          const name = row.found?.name || row.missing;
          if (!names.includes(name) || accounted.has(name)) unavailable();
          accounted.add(name);
          if (!row.found) continue;
          const item = document(row.found, 'payments'), source = item.data;
          const kind = source.kind || source.quote?.kind;
          if (!active(source) || source.environment !== 'production'
            || !linked.get(item.id)?.some(({ registration, kind: expected }) => source.userId === registration.userId
              && source.registrationId === registration.id && kind === expected)) continue;
          payments.push(paymentProjection(source, item.id));
        }
        if (accounted.size !== names.length) unavailable();
      }
      return { registrations, payments };
    },
  };
}

export function createRegistrationReportsApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createRegistrationReportsStore, now = () => new Date().toISOString() } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (request.method !== 'GET') return reply({ error: 'method-not-allowed' }, 405, { Allow: 'GET' });
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign-in-required' }, 401, { 'WWW-Authenticate': 'Bearer' });
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'registration-report-unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email_verified !== true || !UID.test(claims.sub || '') || typeof claims.email !== 'string'
      || !READERS.has(claims.email.trim().toLowerCase())) return reply({ error: 'registration-report-forbidden' }, 403);
    try {
      const serviceToken = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: serviceToken });
      const report = await store.report();
      return reply({ ...report, generatedAt: now() });
    } catch { return reply({ error: 'registration-report-unavailable' }, 503); }
  };
}
