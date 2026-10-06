// Admin-session REST access remains subject to the existing Firestore rules.
// Sandbox attempts live under admin-only settings, never registrations/payments.
export class SandboxStoreError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function createSandboxStore({ projectId, token, uid, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId) || typeof uid !== 'string' || !uid) throw new SandboxStoreError('storage_unavailable');
  const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/`;
  const docUrl = id => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new SandboxStoreError('invalid_request');
    return `${root}circ-eupago-sandbox-${encodeURIComponent(uid)}-${id}`;
  };
  async function call(url, method = 'GET', value) {
    let response;
    try {
      response = await fetchImpl(url, { method, redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(value ? { body: JSON.stringify({ fields: { payload: { stringValue: JSON.stringify(value) } } }) } : {}),
        signal: AbortSignal.timeout(10000) });
    } catch { throw new SandboxStoreError('storage_unavailable'); }
    if (method === 'GET' && response.status === 404) return null;
    if ([409, 412].includes(response.status)) throw new SandboxStoreError('conflict');
    if (!response.ok) throw new SandboxStoreError(response.status === 403 ? 'storage_forbidden' : 'storage_unavailable');
    try {
      const document = await response.json();
      const record = JSON.parse(document.fields.payload.stringValue);
      if (record.owner !== uid || record.environment !== 'sandbox' || record.kind !== 'gateway-test'
        || !document.updateTime) throw new Error('invalid record');
      return { record, version: document.updateTime };
    } catch { throw new SandboxStoreError('storage_unavailable'); }
  }
  return {
    read: id => call(docUrl(id)),
    create: (id, record) => call(`${docUrl(id)}?currentDocument.exists=false`, 'PATCH', record),
    replace: (id, record, version) => call(`${docUrl(id)}?currentDocument.updateTime=${encodeURIComponent(version)}`, 'PATCH', record),
  };
}
