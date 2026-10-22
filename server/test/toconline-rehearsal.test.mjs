import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToconlineRehearsal, createToconlineRehearsalApi, mapReceiptPaymentMechanism } from '../payments/toconline-rehearsal.mjs';
import { FISCAL_POLICY_VERSION } from '../payments/toconline-rehearsal-tax.mjs';

const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const RID = '57892222-b856-41c9-a519-e2cc97bb3b69';
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra' };
const claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };

function record(method = 'multibanco') {
  return {
    id: SID,
    owner: 'admin',
    kind: 'checkout-test',
    environment: 'sandbox',
    eventId: 'circ-2027',
    createdAt: '2026-10-17T09:00:00Z',
    registration: {
      status: 'confirmed',
      selection: { profile: 'external' },
      entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 },
    },
    orders: [{
      id: OID,
      environment: 'sandbox',
      method,
      status: 'confirmed',
      amountCents: 16000,
      currency: 'EUR',
      createdAt: '2026-10-17T09:01:00Z',
      reference: method === 'multibanco' ? '405999' : null,
      notification: method === 'multibanco' || method === 'mbway' ? { transactionId: '29759999' } : null,
      bankTransfer: method === 'bank_transfer' ? { confirmation: { creditReference: 'TESTE-CIRC-01' } } : null,
      quote: {
        eventId: 'circ-2027',
        kind: 'primary',
        amountCents: 16000,
        currency: 'EUR',
        lines: [
          { code: 'congress-onsite', quantity: 1, unitAmountCents: 9500, amountCents: 9500 },
          { code: 'course-morning', quantity: 1, unitAmountCents: 3500, amountCents: 3500 },
          { code: 'dinner', quantity: 1, unitAmountCents: 3000, amountCents: 3000 },
        ],
      },
    }],
  };
}

test('payment mechanism mapping uses documented receipt codes and flags MB WAY for confirmation', () => {
  assert.deepEqual(mapReceiptPaymentMechanism('multibanco'), { code: 'MB', label: 'Referência Multibanco', blocker: null });
  assert.deepEqual(mapReceiptPaymentMechanism('bank_transfer'), { code: 'TR', label: 'Transferência bancária', blocker: null });
  assert.deepEqual(mapReceiptPaymentMechanism('stripe'), { code: 'CC', label: 'Cartão', blocker: null });
  assert.equal(mapReceiptPaymentMechanism('mbway').code, null);
  assert.equal(mapReceiptPaymentMechanism('mbway').blocker, 'mbway-payment-mechanism-required');
});

test('invoice plus receipt preview preserves totals, uses M07 and does not reuse the FR series for an FT', () => {
  const r = buildToconlineRehearsal(record(), OID, 'invoice_plus_receipt', '2026-10-17');
  assert.equal(r.liveWritesEnabled, false);
  assert.equal(r.salesDocument.document_type, 'FT');
  assert.equal(r.salesDocument.payment_mechanism, 'MB');
  assert.equal(r.receipt.payment_mechanism, 'MB');
  assert.equal(r.receipt.lines[0].received_value, 160);
  assert.equal(r.salesDocument.lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0), 160);
  assert.equal(r.salesDocument.customer_tax_registration_number, '000000000');
  assert.ok(r.blockers.includes('vat-or-exemption-configuration-required'));
  assert.ok(r.blockers.includes('document-series-required'));
  assert.equal(r.salesDocument.document_series_id, undefined);
  assert.equal(r.salesDocument.tax_exemption_reason_id, 9);
  assert.equal(r.salesDocument.lines[0].tax_code, 'ISE');
  assert.equal(r.salesDocument.lines[1].tax_percentage, 23);
  assert.equal(r.salesDocument.lines[2].tax_code, 'ISE');
  assert.equal(r.taxPreview.complete, true);
});

