// Sandbox checkout data is isolated under admin-only settings. Never writes users,
// registrations, vouchers, capacity, production payments or invoices.
import { SandboxStoreError } from './sandbox-store.mjs';

export const CHECKOUT_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const isUid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return null;
}
export function createCheckoutSandboxStore({ projectId, token, uid, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId) || !isUid(uid) || typeof token !== 'string' || !token) throw new SandboxStoreError('storage_unavailable');
  const database = `projects/${projectId}/databases/(default)`;
  const root = `${database}/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  const prefix = `circ-checkout-sandbox-${uid}-`;
  const name = id => {
    if (!CHECKOUT_UUID.test(id || '')) throw new SandboxStoreError('invalid_request');
    return `${root}/settings/${prefix}${id}`;
  };
  const fields = record => ({ payload: { stringValue: JSON.stringify(record) } });
  function assertRecord(record, id) {
    if (!record || record.id !== id || record.owner !== uid || record.environment !== 'sandbox'
      || record.kind !== 'checkout-test' || record.eventId !== 'circ-2027' || !Array.isArray(record.orders)) throw new SandboxStoreError('storage_unavailable');
  }
  function unpack(document, id) {
    try {
      const record = JSON.parse(document.fields.payload.stringValue);
      assertRecord(record, id);
      if (document.name !== name(id) || !document.updateTime) throw new Error();
      return { record, version: document.updateTime };
    } catch { throw new SandboxStoreError('storage_unavailable'); }
  }
  async function call(url, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(url, { method, redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    } catch { throw new SandboxStoreError('storage_unavailable'); }
    if (method === 'GET' && response.status === 404) return null;
    if ([409, 412].includes(response.status)) throw new SandboxStoreError('conflict');
    if (!response.ok) throw new SandboxStoreError(response.status === 403 ? 'storage_forbidden' : response.status === 401 ? 'storage_session_expired' : 'storage_unavailable');
    try { return await response.json(); } catch { throw new SandboxStoreError('storage_unavailable'); }
  }
  async function readSource(collection, id) {
    const allowed = new Set(['users', 'studentVerifications', 'ulsEligibility', 'ulsMecClaims', 'ulsRoster', 'registrations']);
    if (!allowed.has(collection) || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new SandboxStoreError('invalid_request');
    const resource = `${root}/${collection}/${id}`;
    const document = await call(`https://firestore.googleapis.com/v1/${resource}`);
    if (!document) return { data: null, guard: { name: resource, version: null } };
    if (document.name !== resource || !document.updateTime) throw new SandboxStoreError('storage_unavailable');
    return { data: decode({ mapValue: { fields: document.fields } }), guard: { name: resource, version: document.updateTime } };
  }
  const proofName = (sessionId, orderId, proofId) => {
    if (![sessionId, orderId, proofId].every(id => CHECKOUT_UUID.test(id || ''))) throw new SandboxStoreError('invalid_request');
    return `${root}/settings/circ-bank-proof-sandbox-${uid}-${sessionId}-${orderId}-${proofId}`;
  };
  const creditName = key => {
    if (!/^[a-f0-9]{64}$/.test(key || '')) throw new SandboxStoreError('invalid_request');
    return `${root}/settings/circ-bank-credit-sandbox-${uid}-${key}`;
  };
  async function commitBankExtra(id, record, version, resource, payload) {
    assertRecord(record, id);
    if (!version || payload.owner !== uid || payload.environment !== 'sandbox' || payload.sessionId !== id) throw new SandboxStoreError('invalid_request');
    const result = await call(`${endpoint}:commit`, 'POST', { writes: [
      { update: { name: name(id), fields: fields(record) }, currentDocument: { updateTime: version } },
      { update: { name: resource, fields: fields(payload) }, currentDocument: { exists: false } },
    ] });
    if (!result.writeResults?.[0]?.updateTime) throw new SandboxStoreError('storage_unavailable');
    return { record, version: result.writeResults[0].updateTime };
  }
  return {
    async attachBankProof(id, record, version, proof) {
      if (proof.kind !== 'bank-proof-test' || typeof proof.base64 !== 'string' || proof.base64.length > 682668) throw new SandboxStoreError('invalid_request');
      return commitBankExtra(id, record, version, proofName(id, proof.orderId, proof.id), proof);
    },
    async readBankProof(sessionId, orderId, proofId) {
      const resource = proofName(sessionId, orderId, proofId);
      const document = await call(`https://firestore.googleapis.com/v1/${resource}`);
      if (!document) return null;
      try {
        const proof = JSON.parse(document.fields.payload.stringValue);
        if (document.name !== resource || proof.id !== proofId || proof.orderId !== orderId || proof.sessionId !== sessionId
          || proof.owner !== uid || proof.environment !== 'sandbox' || proof.kind !== 'bank-proof-test') throw new Error();
        return proof;
      } catch { throw new SandboxStoreError('storage_unavailable'); }
    },
    async bankCreditExists(key) { return Boolean(await call(`https://firestore.googleapis.com/v1/${creditName(key)}`)); },
    async confirmBankTransfer(id, record, version, credit) {
      if (credit.kind !== 'bank-credit-test' || !CHECKOUT_UUID.test(credit.orderId || '')) throw new SandboxStoreError('invalid_request');
      return commitBankExtra(id, record, version, creditName(credit.key), credit);
    },
    async read(id) { const d = await call(`https://firestore.googleapis.com/v1/${name(id)}`); return d ? unpack(d, id) : null; },
    async create(id, record) {
      assertRecord(record, id);
      return unpack(await call(`https://firestore.googleapis.com/v1/${name(id)}?currentDocument.exists=false`, 'PATCH', { fields: fields(record) }), id);
    },
    async replace(id, record, version, guards = []) {
      assertRecord(record, id);
      if (!version) throw new SandboxStoreError('storage_unavailable');
      if (!guards.length) return unpack(await call(`https://firestore.googleapis.com/v1/${name(id)}?currentDocument.updateTime=${encodeURIComponent(version)}`, 'PATCH', { fields: fields(record) }), id);
      // Re-read eligibility AND the checkout document in a read/write
      // transaction. Public REST Write has no verify operation. Commit writes
      // only this sandbox document; eligibility remains read-only and locked.
      const checks = [...guards, { name: name(id), version }];
      if (guards.some(g => !g.name.startsWith(`${root}/`) || !/\/(users|studentVerifications|ulsEligibility|ulsMecClaims|ulsRoster)\/[A-Za-z0-9_-]+$/.test(g.name))) throw new SandboxStoreError('storage_unavailable');
      let transaction;
      try {
        const rows = await call(`${endpoint}:batchGet`, 'POST', {
          documents: checks.map(g => g.name), newTransaction: { readWrite: {} },
        });
        if (!Array.isArray(rows)) throw new SandboxStoreError('storage_unavailable');
        transaction = rows.find(row => row.transaction)?.transaction;
        if (typeof transaction !== 'string' || !transaction) throw new SandboxStoreError('storage_unavailable');
        for (const check of checks) {
          const row = rows.find(value => value.found?.name === check.name || value.missing === check.name);
          if (!row || (check.version === null ? row.missing !== check.name : row.found?.updateTime !== check.version)) throw new SandboxStoreError('conflict');
        }
        const result = await call(`${endpoint}:commit`, 'POST', { transaction, writes: [
          { update: { name: name(id), fields: fields(record) }, currentDocument: { updateTime: version } },
        ] });
        const updated = result.writeResults?.[0]?.updateTime;
        if (!updated) throw new SandboxStoreError('storage_unavailable');
        return { record, version: updated };
      } catch (error) {
        if (transaction) { try { await call(`${endpoint}:rollback`, 'POST', { transaction }); } catch { /* No unsafe retry or raw logging. */ } }
        throw error;
      }
    },
    async list() {
      // Document-name index needs no new Firestore index or permission changes.
      const start = `${root}/settings/${prefix}`;
      const rows = await call(`${endpoint}:runQuery`, 'POST', { structuredQuery: {
        from: [{ collectionId: 'settings' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: '__name__' }, op: 'GREATER_THAN_OR_EQUAL', value: { referenceValue: start } } },
          { fieldFilter: { field: { fieldPath: '__name__' }, op: 'LESS_THAN', value: { referenceValue: `${start}~` } } },
        ] } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 101,
      } });
      if (!Array.isArray(rows)) throw new SandboxStoreError('storage_unavailable');
      const documents = rows.filter(row => row.document).map(row => {
        const id = row.document.name.split('/').pop().slice(prefix.length);
        return unpack(row.document, id).record;
      });
      return { records: documents.slice(0, 100).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), truncated: documents.length > 100 };
    },
    async context(claims, profile) {
      const context = { uid, emailVerified: claims.email_verified === true };
      const guards = [];
      if (profile === 'student') {
        const [user, student] = await Promise.all([readSource('users', uid), readSource('studentVerifications', uid)]);
        context.profileName = typeof user.data?.name === 'string' ? user.data.name.replace(/\s+/g, ' ').trim() : '';
        context.student = student.data; guards.push(user.guard, student.guard);
      } else if (profile === 'uls') {
        const eligibility = await readSource('ulsEligibility', uid);
        context.uls = eligibility.data; guards.push(eligibility.guard);
        if (/^\d{1,12}$/.test(context.uls?.mec || '')) {
          const [claim, roster] = await Promise.all([readSource('ulsMecClaims', `circ-2027_${context.uls.mec}`), readSource('ulsRoster', context.uls.mec)]);
          context.claim = claim.data; context.roster = roster.data; guards.push(claim.guard, roster.guard);
        }
      }
      return { context, guards };
    },
    async sourceRegistration() {
      const id = `circ-2027-${uid}`;
      const source = await readSource('registrations', id);
      // Firestore document IDs are metadata, not stored fields (including vouchers).
      // Derive it from the authenticated path; never trust a payload-supplied ID.
      return { ...source, data: source.data ? { ...source.data, id } : null };
    },
  };
}
