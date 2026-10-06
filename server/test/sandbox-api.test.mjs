import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxApi } from '../payments/sandbox-api.mjs';
import { createSandboxStore } from '../payments/sandbox-store.mjs';
const ID = '8cf7f394-f73f-444b-bc83-9d6031176942';
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', EUPAGO_SANDBOX_API_KEY: 'test-secret' };
const claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };
const req = (path = 'attempts', body = { id: ID, method: 'multibanco' }, headers = {}) => new Request(`https://circ.local/api/payments/sandbox/${path}`, {
  method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer token', Origin: 'https://circ.local', 'Content-Type': 'application/json', ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
function fixture(overrides = {}) {
  let document = null, calls = 0, version = 0;
  const conflict = () => { throw Object.assign(new Error('conflict'), { code: 'conflict' }); };
  const store = {
    read: async () => document && structuredClone(document),
    create: async (id, record) => { if (document) conflict(); document = { record, version: String(++version) }; return structuredClone(document); },
    replace: async (id, record, expected) => { if (document.version !== expected) conflict(); document = { record, version: String(++version) }; return structuredClone(document); },
  };
  const provider = {
    createPayment: async data => { calls++; assert.equal(document.record.status, 'creating'); return { ...data, reference: '123456789', entity: '12345', status: 'pending' }; },
    inspectReference: async () => ({ providerState: 'pago', requiresReconciliation: true }),
    ...overrides.provider,
  };
  return { handle: createSandboxApi({ verify: async () => claims, storeFactory: () => store, providerFactory: () => provider, ...overrides }),
    calls: () => calls, document: () => document };
}
test('only verified administrator can use sandbox; origins and configuration are checked', async () => {
  for (const user of [{ ...claims, email: 'visitor@example.com' }, { ...claims, email_verified: false }]) {
    assert.equal((await fixture({ verify: async () => user }).handle(req(), env)).status, 403);
  }
  const f = fixture();
  assert.equal((await f.handle(req('config', null, { Authorization: '' }), env)).status, 401);
  assert.equal((await f.handle(req('attempts', { id: ID, method: 'multibanco' }, { Origin: 'https://evil.local' }), env)).status, 403);
  assert.equal((await f.handle(req(), { FIREBASE_PROJECT_ID: 'circ-coimbra' })).status, 503);
  assert.equal(f.calls(), 0);
  const config = await (await f.handle(req('config', null), env)).json();
  assert.deepEqual(config, { configured: true, environment: 'sandbox', amountCents: 100 });
  assert.ok(!JSON.stringify(config).includes(env.EUPAGO_SANDBOX_API_KEY));
});
test('server fixes test amount and persists before provider call', async () => {
  const f = fixture(); const response = await f.handle(req(), env);
  assert.equal(response.status, 201);
  const { attempt } = await response.json();
  assert.equal(attempt.amountCents, 100); assert.equal(attempt.environment, 'sandbox');
  assert.equal(attempt.status, 'pending'); assert.equal(attempt.owner, undefined);
  assert.equal(f.document().record.kind, 'gateway-test');
});
test('retry and concurrent creation cause at most one provider request', async () => {
  const f = fixture();
  const responses = await Promise.all([f.handle(req(), env), f.handle(req(), env)]);
  assert.ok(responses.some(response => response.status === 201));
  assert.equal(f.calls(), 1);
  assert.equal((await f.handle(req(), env)).status, 200); assert.equal(f.calls(), 1);
  assert.equal((await f.handle(req('attempts', { id: ID, method: 'mbway', phone: '987654321' }), env)).status, 409);
});
test('creation timeout remains uncertain across retries', async () => {
  let count = 0;
  const f = fixture({ provider: { createPayment: async () => { count++; throw new Error('secret'); } } });
  assert.equal((await f.handle(req(), env)).status, 502);
  assert.equal(f.document().record.status, 'creation_unknown');
  const retry = await (await f.handle(req(), env)).json();
  assert.equal(retry.attempt.status, 'creation_unknown'); assert.equal(count, 1);
  assert.ok(!JSON.stringify(retry).includes('secret'));
});
test('inspect does not mark an attempt paid, grant a registration or create an invoice', async () => {
  const f = fixture(); await f.handle(req(), env);
  const result = await (await f.handle(req(`attempts/${ID}/inspect`, {}), env)).json();
  assert.equal(result.attempt.providerState, 'pago'); assert.equal(result.attempt.status, 'pending');
  assert.equal(f.calls(), 1);
});
test('invalid and oversized input is rejected without provider calls', async () => {
  const f = fixture();
  for (const body of [{ id: ID, method: 'multibanco', amountCents: 1 }, { id: '../other', method: 'multibanco' },
    { id: ID, method: 'card' }, { id: ID, method: 'mbway', phone: 'bad' }, { id: ID, method: 'multibanco', extra: 'x'.repeat(3000) }]) {
    assert.equal((await f.handle(req('attempts', body), env)).status, 400);
  }
  assert.equal(f.calls(), 0);
});
test('storage errors stop payment creation', async () => {
  const f = fixture({ storeFactory: () => ({ read: async () => { throw Object.assign(new Error(), { code: 'storage_forbidden' }); } }) });
  assert.equal((await f.handle(req(), env)).status, 503); assert.equal(f.calls(), 0);
});
test('Firestore uses only admin settings paths, session token and CAS preconditions', async () => {
  const record = { owner: 'admin', environment: 'sandbox', kind: 'gateway-test' };
  const seen = [];
  const store = createSandboxStore({ projectId: 'circ-coimbra', uid: 'admin', token: 'firebase-token', fetchImpl: async (url, options) => {
    seen.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer firebase-token'); assert.equal(options.redirect, 'manual');
    return Response.json({ fields: { payload: { stringValue: JSON.stringify(record) } }, updateTime: '2026-10-06T22:00:00Z' });
  } });
  await store.create(ID, record); await store.replace(ID, record, '2026-10-06T22:00:00Z');
  assert.match(seen[0].url, /\/settings\/circ-eupago-sandbox-admin-/);
  assert.match(seen[0].url, /currentDocument.exists=false/);
  assert.match(seen[1].url, /currentDocument.updateTime=/);
  assert.ok(seen.every(x => !/\/registrations\//.test(x.url)));
});

test('storage diagnostics expose stage/status only, never tokens or Google messages', async () => {
  const store = createSandboxStore({ projectId: 'circ-coimbra', uid: 'admin', token: 'super-secret', fetchImpl: async () =>
    Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'super-secret private document data' } }, { status: 400 }) });
  const f = fixture({ storeFactory: () => store });
  const result = await (await f.handle(req(), env)).json();
  assert.deepEqual(result, { error: 'storage_unavailable', diagnostic: 'read/http-400/INVALID_ARGUMENT' });
  assert.equal(f.calls(), 0);
});
test('storage network failures and malformed saved records are distinguishable without raw errors', async () => {
  for (const [fetchImpl, diagnostic] of [
    [async () => { throw new Error('secret URL'); }, 'read/network'],
    [async () => { throw Object.assign(new Error('secret URL'), { name: 'TimeoutError' }); }, 'read/timeout'],
    [async () => Response.json({ fields: {} }), 'read/invalid-record'],
  ]) {
    const store = createSandboxStore({ projectId: 'circ-coimbra', uid: 'admin', token: 'super-secret', fetchImpl });
    await assert.rejects(store.read(ID), e => { assert.equal(e.diagnostic, diagnostic); assert.ok(!e.message.includes('secret')); return true; });
  }
});

test('Firestore redirects fail closed before creating a payment', async () => {
  let calls = 0;
  const store = createSandboxStore({ projectId: 'circ-coimbra', token: 'test-token', uid: 'admin', fetchImpl: async (url, options) => {
    calls++; assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.invalid' } });
  } });
  await assert.rejects(store.read(ID), error => error.code === 'storage_unavailable' && error.diagnostic === 'read/http-302/UNKNOWN');
  assert.equal(calls, 1);
});
