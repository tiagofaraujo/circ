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
      return Response.json({ id: 322, document_no: 'FR CIRC2027/2' });
    },
    now: () => 1000,
  });
  const result = await client.issueFinalizedSalesDocument(env, payload);
  assert.equal(result.accepted, true);
  assert.equal(result.providerDocumentId, 322);
  assert.equal(saved, 1);
  assert.equal(calls.filter(x => x.url.endsWith('/v1/commercial_sales_documents')).length, 2);
});

function responseClient(responseFactory) {
  let calls = 0;
  const client = createToconlineLiveClient({
    sessionStore: {
      load: async () => ({ session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: 999999, refreshExpiresAt: 9999999 } }),
    },
    fetchImpl: async () => { calls++; return responseFactory(); },
    now: () => 1000,
  });
  return { client, calls: () => calls };
}

test('JSON:API creation response preserves the provider document identity and number', async () => {
  const f = responseClient(() => Response.json({ data: { id: '323', attributes: { document_no: 'FR CIRC2027/3' } } }, { status: 201 }));
  const result = await f.client.issueFinalizedSalesDocument(env, payload);
  assert.equal(result.providerDocumentId, '323');
  assert.equal(result.providerDocumentNo, 'FR CIRC2027/3');
  assert.equal(result.finalized, true);
  assert.equal(f.calls(), 1);
});

const ambiguousResponses = [
  ['empty HTTP 200', () => new Response(null, { status: 200 })],
  ['HTML HTTP 200', () => new Response('<html>Proxy page</html>', { status: 200 })],
  ['missing document ID', () => Response.json({ success: true })],
  ['null document ID', () => Response.json({ id: null })],
  ['empty document ID', () => Response.json({ id: ' ' })],
  ['invalid numeric document ID', () => Response.json({ id: 0 })],
  ['error response with HTTP 200', () => Response.json({ id: 324, errors: [{ title: 'Rejected' }] })],
  ['asynchronous HTTP 202', () => Response.json({ id: 325 }, { status: 202 })],
  ['body read failure', () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection closed')); } }), { status: 200 })],
];

for (const [name, responseFactory] of ambiguousResponses) {
  test(`${name} is uncertain and never triggers another finalizing POST`, async () => {
    const f = responseClient(responseFactory);
    await assert.rejects(f.client.issueFinalizedSalesDocument(env, payload), error => {
      assert.equal(error.code, 'toconline-live-outcome-unknown');
      assert.equal(error.uncertain, true);
      return true;
    });
    assert.equal(f.calls(), 1);
  });
}

const bankIban = 'PT50000000000000000001905';
const bankRow = (id = '77', iban = bankIban) => ({
  id, type: 'company_bank_accounts', attributes: { iban, name: 'Synthetic bank account', is_connected: false },
});
function bankClient(reply, overrides = {}) {
  const calls = [];
  const saved = [];
  let loads = 0;
  const session = {
    accessToken: 'bank-access', refreshToken: 'bank-refresh', expiresAt: 999999, refreshExpiresAt: 9999999,
    ...overrides.session,
  };
  const client = createToconlineLiveClient({
    sessionStore: {
      load: async () => { loads++; return overrides.missingSession ? null : { session }; },
      save: async (_env, value) => { saved.push(value); },
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      // No billing lookup test may issue or change a commercial document.
      assert.ok(options.method === 'GET' || (options.method === 'POST' && url.endsWith('/oauth/token')));
      assert.ok(!url.includes('commercial_sales_documents'));
      return reply(url, options, calls);
    },
    now: () => 1000,
  });
  return { client, calls, saved, loads: () => loads };
}

test('billing bank resolver uses only the filtered company resource and returns a minimal numeric identity', async () => {
  const f = bankClient(async () => Response.json({ data: [bankRow()] }));
  const formatted = bankIban.toLowerCase().match(/.{1,4}/g).join(' ');
  const account = await f.client.resolveBillingBankAccount(env, formatted);
  assert.deepEqual(account, { id: 77, ibanLast4: '1905', source: 'company_bank_accounts' });
  assert.equal(f.calls.length, 1);
  const { url, options } = f.calls[0];
  const requestUrl = new URL(url);
  assert.equal(requestUrl.pathname, '/api/company_bank_accounts');
  assert.equal(requestUrl.searchParams.get('filter[iban]'), bankIban);
  assert.equal(requestUrl.searchParams.get('page[size]'), '2');
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.headers.Authorization, 'Bearer bank-access');
  assert.equal(options.body, undefined);
  assert.ok(!JSON.stringify(account).includes(bankIban));
  assert.ok(!JSON.stringify(account).includes('Synthetic bank account'));
  assert.equal(f.saved.length, 0);
});

test('billing bank resolver refuses invalid IBAN before loading a session or calling a provider', async () => {
  for (const iban of ['', undefined, '1905', 'https://other.test/private']) {
    const f = bankClient(() => assert.fail('no provider request expected'));
    await assert.rejects(f.client.resolveBillingBankAccount(env, iban), { code: 'billing-bank-unconfirmed' });
    assert.equal(f.loads(), 0);
    assert.equal(f.calls.length, 0);
  }
});

