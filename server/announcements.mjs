import { createHash } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments/payments-service-token.mjs';
import { normalizePushSubscription, pushConfiguration, sendPushMessage } from './push.mjs';

const ADMIN = 'circ.chuc@gmail.com';
const PATH = '/api/notifications';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const reply = (value, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const publicNotice = ({ id, title, body, createdAt }) => ({ id, title, body, createdAt });
export function normalizeAnnouncement(value) {
  if (!UUID.test(value?.id || '') || typeof value.title !== 'string' || typeof value.body !== 'string') throw new Error('invalid-notification');
  const title = value.title.trim(), body = value.body.trim();
  if (!title || title.length > 80 || !body || body.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title + body)) throw new Error('invalid-notification');
  return { id: value.id, title, body };
}

export function createAnnouncementStore({ projectId, token, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || !token) throw new Error('storage-unavailable');
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${root}`;
  const init = () => ({ redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const name = (collection, id) => `${root}/${collection}/${id}`;
  const fields = record => ({ record: { stringValue: JSON.stringify(record) } });
  const jobFields = record => ({ ...fields(record), pending: { booleanValue: record.pending } });
  const conflict = async response => ['ALREADY_EXISTS', 'FAILED_PRECONDITION', 'NOT_FOUND'].includes((await response.json().catch(() => ({}))).error?.status);
  function decode(doc, collection) {
    const record = JSON.parse(doc?.fields?.record?.stringValue || 'null');
    if (!record || !UUID.test(record.id || '') || doc.name !== name(collection, record.id) || !doc.updateTime) throw new Error('storage-unavailable');
    return { ...record, revision: doc.updateTime };
  }
  async function query(structuredQuery) {
    const response = await fetchImpl(`${base}:runQuery`, { ...init(), method: 'POST', body: JSON.stringify({ structuredQuery }) });
    if (!response.ok) throw new Error('storage-unavailable');
    return (await response.json()).filter(row => row.document).map(row => row.document);
  }
  async function read(id) {
    const response = await fetchImpl(`${base}/notifications/${id}`, init());
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('storage-unavailable');
    return decode(await response.json(), 'notifications');
  }
  return {
    async publish(notice, uid, time) {
      const previous = await read(notice.id);
      if (previous) {
        if (previous.title !== notice.title || previous.body !== notice.body || previous.createdBy !== uid) throw new Error('id-conflict');
        return { notification: publicNotice(previous), duplicate: true };
      }
      const createdAt = new Date(time).toISOString();
      const record = { ...notice, createdBy: uid, createdAt };
      const job = { id: notice.id, createdAt, pending: true, cursor: null, leaseUntil: 0,
        checked: 0, attempted: 0, accepted: 0, failed: 0, skipped: 0 };
      const response = await fetchImpl(`${base}:commit`, { ...init(), method: 'POST', body: JSON.stringify({ writes: [
        { update: { name: name('notifications', notice.id), fields: { ...fields(record), createdAt: { timestampValue: createdAt } } }, currentDocument: { exists: false } },
        { update: { name: name('pushAnnouncementJobs', notice.id), fields: jobFields(job) }, currentDocument: { exists: false } },
      ] }) });
      if (!response.ok) {
        if (await conflict(response)) {
          const saved = await read(notice.id);
          if (saved?.title === notice.title && saved?.body === notice.body && saved?.createdBy === uid) return { notification: publicNotice(saved), duplicate: true };
          throw new Error('id-conflict');
        }
        throw new Error('storage-unavailable');
      }
      return { notification: publicNotice(record), duplicate: false };
    },
    async list(admin = false) {
      const docs = await query({ from: [{ collectionId: 'notifications' }], orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 20 });
      const notices = docs.map(doc => publicNotice(decode(doc, 'notifications')));
      if (!admin || !notices.length) return notices;
      const response = await fetchImpl(`${base}:batchGet`, { ...init(), method: 'POST', body: JSON.stringify({ documents: notices.map(n => name('pushAnnouncementJobs', n.id)) }) });
      if (!response.ok) throw new Error('storage-unavailable');
      const jobs = new Map((await response.json()).filter(row => row.found).map(row => { const j = decode(row.found, 'pushAnnouncementJobs'); return [j.id, j]; }));
      return notices.map(n => { const j = jobs.get(n.id); return { ...n, dispatch: j ? {
        pending: j.pending, accepted: j.accepted, attempted: j.attempted, failed: j.failed, expired: j.expired === true,
      } : null }; });
    },
    async nextJob() {
      const docs = await query({ from: [{ collectionId: 'pushAnnouncementJobs' }], where: { fieldFilter: {
        field: { fieldPath: 'pending' }, op: 'EQUAL', value: { booleanValue: true },
      } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 1 });
      return docs.length ? decode(docs[0], 'pushAnnouncementJobs') : null;
    },
    async saveJob(job, previous) {
      const { revision, ...record } = job;
      const response = await fetchImpl(`${base}/pushAnnouncementJobs/${job.id}?currentDocument.updateTime=${encodeURIComponent(previous.revision)}`, {
        ...init(), method: 'PATCH', body: JSON.stringify({ fields: jobFields(record) }),
      });
      if (!response.ok) { if (await conflict(response)) return null; throw new Error('storage-unavailable'); }
      return decode(await response.json(), 'pushAnnouncementJobs');
    },
    read,
    async candidates(cursor) {
      const prefix = `${root}/pushSubscriptions/`;
      if (cursor && (!cursor.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(cursor.slice(prefix.length)))) throw new Error('invalid-cursor');
      const docs = await query({ from: [{ collectionId: 'pushSubscriptions' }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 100,
        ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
      });
      return { records: docs.map(doc => {
        const record = JSON.parse(doc.fields?.record?.stringValue || 'null');
        if (!record?.subscription?.endpoint || doc.name !== name('pushSubscriptions', hash(record.subscription.endpoint)) || !doc.updateTime) throw new Error('storage-unavailable');
        return { ...record, documentName: doc.name, revision: doc.updateTime };
      }), more: docs.length === 100 };
    },
    async reserve(job, record, time) {
      const deliveryId = hash(JSON.stringify([job.id, record.uid, record.subscription.endpoint]));
      const response = await fetchImpl(`${base}:commit`, { ...init(), method: 'POST', body: JSON.stringify({ writes: [
        { verify: name('pushAnnouncementJobs', job.id), currentDocument: { updateTime: job.revision } },
        { verify: record.documentName, currentDocument: { updateTime: record.revision } },
        { update: { name: name('pushAnnouncementDeliveries', deliveryId), fields: {
          expiresAt: { timestampValue: new Date(time + 30 * 86400000).toISOString() },
        } }, currentDocument: { exists: false } },
      ] }) });
      if (response.ok) return true;
      if (await conflict(response)) return false;
      throw new Error('storage-unavailable');
    },
  };
}

export function createAnnouncementsApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(), storeFactory = createAnnouncementStore, now = Date.now } = {}) {
  return async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (url.search || !['GET', 'POST'].includes(request.method)) return reply({ error: 'invalid-request' }, 400);
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return reply({ error: 'sign-in-required' }, 401);
    let claims;
    try { claims = await verify(bearer, env.FIREBASE_PROJECT_ID); } catch { return reply({ error: 'invalid-session' }, 401); }
    if (!/^[\w-]{1,128}$/.test(claims?.sub || '') || claims.email_verified !== true) return reply({ error: 'verified-account-required' }, 403);
    const admin = claims.email === ADMIN;
    let notice;
    if (request.method === 'POST') {
      if (!admin) return reply({ error: 'admin-required' }, 403);
      if (env.PUSH_ANNOUNCEMENTS_ENABLED !== 'true' || !pushConfiguration(env).enabled) return reply({ error: 'sending-disabled' }, 503);
      try {
        if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '') || !request.body) throw new Error();
        const reader = request.body.getReader(); let bytes = 0; const chunks = [];
        while (true) { const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength; if (bytes > 8192) { await reader.cancel(); throw new Error(); } chunks.push(Buffer.from(value)); }
        notice = normalizeAnnouncement(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch { return reply({ error: 'invalid-notification' }, 400); }
    }
    try {
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: await tokenProvider(env) });
      if (!notice) return reply({ notifications: await store.list(admin) });
      const result = await store.publish(notice, claims.sub, now());
      return reply(result, result.duplicate ? 200 : 201);
    } catch (error) { return reply({ error: error.message === 'id-conflict' ? 'id-conflict' : 'notifications-unavailable' }, error.message === 'id-conflict' ? 409 : 503); }
  };
}

export function createAnnouncementJob({ tokenProvider = createPaymentsServiceTokenProvider(), storeFactory = createAnnouncementStore, send = sendPushMessage, now = Date.now } = {}) {
  return async (scheduledTime, env) => {
    const config = pushConfiguration(env), start = now();
    if (!config.enabled || env.PUSH_ANNOUNCEMENTS_ENABLED !== 'true') return { skipped: 'disabled' };
    if (!Number.isFinite(scheduledTime) || start < scheduledTime || start - scheduledTime > 3 * 60000) return { skipped: 'stale-trigger' };
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token: await tokenProvider(env) });
    const previous = await store.nextJob();
    if (!previous) return { skipped: 'empty' };
    if (previous.leaseUntil > start) return { skipped: 'busy' };
    const job = await store.saveJob({ ...previous, leaseUntil: start + 120000 }, previous);
    if (!job) return { skipped: 'busy' };
    if (start - Date.parse(job.createdAt) > 7 * 86400000) {
      await store.saveJob({ ...job, pending: false, expired: true, leaseUntil: 0 }, job);
      return { skipped: 'expired' };
    }
    const notice = await store.read(job.id);
    if (!notice) throw new Error('missing-notification');
    let attempts = 0, reservations = 0, pages = 0;
    // Independent cron invocation: at most 8 sends + 16 reservation/provider calls,
    // 3 page reads, auth/claim/progress. Well within the 50-subrequest budget.
    while (reservations < 8 && pages < 3 && now() - start < 45000) {
      const page = await store.candidates(job.cursor); pages++;
      let paused = false;
      for (const record of page.records) {
        if (reservations >= 8 || now() - start >= 45000) { paused = true; break; }
        job.checked++;
        const eligible = /^[\w-]{1,128}$/.test(record.uid || '') && Date.parse(record.expiresAt) > now()
          && Date.parse(record.consentedAt) <= Date.parse(notice.createdAt) && (!config.testOnly || record.testAccount === true);
        let valid = eligible;
        if (valid) { try { normalizePushSubscription(record.subscription); } catch { valid = false; } }
        if (valid) reservations++;
        if (valid && await store.reserve(job, record, now())) {
          attempts++; job.attempted++;
          try {
            const result = await send(record.subscription, { title: 'My CIRC', body: `${notice.title}: ${notice.body}`.slice(0, 240),
              tag: `circ-announcement-${notice.id}`, url: '/conta/notificacoes' }, env, undefined, 3600);
            if (result.accepted) job.accepted++; else job.failed++;
          } catch { job.failed++; } // Uncertain external outcomes are not sent twice.
        } else job.skipped++;
        job.cursor = record.documentName;
      }
      if (paused) break;
      if (!page.more) { job.pending = false; break; }
    }
    const saved = await store.saveJob({ ...job, leaseUntil: 0 }, job);
    if (!saved) throw new Error('progress-conflict');
    return { attempted: attempts, complete: !job.pending };
  };
}
