import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { createPaymentsServiceTokenProvider } from '../payments/payments-service-token.mjs';

const clock = Date.parse('2026-10-30T15:00:00Z');
let account, publicKey;
before(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  publicKey = pair.publicKey;
  account = { type: 'service_account', project_id: 'circ-coimbra', client_email: 'circ-payments@circ-coimbra.iam.gserviceaccount.com', private_key: await exportPKCS8(pair.privateKey) };
});
const env = value => ({ FIREBASE_PROJECT_ID: 'circ-coimbra', FIREBASE_PAYMENTS_SERVICE_ACCOUNT: value });
const success = () => Response.json({ access_token: 'mock-google-token', token_type: 'Bearer', expires_in: 3600 });
async function fails(provider, value, reason) {
  await assert.rejects(() => provider(env(value)), error => {
    assert.equal(error.message, 'payments_service_identity_unavailable');
    assert.equal(error.code, `payments_service_identity_${reason}`);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE KEY|private-message|mock-google-token|assertion=/);
    return true;
  });
}

test('signs a verifiable Google JWT with the required scope, audience and lifetime; caches by credential', async () => {
  let requests = 0;
  const provider = createPaymentsServiceTokenProvider({ now: () => clock, fetchImpl: async (url, options) => {
    requests++;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const { payload } = await jwtVerify(body.get('assertion'), publicKey, { algorithms: ['RS256'], currentDate: new Date(clock), audience: url, issuer: account.client_email });
    assert.equal(payload.scope, 'https://www.googleapis.com/auth/datastore');
    assert.equal(payload.exp - payload.iat, 3600);
    return success();
  } });
  const credential = JSON.stringify(account);
  assert.equal(await provider(env(credential)), 'mock-google-token');
  assert.equal(await provider(env(credential)), 'mock-google-token');
  assert.equal(requests, 1);
  await provider(env(JSON.stringify({ ...account, private_key_id: 'rotated' })));
  assert.equal(requests, 2);
});

test('invalid JSON, account metadata and private key fail before any request to Google', async () => {
  const provider = createPaymentsServiceTokenProvider({ now: () => clock, fetchImpl: () => assert.fail('Unexpected network call') });
  await fails(provider, '{private-message', 'json_invalid');
  for (const value of [null, [], 'double-encoded-json', { ...account, project_id: 'another-project' }, { ...account, client_email: 'other@example.test' }]) {
    await fails(provider, JSON.stringify(value), 'account_invalid');
  }
  await fails(provider, JSON.stringify({ ...account, private_key: 'private-message' }), 'key_invalid');
});

for (const [body, reason] of [
  [{ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, 'signature_rejected'],
  [{ error: 'invalid_grant', error_description: 'Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe.' }, 'clock_rejected'],
  [{ error: 'invalid_client', error_description: 'private-message' }, 'token_rejected'],
  [{ error: 'private-message', error_description: 'private-message' }, 'token_rejected'],
]) {
  test(`Google rejection is reduced to the safe ${reason} category`, async () => {
    const provider = createPaymentsServiceTokenProvider({ now: () => clock, fetchImpl: async () => Response.json(body, { status: 400 }) });
    await fails(provider, JSON.stringify(account), reason);
  });
}

test('network failures and malformed Google responses have separate safe categories', async () => {
  const credential = JSON.stringify(account);
  await fails(createPaymentsServiceTokenProvider({ now: () => clock, fetchImpl: async () => { throw new Error('private-message'); } }), credential, 'network_failed');
  for (const response of [new Response('private-message'), Response.json(null), Response.json({ access_token: 'mock-google-token', token_type: 'Bearer', expires_in: 0 })]) {
    await fails(createPaymentsServiceTokenProvider({ now: () => clock, fetchImpl: async () => response }), credential, 'response_invalid');
  }
});
