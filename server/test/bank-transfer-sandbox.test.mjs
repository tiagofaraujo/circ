import test from 'node:test';
import assert from 'node:assert/strict';
import { getTransferRevision } from '../../src/data/bankTransferState.js';
import { proposedBankAccount, sandboxBankAccount } from '../payments/bank-transfer-account.mjs';
import { createHmac } from 'node:crypto';
import { createCheckoutSandboxApi, createCheckoutSandboxNotification } from '../payments/checkout-sandbox.mjs';
import { createSandboxWebhook } from '../payments/sandbox-webhook.mjs';
import { validateTransferProof, MAX_PROOF_BYTES } from '../payments/bank-transfer-sandbox.mjs';
const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49', OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const OID2 = 'ca991ca4-52ab-4b7e-b6cf-bc9d6480388f', PID = '57892222-b856-41c9-a519-e2cc97bb3b69';
const PID2 = '58a12222-b856-41c9-a519-e2cc97bb3b69', RID = 'ccfc899d-5046-4c9b-8e3f-99ba3e8af3c1';
const RID2 = 'bbfc899d-5046-4c9b-8e3f-99ba3e8af3c1';
const selection = { profile: 'external', congressMode: 'onsite', morningCourse: true, dinnerQuantity: 1 };
const time = '2026-10-10T10:00:00.000Z';
const proof = () => ({ id: PID, expectedProofId: null, filename: 'ficticio.pdf', mimeType: 'application/pdf',
  base64: Buffer.from('%PDF-1.4\n% non-executable synthetic test fixture\n%%EOF\n').toString('base64'), sampleAcknowledged: true });
const approval = () => ({ id: RID, decision: 'approve', proofId: PID, proofReviewed: true, creditConfirmed: true,
  amount: '160.00', bookingDate: '2026-10-10', creditReference: 'TESTE-MOVIMENTO-001', reason: '', sandboxAcknowledged: true });
