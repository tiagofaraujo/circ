import test from 'node:test';
import assert from 'node:assert/strict';
import { createToconlineBankPreviewApi } from '../payments/toconline-bank-preview.mjs';
import { buildToconlineRehearsal, createToconlineRehearsalApi } from '../payments/toconline-rehearsal.mjs';

const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const PATH = `/api/fiscal/sandbox/bank-preview/sessions/${SID}/orders/${OID}`;
const env = { FIREBASE_PROJECT_ID: 'circ-test' };
const claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };
function savedRecord() {
  const lines = [['congress-onsite', 9500, 1], ['course-morning', 3500, 1], ['course-afternoon', 3500, 1], ['dinner', 3000, 2]]
    .map(([code, unitAmountCents, quantity]) => ({ code, unitAmountCents, quantity, amountCents: unitAmountCents * quantity }));
  const order = { id: OID, environment: 'sandbox', status: 'confirmed', method: 'bank_transfer', amountCents: 22500, currency: 'EUR',
    quote: { eventId: 'circ-2027', kind: 'primary', amountCents: 22500, currency: 'EUR', ratePeriod: 'early', selection: { profile: 'external' }, lines },
    bankTransfer: { status: 'confirmed', simulated: true, confirmation: { simulated: true, bookingDate: '2026-10-18', amountCents: 22500, currency: 'EUR', creditReference: 'TESTE-BANK-001' } } };
  const record = { id: SID, owner: 'admin', kind: 'checkout-test', environment: 'sandbox', eventId: 'circ-2027', registration: { status: 'confirmed' }, orders: [order] };
  record.fiscalRehearsals = [{ ...buildToconlineRehearsal(record, OID, 'invoice_receipt', '2026-10-18'), status: 'simulated-issued',
    simulated: { salesDocumentNo: 'FR TESTE/A261038C3B', fiscalEffect: false, providerCallMade: false } }];
  return record;
}
const goodResource = () => ({ source: 'company_bank_accounts', ok: true, mode: 'read-only', status: 'matched', commercialWritesEnabled: false, account: { id: '77', ibanLast4: '1905' } });
function fixture() {
  let record = savedRecord(); let version = '1'; let identity = claims; let bank = goodResource();
  let responseStatus = 200; let afterRead = () => {}; let writes = 0; let reads = 0; const provider = [];
  const store = { read: async () => { reads++; return { record: structuredClone(record), version }; },
    billingProfile: async () => ({ data: {
      name: 'Participante Teste CIRC',
      billingName: 'Entidade Teste CIRC',
      taxNumber: '123456789',
      billingAddress: 'Rua de Teste, 1',
      billingPostalCode: '3000-000',
      billingCity: 'Coimbra',
      billingCountry: 'Portugal',
    } }),
    replace: async () => { writes++; throw new Error('Writes forbidden'); } };
  const verify = async () => identity;
  const api = createToconlineBankPreviewApi({ verify, storeFactory: () => store, buildRehearsal: buildToconlineRehearsal,
    now: () => '2026-10-23T10:00:00Z', readonlyApiFactory: () => async request => {
      provider.push({ path: new URL(request.url).pathname, method: request.method, auth: request.headers.get('Authorization'), cookie: request.headers.get('Cookie') });
      afterRead();
      return Response.json(responseStatus === 200 ? { mode: 'read-only', commercialWritesEnabled: false, resources: { billingBankAccount: bank } }
        : { error: 'toconline-not-connected', privateDetail: 'DO NOT RETURN TOKEN' }, { status: responseStatus,
        headers: { 'Set-Cookie': '__Host-circ_toc_session=renewed; Path=/; Secure; HttpOnly; SameSite=Strict' } });
    } });
  return { call: (suffix = '', options = {}) => api(new Request(`https://circ.local${PATH}${suffix}`, {
    method: options.method || 'GET', headers: { ...(options.noAuth ? {} : { Authorization: 'Bearer firebase-test' }), Cookie: 'session=private' },
  }), env), provider, record: () => structuredClone(record), writes: () => writes, reads: () => reads,
    bank: value => { bank = value; }, identity: value => { identity = value; }, status: value => { responseStatus = value; },
    mutate: fn => { fn(record); }, race: () => { afterRead = () => { version = '2'; }; },
    reprepare: () => { record.fiscalRehearsals = [{ ...buildToconlineRehearsal(record, OID, 'invoice_receipt', '2026-10-18'), status: 'prepared' }]; },
  };
}

