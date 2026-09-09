'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVerificationService, normalizeMec, EVENT_ID, CODE_LIFETIME_MS, COOLDOWN_MS } = require('../ulsVerification');

// Synthetic identifiers only. No data from the staff spreadsheet belongs in tests or Git.
function fixture(sendOverride) {
  const docs = new Map();
  const sent = [];
  let now = Date.UTC(2026, 8, 9);
  let tail = Promise.resolve();
  const store = {
    runTransaction(run) {
      const next = tail.then(async () => {
        const writes = new Map();
        let startedWriting = false;
        const result = await run({
          get: async (path) => { assert.equal(startedWriting, false, 'Firestore requires reads before writes'); return structuredClone(docs.get(path) || null); },
          set: (path, value) => { startedWriting = true; writes.set(path, structuredClone(value)); },
        });
        for (const [path, value] of writes) docs.set(path, value);
        return result;
      });
      tail = next.catch(() => {});
      return next;
    },
  };
  const options = { store, secret: 'synthetic-unit-test-secret-never-for-production', clock: () => now,
    sendCode: sendOverride || (async (mail) => sent.push(mail)) };
  const service = createVerificationService(options);
  const add = (mec) => docs.set(`ulsRoster/${mec}`, { active: true, eventId: EVENT_ID });
  const request = (uid = 'alice', mec = '900001') => service.requestCode({ uid, mec, ip: 'synthetic-network' });
  const verify = (receipt, uid = 'alice', code = sent.at(-1)?.code) => service.verifyCode({ uid, challengeId: receipt.challengeId, code });
  return { docs, sent, store, service, options, add, request, verify, advance: (ms) => { now += ms; } };
}

test('MEC is text, accepts short identifiers, preserves leading zeroes and rejects injected addresses', () => {
  assert.equal(normalizeMec(' 009 '), '009');
  assert.equal(normalizeMec('42'), '42');
  for (const value of [42, '', '../x', '42@other.example', '42 00', '1234567890123']) {
    assert.throws(() => normalizeMec(value), { code: 'invalid-argument' });
  }
});

test('eligible MEC receives one institutional email; only a digest is stored', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, '900001@ulscoimbra.min-saude.pt');
  assert.match(f.sent[0].code, /^\d{6}$/);
  const challenge = f.docs.get('ulsChallenges/alice');
  assert.equal(challenge.status, 'sent');
  assert.equal(challenge.digest.length, 64);
  assert.equal(Object.hasOwn(challenge, 'code'), false);
  assert.equal(Object.hasOwn(receipt, 'code'), false);
  assert.equal(receipt.expiresAtMs - challenge.createdAt.getTime(), CODE_LIFETIME_MS);
});

test('unknown and disabled MECs have the same public receipt and send no email', async () => {
  const f = fixture(); const unknown = await f.request('alice', '900001');
  f.docs.set('ulsRoster/900002', { eventId: EVENT_ID, active: false });
  const disabled = await f.request('bob', '900002');
  assert.deepEqual(Object.keys(unknown), Object.keys(disabled));
  assert.equal(f.sent.length, 0);
  await assert.rejects(f.verify(unknown, 'alice', '000000'), { code: 'permission-denied' });
  assert.equal(f.docs.has('ulsEligibility/alice'), false);
});

test('valid code saves eligibility, unique ownership, timestamp and audit record atomically', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request();
  assert.deepEqual(await f.verify(receipt), { verified: true });
  const saved = f.docs.get('ulsEligibility/alice');
  assert.equal(saved.status, 'verified'); assert.equal(saved.mec, '900001');
  assert.ok(saved.verifiedAt instanceof Date);
  assert.equal(f.docs.get('ulsMecClaims/circ-2027_900001').userId, 'alice');
  assert.equal(f.docs.get('ulsChallenges/alice').digest, null);
  assert.equal(f.docs.get(`auditLogs/uls_${receipt.challengeId}`).userId, 'alice');
  // A new service instance can read the same durable proof after a refresh/restart.
  await createVerificationService(f.options).requireUlsEligibility({ get: async (path) => f.docs.get(path) }, 'alice', { profile: 'uls' });
});

test('wrong attempts persist and the fifth one locks the challenge even with the correct code afterwards', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request();
  const correct = f.sent[0].code; const wrong = correct === '000000' ? '000001' : '000000';
  for (let attempt = 1; attempt <= 5; attempt++) {
    await assert.rejects(f.verify(receipt, 'alice', wrong), { code: 'permission-denied' });
    assert.equal(f.docs.get('ulsChallenges/alice').attempts, attempt);
  }
  assert.equal(f.docs.get('ulsChallenges/alice').status, 'locked');
  await assert.rejects(f.verify(receipt, 'alice', correct), { code: 'permission-denied' });
  assert.equal(f.docs.has('ulsEligibility/alice'), false);
});

