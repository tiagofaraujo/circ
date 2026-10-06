// Admin-session REST access remains subject to the existing Firestore rules.
// Sandbox attempts live under admin-only settings, never registrations/payments.
export class SandboxStoreError extends Error {
  constructor(code, diagnostic) { super(code); this.code = code; this.diagnostic = diagnostic; }
}
export function createSandboxStore({ projectId, token, uid, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+$/.test(projectId) || typeof uid !== 'string' || !uid) throw new SandboxStoreError('storage_unavailable');
  const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/`;
  const docUrl = id => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new SandboxStoreError('invalid_request');
    return `${root}circ-eupago-sandbox-${encodeURIComponent(uid)}-${id}`;
  };
  async function call(url, method = 'GET', value) {
    const operation = method === 'GET' ? 'read' : url.includes('exists=false') ? 'create' : 'update';
    let response;
    try {
      // workerd rejects redirect: error. Manual returns 3xx, rejected by the !ok check.
      response = await fetchImpl(url, { method, redirect: 'manual',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(value ? { body: JSON.stringify({ fields: { payload: { stringValue: JSON.stringify(value) } } }) } : {}),
        signal: AbortSignal.timeout(10000) });
    } catch (error) {
      const failure = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network';
      throw new SandboxStoreError('storage_unavailable', `${operation}/${failure}`);
    }
    if (method === 'GET' && response.status === 404) return null;
    if ([409, 412].includes(response.status)) throw new SandboxStoreError('conflict');
    if (!response.ok) {
      // Return only allowlisted protocol codes, never Google error messages/details,
      // request URLs, tokens, document paths or provider bodies.
      let status = 'UNKNOWN';
      try {
        const body = await response.json();
        if (['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND',
          'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'ABORTED', 'INTERNAL', 'UNAVAILABLE',
          'DEADLINE_EXCEEDED'].includes(body?.error?.status)) status = body.error.status;
      } catch { /* Keep UNKNOWN for non-JSON errors. */ }
      const code = response.status === 403 ? 'storage_forbidden' : response.status === 401 ? 'storage_session_expired' : 'storage_unavailable';
      throw new SandboxStoreError(code, `${operation}/http-${response.status}/${status}`);
    }
    try {
      const document = await response.json();
      const record = JSON.parse(document.fields.payload.stringValue);
      if (record.owner !== uid || record.environment !== 'sandbox' || record.kind !== 'gateway-test'
        || !document.updateTime) throw new Error('invalid record');
      return { record, version: document.updateTime };
    } catch { throw new SandboxStoreError('storage_unavailable', `${operation}/invalid-record`); }
  }
  return {
    read: id => call(docUrl(id)),
    create: (id, record) => call(`${docUrl(id)}?currentDocument.exists=false`, 'PATCH', record),
    replace: (id, record, version) => call(`${docUrl(id)}?currentDocument.updateTime=${encodeURIComponent(version)}`, 'PATCH', record),
  };
}
