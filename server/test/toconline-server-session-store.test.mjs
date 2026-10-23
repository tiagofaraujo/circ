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
