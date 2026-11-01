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

test('MB WAY production transport uses the documented alias and never treats creation as paid',async()=>{
  const calls=[];
  const api=createEupagoLive({apiKey:'live-key',fetchImpl:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});return Response.json({sucesso:true,referencia:405865});
  }});
  const result=await api.createPayment({method:'mbway',identifier:'circ_live_1234567890abcdef1234567890abcdef',amountCents:9500,currency:'EUR',phone:'911111111'});
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://clientes.eupago.pt/clientes/rest_api/mbway/create');
  assert.deepEqual(calls[0].body,{id:'circ_live_1234567890abcdef1234567890abcdef',valor:95,failOver:'0',alias:'911111111',descricao:'CIRC 2027',chave:'live-key'});
  assert.equal(result.entity,null);assert.equal(result.status,'pending');assert.equal(result.environment,'production');
});

test('MB WAY reference information binds an entity learned from the signed notification',async()=>{
  const attempt={environment:'production',method:'mbway',identifier:'circ_live_1234567890abcdef1234567890abcdef',reference:'405865',entity:'10045'};
  let response={sucesso:true,referencia:405865,identificador:attempt.identifier,entidade:10045,estado_referencia:'paga'};
  const calls=[];const api=createEupagoLive({apiKey:'live-key',fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json(response);}});
  assert.equal((await api.inspectReference(attempt)).providerState,'paga');
  assert.equal(calls[0].url,'https://clientes.eupago.pt/clientes/rest_api/multibanco/info');assert.equal(calls[0].body.entidade,'10045');
  for(const changes of [{referencia:999},{identificador:'another-owner'},{entidade:99999}]){
    response={sucesso:true,referencia:405865,identificador:attempt.identifier,entidade:10045,estado_referencia:'paga',...changes};
    await assert.rejects(api.inspectReference(attempt),/reference-mismatch/);
  }
});

test('uncertain MB WAY creation is never retried automatically and invalid phones make no request',async()=>{
  let calls=0;const api=createEupagoLive({apiKey:'live-key',fetchImpl:async()=>{calls++;throw new Error('connection lost');}});
  const input={method:'mbway',identifier:'circ_live_1234567890abcdef1234567890abcdef',amountCents:9500,currency:'EUR',phone:'911111111'};
  await assert.rejects(api.createPayment(input),error=>error.uncertain===true&&error.code==='provider-unavailable');assert.equal(calls,1);
  for(const phone of [undefined,'+351911111111','811111111','91111111'])await assert.rejects(api.createPayment({...input,phone}),/invalid-input/);
  assert.equal(calls,1);
});
