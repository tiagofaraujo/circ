import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankTransferLiveApi } from '../payments/bank-transfer-live.mjs';
import { quotePrimary, quoteSupplementary } from '../payments/quote.mjs';
import { proposedBankAccount } from '../payments/bank-transfer-account.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const decisionId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const env = { FIREBASE_PROJECT_ID: 'circ-test', LIVE_CHECKOUT_ENABLED: 'false', LIVE_BANK_TRANSFER_ENABLED: 'false' };
const context = { uid: 'person', emailVerified: true, guards: [] };
const billing = { customer_business_name: 'Participante Exemplo', customer_tax_registration_number: '123456789',
  customer_address_detail: 'Rua Exemplo 1', customer_postcode: '3000-001', customer_city: 'Coimbra', customer_country: 'PT' };
const initialSelection = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const approve = (overrides = {}) => ({ id: decisionId, expectedRevision: 0, creditConfirmed: true, amountCents: 9500,
  currency: 'EUR', creditReference: 'BCP-ENTRY-00001', bookingDate: '2026-11-01', reason: '', ...overrides });
function request(action = 'review', data = approve(), { method = 'POST', origin = 'https://circ.test', headers = {} } = {}) {
  return new Request(action === 'list' ? 'https://circ.test/api/checkout/live/bank-transfers'
    : `https://circ.test/api/checkout/live/orders/${id}/bank-transfer-${action}`, {
    method, headers: { Authorization: 'Bearer verified-session', Origin: origin, 'Content-Type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
  });
}
function fixture({ claims = {}, supplementary = false, currentTime = '2026-11-01T12:00:00Z', resolver, confirmHook } = {}) {
  const primaryQuote = quotePrimary(initialSelection, context, null, new Date('2026-11-01T12:00:00Z'));
  let registration = { userId: 'person', eventId: 'circ-2027', primaryRegistration: true, isTest: false, testMode: false,
    status: supplementary ? 'confirmed' : 'submitted', selection: primaryQuote.selection,
    entitlements: { congressMode: supplementary ? 'onsite' : '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
    payment: { orderId: supplementary ? '44444444-4444-4444-8444-444444444444' : id,
      status: supplementary ? 'paid' : 'pending', method: supplementary ? 'multibanco' : 'bank_transfer',
      reference: supplementary ? '123456789' : id, amountCents: 9500, currency: 'EUR' }, documentCount: supplementary ? 1 : 0,
    ...(supplementary ? { openSupplementaryOrderId: id } : {}) };
  const quote = supplementary ? quoteSupplementary({ morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 }, context,
    { ...registration, id: 'circ-2027-person' }, new Date('2026-11-01T12:00:00Z')) : primaryQuote;
  let payment = { id, kind: quote.kind, userId: 'person', eventId: 'circ-2027', registrationId: 'circ-2027-person', environment: 'production',
    provider: 'internal_bank_transfer', method: 'bank_transfer', status: 'pending', amountCents: quote.amountCents, currency: 'EUR',
    identifier: `circ_live_${id.replaceAll('-', '')}`, reference: id, entity: null, quote, billingSnapshot: billing, createdAt: '2026-11-01T09:00:00Z',
    bankTransfer: { status: 'awaiting_transfer', revision: 0, payee: proposedBankAccount.beneficiary, iban: proposedBankAccount.iban,
      paymentReference: id, reports: [] } };
  let job = null, revision = 1, credit = null;
  let commits = 0, issues = 0, resolutions = 0;
  const audits = [];
  const store = {
    registrationId: 'circ-2027-person',
    payment: async () => ({ data: payment, version: `p${revision}` }),
    registration: async () => ({ data: registration, version: `r${revision}` }),
    context: async () => context,
    document: async () => ({ data: job, version: job ? `j${revision}` : null }),
    bankCredit: async () => ({ data: credit }),
    adminBankTransfers: async () => [{ id, data: payment, version: `p${revision}` }],
    updatePayment: async (_id, data, version) => {
      if (version !== `p${revision}`) throw { code: 'conflict' };
      payment = data; revision++; return { data, version: `p${revision}` };
    },
    confirmBankTransferPaid: async args => {
      if (confirmHook) await confirmHook(args);
      if (args.paymentVersion !== `p${revision}` || args.registrationVersion !== `r${revision}` || credit || job) throw { code: 'conflict' };
      payment = args.payment; registration = args.registration; job = args.fiscalJob; credit = args.creditClaim; audits.push(args.audit);
      commits++; revision++;
    },
    finalizeFiscalResult: async args => {
      if (args.paymentVersion !== `p${revision}` || args.registrationVersion !== `r${revision}` || args.documentVersion !== `j${revision}`) throw { code: 'conflict' };
      payment = args.payment; registration = args.registration; job = args.document; revision++;
    },
  };
  const fiscalClient = {
    resolveBillingBankAccount: async () => { resolutions++; return resolver ? resolver() : { id: 2, source: 'company_bank_accounts', ibanLast4: '1905' }; },
    issueFinalizedSalesDocument: async (_env, payload) => { issues++; assert.equal(payload.payment_mechanism, 'TR'); assert.equal(payload.bank_account_id, 2);
      return { providerDocumentId: '12345', providerDocumentNo: 'FR EXEMPLO/1' }; },
  };
  const api = createBankTransferLiveApi({ verify: async () => ({ sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true, ...claims }),
    tokenProvider: async () => 'service-token', storeFactory: () => store,
    paymentLookup: async () => ({ data: payment, version: `p${revision}` }), fiscalClient, now: () => currentTime });
  return { api, store, fiscalClient, state: () => ({ payment, registration, job, credit, commits, issues, resolutions, audits }),
    changePayment: change => { payment = { ...payment, ...change }; }, changeRegistration: change => { registration = { ...registration, ...change }; },
    claimCredit: value => { credit = value; } };
}

test('administrator credit approval atomically confirms primary payment, entitlements and TR invoice exactly once even with creation disabled', async () => {
  const f = fixture();
  const first = await f.api(request(), env);
  assert.equal(first.status, 200); const result = await first.json();
  assert.equal(result.order.status, 'paid'); assert.equal(result.order.fiscalStatus, 'issued'); assert.equal(result.duplicate, false);
  const state = f.state(); assert.equal(state.commits, 1); assert.equal(state.issues, 1);
  assert.equal(state.registration.status, 'confirmed'); assert.equal(state.registration.entitlements.congressMode, 'onsite');
  assert.equal(state.registration.documentCount, 1); assert.equal(state.credit.amountCents, 9500);
  assert.equal(state.audits[0].action, 'payment.bank-transfer.confirmed');
  const second = await f.api(request(), env); assert.equal(second.status, 200); assert.equal((await second.json()).duplicate, true);
  assert.equal(f.state().issues, 1); assert.equal(f.state().commits, 1);
});

test('owner report never marks paid or invokes fiscal issuing and its response excludes private note', async () => {
  const f = fixture({ claims: { sub: 'person', email: 'person@example.test' } });
  const report = { id: reportId, expectedRevision: 0, note: 'Referência comunicada.' };
  const response = await f.api(request('report', report), env); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.order.status, 'pending'); assert.equal(result.order.bankTransfer.status, 'under_review');
  assert.equal(result.order.bankTransfer.revision, 1); assert.doesNotMatch(JSON.stringify(result), /Referência comunicada/);
  assert.equal(f.state().issues, 0); assert.equal(f.state().commits, 0); assert.equal(f.state().registration.status, 'submitted');
  const duplicate = await f.api(request('report', report), env); assert.equal((await duplicate.json()).duplicate, true);
});

test('primary tariff is calculated by credited date and insufficient amount cannot confirm payment', async () => {
  const f = fixture({ currentTime: '2027-02-02T12:00:00Z' });
  const wrong = await f.api(request('review', approve({ bookingDate: '2027-02-01' })), env);
  assert.equal(wrong.status, 409); assert.equal((await wrong.json()).expectedAmountCents, 15000);
  assert.equal(f.state().commits, 0); assert.equal(f.state().issues, 0);
  const right = await f.api(request('review', approve({ bookingDate: '2027-02-01', amountCents: 15000 })), env);
  assert.equal(right.status, 200); const state = f.state();
  assert.equal(state.payment.amountCents, 15000); assert.equal(state.payment.quote.amountCents, 9500);
  assert.equal(state.payment.fiscalQuote.amountCents, 15000); assert.equal(state.registration.payment.amountCents, 15000);
  assert.equal(state.audits[0].details.originalAmountCents, 9500);
});

test('supplement approval adds only the purchased entitlements and preserves the primary payment', async () => {
  const f = fixture({ supplementary: true });
  const response = await f.api(request('review', approve({ amountCents: 6500 })), env); assert.equal(response.status, 200);
  const state = f.state(); assert.equal(state.registration.payment.method, 'multibanco'); assert.equal(state.registration.payment.amountCents, 9500);
  assert.equal(state.registration.entitlements.morningCourse, true); assert.equal(state.registration.entitlements.dinnerQuantity, 1);
  assert.deepEqual(state.registration.paidSupplementaryOrderIds, [id]); assert.equal(state.registration.documentCount, 2);
  assert.equal(state.job.orderKind, 'supplementary');
});

test('invalid frozen billing blocks primary and supplemental bank approval before bank lookup, credit claim or fiscal writes', async () => {
  const mutations=[
    customer=>{delete customer.customer_address_detail;},customer=>{delete customer.customer_postcode;},customer=>{delete customer.customer_city;},
    customer=>{customer.customer_business_name=' ';},customer=>{customer.customer_tax_registration_number='203821431';},
    customer=>{customer.customer_tax_registration_number='517072262';},customer=>{customer.customer_address_detail='';},
    customer=>{customer.customer_postcode='3000';},customer=>{customer.customer_city='';},customer=>{customer.customer_country='ES';},
  ];
  for(const supplementary of [false,true])for(const mutate of mutations){
    const f=fixture({supplementary}),customer=structuredClone(billing);mutate(customer);f.changePayment({billingSnapshot:customer});
    const before=structuredClone(f.state());
    const response=await f.api(request('review',approve({amountCents:supplementary?6500:9500})),env);
    assert.equal(response.status,409);const result=await response.json();
    assert.equal(result.error,'billing-customer-unconfirmed');assert.ok(result.issues.length>0);
    assert.doesNotMatch(JSON.stringify(result),/Participante Exemplo|Rua Exemplo|123456789/);
    assert.deepEqual(f.state(),before);assert.equal(f.state().resolutions,0);assert.equal(f.state().commits,0);assert.equal(f.state().issues,0);
    assert.equal(f.state().credit,null);assert.equal(f.state().job,null);
  }
});

test('approval uses the original valid billing snapshot without looking up or substituting current profile billing', async () => {
  const f=fixture(),original=structuredClone(f.state().payment.billingSnapshot);
  f.store.profile=async()=>assert.fail('frozen billing must not be replaced with current profile data');
  const issue=f.fiscalClient.issueFinalizedSalesDocument;
  f.fiscalClient.issueFinalizedSalesDocument=async(env,payload)=>{
    assert.deepEqual(Object.fromEntries(Object.keys(original).map(key=>[key,payload[key]])),original);
    return issue(env,payload);
  };
  assert.equal((await f.api(request(),env)).status,200);
  assert.deepEqual(f.state().payment.billingSnapshot,original);assert.equal(f.state().issues,1);
});

test('stale review, reused credit, invalid date/amount and unconfirmed bank account never mark paid', async () => {
  const cases = [
    [approve({ expectedRevision: 1 }), 409], [approve({ bookingDate: '2026-11-02' }), 400],
    [approve({ bookingDate: '2026-02-30' }), 400], [approve({ amountCents: -1 }), 400],
    [approve({ creditConfirmed: false }), 400], [approve({ bankAccountId: 999 }), 400],
  ];
  for (const [body, status] of cases) {
    const f = fixture(); assert.equal((await f.api(request('review', body), env)).status, status);
    assert.equal(f.state().commits, 0); assert.equal(f.state().issues, 0);
  }
  const reused = fixture(); reused.claimCredit({ orderId: 'other' }); assert.equal((await reused.api(request(), env)).status, 409); assert.equal(reused.state().issues, 0);
  const account = fixture({ resolver: () => ({ id: 999, source: 'bank_accounts', ibanLast4: '1905' }) });
  assert.equal((await account.api(request(), env)).status, 503); assert.equal(account.state().commits, 0);
});

test('only verified admin can approve and an owner cannot report another participant payment', async () => {
  const publicUser = fixture({ claims: { sub: 'person', email: 'person@example.test' } });
  assert.equal((await publicUser.api(request(), env)).status, 403);
  const stranger = fixture({ claims: { sub: 'other', email: 'other@example.test' } });
  assert.equal((await stranger.api(request('report', { id: reportId, expectedRevision: 0 }), env)).status, 404);
  const unverified = fixture({ claims: { email_verified: false } }); assert.equal((await unverified.api(request(), env)).status, 403);
  const f = fixture(); assert.equal((await f.api(request('review', approve(), { origin: 'https://evil.test' }), env)).status, 403);
  assert.equal((await f.api(request('review', approve(), { headers: { Authorization: '' } }), env)).status, 401);
  assert.equal((await f.api(request('review', approve(), { method: 'GET' }), env)).status, 405);
});

test('bounded admin listing is private and exposes participant reports only to the administrator', async () => {
  const f = fixture();
  f.changePayment({ bankTransfer: { ...f.state().payment.bankTransfer, reports: [{ note: 'Observação para conferência', at: '2026-11-01T11:00:00Z' }] } });
  const response = await f.api(request('list', undefined, { method: 'GET' }), env); assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  const data = await response.json(); assert.equal(data.orders[0].ownerName, billing.customer_business_name);
  assert.doesNotMatch(JSON.stringify(data), /customer_tax_registration_number|requestHash/);
  assert.equal(data.orders[0].bankTransfer.reports[0].note,'Observação para conferência');
  assert.equal(data.nextCursor,null);
});

test('concurrent approval requests cannot duplicate the credit claim or fiscal issuance', async () => {
  const f = fixture();
  const responses = await Promise.all([f.api(request(), env), f.api(request(), env)]);
  assert.ok(responses.some(response => response.status === 200));
  assert.ok(responses.every(response => [200, 409].includes(response.status)));
  assert.equal(f.state().commits, 1); assert.equal(f.state().issues, 1);
});

test('a lost response after durable credit confirmation does not retry fiscal posting on duplicate approval', async () => {
  const f = fixture();
  const commit = f.store.confirmBankTransferPaid;
  f.store.confirmBankTransferPaid = async args => { await commit(args); throw new Error('response lost'); };
  const response = await f.api(request(), env); assert.equal(response.status, 503);
  assert.equal(f.state().payment.status, 'paid'); assert.equal(f.state().issues, 0);
  assert.equal(f.state().job.status, 'pending'); assert.equal(f.state().job.issuanceProtocol, 'claimed-v1');
  const duplicate = await f.api(request(), env); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(f.state().issues, 0); assert.equal(f.state().commits, 1);
});

test('a bank credit cannot predate the Lisbon creation day or backdate a regular-rate order into the early tariff', async () => {
  const f = fixture({ currentTime: '2027-02-02T12:00:00Z' });
  f.changePayment({ createdAt: '2027-02-01T10:00:00Z' });
  const response = await f.api(request('review', approve({ bookingDate: '2027-01-31' })), env);
  assert.equal(response.status, 400); assert.equal((await response.json()).error, 'bank-transfer-invalid-credit');
  assert.equal(f.state().commits, 0); assert.equal(f.state().issues, 0);
  const lisbon = fixture({ currentTime: '2026-07-02T12:00:00Z' });
  lisbon.changePayment({ createdAt: '2026-07-01T23:30:00Z' });
  const yesterday = await lisbon.api(request('review', approve({ bookingDate: '2026-07-01' })), env);
  assert.equal(yesterday.status, 400); assert.equal(lisbon.state().commits, 0);
});

test('admin pagination advances through raw scanned rows and exact UUID lookup can recover orders outside the first page', async () => {
  const f = fixture();
  const ids = Array.from({ length: 101 }, (_, index) => `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`);
  let receivedAfter;
  f.store.adminBankTransfers = async ({ after }) => {
    receivedAfter = after;
    return ids.map((rowId,index) => ({ id: rowId, data: { ...f.state().payment, id: rowId, reference: rowId,
      identifier: `circ_live_${rowId.replaceAll('-', '')}`, bankTransfer: { ...f.state().payment.bankTransfer, paymentReference: rowId,
        ...(index===99?{iban:'invalid-iban'}:{}) } } }));
  };
  const page = await f.api(request('list', undefined, { method: 'GET' }), env);
  const result = await page.json(); assert.equal(result.orders.length, 99); assert.equal(result.truncated, true);
  assert.equal(result.nextCursor, ids[99]); assert.equal(receivedAfter, null);
  const next = new Request(`https://circ.test/api/checkout/live/bank-transfers?after=${ids[99]}`, { headers: { Authorization: 'Bearer verified-session' } });
  assert.equal((await f.api(next, env)).status, 200); assert.equal(receivedAfter, ids[99]);
  const direct = new Request(`https://circ.test/api/checkout/live/bank-transfers?orderId=${id}`, { headers: { Authorization: 'Bearer verified-session' } });
  const lookup = await f.api(direct, env); const found = await lookup.json();
  assert.equal(found.orders[0].id,id); assert.equal(found.truncated,false); assert.equal(found.nextCursor,null);
  const invalid = new Request(`https://circ.test/api/checkout/live/bank-transfers?orderId=${id}&after=${id}`, { headers: { Authorization: 'Bearer verified-session' } });
  assert.equal((await f.api(invalid,env)).status,400);
  const attacker = fixture({claims:{email:'person@example.test'}});
  assert.equal((await attacker.api(direct,env)).status,403);
});
