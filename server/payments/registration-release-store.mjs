// This store uses the verified administrator's Firebase ID token. Every source
// read and bounded query belongs to the same Firestore transaction.
export class RegistrationReleaseStoreError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const invalid = () => { throw new RegistrationReleaseStoreError('storage_invalid'); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const regId = /^circ-2027-[A-Za-z0-9_-]{1,128}$/;
const hash = /^[a-f0-9]{64}$/;
export function encodeReleaseValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number' && Number.isFinite(value)) return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeReleaseValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: releaseFields(value) } };
  return invalid();
}
export const releaseFields = object => Object.fromEntries(Object.entries(object).map(([k,v]) => [k,encodeReleaseValue(v)]));
export function decodeReleaseValue(value) {
  if (!value || typeof value !== 'object') return invalid();
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k,decodeReleaseValue(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeReleaseValue);
  // Preserve opaque Firestore values in raw archives, but never authorize a
  // release based on an unsupported decoded source value.
  return null;
}
export function createRegistrationReleaseStore({projectId,token,fetchImpl=fetch}={}) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || typeof token !== 'string' || !token) return invalid();
  const root = `projects/${projectId}/databases/(default)/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  const name = (collection,id) => `${root}/${collection}/${id}`;
  const validTx = transaction => { if (typeof transaction !== 'string' || !transaction || transaction.length > 4096) invalid(); };
  async function call(url,method='GET',body) {
    let response;
    try { response = await fetchImpl(url,{method,redirect:'manual',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body !== undefined ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(10000)}); }
    catch { throw new RegistrationReleaseStoreError('storage_unavailable'); }
    if (method === 'GET' && response.status === 404) return null;
    if ([409,412].includes(response.status)) throw new RegistrationReleaseStoreError('conflict');
    if (!response.ok) throw new RegistrationReleaseStoreError('storage_unavailable');
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new RegistrationReleaseStoreError('storage_unavailable'); }
  }
  function record(doc,collection) {
    if (!doc || typeof doc.name !== 'string' || !doc.name.startsWith(`${root}/${collection}/`) || !doc.updateTime || !doc.fields) invalid();
    const id = doc.name.slice(`${root}/${collection}/`.length);
    if (!id || id.includes('/')) invalid();
    return {id,name:doc.name,fields:doc.fields,data:decodeReleaseValue({mapValue:{fields:doc.fields}}),version:doc.updateTime};
  }
  async function read(collection,id,transaction) {
    validTx(transaction);
    const doc = await call(`${endpoint}/${collection}/${encodeURIComponent(id)}?transaction=${encodeURIComponent(transaction)}`);
    return doc ? record(doc,collection) : {id,name:name(collection,id),data:null,fields:null,version:null};
  }
  const equal = (fieldPath,value) => ({fieldFilter:{field:{fieldPath},op:'EQUAL',value:encodeReleaseValue(value)}});
  async function query(collection,filters,limit,transaction) {
    validTx(transaction);
    const rows=await call(`${endpoint}:runQuery`,'POST',{transaction,structuredQuery:{from:[{collectionId:collection}],
      where:filters.length===1?filters[0]:{compositeFilter:{op:'AND',filters}},limit}});
    if (!Array.isArray(rows)) invalid();
    return rows.filter(row=>row.document).map(row=>record(row.document,collection));
  }
  return {
    async begin({readOnly=true}={}) {
      const result=await call(`${endpoint}:beginTransaction`,'POST',{options:readOnly?{readOnly:{}}:{readWrite:{}}});
      validTx(result?.transaction); return result.transaction;
    },
    async readRegistration(id,tx) { if (!regId.test(id || '')) invalid(); return read('registrations',id,tx); },
    async readProfile(id,tx) { if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || '')) invalid(); return read('users',id,tx); },
    async readCredit(key,tx) { if (!hash.test(key || '')) invalid(); return read('settings',`circ-bank-credit-live-${key}`,tx); },
    async related(collection,id,tx) {
      if (!['payments','documents','registrationOrders'].includes(collection) || !regId.test(id || '')) invalid();
      return query(collection,[equal('registrationId',id)],26,tx);
    },
    async findArchive(id,stamp,tx) {
      if (!regId.test(id || '') || !hash.test(stamp || '')) invalid();
      return query('settings',[equal('kind','registration-release'),equal('eventId','circ-2027'),equal('registrationId',id),equal('stamp',stamp)],2,tx);
    },
    async readArchive(id,tx) {
      if (!uuid.test(id || '')) invalid(); return read('settings',`circ-registration-release-${id}`,tx);
    },
    async commit({transaction,registration,payments,documents=[],archiveId,archiveFields,auditFields,archivedAt}) {
      validTx(transaction);
      if (!uuid.test(archiveId || '') || !regId.test(registration?.id || '') || registration.name !== name('registrations',registration.id)
        || !registration.version || !Array.isArray(payments) || payments.length < 1 || payments.length > 25
        || !Array.isArray(documents) || documents.length > 25 || !archiveFields || !auditFields || !Number.isFinite(Date.parse(archivedAt))) invalid();
      const marker=releaseFields({registrationArchiveId:archiveId,registrationArchivedAt:archivedAt});
      const seen = new Set();
      const patches = (rows,collection) => rows.map(row=>{
        if (!uuid.test(row?.id || '') || row.name!==name(collection,row.id) || !row.version || seen.has(row.name)
          || row.data?.registrationArchiveId || row.data?.registrationArchivedAt) invalid();
        seen.add(row.name);
        return {update:{name:row.name,fields:marker},updateMask:{fieldPaths:['registrationArchiveId','registrationArchivedAt']},currentDocument:{updateTime:row.version}};
      });
      const writes=[{update:{name:name('settings',`circ-registration-release-${archiveId}`),fields:archiveFields},currentDocument:{exists:false}},
        {update:{name:name('auditLogs',`registration-release-${archiveId}`),fields:auditFields},currentDocument:{exists:false}},
        ...patches(payments,'payments'),...patches(documents,'documents'),
        {delete:registration.name,currentDocument:{updateTime:registration.version}}];
      await call(`${endpoint}:commit`,'POST',{transaction,writes});
    },
    async rollback(transaction) { validTx(transaction); await call(`${endpoint}:rollback`,'POST',{transaction}); },
  };
}
