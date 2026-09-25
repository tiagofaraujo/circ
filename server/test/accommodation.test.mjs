import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import worker, { createWorker, verifyFirebaseToken } from '../worker.mjs';

let privateKey, keys;
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra', ASSETS: { fetch: async () => new Response('public website') } };
before(async () => {
  const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256' }] });
});
const protectedWorker = createWorker((token, projectId) => verifyFirebaseToken(token, projectId, keys));
async function token(overrides = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: 'test-user', aud: 'circ-coimbra', iss: 'https://securetoken.google.com/circ-coimbra', iat: now - 10, exp: now + 3600, auth_time: now - 10, firebase: { sign_in_provider: 'password' }, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(key);
}
const request = (value, method = 'GET') => new Request('https://circ.local/api/accommodation/hotels', { method, headers: value ? { Authorization: `Bearer ${value}` } : {} });

test('unauthenticated direct requests expose no hotel information and cannot be cached', async () => {
  for (const value of [null, 'not-a-token']) {
    const response = await worker.fetch(request(value), env);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.text();
    assert.doesNotMatch(body, /hotels|TCOIWED|Hotel/);
  }
});

test('a signed session for this Firebase project can read the seven offers', async () => {
  const response = await protectedWorker.fetch(request(await token()), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Authorization');
  const body = await response.json();
  assert.equal(body.hotels.length, 7);
  assert.equal(body.hotels.find(h => h.id === 'tivoli-coimbra').promoCode, 'TCOIWED');
});

test('expired, foreign-project, future and anonymous tokens are rejected', async () => {
  const future = Math.floor(Date.now() / 1000) + 600;
  for (const claims of [{ exp: 1 }, { aud: 'another-project' }, { iss: 'https://securetoken.google.com/another-project' }, { iat: future }, { auth_time: future }, { auth_time: null }, { sub: '' }, { firebase: { sign_in_provider: 'anonymous' } }]) {
    const response = await protectedWorker.fetch(request(await token(claims)), env);
    assert.equal(response.status, 401, JSON.stringify(claims));
    assert.deepEqual(await response.json(), { error: 'invalid_session' });
  }
});

test('a forged signature never grants access', async () => {
  const forged = await generateKeyPair('RS256');
  assert.equal((await protectedWorker.fetch(request(await token({}, forged.privateKey)), env)).status, 401);
});

test('API failures fail closed while ordinary pages keep using static assets', async () => {
  const unavailable = createWorker(async () => { throw new Error('Keys unavailable'); });
  assert.equal((await unavailable.fetch(request('token'), env)).status, 401);
  assert.equal((await protectedWorker.fetch(request('token'), { ASSETS: env.ASSETS })).status, 503);
  assert.equal((await worker.fetch(request(null, 'POST'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://circ.local/api/unknown'), env)).status, 404);
  assert.equal(await (await worker.fetch(new Request('https://circ.local/coimbra'), env)).text(), 'public website');
});
