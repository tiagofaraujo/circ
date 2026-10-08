import test from 'node:test';
import assert from 'node:assert/strict';
import { createEupagoSandbox } from '../payments/eupago-sandbox.mjs';
import { validateSandboxNotification } from '../payments/eupago-notification.mjs';
const apiKey = 'test-secret-never-return';
const input = { method: 'multibanco', identifier: 'opaque_attempt_0001', amountCents: 12345, currency: 'EUR' };
const success = { sucesso: true, estado: 0, referencia: '123456789', entidade: '12345' };
const adapter = fetchImpl => createEupagoSandbox({ apiKey, environment: 'sandbox', fetchImpl });

test('requires explicit sandbox configuration', () => {
  for (const environment of [undefined, 'production', 'https://clientes.eupago.pt']) {
    assert.throws(() => createEupagoSandbox({ apiKey, environment }));
  }
  assert.throws(() => createEupagoSandbox({ apiKey: '', environment: 'sandbox' }));
});
test('Multibanco goes only to sandbox with exact cents and single payment', async () => {
  let calls = 0;
  const result = await adapter(async (url, options) => {
    calls++;
    assert.equal(url, 'https://sandbox.eupago.pt/clientes/rest_api/multibanco/create');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `ApiKey ${apiKey}`);
    assert.deepEqual(JSON.parse(options.body), { chave: apiKey, id: input.identifier, valor: 123.45, failOver: '0', per_dup: 0 });
    return Response.json({ ...success, chave: apiKey, resposta: apiKey });
  }).createPayment(input);
  assert.equal(calls, 1); assert.equal(result.status, 'pending');
  assert.equal(result.amountCents, 12345);
  assert.ok(!JSON.stringify(result).includes(apiKey));
});
test('MB WAY uses documented body authentication and validates telephone', async () => {
  const client = adapter(async (url, options) => {
    assert.match(url, /\/mbway\/create$/);
    const body = JSON.parse(options.body);
    assert.equal(body.alias, '987654321'); assert.equal(body.chave, apiKey);
    assert.equal(body.per_dup, undefined);
    return Response.json({ sucesso: true, referencia: '123456789' });
  });
  assert.equal((await client.createPayment({ ...input, method: 'mbway', phone: '987654321' })).status, 'pending');
  await assert.rejects(client.createPayment({ ...input, method: 'mbway', phone: 'bad' }));
});
test('invalid amounts, currency, identifiers and methods make no provider calls', async () => {
  const client = adapter(() => { assert.fail('must not fetch'); });
  for (const override of [{ amountCents: 1 }, { amountCents: 100.1 }, { amountCents: NaN },
    { amountCents: 10000000 }, { currency: 'USD' }, { identifier: 'person@example.com' }, { method: 'card' }]) {
    await assert.rejects(client.createPayment({ ...input, ...override }), /invalid-input/);
  }
});
test('uncertain outcomes are never retried and provider errors never leak secrets', async () => {
  for (const fn of [() => { throw new Error(apiKey); }, () => new Response(apiKey, { status: 500 }),
    () => new Response(apiKey), () => Response.json({ sucesso: true }),
    () => Response.json({ sucesso: false, resposta: apiKey })]) {
    let calls = 0;
    await assert.rejects(adapter(async () => { calls++; return fn(); }).createPayment(input), error => {
      assert.equal(error.uncertain, true); assert.ok(!error.message.includes(apiKey)); return true;
    });
    assert.equal(calls, 1);
  }
});
test('creation diagnostics distinguish transport, rejection and malformed responses without raw content', async () => {
  for (const [reply, diagnostic] of [
    [() => { throw Object.assign(new Error(apiKey), { name: 'TimeoutError' }); }, 'provider/timeout'],
    [() => { throw new Error(apiKey); }, 'provider/network'],
    [() => new Response(apiKey, { status: 503 }), 'provider/http-503'],
    [() => Response.json({ estado: -7, message: apiKey }, { status: 400 }), 'provider/http-400/code--7'],
    [() => new Response(apiKey), 'provider/invalid-json'],
    [() => Response.json([]), 'provider/invalid-response'],
    [() => Response.json({ sucesso: false, estado: '-8', resposta: apiKey }), 'provider/rejected/code--8'],
    [() => Response.json({ sucesso: false, estado: apiKey }), 'provider/rejected'],
    [() => Response.json({ sucesso: true, referencia: apiKey }), 'provider/invalid-reference'],
    [() => Response.json({ sucesso: true, referencia: '123456789', entidade: apiKey }), 'provider/invalid-entity'],
  ]) {
    let calls = 0;
    await assert.rejects(adapter(async () => { calls++; return reply(); }).createPayment(input), error => {
      assert.equal(error.diagnostic, diagnostic); assert.equal(error.uncertain, true);
      assert.ok(!JSON.stringify(error).includes(apiKey)); assert.ok(!error.message.includes(apiKey)); return true;
    });
    assert.equal(calls, 1);
  }
});
const attempt = { ...input, environment: 'sandbox', reference: '123456789', entity: '12345' };
test('reference status is only a reconciliation hint, never a paid registration', async () => {
  const client = adapter(async () => Response.json({ sucesso: true, referencia: attempt.reference,
    entidade: attempt.entity, identificador: attempt.identifier, estado: 'pago' }));
  const result = await client.inspectReference(attempt);
  assert.equal(result.requiresReconciliation, true); assert.equal(result.status, undefined);
  await assert.rejects(client.inspectReference({ ...attempt, identifier: 'different_attempt_0001' }), /reference-mismatch/);
});
const config = { apiKey, channel: 'demo-Hemisfério Disciplinado Lda' };
const notification = () => new URLSearchParams({ chave_api: apiKey, canal: config.channel,
  referencia: attempt.reference, identificador: attempt.identifier, valor: '123.45000',
  transacao: '100001', mp: 'PC:PT', entidade: attempt.entity });
