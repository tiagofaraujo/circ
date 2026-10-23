export const LIVE_ORDER_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const isUid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const EVENT = 'circ-2027';

export class LiveStoreError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number' && Number.isFinite(value)) return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, encode(v)])) } };
  throw new LiveStoreError('storage_invalid');
}
function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k, decode(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return null;
}
const fields = object => Object.fromEntries(Object.entries(object).map(([k,v]) => [k, encode(v)]));

export function createCheckoutLiveStore({
  projectId,
  uid,
  token,
  fetchImpl = fetch,
} = {}) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || !isUid(uid) || typeof token !== 'string' || !token) throw new LiveStoreError('storage_unavailable');
  const database = `projects/${projectId}/databases/(default)`;
  const root = `${database}/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  const registrationId = `${EVENT}-${uid}`;
  const registrationName = `${root}/registrations/${registrationId}`;
  const paymentName = id => {
    if (!LIVE_ORDER_UUID.test(id || '')) throw new LiveStoreError('invalid_request');
    return `${root}/payments/${id}`;
  };
  const documentName = id => {
    if (!LIVE_ORDER_UUID.test(id || '')) throw new LiveStoreError('invalid_request');
    return `${root}/documents/${id}`;
  };
  async function call(url, method = 'GET', body) {
    const accessToken = token;
    let response;
    try {
      response = await fetchImpl(url, {
        method, redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
    } catch { throw new LiveStoreError('storage_unavailable'); }
    if (method === 'GET' && response.status === 404) return null;
    if ([409,412].includes(response.status)) throw new LiveStoreError('conflict');
    if (!response.ok) throw new LiveStoreError(response.status === 403 ? 'storage_forbidden' : 'storage_unavailable');
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new LiveStoreError('storage_unavailable'); }
  }
  async function readDoc(collection, id) {
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(id || '')) throw new LiveStoreError('invalid_request');
    const name = `${root}/${collection}/${id}`;
    const doc = await call(`https://firestore.googleapis.com/v1/${name}`);
    return doc ? { data: decode({ mapValue:{ fields:doc.fields || {} } }), version: doc.updateTime, name } : { data:null, version:null, name };
  }
  return {
    registrationId,
    async profile() { return readDoc('users', uid); },
    async registration() { return readDoc('registrations', registrationId); },
    async payment(id) { return readDoc('payments', id); },
    async context(profile) {
      const result = { uid, emailVerified: true, guards: [] };
      if (profile === 'student') {
        const [user, student] = await Promise.all([readDoc('users', uid), readDoc('studentVerifications', uid)]);
        result.profileName = typeof user.data?.name === 'string' ? user.data.name.replace(/\s+/g,' ').trim() : '';
        result.student = student.data; result.guards.push(user, student);
      } else if (profile === 'uls') {
        const eligibility = await readDoc('ulsEligibility', uid);
        result.uls = eligibility.data; result.guards.push(eligibility);
        if (/^\d{1,12}$/.test(result.uls?.mec || '')) {
          const [claim, roster] = await Promise.all([
            readDoc('ulsMecClaims', `circ-2027_${result.uls.mec}`),
            readDoc('ulsRoster', result.uls.mec),
          ]);
          result.claim = claim.data; result.roster = roster.data; result.guards.push(claim, roster);
        }
      }
      return result;
    },
    async createPendingPrimary({ orderId, registration, payment, guards = [] }) {
      if (!LIVE_ORDER_UUID.test(orderId || '') || registration.eventId !== EVENT || registration.userId !== uid
        || registration.isTest !== false || registration.testMode !== false
        || payment.environment !== 'production' || payment.userId !== uid || payment.registrationId !== registrationId) {
        throw new LiveStoreError('storage_invalid');
      }
      const checks = [...guards.map(g => ({ name:g.name, version:g.version })), { name: registrationName, version: null }, { name: paymentName(orderId), version: null }];
      const accessToken = token;
      let transaction;
      try {
        const rows = await fetchImpl(`${endpoint}:batchGet`, {
          method:'POST', redirect:'manual', headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({ documents: checks.map(g=>g.name), newTransaction:{readWrite:{}} }),
          signal:AbortSignal.timeout(10000),
        });
        if (!rows.ok) throw new LiveStoreError('storage_unavailable');
        const batch = await rows.json();
        transaction = batch.find(row=>row.transaction)?.transaction;
        if (!transaction) throw new LiveStoreError('storage_unavailable');
        for (const check of checks) {
          const row=batch.find(x=>x.found?.name===check.name || x.missing===check.name);
          if (!row || (check.version===null ? row.missing!==check.name : row.found?.updateTime!==check.version)) throw new LiveStoreError('conflict');
        }
        const commit = await fetchImpl(`${endpoint}:commit`, {
          method:'POST', redirect:'manual', headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({transaction,writes:[
            {update:{name:registrationName,fields:fields(registration)},currentDocument:{exists:false}},
            {update:{name:paymentName(orderId),fields:fields(payment)},currentDocument:{exists:false}},
          ]}), signal:AbortSignal.timeout(10000),
        });
        if (!commit.ok) throw new LiveStoreError([409,412].includes(commit.status)?'conflict':'storage_unavailable');
        return true;
      } catch (error) {
        if (transaction) {
          try { await fetchImpl(`${endpoint}:rollback`, {method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({transaction})}); } catch {}
        }
        throw error;
      }
    },
    async updatePayment(id, data, version) {
      if (!version) throw new LiveStoreError('storage_unavailable');
      const doc = await call(`https://firestore.googleapis.com/v1/${paymentName(id)}?currentDocument.updateTime=${encodeURIComponent(version)}`, 'PATCH', {fields:fields(data)});
      return { data: decode({mapValue:{fields:doc.fields||{}}}), version:doc.updateTime };
    },
    async confirmPrimaryPaid({ orderId, payment, paymentVersion, registration, registrationVersion, fiscalJob }) {
      if (!paymentVersion || !registrationVersion || fiscalJob.id !== orderId) throw new LiveStoreError('storage_invalid');
      const accessToken = token;
      const result = await fetchImpl(`${endpoint}:commit`, {
        method:'POST', redirect:'manual', headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({writes:[
          {update:{name:paymentName(orderId),fields:fields(payment)},currentDocument:{updateTime:paymentVersion}},
          {update:{name:registrationName,fields:fields(registration)},currentDocument:{updateTime:registrationVersion}},
          {update:{name:documentName(orderId),fields:fields(fiscalJob)},currentDocument:{exists:false}},
        ]}), signal:AbortSignal.timeout(10000),
      });
      if (!result.ok) throw new LiveStoreError([409,412].includes(result.status)?'conflict':'storage_unavailable');
      return true;
    },
  };
}