function fixture() {
  const docs = new Map(), proofs = new Map(), credits = new Set(), reviewRequests = new Map();
  let claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true }, broken = false, writes = 0;
  const conflict = () => Object.assign(new Error(), { code: 'conflict' });
  const save = (id, record, version) => {
    if (broken) throw Object.assign(new Error('secret'), { code: 'storage_unavailable' });
    if (docs.get(id)?.version !== version) throw conflict();
    const data = { record: structuredClone(record), version: String(Number(version) + 1) }; docs.set(id, data); writes++;
    return structuredClone(data);
  };
  const store = {
    read: async id => structuredClone(docs.get(id) || null),
    create: async (id, r) => { if (docs.has(id)) throw conflict(); docs.set(id, { record: structuredClone(r), version: '1' }); writes++; return structuredClone(docs.get(id)); },
    replace: async (id, r, version) => save(id, r, version),
    list: async () => ({ records: [...docs.values()].map(d => structuredClone(d.record)), truncated: false }),
    context: async () => ({ context: { uid: claims.sub, emailVerified: true }, guards: [] }),
    attachBankProof: async (id, r, version, p) => { if (proofs.has(p.id)) throw conflict(); const saved = save(id, r, version); proofs.set(p.id, structuredClone(p)); return saved; },
    readBankProof: async (sid, oid, pid) => { const p = proofs.get(pid); return p?.sessionId === sid && p.orderId === oid ? structuredClone(p) : null; },
    bankCreditExists: async key => credits.has(key),
    confirmBankTransfer: async (id, r, version, credit) => { if (credits.has(credit.key)) throw conflict(); const saved = save(id, r, version); credits.add(credit.key); return saved; },
  };
  const api = createCheckoutSandboxApi({ verify: async () => claims, storeFactory: () => store,
    providerFactory: () => assert.fail('bank transfers must never reach Eupago'), now: () => time });
  const env = { FIREBASE_PROJECT_ID: 'circ-coimbra' }; // no gateway credentials
  const request = (path, body, extra = {}) => new Request(`https://circ.local/api/checkout/sandbox/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test', Origin: 'https://circ.local', 'Content-Type': 'application/json', ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const call = (path, body, extra) => api(request(path, body, extra), env);
  const create = async (chosen = selection, oid = OID) => {
    const q = await call(`sessions/${SID}/quote`, { selection: chosen });
    assert.equal(q.status, 200, JSON.stringify(await q.clone().json()));
    return call(`sessions/${SID}/orders`, { id: oid, method: 'bank_transfer', selection: chosen, stamp: (await q.json()).stamp, sandboxAcknowledged: true });
  };
  return { call, create, store, api, request, env, credits, proofs,
    order: oid => docs.get(SID)?.record.orders.find(o => o.id === (oid || OID)), record: () => docs.get(SID)?.record,
    writes: () => writes, setClaims: value => { claims = value; }, setBroken: value => { broken = value; },
    upload: (p = proof(), oid = OID) => call(`sessions/${SID}/orders/${oid}/proof`, p),
    review: (r = approval(), oid = OID) => {
      // Like a browser, retries of an identical decision retain their revision.
      const key = JSON.stringify({ r, oid });
      if (!reviewRequests.has(key)) reviewRequests.set(key, { expectedRevision: getTransferRevision(docs.get(SID)?.record.orders.find(o => o.id === oid)?.bankTransfer), ...r });
      return call(`sessions/${SID}/orders/${oid}/review`, reviewRequests.get(key));
    },
    report: (r = { id: PID, expectedRevision: 0, sandboxAcknowledged: true }, oid = OID) => call(`sessions/${SID}/orders/${oid}/report`, r),
    mutate: change => change(docs.get(SID).record),
  };
}
async function start() { const f = fixture(); await f.call('sessions', { id: SID, source: 'new' }); assert.equal((await f.create()).status, 201); return f; }
test('bank transfer works without Eupago, uses server pricing and has no actionable bank details', async () => {
  const f = await start(); const config = await (await f.call('config')).json();
  assert.equal(config.configured, true); assert.equal(config.eupagoConfigured, false);
  assert.equal(f.order().amountCents, 16000); assert.equal(f.order().status, 'pending');
  assert.equal(f.order().bankTransfer.status, 'awaiting_transfer'); assert.equal(f.order().entity, null); assert.equal(f.order().reference, null);
  assert.equal(f.record().registration, null); assert.ok(!JSON.stringify(f.order()).includes('PT50'));
});
test('proof upload is private, versioned and never confirms a registration', async () => {
  const f = await start(); const result = await f.upload(); assert.equal(result.status, 200);
  const data = await result.json(); assert.equal(data.session.orders[0].bankTransfer.status, 'under_review');
  assert.equal(data.session.registration, null); assert.equal(data.session.orders[0].notification, null);
  assert.ok(!JSON.stringify(data).includes(proof().base64)); assert.ok(!JSON.stringify(data).includes('base64'));
  assert.equal(f.proofs.get(PID).owner, 'admin'); assert.equal(f.proofs.get(PID).environment, 'sandbox');
});
test('manual validation records an explicit simulated credit, reviewer and entitlements exactly once', async () => {
  const f = await start(); await f.upload(); const res = await f.review(); assert.equal(res.status, 200);
  assert.equal(f.order().status, 'confirmed'); assert.equal(f.order().bankTransfer.confirmation.confirmedBy, 'admin');
  assert.equal(f.order().bankTransfer.confirmation.confirmedAt, time); assert.equal(f.order().notification, null);
  assert.deepEqual(f.record().registration.entitlements, { congressMode: 'onsite', morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 });
  const count = f.writes(); assert.equal((await f.review()).status, 200); assert.equal(f.writes(), count); assert.equal(f.credits.size, 1);
  const reload = await (await f.call(`sessions/${SID}`)).json(); assert.equal(reload.session.orders[0].bankTransfer.status, 'confirmed');
});
test('approval needs a report or proof and bank-credit verification; an attached proof must be reviewed', async () => {
  const f = await start(); assert.equal((await f.review({ ...approval(), proofId: null })).status, 400); await f.upload();
  for (const override of [{ proofReviewed: false }, { creditConfirmed: false }, { sandboxAcknowledged: false }]) {
    assert.equal((await f.review({ ...approval(), ...override })).status, 400); assert.equal(f.record().registration, null);
  }
});
test('wrong, partial, excessive and malformed credited amounts remain pending', async () => {
  const f = await start(); await f.upload();
  for (const amount of ['0.00', '159.99', '160.01', '160', '1e2', '160.001', -1, null]) {
    assert.equal((await f.review({ ...approval(), amount })).status, 400); assert.equal(f.record().registration, null);
  }
  assert.equal((await f.review({ ...approval(), amount: '160,00' })).status, 200);
});
test('invalid or future dates and non-test movement references are rejected', async () => {
  const f = await start(); await f.upload();
  for (const override of [{ bookingDate: '2026-02-30' }, { bookingDate: '2026-10-11' }, { bookingDate: 'n/a' },
    { creditReference: '' }, { creditReference: 'REAL-001' }, { creditReference: 'TESTE-<script>' }]) assert.equal((await f.review({ ...approval(), ...override })).status, 400);
  assert.equal(f.record().registration, null);
});
test('rejection requires a reason, permits resubmission and preserves previous proofs and decisions', async () => {
  const f = await start(); await f.upload();
  const rejection = { id: RID, decision: 'reject', proofId: PID, reason: '', sandboxAcknowledged: true };
  assert.equal((await f.review(rejection)).status, 400);
  assert.equal((await f.review({ ...rejection, reason: 'Ficheiro ilegível' })).status, 200);
  assert.equal(f.order().bankTransfer.status, 'rejected'); assert.equal(f.record().registration, null);
  assert.equal((await f.upload({ ...proof(), id: PID2, expectedProofId: PID })).status, 200);
  assert.equal(f.order().bankTransfer.proofs.length, 2); assert.equal(f.proofs.size, 2);
  assert.equal((await f.review({ ...approval(), id: RID2, proofId: PID2 })).status, 200);
  assert.equal(f.order().bankTransfer.decisions.length, 2);
});
test('stale proof review cannot approve a new upload unseen by the reviewer', async () => {
  const f = await start(); await f.upload(); await f.upload({ ...proof(), id: PID2, expectedProofId: PID });
  assert.equal((await f.review()).status, 409); assert.equal(f.record().registration, null);
});
test('proof retries are idempotent and cannot roll back a confirmed payment', async () => {
  const f = await start(); await f.upload(); const writes = f.writes(); await f.upload(); assert.equal(f.writes(), writes);
  await f.review(); const count = f.writes(); assert.equal((await f.upload()).status, 200); assert.equal(f.writes(), count);
  assert.equal((await f.upload({ ...proof(), id: PID2, expectedProofId: PID })).status, 409);
  assert.equal(f.order().status, 'confirmed');
});
test('reused proof IDs with different data are rejected', async () => {
  const f = await start(); await f.upload(); assert.equal((await f.upload({ ...proof(), filename: 'another.pdf' })).status, 409);
});
test('concurrent uploads and manual approvals cannot duplicate state changes', async () => {
  const f = await start(); const uploads = await Promise.all([f.upload(), f.upload()]);
  assert.ok(uploads.every(r => [200, 409].includes(r.status))); assert.equal(f.order().bankTransfer.proofs.length, 1);
  const results = await Promise.all([f.review(), f.review()]); assert.ok(results.every(r => [200, 409].includes(r.status)));
  assert.equal(f.credits.size, 1); assert.equal(f.order().bankTransfer.decisions.length, 1);
  assert.equal(f.record().registration.entitlements.dinnerQuantity, 1);
});
test('a bank credit cannot be used for two orders; add-ons do not charge the congress again', async () => {
  const f = await start(); await f.upload(); await f.review();
  assert.equal((await f.create({ afternoonCourse: true, dinnerQuantity: 1 }, OID2)).status, 201);
  assert.equal(f.order(OID2).amountCents, 6500);
  await f.upload({ ...proof(), id: PID2 }, OID2);
  const body = { ...approval(), id: RID2, proofId: PID2, amount: '65.00' };
  assert.equal((await f.review(body, OID2)).status, 409);
  assert.equal((await f.review({ ...body, creditReference: 'TESTE-MOVIMENTO-002' }, OID2)).status, 200);
  assert.deepEqual(f.record().registration.entitlements, { congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 });
});
test('cancellation retains the record, enables a new order and never confirms funds or issues a refund', async () => {
  const f = await start();
  const cancel = { id: RID, decision: 'cancel', proofId: null, reason: 'Ensaio cancelado', sandboxAcknowledged: true };
  assert.equal((await f.review(cancel)).status, 200); assert.equal(f.order().status, 'closed'); assert.equal(f.credits.size, 0);
  assert.equal((await f.create(selection, OID2)).status, 201); assert.equal(f.record().orders.length, 2);
  assert.equal((await f.upload()).status, 409); assert.equal(f.record().registration, null);
});
test('proofs download only through the authenticated route with attachment and no-store headers', async () => {
  const f = await start(); await f.upload();
  const result = await f.call(`sessions/${SID}/orders/${OID}/proof-download`, { proofId: PID });
  assert.equal(result.status, 200); assert.match(result.headers.get('Content-Disposition'), /^attachment;/);
  assert.equal(result.headers.get('Content-Security-Policy'), "sandbox; default-src 'none'");
  assert.match(result.headers.get('Cache-Control'), /no-store/);
  assert.equal(Buffer.from(await result.arrayBuffer()).toString('base64'), proof().base64);
  assert.equal((await f.call(`sessions/${SID}/orders/${OID2}/proof-download`, { proofId: PID })).status, 409);
});
test('proof integrity failures never release a different file', async () => {
  const f = await start(); await f.upload(); f.proofs.get(PID).base64 = Buffer.from('tampered').toString('base64');
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/proof-download`, { proofId: PID })).status, 400);
});
test('unauthenticated, foreign-account and cross-origin requests fail before file or bank operations', async () => {
  const f = await start();
  const path = `sessions/${SID}/orders/${OID}/proof`;
  assert.equal((await f.call(path, proof(), { Authorization: '' })).status, 401);
  assert.equal((await f.call(path, proof(), { Origin: 'https://other.invalid' })).status, 403);
  f.setClaims({ sub: 'participant', email: 'person@example.invalid', email_verified: true });
  assert.equal((await f.upload()).status, 403); assert.equal(f.proofs.size, 0);
});
test('bank-only actions cannot modify gateway orders or production records', async () => {
  const f = await start(); f.mutate(r => { r.orders[0].method = 'mbway'; }); assert.equal((await f.upload()).status, 409);
  f.mutate(r => { r.orders[0].method = 'bank_transfer'; r.environment = 'production'; }); assert.equal((await f.upload()).status, 409);
});
test('bank transfer has no Eupago inspection, recovery or callback route', async () => {
  const f = await start();
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/inspect`, {})).status, 409);
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/recover`, { reference: '123' })).status, 409);
  const key = 'test', env = { FIREBASE_PROJECT_ID: 'circ-coimbra', EUPAGO_SANDBOX_API_KEY: 'test', EUPAGO_SANDBOX_WEBHOOK_KEY: key,
    EUPAGO_SANDBOX_CHANNEL: 'demo', FIREBASE_SANDBOX_SERVICE_ACCOUNT: 'test' };
  const body = JSON.stringify({ channel: { name: 'demo' }, transaction: { identifier: f.order().identifier, entity: '10045',
    method: 'MW:PT', reference: '123', trid: '123', status: 'Paid', date: '2026-10-10T10:00:00', amount: { value: '160.00', currency: 'EUR' } } });
  const handle = createSandboxWebhook({ checkoutHandler: createCheckoutSandboxNotification({ tokenProvider: () => assert.fail('must not reconcile') }) });
  const response = await handle(new Request('https://circ.local/api/payments/sandbox/notifications/YWRtaW4', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': createHmac('sha256', key).update(body).digest('base64') }, body }), env);
  assert.equal(response.status, 422);
});
test('failed atomic proof and credit commits do not partially confirm registration', async () => {
  const f = await start(); f.setBroken(true); assert.equal((await f.upload()).status, 503);
  assert.equal(f.proofs.size, 0); assert.equal(f.order().bankTransfer.status, 'awaiting_transfer');
  f.setBroken(false); await f.upload(); f.setBroken(true); assert.equal((await f.review()).status, 503);
  assert.equal(f.record().registration, null); assert.equal(f.credits.size, 0); f.setBroken(false); assert.equal((await f.review()).status, 200);
});
test('file validation enforces type, size, strict base64, filename and explicit synthetic data declaration', () => {
  for (const bad of [{ filename: '../proof.pdf' }, { filename: 'proof.html' }, { mimeType: 'text/html' },
    { base64: '%%%garbage' }, { base64: Buffer.from('<html>bad</html>').toString('base64') },
    { sampleAcknowledged: false }, { base64: 'a'.repeat(700000) }, { filename: 'bad\n.pdf' }, { expectedProofId: 'bad' }]) {
    assert.throws(() => validateTransferProof({ ...proof(), ...bad }));
  }
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_PROOF_BYTES - 15, 32), Buffer.from('%%EOF\n')]);
  assert.equal(validateTransferProof({ ...proof(), base64: pdf.toString('base64') }).size, MAX_PROOF_BYTES);
  assert.throws(() => validateTransferProof({ ...proof(), base64: Buffer.concat([pdf, Buffer.from(' ')]).toString('base64') }));
  for (const [filename, mimeType, header] of [['test.png', 'image/png', '89504e470d0a1a0a'], ['test.jpg', 'image/jpeg', 'ffd8ff']])
    assert.equal(validateTransferProof({ ...proof(), filename, mimeType, base64: Buffer.from(header, 'hex').toString('base64') }).mimeType, mimeType);
});
test('oversized request bodies are stopped and do not write a proof', async () => {
  const f = await start(); const r = await f.upload({ ...proof(), base64: 'a'.repeat(800000) }); assert.equal(r.status, 400); assert.equal(f.proofs.size, 0);
});