test('callback validates account, reference, identifier, amount, method and secret', () => {
  const result = validateSandboxNotification(notification(), attempt, config);
  assert.equal(result.requiresReconciliation, true); assert.ok(!JSON.stringify(result).includes(apiKey));
  for (const [key, value] of Object.entries({ chave_api: 'wrong', canal: 'wrong', referencia: '0',
    identificador: 'wrong', valor: '123.451', transacao: '', mp: 'MW:PT', entidade: '00000' })) {
    const params = notification(); params.set(key, value);
    assert.throws(() => validateSandboxNotification(params, attempt, config), /invalid-notification/);
  }
});
test('callback rejects duplicate fields and production attempts', () => {
  const params = notification(); params.append('valor', '123.45');
  assert.throws(() => validateSandboxNotification(params, attempt, config));
  assert.throws(() => validateSandboxNotification(notification(), { ...attempt, environment: 'production' }, config));
});

 test('provider redirects are rejected without retrying or following the destination', async () => {
  let calls = 0;
  await assert.rejects(adapter(async (url, options) => {
    calls++; assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.invalid' } });
  }).createPayment(input), error => error.code === 'provider-unavailable' && error.uncertain);
  assert.equal(calls, 1);
});

 test('inspection normalizes text but never interprets numeric codes as payment confirmation', async () => {
  for (const [estado, expected, code] of [[' Pendente ', 'pendente', null], ['PAGO', 'pago', null], [0, 'unknown', 0], ['0', 'unknown', 0], [undefined, 'unknown', null], ['private raw message', 'unknown', null]]) {
    const result = await adapter(async () => Response.json({ sucesso: true, referencia: attempt.reference,
      entidade: attempt.entity, identificador: attempt.identifier, estado })).inspectReference(attempt);
    assert.equal(result.providerState, expected); assert.equal(result.providerStateCode, code);
    assert.equal(result.status, undefined); assert.equal(result.requiresReconciliation, true);
    assert.ok(!JSON.stringify(result).includes('private raw message'));
  }
});

test('reference payment state takes priority over the API response code', async () => {
  for (const [estado_referencia, expected] of [['pendente', 'pendente'], [' Paga ', 'paga'], ['transferida', 'transferida'], ['unrecognized', 'unknown']]) {
    const result = await adapter(async () => Response.json({ sucesso: true, referencia: attempt.reference,
      entidade: attempt.entity, identificador: attempt.identifier, estado: 0, estado_referencia })).inspectReference(attempt);
    assert.equal(result.providerState, expected);
    assert.equal(result.providerStateCode, 0);
    assert.equal(result.status, undefined);
    assert.equal(result.requiresReconciliation, true);
  }
});
