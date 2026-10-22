import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRehearsalPricing, PRICING_POLICY_VERSION } from '../payments/toconline-rehearsal-pricing.mjs';
import { buildToconlineRehearsal, createToconlineRehearsalApi } from '../payments/toconline-rehearsal.mjs';

const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const RID = '57892222-b856-41c9-a519-e2cc97bb3b69';
function order(profile = 'external', date = '2027-01-31', lines = [['congress-onsite', 9500, 1]]) {
  const items = lines.map(([code, unitAmountCents, quantity = 1]) => ({ code, unitAmountCents, quantity, amountCents: unitAmountCents * quantity }));
  const amountCents = items.reduce((sum, line) => sum + line.amountCents, 0);
  return { id: OID, environment: 'sandbox', status: 'confirmed', method: 'bank_transfer', currency: 'EUR', amountCents,
    createdAt: '2027-01-30T10:00:00Z',
    quote: { eventId: 'circ-2027', kind: 'primary', selection: { profile }, ratePeriod: 'early', currency: 'EUR', amountCents, lines: items },
    bankTransfer: { status: 'confirmed', simulated: true, confirmation: { simulated: true, bookingDate: date,
      confirmedAt: '2027-02-03T10:00:00Z', amountCents, currency: 'EUR', creditReference: 'TESTE-REHEARSAL-001' } } };
}
const record = o => ({ id: SID, kind: 'checkout-test', environment: 'sandbox', eventId: 'circ-2027', owner: 'admin', registration: { status: 'confirmed' }, orders: [o] });

test('January credit reviewed in February keeps 95 EUR; February credit requires 150 EUR', () => {
  const early = inspectRehearsalPricing(order());
  assert.equal(early.status, 'matches'); assert.equal(early.expectedCents, 9500);
  assert.equal(early.paymentDate, '2027-01-31');
  for (const date of ['2027-02-01', '2027-02-02']) {
    const late = inspectRehearsalPricing(order('external', date));
    assert.equal(late.status, 'mismatch'); assert.equal(late.paymentPeriod, 'regular');
    assert.equal(late.expectedCents, 15000); assert.equal(late.paidCents, 9500);
    assert.equal(late.differenceCents, 5500); assert.equal(late.simulationBlocked, true);
    assert.equal(late.liveWritesEnabled, false);
  }
});

test('all participant tariffs use the credit date, not the quoted phase', () => {
  for (const [profile, early, regular] of [['uls', 5500, 9000], ['external', 9500, 15000], ['student', 6000, 9500]]) {
    assert.equal(inspectRehearsalPricing(order(profile, '2027-01-31', [['congress-onsite', early]])).status, 'matches');
    const late = order(profile, '2027-02-02', [['congress-onsite', regular]]);
    assert.equal(inspectRehearsalPricing(late).status, 'matches');
    assert.equal(inspectRehearsalPricing(late).quotedPeriod, 'early');
  }
});

test('virtual, courses and separate dinner use existing prices and supplementary orders do not reprice prior registration', () => {
  for (const profile of ['uls', 'external', 'student']) {
    const course = profile === 'uls' ? 2000 : 3500;
    assert.equal(inspectRehearsalPricing(order(profile, '2027-02-02', [['congress-virtual', 6000]])).status, 'matches');
    const extra = order(profile, '2027-02-02', [['course-morning', course], ['course-afternoon', course], ['dinner', 3000, 2]]);
    extra.quote.kind = 'supplementary';
    const c = inspectRehearsalPricing(extra);
    assert.equal(c.status, 'matches'); assert.equal(c.expectedCents, 2 * course + 6000);
    assert.equal(c.lines.some(line => line.code.startsWith('congress')), false);
  }
});

test('225 EUR mixed order preserves fiscal calculation while checking the February commercial shortfall', () => {
  const lines = [['congress-onsite', 9500], ['course-morning', 3500], ['course-afternoon', 3500], ['dinner', 3000, 2]];
  const early = buildToconlineRehearsal(record(order('external', '2027-01-31', lines)), OID, 'invoice_receipt', '2027-02-03');
  assert.equal(early.pricingCheck.status, 'matches'); assert.equal(early.taxPreview.grossCents, 22500);
  assert.equal(early.taxPreview.exemptCents, 15500); assert.equal(early.taxPreview.taxableNetCents, 5692); assert.equal(early.taxPreview.vatCents, 1308);
  const late = buildToconlineRehearsal(record(order('external', '2027-02-02', lines)), OID, 'invoice_receipt', '2027-01-31');
  assert.equal(late.pricingCheck.expectedCents, 28000); assert.equal(late.pricingCheck.differenceCents, 5500);
  assert.equal(late.salesDocument.lines[0].unit_price, 95); assert.equal(late.amountCents, 22500);
  assert.equal(late.pricingCheck.simulationBlocked, true);
});

test('invoice date cannot override payment evidence and no saved data is mutated', () => {
  const r = record(order('external', '2027-02-02'));
  const before = JSON.stringify(r);
  for (const date of ['2027-01-01', '2027-02-03']) {
    const result = buildToconlineRehearsal(r, OID, 'invoice_receipt', date);
    assert.equal(result.pricingCheck.status, 'mismatch'); assert.equal(result.pricingPolicyVersion, PRICING_POLICY_VERSION);
    assert.equal(result.salesDocument.lines[0].unit_price, 95);
  }
  assert.equal(JSON.stringify(r), before);
});