test('verified account ID is added to a server proposal, not to the historic simulated document', async () => {
  const f = fixture(); const before = JSON.stringify(f.record());
  const response = await f.call(); assert.equal(response.status, 200);
  const { preview } = await response.json();
  assert.equal(preview.salesDocument.bank_account_id, 77); // deliberately not the generic-account ID 2
  assert.equal(preview.salesDocument.customer_business_name, 'Entidade Teste CIRC');
  assert.equal(preview.salesDocument.customer_tax_registration_number, '123456789');
  assert.equal(preview.salesDocument.customer_country, 'PT');
  assert.equal(preview.salesDocument.document_type, 'FR'); assert.equal(preview.salesDocument.payment_mechanism, 'TR');
  assert.equal(preview.basedOnSimulatedDocument, 'FR TESTE/A261038C3B');
  assert.equal(preview.amountCents, 22500); assert.equal(preview.taxPreview.exemptCents, 15500);
  assert.equal(preview.taxPreview.taxableNetCents, 5692); assert.equal(preview.taxPreview.vatCents, 1308);
  for (const key of ['persisted', 'liveWritesEnabled', 'fiscalEffect', 'providerWriteMade']) assert.equal(preview[key], false);
  assert.equal(preview.providerReadMade, true);
  assert.equal(JSON.stringify(f.record()), before); assert.equal(f.writes(), 0);
  assert.deepEqual(f.provider.map(p => [p.path, p.method]), [['/api/fiscal/toconline/resources', 'GET']]);
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/); assert.equal(response.headers.get('Vary'), 'Authorization, Cookie');
});

test('empty, ambiguous, wrong-source and invalid-ID responses cannot assign a bank account', async () => {
  for (const bank of [null, { ...goodResource(), source: 'bank_accounts' }, { ...goodResource(), ok: false },
    { ...goodResource(), status: 'not-found' }, { ...goodResource(), status: 'ambiguous' },
    { ...goodResource(), status: 'iban-mismatch' }, { ...goodResource(), account: { id: '0', ibanLast4: '1905' } },
    { ...goodResource(), account: { id: '9999999999999999', ibanLast4: '1905' } }]) {
    const f = fixture(); f.bank(bank); const response = await f.call();
    assert.equal(response.status, 409); assert.equal((await response.json()).error, 'billing-bank-unconfirmed'); assert.equal(f.writes(), 0);
  }
});

test('requires a verified administrator, GET and no browser-provided account/IBAN/payload overrides', async () => {
  for (const identity of [{ ...claims, email: 'other@example.test' }, { ...claims, email_verified: false }]) {
    const f = fixture(); f.identity(identity); assert.equal((await f.call()).status, 403); assert.equal(f.reads(), 0); assert.equal(f.provider.length, 0);
  }
  const missing = fixture(); assert.equal((await missing.call('', { noAuth: true })).status, 401);
  for (const options of [{ method: 'POST' }, { method: 'DELETE' }]) {
    const f = fixture(); assert.equal((await f.call('', options)).status, 405); assert.equal(f.reads(), 0);
  }
  for (const suffix of ['?bank_account_id=2', '?iban=OTHER', '?url=https://evil.invalid', '?payload={}']) {
    const f = fixture(); assert.equal((await f.call(suffix)).status, 400); assert.equal(f.provider.length, 0);
  }
});

test('does not associate a transfer account with other payment methods or unverified tariffs', async () => {
  for (const method of ['stripe', 'mbway', 'multibanco']) {
    const f = fixture(); f.mutate(r => { r.orders[0].method = method; });
    assert.equal((await f.call()).status, 422); assert.equal(f.provider.length, 0);
  }
  const late = fixture(); late.mutate(r => { r.orders[0].bankTransfer.confirmation.bookingDate = '2027-02-02'; }); late.reprepare();
  assert.equal((await late.call()).status, 409); assert.equal(late.provider.length, 0); assert.equal(late.writes(), 0);
});

test('stale payment, stale policy, cross-owner data and concurrent changes preserve all records', async () => {
  const stale = fixture(); stale.mutate(r => { r.orders[0].bankTransfer.confirmation.bookingDate = '2026-10-19'; });
  assert.equal((await (await stale.call()).json()).error, 'stale-source');
  const old = fixture(); old.mutate(r => { delete r.fiscalRehearsals[0].pricingPolicyVersion; });
  assert.equal((await (await old.call()).json()).error, 'stale-tax-policy');
  const other = fixture(); other.mutate(r => { r.owner = 'someone-else'; }); assert.equal((await other.call()).status, 404);
  const race = fixture(); race.race(); assert.equal((await (await race.call()).json()).error, 'stale-source'); assert.equal(race.writes(), 0);
});

test('expired OAuth is reported without private details; repeating a preview does not issue or persist anything', async () => {
  const f = fixture(); f.status(401); const response = await f.call(); assert.equal(response.status, 401);
  const text = await response.text(); assert.match(text, /toconline-not-connected/); assert.ok(!text.includes('DO NOT RETURN TOKEN'));
  const repeat = fixture(); const before = JSON.stringify(repeat.record());
  assert.equal((await repeat.call()).status, 200); assert.equal((await repeat.call()).status, 200);
  assert.equal(repeat.writes(), 0); assert.equal(JSON.stringify(repeat.record()), before);
});

test('main fiscal handler dispatches the new route without allowing unauthenticated reads', async () => {
  const api = createToconlineRehearsalApi({ verify: async () => { throw new Error('No token'); }, storeFactory: () => { throw new Error('Must not open a store'); } });
  const response = await api(new Request(`https://circ.local${PATH}`), env);
  assert.equal(response.status, 401); assert.equal((await response.json()).error, 'sign-in-required');
});