test('invoice-receipt preview reflects TOConline automatic receipt behaviour', () => {
  const r = buildToconlineRehearsal(record('bank_transfer'), OID, 'invoice_receipt', '2026-10-17');
  assert.equal(r.salesDocument.document_type, 'FR');
  assert.equal(r.salesDocument.document_series_id, 244);
  assert.equal(r.salesDocument.payment_mechanism, 'TR');
  assert.equal(r.receipt, null);
  assert.ok(r.warnings.includes('fr-auto-creates-associated-receipt'));
  assert.ok(r.warnings.includes('bank-account-mapping-may-be-required'));
});

test('MB WAY preview refuses to invent a TOConline receipt mechanism code', () => {
  const r = buildToconlineRehearsal(record('mbway'), OID, 'invoice_plus_receipt', '2026-10-17');
  assert.equal(r.salesDocument.payment_mechanism, undefined);
  assert.equal(r.receipt.payment_mechanism, undefined);
  assert.ok(r.blockers.includes('mbway-payment-mechanism-required'));
});

test('unpaid, malformed and inconsistent source orders fail closed', () => {
  const unpaid = record(); unpaid.orders[0].status = 'pending';
  assert.throws(() => buildToconlineRehearsal(unpaid, OID, 'invoice_plus_receipt', '2026-10-17'), /paid-test-required/);
  const mismatch = record(); mismatch.orders[0].amountCents = 15900;
  assert.throws(() => buildToconlineRehearsal(mismatch, OID, 'invoice_plus_receipt', '2026-10-17'), /source-mismatch|paid-test-required/);
  assert.throws(() => buildToconlineRehearsal(record(), OID, 'wrong', '2026-10-17'), /invalid-mode/);
  assert.throws(() => buildToconlineRehearsal(record(), OID, 'invoice_plus_receipt', '2026-02-30'), /invalid-date/);
  const badUnit = record(); badUnit.orders[0].quote.lines[0].unitAmountCents = 5500;
  assert.throws(() => buildToconlineRehearsal(badUnit, OID, 'invoice_receipt', '2026-10-20'), /source-mismatch/);
  const live = record(); live.environment = 'production';
  assert.throws(() => buildToconlineRehearsal(live, OID, 'invoice_receipt', '2026-10-20'), /paid-test-required/);
});

function fixture() {
  let saved = { record: record(), version: '1' };
  let writes = 0;
  let identity = claims;
  const store = {
    read: async id => id === SID ? structuredClone(saved) : null,
    replace: async (id, next, version) => {
      assert.equal(id, SID);
      if (version !== saved.version) throw Object.assign(new Error('conflict'), { code: 'conflict' });
      writes += 1;
      saved = { record: structuredClone(next), version: String(Number(saved.version) + 1) };
      return structuredClone(saved);
    },
  };
  const api = createToconlineRehearsalApi({
    verify: async () => identity,
    storeFactory: ({ uid, projectId, token }) => {
      assert.equal(uid, 'admin'); assert.equal(projectId, 'circ-coimbra'); assert.equal(token, 'token');
      return store;
    },
    now: () => '2026-10-17T10:00:00Z',
  });
  const request = (path, body, headers = {}) => new Request(`https://circ.local/api/fiscal/sandbox/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: 'Bearer token',
      Origin: 'https://circ.local',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    call: (path, body, headers) => api(request(path, body, headers), env),
    record: () => structuredClone(saved.record),
    writes: () => writes,
    mutateSource: fn => { fn(saved.record); saved.version = String(Number(saved.version) + 1); },
    setIdentity: value => { identity = value; },
  };
}

test('config explicitly reports that live TOConline writes are disabled', async () => {
  const f = fixture();
  const response = await f.call('config');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.provider, 'toconline');
  assert.equal(data.liveWritesEnabled, false);
  assert.equal(data.scopeRequired, 'commercial');
  assert.equal(data.fiscalPolicyVersion, FISCAL_POLICY_VERSION);
});

test('confirmed checkout orders are exposed without private fingerprints or credentials', async () => {
  const f = fixture();
  const response = await f.call(`sessions/${SID}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.session.orders[0].amountCents, 16000);
  assert.equal(data.session.orders[0].transaction, '29759999');
  assert.equal(data.session.orders[0].rehearsal, null);
  assert.ok(!JSON.stringify(data).includes('token'));
});