test('a no-proof report remains pending until an explicit checked credit confirms it', async () => {
  const f = await start(); const reported = await f.report(); assert.equal(reported.status, 200);
  assert.equal(f.order().bankTransfer.status, 'under_review'); assert.equal(f.record().registration, null);
  assert.equal(f.proofs.size, 0); assert.equal(f.credits.size, 0); assert.equal(f.order().notification, null);
  assert.equal(f.order().bankTransfer.reports[0].actor, 'admin'); assert.equal(f.order().bankTransfer.reports[0].at, time);
  assert.equal((await f.review({ ...approval(), proofId: null, proofReviewed: false })).status, 200);
  assert.equal(f.record().registration.status, 'confirmed'); assert.equal(f.order().bankTransfer.confirmation.proofId, null);
  assert.equal(f.credits.size, 1); assert.equal(f.proofs.size, 0);
});
test('report retries never duplicate declarations, approval or entitlements', async () => {
  const f = await start(); await f.report(); const writes = f.writes(); await f.report(); assert.equal(f.writes(), writes);
  await f.review({ ...approval(), proofId: null }); const paidWrites = f.writes();
  assert.equal((await f.report()).status, 200); assert.equal(f.writes(), paidWrites); assert.equal(f.order().bankTransfer.reports.length, 1);
  assert.equal((await f.report({ id: PID2, expectedRevision: 2, sandboxAcknowledged: true })).status, 409);
  assert.equal((await f.report({ id: PID, expectedRevision: 0, note: 'changed', sandboxAcknowledged: true })).status, 409);
});
test('no-proof approval still rejects missing credit declaration and different amounts', async () => {
  const f = await start(); await f.report();
  for (const override of [{ creditConfirmed: false }, { amount: '159.99' }, { amount: '160.01' }]) {
    assert.equal((await f.review({ ...approval(), proofId: null, ...override })).status, 400);
    assert.equal(f.record().registration, null); assert.equal(f.credits.size, 0);
  }
});
test('clarification and re-reporting invalidate a stale no-proof approval', async () => {
  const f = await start(); await f.report();
  const oldApproval = { ...approval(), proofId: null, expectedRevision: 1 };
  assert.equal((await f.review({ id: RID2, decision: 'reject', proofId: null, reason: 'Não foi localizado o movimento', sandboxAcknowledged: true })).status, 200);
  assert.equal(f.order().bankTransfer.status, 'rejected');
  assert.equal((await f.report({ id: PID2, expectedRevision: 2, note: 'A transferência foi feita por outra pessoa.', sandboxAcknowledged: true })).status, 200);
  const stale = await f.review(oldApproval); assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, 'transfer-stale-review'); assert.equal(f.record().registration, null);
  assert.equal((await f.review({ ...oldApproval, expectedRevision: 3 })).status, 200);
  assert.equal(f.order().bankTransfer.reports.length, 2); assert.equal(f.order().bankTransfer.decisions.length, 2);
});
test('revision is mandatory for new transfers and any no-proof report', async () => {
  const f = await start(); await f.report();
  const res = await f.call(`sessions/${SID}/orders/${OID}/review`, { ...approval(), proofId: null });
  assert.equal(res.status, 409); assert.equal(f.record().registration, null);
});
test('an attachment supplied after reporting must be reviewed, not silently ignored', async () => {
  const f = await start(); await f.report(); await f.upload();
  assert.equal((await f.review({ ...approval(), proofId: null, expectedRevision: 1 })).status, 409);
  assert.equal((await f.review({ ...approval(), proofReviewed: false })).status, 400);
  assert.equal((await f.review()).status, 200);
});
test('legacy proof-only records and their original memos remain usable without migration', async () => {
  const f = await start(); const oldMemo = `CIRC-TESTE-${SID}-1`;
  f.mutate(r => { const b = r.orders[0].bankTransfer; delete b.flowVersion; delete b.reports; b.memo = oldMemo; b.status = 'awaiting_proof'; });
  await f.upload();
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/review`, approval())).status, 200);
  assert.equal(f.order().bankTransfer.memo, oldMemo); assert.equal(f.record().registration.status, 'confirmed');
});
test('legacy awaiting-proof records accept a report without changing their existing memo', async () => {
  const f = await start(); const oldMemo = `CIRC-TESTE-${SID}-1`;
  f.mutate(r => { const b = r.orders[0].bankTransfer; delete b.flowVersion; delete b.reports; b.memo = oldMemo; b.status = 'awaiting_proof'; });
  await f.report(); assert.equal(f.order().bankTransfer.memo, oldMemo);
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/review`, { ...approval(), proofId: null })).status, 409);
  assert.equal((await f.review({ ...approval(), proofId: null })).status, 200);
});
test('compact memos encode the entire order UUID and remain stable across refresh/report', async () => {
  const f = await start(); const memo = f.order().bankTransfer.memo;
  assert.match(memo, /^C27T-[A-Z0-9]{1,25}$/); assert.ok(memo.length <= 30);
  assert.equal(memo, `C27T-${BigInt('0x' + OID.replaceAll('-', '')).toString(36).toUpperCase()}`);
  await f.report(); assert.equal(f.order().bankTransfer.memo, memo);
  await f.review({ ...approval(), proofId: null });
  await f.create({ dinnerQuantity: 1 }, OID2);
  assert.notEqual(f.order(OID2).bankTransfer.memo, memo);
});
test('the administrative queue exposes only compact bank-order metadata and no bank destination', async () => {
  const f = await start(); await f.report();
  const data = await (await f.call('sessions')).json(); const row = data.sessions[0].bankTransfers[0];
  assert.equal(row.status, 'under_review'); assert.equal(row.amountCents, 16000); assert.equal(row.proofCount, 0);
  assert.equal(row.id, OID); assert.equal(row.memo, f.order().bankTransfer.memo);
  assert.equal(data.sessions[0].reports, undefined); assert.equal(row.proofs, undefined);
  const config = await (await f.call('config')).json();
  assert.deepEqual(config.bankTransferAccount, sandboxBankAccount());
  assert.equal(config.bankTransferAccount.enabled, false); assert.equal(config.bankTransferAccount.iban, null);
  assert.equal(proposedBankAccount.beneficiary, null); assert.equal(proposedBankAccount.enabled, false);
  assert.ok(!JSON.stringify(config).includes(proposedBankAccount.iban));
});
test('report API rejects spoofed fields, missing acknowledgements and unauthorized requests', async () => {
  const f = await start(); const r = { id: PID, expectedRevision: 0, sandboxAcknowledged: true };
  for (const extra of [{ amount: '0.00' }, { status: 'confirmed' }, { owner: 'other' }, { environment: 'production' }, { sandboxAcknowledged: false }, { note: 'x'.repeat(501) }]) assert.equal((await f.report({ ...r, ...extra })).status, 400);
  const path = `sessions/${SID}/orders/${OID}/report`;
  assert.equal((await f.call(path, r, { Authorization: '' })).status, 401);
  assert.equal((await f.call(path, r, { Origin: 'https://other.invalid' })).status, 403);
  f.setClaims({ sub: 'other', email: 'other@example.invalid', email_verified: true });
  assert.equal((await f.report(r)).status, 403); assert.equal(f.order().bankTransfer.reports.length, 0);
});
test('concurrent and failed report writes cannot grant a registration or discard history', async () => {
  const f = await start(); f.setBroken(true); assert.equal((await f.report()).status, 503);
  assert.equal(f.order().bankTransfer.reports.length, 0); assert.equal(f.record().registration, null);
  f.setBroken(false); const responses = await Promise.all([f.report(), f.report()]);
  assert.ok(responses.every(r => [200, 409].includes(r.status))); assert.equal(f.order().bankTransfer.reports.length, 1);
  assert.equal(f.record().registration, null);
});
test('bank credit uniqueness also applies when neither order has a proof', async () => {
  const f = await start(); await f.report(); await f.review({ ...approval(), proofId: null });
  await f.create({ dinnerQuantity: 1 }, OID2);
  await f.report({ id: PID2, expectedRevision: 0, sandboxAcknowledged: true }, OID2);
  const decision = { ...approval(), id: RID2, proofId: null, amount: '30.00' };
  assert.equal((await f.review(decision, OID2)).status, 409);
  assert.equal((await f.review({ ...decision, creditReference: 'TESTE-SECOND-CREDIT' }, OID2)).status, 200);
  assert.equal(f.record().registration.entitlements.dinnerQuantity, 2); assert.equal(f.credits.size, 2); assert.equal(f.proofs.size, 0);
});
