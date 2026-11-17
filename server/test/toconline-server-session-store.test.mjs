import test from 'node:test';
import assert from 'node:assert/strict';
import { createToconlineServerSessionStore } from '../payments/toconline-server-session-store.mjs';

const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', TOCONLINE_SESSION_KEY: '0123456789abcdef0123456789abcdef-extra' };

test('server TOConline session is encrypted at rest and round-trips', async () => {
  let saved = null;
  const store = createToconlineServerSessionStore({
    tokenProvider: async () => 'service-token',
    now: () => '2026-10-23T20:00:00.000Z',
    fetchImpl: async (url, options = {}) => {
      assert.ok(url.endsWith('/documents/settings/circ-toconline-server-session'));
      assert.equal(options.headers.Authorization, 'Bearer service-token');
      if (options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        saved = body.fields;
        assert.equal(saved.kind.stringValue, 'toconline-server-session');
        assert.equal(saved.environment.stringValue, 'production');
        assert.ok(!saved.payload.stringValue.includes('refresh-secret'));
        return Response.json({ name: url, fields: saved, updateTime: '2026-10-23T20:00:01Z' });
      }
      if (!options.method || options.method === 'GET') {
        return saved ? Response.json({ name: url, fields: saved, updateTime: '2026-10-23T20:00:01Z' }) : new Response(null, { status: 404 });
      }
      if (options.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(null, { status: 500 });
    },
  });
  const session = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 10, refreshExpiresAt: 20, tokenType: 'Bearer' };
  await store.save(env, session);
  const loaded = await store.load(env);
  assert.deepEqual(loaded.session, session);
  await store.clear(env);
});

function firestoreFixture() {
  let document = null, version = 0, clock = Date.parse('2026-11-17T12:00:00Z');
  const calls = [];
  const fetchImpl = async (raw, options) => {
    const url = new URL(raw);
    calls.push({ url, options });
    if (options.method === 'GET') return document ? Response.json(document) : new Response(null, { status: 404 });
    assert.equal(options.method, 'PATCH');
    const exists = url.searchParams.get('currentDocument.exists');
    const updateTime = url.searchParams.get('currentDocument.updateTime');
    if (exists === 'false' && document || updateTime && document?.updateTime !== updateTime) return new Response(null, { status: 409 });
    const fields = JSON.parse(options.body).fields;
    const masks = url.searchParams.getAll('updateMask.fieldPaths');
    if (masks.length) {
      for (const name of masks) { if (fields[name]) document.fields[name] = fields[name]; else delete document.fields[name]; }
    } else document = { fields };
    document.updateTime = new Date(clock + ++version).toISOString();
    return Response.json(document);
  };
  const makeStore = () => createToconlineServerSessionStore({ tokenProvider: async () => 'service-token', fetchImpl, now: () => new Date(clock).toISOString() });
  return { makeStore, calls, advance: ms => { clock += ms; } };
}
const storedSession = { accessToken: 'private-access', refreshToken: 'private-refresh', expiresAt: 100, refreshExpiresAt: 200 };

test('only one worker acquires the first authorization lease using a create precondition', async () => {
  const f = firestoreFixture(), a = f.makeStore(), b = f.makeStore();
  const locks = await Promise.all([a.acquireRefreshLock(env), b.acquireRefreshLock(env)]);
  assert.equal(locks.filter(Boolean).length, 1);
  assert.ok(f.calls.filter(call => call.options.method === 'PATCH').every(call => call.url.searchParams.get('currentDocument.exists') === 'false'));
  assert.equal(await a.load(env), null);
  await a.save(env, storedSession, locks.find(Boolean));
  assert.deepEqual((await b.load(env)).session, storedSession);
});
test('lease renewal preserves encrypted credentials and only its owner can save or release it', async () => {
  const f = firestoreFixture(), a = f.makeStore(), b = f.makeStore();
  await a.save(env, storedSession);
  const [one, two] = await Promise.all([a.acquireRefreshLock(env), b.acquireRefreshLock(env)]);
  assert.equal([one, two].filter(Boolean).length, 1);
  const owner = one || two;
  assert.deepEqual((await b.load(env)).session, storedSession);
  await b.releaseRefreshLock(env, 'wrong-owner');
  assert.equal(await a.acquireRefreshLock(env), null);
  await assert.rejects(b.save(env, { ...storedSession, accessToken: 'stale' }, 'wrong-owner'), /toconline_session_conflict/);
  await a.save(env, { ...storedSession, accessToken: 'rotated' }, owner);
  await a.releaseRefreshLock(env, owner);
  assert.equal((await b.load(env)).session.accessToken, 'rotated');
  assert.ok(await b.acquireRefreshLock(env));
  const conditional = f.calls.filter(call => call.options.method === 'PATCH' && call.url.searchParams.has('currentDocument.updateTime'));
  assert.ok(conditional.length >= 3);
});
test('expired lease recovers after a worker crash and rejects stale-owner persistence', async () => {
  const f = firestoreFixture(), a = f.makeStore(), b = f.makeStore();
  const old = await a.acquireRefreshLock(env);
  f.advance(60_001);
  await assert.rejects(a.save(env, storedSession, old), /toconline_session_conflict/);
  const next = await b.acquireRefreshLock(env);
  assert.ok(next); assert.notEqual(next, old);
  await a.releaseRefreshLock(env, old);
  assert.equal(await a.acquireRefreshLock(env), null);
  await b.save(env, storedSession, next);
  assert.deepEqual((await a.load(env)).session, storedSession);
});
test('releasing a failed renewal keeps the prior encrypted session available', async () => {
  const f = firestoreFixture(), store = f.makeStore();
  await store.save(env, storedSession);
  const lock = await store.acquireRefreshLock(env);
  await store.releaseRefreshLock(env, lock);
  assert.deepEqual((await store.load(env)).session, storedSession);
  assert.ok(await store.acquireRefreshLock(env));
});