test('prepare and simulated issue persist exactly once without external fiscal effect', async () => {
  const f = fixture();
  const prepare = await f.call(`sessions/${SID}/orders/${OID}/prepare`, {
    mode: 'invoice_plus_receipt', date: '2026-10-17', sandboxAcknowledged: true,
  });
  assert.equal(prepare.status, 201);
  let r = (await prepare.json()).rehearsal;
  assert.equal(r.status, 'prepared');
  assert.equal(r.liveWritesEnabled, false);
  assert.equal(f.writes(), 1);

  const issue = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  assert.equal(issue.status, 200);
  r = (await issue.json()).rehearsal;
  assert.equal(r.status, 'simulated-issued');
  assert.equal(r.simulated.fiscalEffect, false);
  assert.equal(r.simulated.providerCallMade, false);
  assert.match(r.simulated.salesDocumentNo, /^FT TESTE\//);
  assert.match(r.simulated.receiptNo, /^RC TESTE\//);
  assert.equal(f.writes(), 2);

  const duplicate = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: '58a12222-b856-41c9-a519-e2cc97bb3b69', sandboxAcknowledged: true });
  assert.equal(duplicate.status, 200);
  const d = await duplicate.json();
  assert.equal(d.duplicate, true);
  assert.equal(f.writes(), 2);
});

test('source mutation after preparation blocks simulated issue and preserves the draft', async () => {
  const f = fixture();
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, {
    mode: 'invoice_plus_receipt', date: '2026-10-17', sandboxAcknowledged: true,
  });
  f.mutateSource(r => { r.orders[0].notification.transactionId = 'DIFFERENT'; });
  const issue = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  assert.equal(issue.status, 409);
  assert.equal((await issue.json()).error, 'stale-source');
  assert.equal(f.record().fiscalRehearsals[0].status, 'prepared');
});

test('reset removes only the fiscal rehearsal, not the paid checkout order or registration', async () => {
  const f = fixture();
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, {
    mode: 'invoice_receipt', date: '2026-10-17', sandboxAcknowledged: true,
  });
  const response = await f.call(`sessions/${SID}/orders/${OID}/reset`, { sandboxAcknowledged: true });
  assert.equal(response.status, 200);
  const r = f.record();
  assert.equal(r.fiscalRehearsals.length, 0);
  assert.equal(r.orders[0].status, 'confirmed');
  assert.equal(r.registration.status, 'confirmed');
});

test('authentication, verified administrator and same-origin writes are mandatory', async () => {
  const f = fixture();
  f.setIdentity({ ...claims, email: 'participant@example.test' });
  assert.equal((await f.call('config')).status, 403);
  f.setIdentity(claims);
  assert.equal((await f.call(`sessions/${SID}/orders/${OID}/prepare`, {
    mode: 'invoice_plus_receipt', date: '2026-10-17', sandboxAcknowledged: true,
  }, { Origin: 'https://evil.invalid' })).status, 403);

  const response = await f.call(`sessions/${SID}/orders/${OID}/prepare`, {
    mode: 'invoice_plus_receipt', date: '2026-10-17', sandboxAcknowledged: false,
  });
  assert.equal(response.status, 400);
  assert.equal(f.writes(), 0);
});

function withLines(inputLines) {
  const r = record('bank_transfer');
  const lines = inputLines.map(([code, unitAmountCents, quantity = 1]) => ({ code, unitAmountCents, quantity, amountCents: unitAmountCents * quantity }));
  const amount = lines.reduce((sum, line) => sum + line.amountCents, 0);
  Object.assign(r.orders[0], { amountCents: amount, quote: { ...r.orders[0].quote, amountCents: amount, lines } });
  return r;
}

