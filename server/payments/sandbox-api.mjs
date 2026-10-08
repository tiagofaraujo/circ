import { createHash } from 'node:crypto';
import { createEupagoSandbox, safeProviderDiagnostic } from './eupago-sandbox.mjs';
import { createSandboxStore } from './sandbox-store.mjs';
import { webhookConfiguration } from './sandbox-webhook.mjs';

const PREFIX = '/api/payments/sandbox';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const adminEmail = 'circ.chuc@gmail.com'; // Same administrator as firestore.rules.
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
  Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
function publicRecord(record) {
  return { id: record.id, method: record.method, amountCents: record.amountCents,
    currency: record.currency, environment: 'sandbox', status: record.status,
    reference: record.reference || null, entity: record.entity || null,
    providerState: record.providerState || null, providerStateCode: record.providerStateCode ?? null,
    creationDiagnostic: safeProviderDiagnostic(record.creationDiagnostic),
    inspectedAt: record.inspectedAt || null, createdAt: record.createdAt,
    identifier: record.identifier, notification: record.notification ? {
      receivedAt: record.notification.receivedAt, verifiedAt: record.notification.verifiedAt || null,
      transactionId: record.notification.transactionId,
    } : null };
}

export function createSandboxApi({ verify, storeFactory = createSandboxStore, providerFactory = createEupagoSandbox,
  now = () => new Date().toISOString() }) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${PREFIX}/`)) return null;
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405);
    const token = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return reply({ error: 'sign_in_required' }, 401);
    if (!env.FIREBASE_PROJECT_ID) return reply({ error: 'service_unavailable' }, 503);
    let claims;
    try { claims = await verify(token, env.FIREBASE_PROJECT_ID); }
    catch { return reply({ error: 'invalid_session' }, 401); }
    if (claims.email_verified !== true || claims.email !== adminEmail) return reply({ error: 'admin_required' }, 403);
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return reply({ error: 'invalid_origin' }, 403);
    const configured = Boolean(env.EUPAGO_SANDBOX_API_KEY?.trim());
    if (url.pathname === `${PREFIX}/config` && request.method === 'GET') return reply({ configured, environment: 'sandbox', amountCents: 100,
      webhook: webhookConfiguration(env, claims.sub) });
    if (!configured) return reply({ error: 'sandbox_not_configured' }, 503);
    const create = url.pathname === `${PREFIX}/attempts` && request.method === 'POST';
    const match = url.pathname.match(/^\/api\/payments\/sandbox\/attempts\/([^/]+)(\/inspect)?$/);
    if (!create && (!match || !UUID.test(match[1])
      || (match[2] ? request.method !== 'POST' : request.method !== 'GET'))) return reply({ error: 'not_found' }, 404);
    let body;
    if (create) {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'invalid_request' }, 400);
      try {
        // Enforce the limit on streamed bytes as well as Content-Length.
        const reader = request.body?.getReader(); if (!reader) throw new Error();
        let size = 0; const chunks = [];
        while (true) { const part = await reader.read(); if (part.done) break;
          size += part.value.length; if (size > 2048) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        body = JSON.parse(new TextDecoder().decode(bytes));
        if (!body || !UUID.test(body.id) || !['multibanco', 'mbway'].includes(body.method)
          || Object.keys(body).some(key => !['id', 'method', 'phone'].includes(key))
          || (body.method === 'mbway' && (typeof body.phone !== 'string' || !/^9\d{8}$/.test(body.phone)))) throw new Error();
      } catch { return reply({ error: 'invalid_request' }, 400); }
    }
    const id = create ? body.id : match[1];
    const store = storeFactory({ projectId: env.FIREBASE_PROJECT_ID, token, uid: claims.sub });
    const provider = providerFactory({ apiKey: env.EUPAGO_SANDBOX_API_KEY, environment: 'sandbox' });
    try {
      let saved = await store.read(id);
      if (!create) {
        if (!saved) return reply({ error: 'not_found' }, 404);
        if (match[2]) {
          if (!saved.record.reference) return reply({ attempt: publicRecord(saved.record), error: 'reference_unavailable' }, 409);
          const hint = await provider.inspectReference(saved.record);
          saved = await store.replace(id, { ...saved.record, providerState: hint.providerState, providerStateCode: hint.providerStateCode ?? null, inspectedAt: now() }, saved.version);
        }
        return reply({ attempt: publicRecord(saved.record) });
      }
      const fingerprint = createHash('sha256').update(`${body.method}:${body.method === 'mbway' ? body.phone : ''}`).digest('hex');
      if (saved) {
        if (saved.record.fingerprint !== fingerprint) return reply({ error: 'idempotency_conflict' }, 409);
        // Even a crash/timeout after creation never results in a second provider call.
        return reply({ attempt: publicRecord(saved.record) });
      }
      const record = { kind: 'gateway-test', owner: claims.sub, environment: 'sandbox', id,
        identifier: `circ_test_${id.replaceAll('-', '')}`, method: body.method,
        amountCents: 100, currency: 'EUR', fingerprint, status: 'creating', createdAt: now() };
      try { saved = await store.create(id, record); }
      catch (error) {
        if (error.code !== 'conflict') throw error;
        return reply({ error: 'creation_in_progress' }, 409);
      }
      let result;
      try { result = await provider.createPayment({ ...record, phone: body.phone }); }
      catch (error) {
        const diagnostic = safeProviderDiagnostic(error?.diagnostic) || 'provider/unknown';
        const failed = { ...record, status: 'creation_unknown', creationDiagnostic: diagnostic };
        try { await store.replace(id, failed, saved.version); } catch { /* Preserve the original creating record. */ }
        return reply({ attempt: publicRecord(failed), error: 'creation_unknown', diagnostic }, 502);
      }
      try { saved = await store.replace(id, { ...record, ...result }, saved.version); }
      catch { return reply({ attempt: publicRecord(record), error: 'storage_after_creation_failed' }, 503); }
      return reply({ attempt: publicRecord(saved.record) }, 201);
    } catch (error) {
      const code = ['storage_forbidden', 'storage_session_expired', 'storage_unavailable', 'conflict'].includes(error.code) ? error.code : 'provider_unavailable';
      const diagnostic = safeProviderDiagnostic(error.diagnostic) || (typeof error.diagnostic === 'string' && /^(read|create|update)\/(timeout|network|invalid-record|http-\d{3}\/[A-Z_]+)$/.test(error.diagnostic) ? error.diagnostic : undefined);
      return reply({ error: code, ...(diagnostic ? { diagnostic } : {}) }, code === 'conflict' ? 409 : 503);
    }
  };
}
