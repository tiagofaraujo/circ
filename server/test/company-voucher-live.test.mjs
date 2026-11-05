import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyVoucherLiveApi } from '../payments/company-voucher-live.mjs';

const code = 'a'.repeat(32), second = 'b'.repeat(32);
const env = { FIREBASE_PROJECT_ID: 'circ-test' };
const time = '2026-11-15T12:34:56.000Z';
const copy = value => structuredClone(value);
function request(body = { code }, options = {}) {
  const method = options.method || 'POST';
  return new Request(`https://circ.test/api/checkout/live/company-voucher/redeem${options.query || ''}`, { method,
    headers: { Origin: 'https://circ.test', Authorization: 'Bearer session-token', 'Content-Type': 'application/json', ...options.headers },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
}
function fixture({ claims = {}, commitError = null, lostAck = false, date = time } = {}) {
  const data = {
    config: { enabled: true }, profile: { name: 'Pessoa Participante' }, registration: null,
    voucher: { eventId: 'circ-2027', purchaseId: 'purchase', index: 0, companyName: 'Empresa Exemplo', unitAmountCents: 9500,
      status: 'available', redeemedBy: null, registrationId: null, redeemedAt: null, createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z' },
    purchase: { eventId: 'circ-2027', company: { name: 'Empresa Exemplo', taxNumber: '123456789' }, quantity: 2,
      unitAmountCents: 9500, amountCents: 19000, codes: [code, second], status: 'paid' },
  };
  let revision = 1, commits = 0;
  const reads = [], writes = [];
  const read = key => { reads.push(key); return { name: `documents/${key}`, version: data[key] ? `${key}-${revision}` : null, data: copy(data[key]) }; };
  const store = { companyConfig: async () => read('config'), profile: async () => read('profile'), registration: async () => read('registration'),
    companyVoucher: async value => { assert.equal(value, code); return read('voucher'); },
    companyPurchase: async id => { assert.equal(id, 'purchase'); return read('purchase'); },
    redeemCompanyVoucher: async args => {
      if (commitError) throw Object.assign(new Error(commitError), { code: commitError });
      if (data.registration || args.voucherVersion !== `voucher-${revision}`) throw { code: 'conflict' };
      for (const guard of args.guards) assert.equal(guard.version, `${guard.name.slice('documents/'.length)}-${revision}`);
      data.registration = copy(args.registration); data.voucher = copy(args.voucher); commits++; revision++; writes.push(args);
      if (lostAck) throw new Error('lost response containing private upstream details');
    } };
  const verify = async () => ({ sub: 'alice', email: 'alice@example.test', email_verified: true, ...claims });
  const tokenProvider = async () => 'service-identity';
  const api = createCompanyVoucherLiveApi({ verify, tokenProvider, storeFactory: args => {
    assert.equal(args.uid, claims.sub || 'alice'); assert.equal(args.token, 'service-identity'); return store;
  }, now: () => date });
  return { api, data, store, reads, writes, commits: () => commits, setDate: value => { date = value; } };
}

test('paid company voucher creates only covered onsite rights with no personal fiscal data or separate charge', async () => {
  const f = fixture();
  const response = await f.api(request({ code: code.toUpperCase().match(/.{4}/g).join('-') }), env);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { registrationId: 'circ-2027-alice', duplicate: false });
  assert.equal(f.commits(), 1); const r = f.data.registration;
  assert.deepEqual(r.payment, { status: 'paid', amountCents: 0, coveredAmountCents: 9500, currency: 'EUR', method: 'company_voucher', reference: 'purchase', payer: 'Empresa Exemplo' });
  assert.deepEqual(r.entitlements, { congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 });
  assert.equal(r.status, 'confirmed'); assert.equal(r.isTest, false); assert.equal(r.testMode, false);
  assert.equal(r.documentCount, 0); assert.equal(r.createdAt, time); assert.equal(r.updatedAt, time);
  assert.equal(r.participantName, f.data.profile.name); assert.equal(r.participantEmail, 'alice@example.test');
  assert.equal(f.data.voucher.redeemedBy, 'alice'); assert.equal(f.data.voucher.redeemedAt, time);
  assert.deepEqual(f.writes[0].guards.map(g => g.name), ['documents/config', 'documents/profile', 'documents/purchase']);
});

test('voucher redemption respects the exact opening boundary and an existing redemption remains recoverable before opening', async () => {
  const f=fixture({date:'2026-11-14T23:59:59.999Z'});
  const closed=await f.api(request(),env);assert.equal(closed.status,403);assert.equal((await closed.json()).error,'company/registration-not-open');
  assert.equal(f.commits(),0);assert.equal(f.data.voucher.status,'available');
  f.setDate('2026-11-15T00:00:00Z');assert.equal((await f.api(request(),env)).status,200);assert.equal(f.commits(),1);
  f.setDate('2026-11-14T23:59:59.999Z');
  const existing=await f.api(request(),env);assert.equal(existing.status,200);assert.equal((await existing.json()).duplicate,true);assert.equal(f.commits(),1);
});

test('an acknowledged or lost acknowledgement retry does not consume another seat even after redemption closes', async () => {
  const f = fixture({ lostAck: true });
  const lost = await f.api(request(), env); assert.equal(lost.status, 503); assert.equal(f.commits(), 1);
  assert.deepEqual(await lost.json(), { error: 'company/unavailable' });
  f.data.config.enabled = false; f.data.profile.name = '';
  const retry = await f.api(request(), env); assert.equal(retry.status, 200); assert.equal((await retry.json()).duplicate, true);
  assert.equal(f.commits(), 1);
});

test('a full capacity atomically leaves the available voucher and registration unchanged', async () => {
  const f = fixture({ commitError: 'capacity-full' });
  const response = await f.api(request(), env); assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'company/capacity-full' });
  assert.equal(f.data.registration, null); assert.equal(f.data.voucher.status, 'available'); assert.equal(f.commits(), 0);
});

