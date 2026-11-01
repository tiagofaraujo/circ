import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';

test('production retires simulation and pilot endpoints before any provider call', async () => {
  const worker = createWorker(() => { throw new Error('must not authenticate a retired endpoint'); });
  for (const path of ['/api/payments/sandbox/config', '/api/payments/sandbox/attempts',
    '/api/checkout/sandbox/sessions', '/api/fiscal/sandbox/config',
    '/api/payments/stripe/sandbox/notifications', '/api/fiscal/toconline/draft-test/sessions/a/orders/b',
    '/api/checkout/live/pilot-preview']) {
    for (const method of ['GET', 'POST']) {
      const response = await worker.fetch(new Request(`https://circ.test${path}`, { method }), { CIRC_OPERATION_MODE: 'production' });
      assert.equal(response.status, 410, `${method} ${path}`);
      assert.equal((await response.json()).error, 'retired-endpoint');
    }
  }
});

test('production retains authenticated live payment and fiscal read routes', async () => {
  const worker = createWorker();
  for (const path of ['/api/checkout/live/config', '/api/fiscal/toconline/config', '/api/checkout/live/bank-transfers']) {
    const response = await worker.fetch(new Request(`https://circ.test${path}`), { CIRC_OPERATION_MODE: 'production' });
    assert.equal(response.status, 401);
  }
});

test('bank transfer review is routed before the generic checkout handler', async () => {
  const worker = createWorker(() => { throw new Error('must not reach authentication for a wrong method'); });
  const response = await worker.fetch(new Request('https://circ.test/api/checkout/live/bank-transfers', { method: 'POST' }), {
    CIRC_OPERATION_MODE: 'production', FIREBASE_PROJECT_ID: 'circ-coimbra',
  });
  assert.equal(response.status, 405);
  assert.equal((await response.json()).error, 'method-not-allowed');
});