test('all onsite price tiers and virtual registration preserve gross amounts with ISE/M07', () => {
  for (const [code, amount, id] of [
    ['congress-onsite', 5500, 55], ['congress-onsite', 9500, 55], ['congress-onsite', 6000, 55],
    ['congress-onsite', 9000, 55], ['congress-onsite', 15000, 55], ['congress-virtual', 6000, 56],
  ]) {
    const r = buildToconlineRehearsal(withLines([[code, amount]]), OID, 'invoice_receipt', '2026-10-20');
    assert.equal(r.salesDocument.document_series_id, 244);
    assert.equal(r.salesDocument.tax_exemption_reason_id, 9);
    const line = r.salesDocument.lines[0];
    assert.equal(line.item_id, id);
    assert.equal(line.unit_price, amount / 100);
    assert.equal(line.tax_code, 'ISE');
    assert.equal(line.tax_percentage, 0);
    assert.equal(line.tax_country_region, 'PT');
    assert.equal(line.tax_exemption_reason_id, undefined);
    assert.equal(r.taxPreview.complete, true);
    assert.equal(r.taxPreview.netCents, amount);
    assert.equal(r.taxPreview.vatCents, 0);
    assert.equal(r.taxPreview.grossCents, amount);
    assert.equal(r.taxPreview.providerValidated, false);
    assert.equal(r.liveWritesEnabled, false);
  }
});

test('mixed exempt registration and taxable course retain each line treatment and exact totals', () => {
  const r = buildToconlineRehearsal(withLines([['congress-onsite', 9500], ['course-morning', 3500]]), OID, 'invoice_receipt', '2026-10-20');
  assert.deepEqual(r.salesDocument.lines.map(line => line.tax_code), ['ISE', 'NOR']);
  assert.equal(r.taxPreview.netCents, 12346);
  assert.equal(r.taxPreview.vatCents, 654);
  assert.equal(r.taxPreview.grossCents, 13000);
  assert.equal(r.blockers.includes('course-tax-clarification-pending'), false);
  const courses = buildToconlineRehearsal(withLines([['course-morning', 2000], ['course-afternoon', 3500]]), OID, 'invoice_receipt', '2026-10-20');
  assert.equal(courses.salesDocument.tax_exemption_reason_id, undefined);
  assert.equal(courses.taxPreview.netCents + courses.taxPreview.vatCents, 5500);
});

test('225 EUR four-line example includes exempt standalone dinners and only course VAT', () => {
  const r = buildToconlineRehearsal(withLines([['congress-onsite', 9500], ['course-morning', 3500], ['course-afternoon', 3500], ['dinner', 3000, 2]]), OID, 'invoice_receipt', '2026-10-22');
  assert.equal(r.amountCents, 22500);
  assert.equal(r.salesDocument.lines.length, 4);
  assert.equal(r.salesDocument.lines[3].quantity, 2);
  assert.equal(r.salesDocument.lines[3].unit_price, 30);
  assert.equal(r.salesDocument.lines[3].item_id, 59);
  assert.equal(r.salesDocument.lines[3].item_code, 'CIRC27-JANTAR');
  assert.equal(r.salesDocument.lines[3].tax_code, 'ISE');
  assert.equal(r.salesDocument.lines[3].tax_percentage, 0);
  assert.equal(r.salesDocument.tax_exemption_reason_id, 9);
  assert.equal(r.salesDocument.vat_included_prices, true);
  assert.equal(r.taxPreview.complete, true);
  assert.equal(r.taxPreview.exemptCents, 15500);
  assert.equal(r.taxPreview.taxableNetCents, 5692);
  assert.equal(r.taxPreview.netCents, 21192);
  assert.equal(r.taxPreview.vatCents, 1308);
  assert.equal(r.taxPreview.grossCents, 22500);
  assert.equal(r.blockers.includes('dinner-tax-treatment-required'), false);
  assert.equal(r.liveWritesEnabled, false);
  assert.equal(r.taxPreview.providerValidated, false);
});

test('stale prepared tax policy is rejected until explicitly refreshed', async () => {
  const f = fixture();
  const body = { mode: 'invoice_receipt', date: '2026-10-20', sandboxAcknowledged: true };
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, body);
  f.mutateSource(r => { delete r.fiscalRehearsals[0].fiscalPolicyVersion; });
  const rejected = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error, 'stale-tax-policy');
  assert.equal(f.writes(), 1);
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, body);
  const issued = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  assert.equal(issued.status, 200);
});