test('missing evidence and unmapped provider timestamps never imply that the tariff was verified', () => {
  for (const method of ['stripe', 'multibanco', 'mbway']) {
    const o = order(); o.method = method; o.notification = { receivedAt: '2027-01-31T23:00:00Z' };
    const c = inspectRehearsalPricing(o);
    assert.equal(c.status, 'unverified'); assert.equal(c.expectedCents, null); assert.equal(c.paymentDate, null);
  }
  const missing = order(); delete missing.bankTransfer.confirmation.bookingDate;
  assert.equal(inspectRehearsalPricing(missing).status, 'unverified');
  const legacy = order(); delete legacy.quote.selection;
  assert.equal(inspectRehearsalPricing(legacy).status, 'unverified');
});

test('invalid evidence, duplicate lines and offsetting price errors fail without hiding behind a correct total', () => {
  for (const mutate of [
    o => { o.bankTransfer.confirmation.bookingDate = '2027-02-30'; },
    o => { o.bankTransfer.confirmation.amountCents = 1; },
    o => { o.bankTransfer.confirmation.simulated = false; },
    o => { o.quote.lines.push(o.quote.lines[0]); },
    o => { o.quote.lines[0].quantity = 0; },
    o => { o.environment = 'production'; },
  ]) { const o = order(); mutate(o); assert.equal(inspectRehearsalPricing(o).simulationBlocked, true); }
  const wrong = order('external', '2027-01-31', [['congress-onsite', 9000], ['course-morning', 4000]]);
  const c = inspectRehearsalPricing(wrong);
  assert.equal(c.differenceCents, 0); assert.equal(c.status, 'mismatch');
});

function fixture(o) {
  let saved = { record: record(o), version: '1' }; let writes = 0;
  const store = { read: async () => structuredClone(saved), replace: async (id, next, version) => {
    if (version !== saved.version) throw Object.assign(new Error('conflict'), { code: 'conflict' });
    writes++; saved = { record: structuredClone(next), version: String(+saved.version + 1) }; return structuredClone(saved);
  } };
  const api = createToconlineRehearsalApi({ verify: async () => ({ sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true }), storeFactory: () => store, now: () => '2027-02-03T10:00:00Z' });
  return { call: (action, body) => api(new Request(`https://circ.local/api/fiscal/sandbox/sessions/${SID}/orders/${OID}/${action}`, {
    method: 'POST', headers: { Authorization: 'Bearer test', Origin: 'https://circ.local', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { FIREBASE_PROJECT_ID: 'circ-coimbra' }), writes: () => writes, current: () => structuredClone(saved.record),
  mutate: fn => { fn(saved.record); saved.version = String(+saved.version + 1); } };
}
const prep = { mode: 'invoice_receipt', date: '2027-01-31', sandboxAcknowledged: true };
const issue = { id: RID, sandboxAcknowledged: true };

test('API refuses an identified late-price mismatch and never calls the provider or alters the payment', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('No network allowed'); });
  const f = fixture(order('external', '2027-02-02'));
  assert.equal((await f.call('prepare', prep)).status, 201);
  const response = await f.call('issue', issue);
  assert.equal(response.status, 409); assert.equal((await response.json()).error, 'payment-tariff-review-required');
  assert.equal(f.writes(), 1); assert.equal(f.current().orders[0].amountCents, 9500);
  assert.equal(f.current().orders[0].status, 'confirmed'); assert.equal(f.current().fiscalRehearsals[0].status, 'prepared');
  assert.equal(calls, 0);
});

test('changed credit date invalidates the preview and old prepared versions must be refreshed', async () => {
  const f = fixture(order()); await f.call('prepare', prep);
  f.mutate(r => { r.orders[0].bankTransfer.confirmation.bookingDate = '2027-02-02'; });
  assert.equal((await (await f.call('issue', issue)).json()).error, 'stale-source');
  const old = fixture(order()); await old.call('prepare', prep);
  old.mutate(r => { delete r.fiscalRehearsals[0].pricingPolicyVersion; });
  assert.equal((await (await old.call('issue', issue)).json()).error, 'stale-tax-policy');
});

test('concurrent issue retries still produce a single internal FR/RC pair', async () => {
  const f = fixture(order()); await f.call('prepare', prep);
  const responses = await Promise.all([f.call('issue', issue), f.call('issue', { ...issue, id: '58a12222-b856-41c9-a519-e2cc97bb3b69' })]);
  const data = await Promise.all(responses.map(r => r.json()));
  assert.equal(new Set(data.map(d => d.rehearsal.simulated.salesDocumentNo)).size, 1);
  assert.equal(f.writes(), 2); assert.equal(data.every(d => d.rehearsal.simulated.providerCallMade === false), true);
});

test('client-supplied booking dates, prices and pricing flags are rejected', async () => {
  for (const override of [{ bookingDate: '2027-01-31' }, { amountCents: 15000 }, { pricingCheck: { status: 'matches' } }]) {
    const f = fixture(order('external', '2027-02-02'));
    assert.equal((await f.call('prepare', { ...prep, ...override })).status, 400); assert.equal(f.writes(), 0);
  }
});