test('simultaneous redemptions cannot grant the same code or admit the same registration twice', async () => {
  const f = fixture(); const replies = await Promise.all([f.api(request(), env), f.api(request(), env)]);
  assert.equal(replies.filter(r => r.status === 200).length, 1); assert.equal(replies.filter(r => r.status === 409).length, 1);
  assert.equal(f.commits(), 1);
  const retry = await f.api(request(), env); assert.equal(retry.status, 200); assert.equal((await retry.json()).duplicate, true);
});

test('paid purchase, index, code allocation, company, amount and event must match before admission', async () => {
  const mutations = [
    f => { f.data.purchase.status = 'pending'; }, f => { f.data.purchase.eventId = 'other'; },
    f => { f.data.purchase.codes[0] = second; }, f => { f.data.purchase.codes = [code]; },
    f => { f.data.voucher.index = 2; }, f => { f.data.voucher.unitAmountCents = 9400; },
    f => { f.data.purchase.amountCents = 9500; }, f => { f.data.voucher.companyName = 'Outra empresa'; },
    f => { f.data.voucher.eventId = 'other'; }, f => { f.data.purchase = null; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f); const response = await f.api(request(), env);
    assert.equal(response.status, 400); assert.equal((await response.json()).error, 'company/invalid-code'); assert.equal(f.commits(), 0);
  }
});

test('closed, cancelled, already used or incomplete profile cannot gain a registration', async () => {
  for (const [mutate, error] of [
    [f => { f.data.config.enabled = false; }, 'company/closed'],
    [f => { f.data.voucher.status = 'cancelled'; }, 'company/invalid-code'],
    [f => { f.data.voucher.redeemedBy = 'bob'; }, 'company/invalid-code'],
    [f => { f.data.profile = { name: 'abc' }; }, 'company/profile'],
    [f => { f.data.profile = null; }, 'company/profile'],
    [f => { f.data.profile.name = 'Pessoa\nParticipante'; }, 'company/profile'],
  ]) { const f = fixture(); mutate(f); const response = await f.api(request(), env); assert.equal((await response.json()).error, error); assert.equal(f.commits(), 0); }
});

test('an existing different registration or another users consumed code cannot be overwritten', async () => {
  const f = fixture(); f.data.registration = { eventId: 'circ-2027', userId: 'alice', payment: { status: 'paid' }, voucherId: second };
  const response = await f.api(request(), env); assert.equal(response.status, 409); assert.equal((await response.json()).error, 'company/existing');
  assert.equal(f.commits(), 0);
  const g = fixture(); g.data.voucher = { ...g.data.voucher, status: 'redeemed', redeemedBy: 'bob', registrationId: 'circ-2027-bob', redeemedAt: time };
  assert.equal((await g.api(request(), env)).status, 400); assert.equal(g.commits(), 0);
});

test('strict method, origin, verified identity and bounded exact body protect the server path', async () => {
  const f = fixture();
  assert.equal((await f.api(new Request('https://circ.test/unrelated'), env)), null);
  for (const [req, status] of [
    [request(null, { method: 'GET' }), 405], [request({}, { query: '?code=secret' }), 400],
    [request({ code }, { headers: { Origin: 'https://other.test' } }), 403],
    [request({ code }, { headers: { Authorization: '' } }), 401],
    [request({ code, amountCents: 0 }), 400], [request({ code: '../users/alice' }), 400],
    [request('x'.repeat(2049)), 400], [request('not-json'), 400],
    [request({ code }, { headers: { 'Content-Type': 'text/plain' } }), 400],
  ]) assert.equal((await f.api(req, env)).status, status);
  for (const claims of [{ email_verified: false }, { sub: '../alice' }, { email: null }]) {
    const g = fixture({ claims }); assert.equal((await g.api(request(), env)).status, 403); assert.equal(g.reads.length, 0);
  }
  assert.equal(f.commits(), 0);
});

test('configuration, profile or purchase races fail closed and storage messages never reach a participant', async () => {
  for (const [commitError, status, error] of [['conflict', 409, 'company/conflict'], ['storage_forbidden', 503, 'company/unavailable']]) {
    const f = fixture({ commitError }); const response = await f.api(request(), env);
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error }); assert.equal(f.commits(), 0);
  }
});
