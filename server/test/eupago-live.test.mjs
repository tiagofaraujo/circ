import test from 'node:test';
import assert from 'node:assert/strict';
import { createEupagoLive } from '../payments/eupago-live.mjs';

test('live EuPago adapter uses production host and never sandbox', async () => {
  const calls = [];
  const api = createEupagoLive({
    apiKey: 'live-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ sucesso: true, referencia: 123456789, entidade: 12345 });
    },
  });
  const result = await api.createPayment({
    method: 'multibanco',
    identifier: 'circ_live_1234567890abcdef1234567890abcdef',
    amountCents: 9500,
    currency: 'EUR',
  });
  assert.equal(result.environment, 'production');
  assert.equal(result.reference, '123456789');
  assert.ok(calls[0].url.startsWith('https://clientes.eupago.pt/'));
  assert.ok(!calls[0].url.includes('sandbox'));
});

test('live EuPago adapter rejects sandbox-style identifiers and invalid amounts before network', async () => {
  let calls = 0;
  const api = createEupagoLive({ apiKey: 'live-key', fetchImpl: async () => { calls++; return Response.json({}); } });
  await assert.rejects(api.createPayment({
    method: 'multibanco', identifier: 'circ_test_1234567890abcdef1234567890abcdef', amountCents: 9500, currency: 'EUR',
  }), /invalid-input/);
  assert.equal(calls, 0);
});