test('a code fails at the exact expiry boundary', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request(); f.advance(CODE_LIFETIME_MS);
  await assert.rejects(f.verify(receipt), { code: 'permission-denied' });
  assert.equal(f.docs.has('ulsEligibility/alice'), false);
});

test('resend respects cooldown and invalidates the old challenge', async () => {
  const f = fixture(); f.add('900001'); const old = await f.request(); const oldCode = f.sent[0].code;
  await assert.rejects(f.request(), { code: 'resource-exhausted' });
  f.advance(COOLDOWN_MS); const current = await f.request();
  assert.notEqual(old.challengeId, current.challengeId);
  await assert.rejects(f.verify(old, 'alice', oldCode), { code: 'permission-denied' });
  await f.verify(current);
});

test('hourly request limit applies across different MECs for one account', async () => {
  const f = fixture();
  for (let n = 1; n <= 5; n++) { await f.request('alice', `90000${n}`); f.advance(COOLDOWN_MS); }
  await assert.rejects(f.request('alice', '900006'), { code: 'resource-exhausted' });
});

test('one account cannot redeem another account challenge', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request();
  await assert.rejects(f.verify(receipt, 'bob'), { code: 'permission-denied' });
  assert.equal(f.docs.has('ulsEligibility/bob'), false);
  await f.verify(receipt, 'alice');
});

test('concurrent redemption of the same MEC grants exactly one account', async () => {
  const f = fixture(); f.add('900001'); const a = await f.request('alice'); const ac = f.sent.at(-1).code;
  f.advance(COOLDOWN_MS); const b = await f.request('bob'); const bc = f.sent.at(-1).code;
  const results = await Promise.allSettled([f.verify(a, 'alice', ac), f.verify(b, 'bob', bc)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal([...f.docs.keys()].filter((path) => path.startsWith('ulsEligibility/')).length, 1);
});

test('claimed MEC sends no new email to a different account', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request(); await f.verify(receipt);
  f.advance(COOLDOWN_MS); const other = await f.request('bob');
  assert.equal(f.sent.length, 1);
  await assert.rejects(f.verify(other, 'bob', f.sent[0].code), { code: 'permission-denied' });
});

test('replaying a successful confirmation is idempotent and does not move ownership', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request(); await f.verify(receipt);
  const firstTimestamp = f.docs.get('ulsEligibility/alice').verifiedAt.getTime();
  f.advance(1000); await f.verify(receipt);
  assert.equal(f.docs.get('ulsEligibility/alice').verifiedAt.getTime(), firstTimestamp);
  assert.equal([...f.docs.keys()].filter((path) => path.startsWith('auditLogs/')).length, 1);
});

test('mail failure invalidates the challenge and cannot grant eligibility', async () => {
  const f = fixture(async () => { throw new Error('synthetic SMTP failure'); }); f.add('900001');
  await assert.rejects(f.request(), { code: 'unavailable' });
  assert.equal(f.docs.get('ulsChallenges/alice').digest, null);
  assert.equal(f.docs.get('ulsChallenges/alice').status, 'delivery_failed');
  assert.equal(f.docs.has('ulsEligibility/alice'), false);
});

test('roster revocation between sending and confirmation prevents verification', async () => {
  const f = fixture(); f.add('900001'); const receipt = await f.request();
  f.docs.get('ulsRoster/900001').active = false;
  await assert.rejects(f.verify(receipt), { code: 'permission-denied' });
});

test('checkout guard checks both congress and course affiliation and rechecks revocation', async () => {
  const f = fixture(); const tx = { get: async (path) => f.docs.get(path) };
  await f.service.requireUlsEligibility(tx, 'alice', { profile: 'external', courseAffiliation: 'external' });
  await assert.rejects(f.service.requireUlsEligibility(tx, 'alice', { profile: 'uls' }), { code: 'permission-denied' });
  await assert.rejects(f.service.requireUlsEligibility(tx, 'alice', { profile: 'external', courseAffiliation: 'uls' }), { code: 'permission-denied' });
  f.add('900001'); const receipt = await f.request(); await f.verify(receipt);
  await f.service.requireUlsEligibility(tx, 'alice', { profile: 'uls' });
  f.docs.get('ulsRoster/900001').active = false;
  await assert.rejects(f.service.requireUlsEligibility(tx, 'alice', { profile: 'uls' }), { code: 'permission-denied' });
});
