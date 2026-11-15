import { createHash, randomBytes } from 'node:crypto';
import { createPaymentsServiceTokenProvider } from './payments-service-token.mjs';

const PATH = '/api/admin/registration-management/discount-vouchers';
const ADMIN = 'circ.chuc@gmail.com';
const EVENT = 'circ-2027';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CODE = /^[a-f0-9]{32}$/;
const DISCOUNT_MAX = { percentage: 9999, fixed: 9999900 };
const headers = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200, extraHeaders = {}) => Response.json(body, { status, headers: { ...headers, ...extraHeaders } });
const formatCode = (code) => `CIRC27-D-${code.match(/.{4}/g).join('-')}`;

function batchTerms({ batchId, label, count, discount } = {}) {
  const name = typeof label === 'string' ? label.trim() : '';
  if (typeof batchId !== 'string' || !UUID.test(batchId) || !name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)
    || !Number.isInteger(count) || count < 1 || count > 50 || !Object.hasOwn(DISCOUNT_MAX, discount?.type)
    || !Number.isInteger(discount.value) || discount.value < 1 || discount.value > DISCOUNT_MAX[discount.type]) {
    throw new Error('invalid-request');
  }
  return { batchId, label: name, count, discount: { type: discount.type, value: discount.value } };
}

async function readTerms(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '') || !request.body) {
    throw new Error('invalid-request');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new Error('invalid-request');
    }
    chunks.push(Buffer.from(value));
  }
  return batchTerms(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

const string = (value) => ({ stringValue: value });
const integer = (value) => ({ integerValue: String(value) });
const create = (name, fields) => ({ update: { name, fields }, currentDocument: { exists: false } });

export function createOrganizationDiscountVoucherAdminStore({ projectId, token, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || typeof token !== 'string' || !token) throw new Error('storage-unavailable');
  const root = `projects/${projectId}/databases/(default)/documents`;
  const batchName = (batchId) => `${root}/organizationDiscountVoucherBatches/${batchId}`;
  const origin = 'https://firestore.googleapis.com/v1';
  const init = () => ({ redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  return {
    async read(batchId) {
      const response = await fetchImpl(`${origin}/${batchName(batchId)}`, init());
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('storage-unavailable');
      const { name, fields } = await response.json();
      const terms = batchTerms({ batchId, label: fields?.label?.stringValue, count: Number(fields?.count?.integerValue),
        discount: { type: fields?.discount?.mapValue?.fields?.type?.stringValue,
          value: Number(fields?.discount?.mapValue?.fields?.value?.integerValue) } });
      const codes = fields.codes?.arrayValue?.values?.map(value => value.stringValue);
      const createdAt = fields.createdAt?.stringValue;
      if (name !== batchName(batchId) || fields.eventId?.stringValue !== EVENT || !Number.isFinite(Date.parse(createdAt))
        || !Array.isArray(codes) || codes.length !== terms.count || new Set(codes).size !== terms.count
        || codes.some(code => typeof code !== 'string' || !CODE.test(code))) throw new Error('storage-unavailable');
      return { ...terms, codes, createdAt };
    },
    async create(batch, uid) {
      const { batchId, label, count, discount, createdAt, codes } = batch;
      const metadata = { eventId: string(EVENT), createdBy: string(uid), createdAt: string(createdAt),
        discount: { mapValue: { fields: { type: string(discount.type), value: integer(discount.value) } } } };
      const writes = [create(batchName(batchId), { ...metadata, label: string(label), count: integer(count),
        codes: { arrayValue: { values: codes.map(string) } } }),
      ...codes.map((code, index) => create(`${root}/organizationDiscountVouchers/${createHash('sha256').update(code).digest('hex')}`, {
        ...metadata, batchId: string(batchId), status: string('available'), index: integer(index + 1),
      }))];
      const response = await fetchImpl(`${origin}/${root}:commit`, { ...init(), method: 'POST', body: JSON.stringify({ writes }) });
      if (!response.ok) throw new Error('storage-unavailable');
    },
  };
}

function batchReply(batch, status = 200) {
  return reply({ ...batch, codes: batch.codes.map(formatCode) }, status);
}

export function createOrganizationDiscountVoucherAdminApi({ verify, tokenProvider = createPaymentsServiceTokenProvider(),
  storeFactory = createOrganizationDiscountVoucherAdminStore, now = () => new Date().toISOString(),
} = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return null;
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method-not-allowed' }, 405, { Allow: 'GET, POST' });
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid-origin' }, 403);
    const identity = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!identity) return reply({ error: 'sign-in-required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'discount-vouchers-unavailable' }, 503);
    let claims;
    try { claims = await verify(identity, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid-session' }, 401); }
    if (claims?.email !== ADMIN || claims.email_verified !== true || !/^[\w-]{1,128}$/.test(claims.sub || '')) {
      return reply({ error: 'admin-required' }, 403);
    }
    let terms;
    let batchId;
    if (request.method === 'GET') {
      batchId = url.searchParams.get('batchId');
      if (Array.from(url.searchParams).length !== 1 || !UUID.test(batchId || '')) return reply({ error: 'invalid-request' }, 400);
    } else {
      if (url.search) return reply({ error: 'invalid-request' }, 400);
      try { terms = await readTerms(request); }
      catch { return reply({ error: 'invalid-request' }, 400); }
      ({ batchId } = terms);
    }
    const unavailable = () => reply({ error: 'discount-vouchers-unavailable' }, 503);
    const priorResult = (previous) => previous.label === terms.label && previous.count === terms.count
      && previous.discount.type === terms.discount.type && previous.discount.value === terms.discount.value
      ? batchReply(previous) : reply({ error: 'batch-conflict' }, 409);

    try {
      const token = await tokenProvider(env);
      const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token });
      const prior = await store.read(batchId);
      if (request.method === 'GET') return prior ? batchReply(prior) : reply({ error: 'batch-not-found' }, 404);
      if (prior) return priorResult(prior);
      const batch = { ...terms, createdAt: now(), codes: Array.from({ length: terms.count }, () => randomBytes(16).toString('hex')) };
      try { await store.create(batch, claims.sub); }
      catch {
        // The same batch ID recovers an earlier successful write after a timeout or simultaneous retry.
        const committed = await store.read(batchId);
        return committed ? priorResult(committed) : unavailable();
      }
      return batchReply(batch, 201);
    } catch { return unavailable(); }
  };
}
