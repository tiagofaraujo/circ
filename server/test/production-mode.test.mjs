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
  for (const path of ['/api/checkout/live/config', '/api/fiscal/toconline/config']) {
    const response = await worker.fetch(new Request(`https://circ.test${path}`), { CIRC_OPERATION_MODE: 'production' });
    assert.equal(response.status, 401);
  }
});

test('production routes scientific correction requests through authentication', async () => {
  const worker = createWorker();
  const response = await worker.fetch(new Request('https://circ.test/api/submissions/real-work/resubmit', {
    method: 'POST', headers: { Origin: 'https://circ.test', 'Content-Type': 'application/json' }, body: '{}',
  }), { CIRC_OPERATION_MODE: 'production', FIREBASE_PROJECT_ID: 'circ-coimbra', SCIENTIFIC_CORRECTIONS_ENABLED: 'true' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'sign-in-required');
});

test('scientific corrections remain closed until their rules are deployed', async () => {
  const worker = createWorker(() => { throw new Error('disabled feature must not authenticate'); });
  const response = await worker.fetch(new Request('https://circ.test/api/submissions/real-work/resubmit', { method: 'POST' }), {
    CIRC_OPERATION_MODE: 'production',
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'corrections-not-enabled');
});
