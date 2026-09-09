'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../ulsVerification');

function handlers({ enabled = true, account = {}, pilotEmails = 'araujotiagofc@gmail.com' } = {}) {
  const docs = new Map([['ulsRoster/900001', { active: true, eventId: core.EVENT_ID }]]);
  const sent = [];
  const defaults = { email: 'araujotiagofc@gmail.com', emailVerified: true, disabled: false, tokensValidAfterTime: '2026-09-08T00:00:00Z' };
  let transportOptions;
  const db = { doc: (p) => ({ path: p }), runTransaction: async (run) => run({
    get: async (ref) => ({ exists: docs.has(ref.path), data: () => structuredClone(docs.get(ref.path)) }),
    set: (ref, data) => docs.set(ref.path, structuredClone(data)),
  }) };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const modules = {
    'firebase-admin/app': { getApps: () => [{}], initializeApp() {} },
    'firebase-admin/auth': { getAuth: () => ({ getUser: async () => ({ ...defaults, ...account }) }) },
    'firebase-admin/firestore': { getFirestore: () => db },
    'firebase-functions/v2/https': { HttpsError, onCall: (options, fn) => fn },
    'firebase-functions/params': {
      defineBoolean: () => ({ value: () => enabled }),
      defineString: () => ({ value: () => pilotEmails }),
      defineSecret: (name) => ({ value: () => name === 'ULS_OTP_SECRET'
        ? 'synthetic-test-secret-do-not-use-in-production'
        : JSON.stringify({ host: 'smtp.example.invalid', port: 587, user: 'synthetic', pass: 'synthetic', from: 'sender@example.invalid' }) }),
    },
    nodemailer: { createTransport: (options) => { transportOptions = options; return { sendMail: async (mail) => { sent.push(mail); return { accepted: [mail.to] }; } }; } },
    './ulsVerification': core,
  };
  const exported = {};
  const context = { require: (name) => { assert.ok(modules[name], `Unexpected dependency ${name}`); return modules[name]; }, exports: exported, process: { env: {} }, Buffer };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8'), context);
  const request = { auth: { uid: 'alice', token: { email_verified: true, auth_time: Date.UTC(2026, 8, 9) / 1000 } },
    data: { mec: '900001', uid: 'victim', to: 'attacker@example.invalid' }, rawRequest: { ip: 'synthetic-ip' } };
  return { ...exported, request, sent, docs, options: () => transportOptions };
}

test('disabled service and missing/unverified accounts cannot request email', async () => {
  const off = handlers({ enabled: false });
  await assert.rejects(off.requestUlsVerification(off.request), { code: 'unavailable' });
  const h = handlers();
  await assert.rejects(h.requestUlsVerification({ ...h.request, auth: null }), { code: 'unauthenticated' });
  await assert.rejects(h.requestUlsVerification({ ...h.request, auth: { uid: 'alice', token: { email_verified: false } } }), { code: 'failed-precondition' });
  assert.equal(h.sent.length, 0);
});

test('disabled accounts and revoked sessions cannot request or confirm a code', async () => {
  for (const account of [{ disabled: true }, { tokensValidAfterTime: '2026-09-10T00:00:00Z' }]) {
    const h = handlers({ account });
    await assert.rejects(h.requestUlsVerification(h.request), { code: 'unauthenticated' });
    await assert.rejects(h.verifyUlsVerification(h.request), { code: 'unauthenticated' });
    assert.equal(h.sent.length, 0);
  }
});

test('pilot is restricted to the authorised personal account email', async () => {
  const outsider = handlers({ account: { email: 'other@example.com' } });
  await assert.rejects(outsider.requestUlsVerification(outsider.request), { code: 'permission-denied' });
  await assert.rejects(outsider.verifyUlsVerification(outsider.request), { code: 'permission-denied' });
  assert.equal(outsider.sent.length, 0);

  const authorised = handlers({
    account: { email: ' ARAUJOTIAGOFC@GMAIL.COM ' },
    pilotEmails: 'another@example.com, araujotiagofc@gmail.com',
  });
  await authorised.requestUlsVerification(authorised.request);
  assert.equal(authorised.sent.length, 1);
});

test('callable wrappers bind to token UID, derive institutional recipient and persist proof', async () => {
  const h = handlers(); const receipt = await h.requestUlsVerification(h.request);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].to, '900001@ulscoimbra.min-saude.pt');
  assert.equal(h.options().requireTLS, true);
  assert.equal(h.options().tls.rejectUnauthorized, true);
  assert.equal(h.docs.has('ulsChallenges/victim'), false);
  const code = h.sent[0].text.match(/\b\d{6}\b/)[0];
  const result = await h.verifyUlsVerification({ ...h.request, data: { challengeId: receipt.challengeId, code, uid: 'victim' } });
  assert.equal(result.verified, true);
  assert.equal(h.docs.get('ulsEligibility/alice').status, 'verified');
  assert.equal(h.docs.has('ulsEligibility/victim'), false);
});
