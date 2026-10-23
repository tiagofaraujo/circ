import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToconlineRehearsal } from '../payments/toconline-rehearsal.mjs';
import { createToconlineDraftAcceptanceApi } from '../payments/toconline-draft-acceptance.mjs';

const SID = 'ce7fcfd4-baf7-4d4e-9893-d4dd2a0c4e49';
const OID = 'af91d4b0-d844-4a37-a71e-05f939a04f83';
const env = { FIREBASE_PROJECT_ID: 'circ-coimbra' };
const claims = { sub: 'admin', email: 'circ.chuc@gmail.com', email_verified: true };

function sourceRecord(amountCents = 9500) {
  const line = amountCents === 9500
    ? [{ code: 'congress-onsite', quantity: 1, unitAmountCents: 9500, amountCents: 9500 }]
    : [
      { code: 'congress-onsite', quantity: 1, unitAmountCents: 9500, amountCents: 9500 },
      { code: 'course-morning', quantity: 1, unitAmountCents: 3500, amountCents: 3500 },
    ];
  const record = {
    id: SID,
    owner: 'admin',
    kind: 'checkout-test',
    environment: 'sandbox',
    eventId: 'circ-2027',
    registration: {
      status: 'confirmed',
      selection: { profile: 'external' },
      entitlements: { congressMode: 'onsite', morningCourse: amountCents !== 9500, afternoonCourse: false, dinnerQuantity: 0 },
    },
    orders: [{
      id: OID,
      environment: 'sandbox',
      method: 'bank_transfer',
      status: 'confirmed',
      amountCents,
      currency: 'EUR',
      createdAt: '2026-10-23T17:58:04Z',
      quote: {
        eventId: 'circ-2027',
        kind: 'primary',
        amountCents,
        currency: 'EUR',
        ratePeriod: 'early',
        selection: { profile: 'external', congressMode: 'onsite', morningCourse: amountCents !== 9500, afternoonCourse: false, dinnerQuantity: 0 },
        lines: line,
      },
      bankTransfer: {
        status: 'confirmed',
        confirmation: {
          simulated: true,
          bookingDate: '2026-10-23',
          amountCents,
          currency: 'EUR',
          creditReference: 'TESTE-CIRC-95',
        },
      },
    }],
  };
  const draft = buildToconlineRehearsal(record, OID, 'invoice_receipt', '2026-10-23');
  record.fiscalRehearsals = [{
    ...draft,
    status: 'simulated-issued',
    simulated: { salesDocumentNo: 'FR TESTE/E0962ABC10', salesDocumentId: 'TEST-DOC-E0962ABC10' },
  }];
  return record;
}

function fixture({ amountCents = 9500, finalized = false } = {}) {
  const record = sourceRecord(amountCents);
  const calls = [];
  const store = {
    read: async id => id === SID ? { record: structuredClone(record), version: '1' } : null,
    billingProfile: async () => ({ data: {
      name: 'Particular Teste',
      taxNumber: '203821432',
      billingAddress: 'Rua Teste, 1',
      billingPostalCode: '3030-471',
      billingCity: 'Coimbra',
      billingCountry: 'Portugal',
    } }),
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body || null });
    if (url.endsWith('/api/commercial_sales_documents') && options.method === 'POST') {
      return Response.json({ data: { type: 'commercial_sales_documents', id: '77', attributes: { status: finalized ? 1 : 0, document_type: 'FR' } } });
    }
    if (url.endsWith('/api/commercial_sales_document_lines') && options.method === 'POST') {
      return Response.json({ data: { type: 'commercial_sales_document_lines', id: '88', attributes: { tax_code: 'ISE', tax_percentage: 0, exemption_reason: 'M07' } } });
    }
    if (options.method === 'DELETE') return Response.json({ meta: { observed: { scalar: 1 } } });
    return new Response(null, { status: 404 });
  };
  const api = createToconlineDraftAcceptanceApi({
    verify: async () => claims,
    storeFactory: ({ uid, projectId, token }) => {
      assert.equal(uid, 'admin'); assert.equal(projectId, 'circ-coimbra'); assert.equal(token, 'token'); return store;
    },
    sessionRunner: async (request, runtimeEnv, nowMs, operation) => ({
      value: await operation('https://api.example.test/api/v1', 'toc-token'),
      setCookie: null,
    }),
    fetchImpl,
    now: () => '2026-10-23T19:10:00Z',
  });
  const request = (body = { confirmation: 'TESTAR API SEM FINALIZAR' }) => new Request(
    `https://circ.local/api/fiscal/toconline/draft-test/sessions/${SID}/orders/${OID}`,
    { method: 'POST', headers: { Authorization: 'Bearer token', Origin: 'https://circ.local', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  return { call: body => api(request(body), env), calls };
}

test('95 EUR draft acceptance creates header and line then deletes both without finalization', async () => {
  const f = fixture();
  const response = await f.call();
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const data = await response.json();
  assert.equal(data.test.finalized, false);
  assert.equal(data.test.fiscalDocumentIssued, false);
  assert.equal(data.test.headerAccepted, true);
  assert.equal(data.test.lineAccepted, true);
  assert.equal(data.test.returnedTaxCode, 'ISE');
  assert.equal(data.test.returnedExemptionReason, 'M07');
  assert.deepEqual(f.calls.map(call => call.method), ['POST', 'POST', 'DELETE', 'DELETE']);
  assert.ok(f.calls.every(call => !call.url.includes('/v1/')));
  assert.ok(f.calls.every(call => call.method !== 'PATCH'));
  const header = JSON.parse(f.calls[0].body);
  assert.equal(header.data.attributes.document_type, 'FR');
  assert.equal(header.data.attributes.document_series_prefix, 'CIRC2027');
  assert.equal(header.data.attributes.customer_tax_registration_number, '203821432');
  const line = JSON.parse(f.calls[1].body);
  assert.equal(line.data.attributes.item_id, 55);
  assert.equal(line.data.attributes.unit_price, 95);
});

test('first real API draft test is restricted to the simple 95 EUR order', async () => {
  const f = fixture({ amountCents: 13000 });
  const response = await f.call();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'first-test-scope-only');
  assert.equal(f.calls.length, 0);
});

test('explicit confirmation is required before any provider call', async () => {
  const f = fixture();
  const response = await f.call({ confirmation: 'NO' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'confirmation-required');
  assert.equal(f.calls.length, 0);
});

test('unexpected provider finalization is treated as a hard failure and no line is created', async () => {
  const f = fixture({ finalized: true });
  const response = await f.call();
  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.error, 'toconline-draft-unexpectedly-finalized');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 0);
  assert.equal(f.calls.filter(call => call.method === 'DELETE').length, 1);
});
