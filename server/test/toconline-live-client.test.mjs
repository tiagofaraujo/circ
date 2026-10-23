import test from 'node:test';
import assert from 'node:assert/strict';
import { createToconlineLiveClient } from '../payments/toconline-live-client.mjs';

const env = {
  TOCONLINE_API_URL: 'https://api.example.test/api',
  TOCONLINE_OAUTH_URL: 'https://oauth.example.test/oauth',
  TOCONLINE_OAUTH_CLIENT_ID: 'client',
  TOCONLINE_OAUTH_CLIENT_SECRET: 'secret',
};
const payload = {
  document_type: 'FR',
  document_series_id: 244,
  date: '2026-11-15',
  due_date: '2026-11-15',
  currency_iso_code: 'EUR',
  customer_business_name: 'Pessoa Teste',
  external_reference: 'CIRC27-ORDER-ABCDEF12',
  payment_mechanism: 'MB',
  vat_included_prices: true,
  lines: [{ item_type: 'Service', item_id: 55, description: 'Inscrição', quantity: 1, unit_price: 95, tax_code: 'ISE', tax_percentage: 0, tax_country_region: 'PT' }],
  tax_exemption_reason_id: 9,
};

test('live client performs one finalizing POST and accepts success', async () => {
  const calls = [];
  const store = {
    load: async () => ({ session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now()+600000, refreshExpiresAt: Date.now()+3600000 } }),
    save: async () => assert.fail('no refresh expected'),
  };
  const client = createToconlineLiveClient({
    sessionStore: store,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ id: 321, document_no: 'FR CIRC2027/1' });
    },
    now: () => 1000,
  });
  const result = await client.issueFinalizedSalesDocument(env, payload);
  assert.equal(result.accepted, true);
  assert.equal(result.providerDocumentId, 321);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.ok(calls[0].url.endsWith('/api/v1/commercial_sales_documents'));
});

test('network ambiguity is never retried automatically', async () => {
  let calls = 0;
  const client = createToconlineLiveClient({
    sessionStore: { load: async () => ({ session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: 999999, refreshExpiresAt: 9999999 } }) },
    fetchImpl: async () => { calls++; throw new Error('network'); },
    now: () => 1000,
  });
  await assert.rejects(client.issueFinalizedSalesDocument(env, payload), error => {
    assert.equal(error.code, 'toconline-live-outcome-unknown');
    assert.equal(error.uncertain, true);
    return true;
  });
  assert.equal(calls, 1);
});

test('401 refreshes once, then retries exactly once', async () => {
  const calls = [];
  let saved = 0;
  const client = createToconlineLiveClient({
    sessionStore: {
      load: async () => ({ session: { accessToken: 'old', refreshToken: 'refresh', expiresAt: 999999, refreshExpiresAt: 9999999 } }),
      save: async () => { saved++; },
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/v1/commercial_sales_documents') && calls.filter(x => x.url.endsWith('/v1/commercial_sales_documents')).length === 1) return new Response(null,{status:401});
      if (url.endsWith('/token')) return Response.json({ access_token:'new', expires_in:3600, token_type:'Bearer' });
      return new Response(null,{status:200});
    },
    now: () => 1000,
  });
  const result = await client.issueFinalizedSalesDocument(env, payload);
  assert.equal(result.accepted, true);
  assert.equal(saved, 1);
  assert.equal(calls.filter(x => x.url.endsWith('/v1/commercial_sales_documents')).length, 2);
});