const unconfirmedBankResponses = [
  ['no matches', () => Response.json({ data: [] })],
  ['multiple matches', () => Response.json({ data: [bankRow(), bankRow('78')] })],
  ['different full IBAN with same suffix', () => Response.json({ data: [bankRow('77', 'PT50000100000000000001905')] })],
  ['inactive account', () => Response.json({ data: [{ ...bankRow(), attributes: { iban: bankIban, is_active: false } }] })],
  ['non-numeric ID', () => Response.json({ data: [bankRow('no-id')] })],
  ['unsafe numeric ID', () => Response.json({ data: [bankRow('9007199254740992')] })],
  ['missing attributes', () => Response.json({ data: [{ id: '77' }] })],
  ['non-array data', () => Response.json({ data: bankRow() })],
  ['missing data', () => Response.json({ accounts: [bankRow()] })],
  ['unexpected pagination', () => Response.json({ data: [bankRow()], links: { next: 'https://api.example.test/api/company_bank_accounts?page=2' } })],
  ['provider error in success response', () => Response.json({ data: [bankRow()], errors: [{ detail: 'private information' }] })],
  ['invalid JSON', () => new Response('<html>not JSON</html>')],
  ['HTTP403', () => new Response(null, { status: 403 })],
  ['HTTP404', () => new Response(null, { status: 404 })],
  ['HTTP500', () => new Response(null, { status: 500 })],
  ['redirect', () => new Response(null, { status: 302, headers: { Location: 'https://other.test' } })],
  ['network failure', () => { throw new Error('secret response'); }],
];
for (const [name, reply] of unconfirmedBankResponses) {
  test(`billing bank resolver fails closed on ${name} without falling back or issuing`, async () => {
    const f = bankClient(reply);
    await assert.rejects(f.client.resolveBillingBankAccount(env, bankIban), error => {
      assert.equal(error.code, 'billing-bank-unconfirmed');
      assert.equal(error.message, 'billing-bank-unconfirmed');
      assert.equal(error.uncertain, false);
      return true;
    });
    assert.equal(f.calls.length, 1);
    assert.equal(f.saved.length, 0);
  });
}

test('billing bank resolver refreshes a rejected access token once and repeats the same GET', async () => {
  let reads = 0;
  const f = bankClient(async (url, options) => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'bank-renewed', expires_in: 3600 });
    reads++;
    if (reads === 1) return new Response(null, { status: 401 });
    assert.equal(options.headers.Authorization, 'Bearer bank-renewed');
    return Response.json({ data: [bankRow('88')] });
  });
  assert.deepEqual(await f.client.resolveBillingBankAccount(env, bankIban), {
    id: 88, ibanLast4: '1905', source: 'company_bank_accounts',
  });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls.map(call => call.options.method), ['GET', 'POST', 'GET']);
  assert.equal(f.calls[0].url, f.calls[2].url);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].accessToken, 'bank-renewed');
});

test('billing bank resolver converts a repeated401 to the safe reauthorization code without another refresh', async () => {
  const f = bankClient(async url => url.endsWith('/token')
    ? Response.json({ access_token: 'bank-renewed', expires_in: 3600 })
    : new Response(null, { status: 401 }));
  await assert.rejects(f.client.resolveBillingBankAccount(env, bankIban), {
    code: 'toconline-reauthorize-required', status: 401,
  });
  assert.equal(f.calls.length, 3);
  assert.equal(f.saved.length, 1);
});

test('billing bank resolver preserves missing-session and expired-refresh authorization errors', async () => {
  for (const [overrides, code] of [
    [{ missingSession: true }, 'toconline-background-session-missing'],
    [{ session: { expiresAt: 1000, refreshExpiresAt: 999 } }, 'toconline-reauthorize-required'],
  ]) {
    const f = bankClient(() => assert.fail('no provider request expected'), overrides);
    await assert.rejects(f.client.resolveBillingBankAccount(env, bankIban), { code });
    assert.equal(f.calls.length, 0);
  }
});

test('billing bank resolver preserves rejected refresh authorization without retrying or writing documents', async () => {
  const f = bankClient(async () => new Response(null, { status: 401 }));
  await assert.rejects(f.client.resolveBillingBankAccount(env, bankIban), {
    code: 'toconline-reauthorize-required', status: 401,
  });
  assert.deepEqual(f.calls.map(call => call.options.method), ['GET', 'POST']);
  assert.equal(f.saved.length, 0);
});

test('billing bank resolver renews an expiring session before its only GET', async () => {
  const f = bankClient(async (url, options) => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'bank-renewed', expires_in: 3600 });
    assert.equal(options.headers.Authorization, 'Bearer bank-renewed');
    return Response.json({ data: [bankRow()] });
  }, { session: { expiresAt: 90000 } });
  const account = await f.client.resolveBillingBankAccount(env, bankIban);
  assert.equal(account.id, 77);
  assert.deepEqual(f.calls.map(call => call.options.method), ['POST', 'GET']);
  assert.equal(f.saved.length, 1);
});

test('billing bank resolver hides other OAuth/configuration/storage failures as unconfirmed', async () => {
  for (const reply of [
    async () => new Response(null, { status: 503 }),
    async () => Response.json({ access_token: 'invalid' }),
    async () => { throw new Error('private refresh error'); },
  ]) {
    const f = bankClient(reply, { session: { expiresAt: 90000 } });
    await assert.rejects(f.client.resolveBillingBankAccount(env, bankIban), { code: 'billing-bank-unconfirmed' });
    assert.equal(f.calls.length, 1);
    assert.equal(f.saved.length, 0);
  }
  const f = bankClient(() => assert.fail('invalid API URL must not be requested'));
  await assert.rejects(f.client.resolveBillingBankAccount({ ...env, TOCONLINE_API_URL: 'http://other.test' }, bankIban), {
    code: 'billing-bank-unconfirmed',
  });
  assert.equal(f.calls.length, 0);
});
