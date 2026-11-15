import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';
import { ORGANIZER_VOUCHER_BATCH as BATCH_ID, ORGANIZER_VOUCHER_QUANTITY as QUANTITY } from './organizer-voucher-record.mjs';

const PATH = '/api/admin/registration-management/organizer-vouchers/issue';
const ADMIN = 'circ.chuc@gmail.com';
const EVENT = 'circ-2027';
const HASH = /^[a-f0-9]{64}$/;
const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200, extraHeaders = {}) => Response.json(body, { status, headers: { ...headers, ...extraHeaders } });
const invalid = () => { throw new Error('invalid-request'); };
const validHashes = (hashes) => Array.isArray(hashes) && hashes.length === QUANTITY
  && hashes.every(hash => typeof hash === 'string' && HASH.test(hash)) && new Set(hashes).size === QUANTITY;

async function readHashes(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) invalid();
  const reader = request.body?.getReader();
  if (!reader) invalid();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024) { await reader.cancel(); invalid(); }
    chunks.push(Buffer.from(value));
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || Object.keys(body).length !== 1 || !validHashes(body.hashes)) invalid();
  return body.hashes;
}

export function createOrganizerVoucherIssueStore({ projectId, token, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || typeof token !== 'string' || !token) throw new Error('storage-unavailable');
  const root = `projects/${projectId}/databases/(default)/documents`;
  const batchName = `${root}/organizerVoucherBatches/${BATCH_ID}`;
  const origin = 'https://firestore.googleapis.com/v1';
  const string = (value) => ({ stringValue: value });
  const integer = (value) => ({ integerValue: String(value) });
  const create = (name, fields) => ({ update: { name, fields }, currentDocument: { exists: false } });
  const init = () => ({ redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  return {
    async read() {
      const response = await fetchImpl(`${origin}/${batchName}`, init());
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('storage-unavailable');
      const { name, fields } = await response.json();
      const hashes = fields?.hashes?.arrayValue?.values?.map(value => value.stringValue);
      if (name !== batchName || fields?.eventId?.stringValue !== EVENT || fields?.quantity?.integerValue !== String(QUANTITY)
        || !validHashes(hashes)) throw new Error('storage-unavailable');
      return hashes;
    },
    async create(hashes, uid, timestamp) {
      const metadata = { eventId: string(EVENT), createdBy: string(uid), createdAt: string(timestamp) };
      const writes = [create(batchName, { ...metadata, quantity: integer(QUANTITY),
        hashes: { arrayValue: { values: hashes.map(string) } } }),
      ...hashes.map((hash, index) => create(`${root}/organizerVouchers/${hash}`, {
        ...metadata, batchId: string(BATCH_ID), status: string('available'), index: integer(index + 1),
      }))];
      const response = await fetchImpl(`${origin}/${root}:commit`, { ...init(), method: 'POST', body: JSON.stringify({ writes }) });
      if (!response.ok) throw new Error('storage-unavailable');
    },
  };
}

export function createOrganizerVoucherIssueApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createOrganizerVoucherIssueStore, now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method-not-allowed' }, 405, { Allow: 'GET, POST' });
    if (url.search) return reply({ error: 'invalid-request' }, 400);
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const identity = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!identity) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'organizer-vouchers-unavailable' }, 503);
    let claims;
    try { claims = await verify(identity, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email !== ADMIN || claims.email_verified !== true || !/^[\w-]{1,128}$/.test(claims.sub || '')) {
      return reply({ error: 'admin-required' }, 403);
    }
    let hashes;
    if (request.method === 'POST') {
      try { hashes = await readHashes(request); }
      catch { return reply({ error: 'invalid-request' }, 400); }
    }
    const result = { batchId: BATCH_ID, quantity: QUANTITY };
    const priorResult = (previous) => hashes.every((hash, index) => hash === previous[index])
      ? reply({ ...result, issued: true, duplicate: true }) : reply({ error: 'organizer-vouchers-already-issued' }, 409);

    try {
      const token = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token });
      const prior = await store.read();
      if (request.method === 'GET') return reply({ ...result, issued: Boolean(prior) });
      if (prior) return priorResult(prior);
      try { await store.create(hashes, claims.sub, now()); }
      catch {
        // A concurrent request or a lost response may already have committed the batch.
        const committed = await store.read();
        return committed ? priorResult(committed) : reply({ error: 'organizer-vouchers-unavailable' }, 503);
      }
      return reply({ ...result, issued: true, duplicate: false });
    } catch { return reply({ error: 'organizer-vouchers-unavailable' }, 503); }
  };
}
