const ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL = /^[^/\s]{1,200}@[^/\s]+\.[^/\s]+$/;
export class SubmissionStoreError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number' && Number.isFinite(value)) return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
  throw new SubmissionStoreError('storage-invalid');
}
export function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  throw new SubmissionStoreError('storage-invalid');
}
const fieldsFor = value => encode(value).mapValue.fields;
export function createSubmissionStore({ projectId, token, fetchImpl = fetch } = {}) {
  if (!/^[a-z0-9-]+$/.test(projectId || '') || typeof token !== 'string' || !token) throw new SubmissionStoreError('storage-unavailable');
  const root = `projects/${projectId}/databases/(default)/documents`;
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  const name = (collection, id) => {
    if (!ID.test(id || '')) throw new SubmissionStoreError('storage-invalid');
    return `${root}/${collection}/${id}`;
  };
  async function call(url, method = 'GET', body) {
    let response;
    try { response = await fetchImpl(url, { method, redirect: 'manual', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) }); }
    catch { throw new SubmissionStoreError('storage-unavailable'); }
    if (method === 'GET' && response.status === 404) return null;
    if ([409, 412].includes(response.status)) throw new SubmissionStoreError('conflict');
    if (!response.ok) throw new SubmissionStoreError(response.status === 403 ? 'storage-forbidden' : 'storage-unavailable');
    try { return await response.json(); } catch { throw new SubmissionStoreError('storage-unavailable'); }
  }
  async function read(documentName) {
    const documentPath = documentName.split('/').map(encodeURIComponent).join('/');
    const raw = await call(`https://firestore.googleapis.com/v1/${documentPath}`);
    if (!raw) return { name: documentName, data: null, fields: null, version: null };
    if (raw.name !== documentName || !raw.fields || typeof raw.updateTime !== 'string') throw new SubmissionStoreError('storage-invalid');
    return { name: raw.name, fields: raw.fields, data: decode({ mapValue: { fields: raw.fields } }), version: raw.updateTime };
  }
  const guard = record => record.data
    ? { update: { name: record.name, fields: record.fields }, currentDocument: { updateTime: record.version } }
    : { delete: record.name, currentDocument: { exists: false } };
  return {
    source: id => read(name('submissions', id)),
    assignment: id => read(name('scientificReviewAssignments', id)),
    draft: id => read(name('submissionCorrectionDrafts', id)),
    history: (id, requestId) => {
      if (!ID.test(id || '') || !ID.test(requestId || '')) throw new SubmissionStoreError('storage-invalid');
      return read(`${root}/scientificRevisionHistory/${id}__${requestId}`);
    },
    work: (email, id) => {
      if (!EMAIL.test(email || '') || !ID.test(id || '')) throw new SubmissionStoreError('storage-invalid');
      return read(`${root}/scientificReviewers/${email}/works/${id}`);
    },
    async commitResubmission({ source, assignment, works, draft, historyName, sourceFields, workFields, historyFields }) {
      if (!source.version || source.name !== name('submissions', source.name.split('/').pop())
        || !historyName.startsWith(`${root}/scientificRevisionHistory/`) || !assignment?.name || !draft?.name
        || works.some(w => !w.version) || works.length !== workFields.length) throw new SubmissionStoreError('storage-invalid');
      const writes = [
        { update: { name: source.name, fields: sourceFields }, currentDocument: { updateTime: source.version } },
        guard(assignment),
        ...works.map((record, i) => ({ update: { name: record.name, fields: workFields[i] }, currentDocument: { updateTime: record.version } })),
        { update: { name: historyName, fields: historyFields }, currentDocument: { exists: false } },
        { delete: draft.name, currentDocument: draft.data ? { updateTime: draft.version } : { exists: false } },
      ];
      const result = await call(`${endpoint}:commit`, 'POST', { writes });
      if (!Array.isArray(result?.writeResults) || result.writeResults.length !== writes.length) throw new SubmissionStoreError('storage-unavailable');
    },
    fieldsFor,
  };
}