test('old simulated documents remain historical and duplicate retries do not reissue or rewrite them', async () => {
  const f = fixture();
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, { mode: 'invoice_receipt', date: '2026-10-20', sandboxAcknowledged: true });
  await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  f.mutateSource(r => { delete r.fiscalRehearsals[0].fiscalPolicyVersion; });
  const duplicate = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(f.writes(), 2);
  assert.equal(f.record().fiscalRehearsals[0].fiscalPolicyVersion, undefined);
});

test('concurrent retries create one simulated document and no network requests', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Network must not be used'); });
  const f = fixture();
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, { mode: 'invoice_receipt', date: '2026-10-20', sandboxAcknowledged: true });
  const results = await Promise.all([RID, '58a12222-b856-41c9-a519-e2cc97bb3b69'].map(id => f.call(`sessions/${SID}/orders/${OID}/issue`, { id, sandboxAcknowledged: true })));
  const data = await Promise.all(results.map(response => response.json()));
  assert.equal(new Set(data.map(d => d.rehearsal.simulated.salesDocumentNo)).size, 1);
  assert.equal(f.writes(), 2);
  assert.equal(calls, 0);
});

test('browser cannot override tax policy, price, real-write flags or provider payload', async () => {
  for (const extra of [{ liveWritesEnabled: true }, { tax_exemption_reason_id: 18 }, { amountCents: 1 }, { salesDocument: {} }]) {
    const f = fixture();
    const response = await f.call(`sessions/${SID}/orders/${OID}/prepare`, { mode: 'invoice_receipt', date: '2026-10-20', sandboxAcknowledged: true, ...extra });
    assert.equal(response.status, 400);
    assert.equal(f.writes(), 0);
  }
});

test('standalone and supplementary dinner orders preserve quantities without requiring a congress bundle', () => {
  for (const quantity of [1, 2, 5]) {
    const source = withLines([['dinner', 3000, quantity]]);
    source.orders[0].quote.kind = 'addon';
    const before = structuredClone(source);
    const r = buildToconlineRehearsal(source, OID, 'invoice_receipt', '2026-10-22');
    assert.deepEqual(source, before);
    assert.equal(r.salesDocument.lines.length, 1);
    assert.equal(r.salesDocument.lines[0].item_id, 59);
    assert.equal(r.salesDocument.lines[0].tax_code, 'ISE');
    assert.equal(r.salesDocument.lines[0].quantity, quantity);
    assert.equal(r.salesDocument.tax_exemption_reason_id, 9);
    assert.equal(r.taxPreview.exemptCents, 3000 * quantity);
    assert.equal(r.taxPreview.taxableNetCents, 0);
    assert.equal(r.taxPreview.vatCents, 0);
    assert.equal(r.taxPreview.grossCents, 3000 * quantity);
    assert.equal(r.liveWritesEnabled, false);
  }
});

test('two 35 EUR courses have 13.08 EUR VAT without an exemption header', () => {
  const r = buildToconlineRehearsal(withLines([['course-morning', 3500], ['course-afternoon', 3500]]), OID, 'invoice_receipt', '2026-10-22');
  assert.equal(r.salesDocument.tax_exemption_reason_id, undefined);
  assert.equal(r.taxPreview.exemptCents, 0);
  assert.equal(r.taxPreview.taxableNetCents, 5692);
  assert.equal(r.taxPreview.vatCents, 1308);
  assert.equal(r.taxPreview.grossCents, 7000);
});

test('the preceding M07 revision cannot be reissued as if it contained the new dinner policy', async () => {
  const f = fixture();
  const body = { mode: 'invoice_receipt', date: '2026-10-22', sandboxAcknowledged: true };
  await f.call(`sessions/${SID}/orders/${OID}/prepare`, body);
  f.mutateSource(r => { r.fiscalRehearsals[0].fiscalPolicyVersion = 'circ2027-m07-20261020'; });
  const rejected = await f.call(`sessions/${SID}/orders/${OID}/issue`, { id: RID, sandboxAcknowledged: true });
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error, 'stale-tax-policy');
  assert.equal(f.writes(), 1);
});
