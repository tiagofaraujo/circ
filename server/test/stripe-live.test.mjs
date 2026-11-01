import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStripeLive, stripeLiveConfiguration, STRIPE_LIVE_API_VERSION, STRIPE_LIVE_WEBHOOK_PATH,
  safeLiveCheckoutUrl, matchStripeLiveSession, StripeLiveError,
} from '../payments/stripe-live.mjs';

const OID='11111111-1111-4111-8111-111111111111',OID2='22222222-2222-4222-8222-222222222222';
const SID='cs_live_syntheticSession12345',PID='pi_syntheticPayment12345',API_KEY='rk_live_circ-unit-fixture-04';
const env={FIREBASE_PROJECT_ID:'circ-demo',FIREBASE_PAYMENTS_SERVICE_ACCOUNT:'injected-live-service-identity',
  STRIPE_LIVE_SECRET_KEY:API_KEY,STRIPE_LIVE_WEBHOOK_SECRET:'whsec_unitfixture05'};
function makeOrder(){
  return {id:OID,userId:'participant',eventId:'circ-2027',registrationId:'circ-2027-participant',
    identifier:`circ_live_${OID.replaceAll('-','')}`,kind:'primary',environment:'production',method:'stripe_card',amountCents:19000,currency:'EUR',
    quote:{kind:'primary',eventId:'circ-2027',currency:'EUR',amountCents:19000,lines:[
      {code:'congress-onsite',quantity:1,unitAmountCents:9500,amountCents:9500},
      {code:'course-morning',quantity:1,unitAmountCents:3500,amountCents:3500},
      {code:'dinner',quantity:2,unitAmountCents:3000,amountCents:6000},
    ]},billingSnapshot:{customer_business_name:'Pessoa Modelo',customer_tax_registration_number:'203821432'}};
}
const metadata=order=>({integration:'circ-checkout-live',environment:'production',event_id:'circ-2027',owner:order.userId,
  registration_id:order.registrationId,order_id:order.id,identifier:order.identifier,order_kind:order.kind});
function makeSession(order=makeOrder(),paid=false){
  return {id:SID,object:'checkout.session',livemode:true,mode:'payment',currency:'eur',amount_total:order.amountCents,
    client_reference_id:order.identifier,metadata:metadata(order),payment_method_types:['card'],status:paid?'complete':'open',
    payment_status:paid?'paid':'unpaid',payment_intent:paid?PID:null,expires_at:1793620800,
    url:paid?null:`https://checkout.stripe.com/c/pay/${SID}#synthetic`};
}
function makeIntent(order=makeOrder()){
  return {id:PID,object:'payment_intent',livemode:true,status:'succeeded',amount:order.amountCents,amount_received:order.amountCents,
    currency:'eur',metadata:metadata(order),payment_method:{id:'pm_privateInstrumentOnly',object:'payment_method',livemode:true,type:'card',
      card:{funding:'credit',last4:'4242',exp_month:12,exp_year:2030,fingerprint:'private-fingerprint',wallet:{type:'apple_pay',dynamic_last4:'1234'}}}};
}
function fixture(order=makeOrder()){
  let session=makeSession(order),intent=makeIntent(order),status=200,transport=null;
  const requests=[];
  const provider=createStripeLive({apiKey:API_KEY,fetchImpl:async(url,options)=>{
    requests.push({url,options});assert.equal(new URL(url).origin,'https://api.stripe.com');
    assert.equal(options.headers.Authorization,`Bearer ${API_KEY}`);assert.equal(options.headers['Stripe-Version'],'2026-09-30.endive');
    assert.equal(options.redirect,'manual');assert.equal(options.cache,'no-store');
    if(transport)throw transport;
    if(status!==200)return new Response('private-error-key-or-billing-data-must-not-escape',{status});
    return Response.json(new URL(url).pathname.startsWith('/v1/payment_intents/')?intent:session);
  }});
  return {provider,order,requests,get session(){return session;},set session(value){session=value;},get intent(){return intent;},set intent(value){intent=value;},
    setStatus:value=>{status=value;},setTransport:value=>{transport=value;},paid:()=>{session=makeSession(order,true);order.reference=SID;}};
}

test('live configuration reports format/readiness without exposing secrets or asserting account validation',()=>{
  const config=stripeLiveConfiguration(env);
  assert.equal(config.ready,true);assert.equal(config.liveKeyValid,true);assert.equal(config.apiKeyPresent,true);
  assert.equal(config.webhookKeyPresent,true);assert.equal(config.serviceAccountPresent,true);
  assert.equal(config.apiVersion,'2026-09-30.endive');assert.equal(config.webhookPath,'/api/payments/stripe/live/notifications');
  assert.equal(STRIPE_LIVE_API_VERSION,config.apiVersion);assert.equal(STRIPE_LIVE_WEBHOOK_PATH,config.webhookPath);
  assert.ok(!JSON.stringify(config).includes(API_KEY));assert.ok(!JSON.stringify(config).includes(env.STRIPE_LIVE_WEBHOOK_SECRET));
  assert.ok(!Object.keys(config).some(key=>/validated|approved|accountVerified/i.test(key)));
  for(const field of ['STRIPE_LIVE_SECRET_KEY','STRIPE_LIVE_WEBHOOK_SECRET','FIREBASE_PAYMENTS_SERVICE_ACCOUNT','FIREBASE_PROJECT_ID'])
    assert.equal(stripeLiveConfiguration({...env,[field]:''}).ready,false);
});
test('only secret or restricted production keys are accepted',()=>{
  for(const key of ['rk_live_circ-unit-fixture-04','sk_live_circ-unit-fixture-06'])assert.doesNotThrow(()=>createStripeLive({apiKey:key,fetchImpl:()=>assert.fail('configuration must not call Stripe')}));
  for(const key of ['rk_test_syntheticKeyOnly','sk_test_syntheticKeyOnly','pk_live_syntheticPublicOnly','','rk_live_short','rk_live_key with spaces','rk_live_circ-unit-fixture-07\n',null]){
    assert.throws(()=>createStripeLive({apiKey:key}),StripeLiveError);assert.equal(stripeLiveConfiguration({...env,STRIPE_LIVE_SECRET_KEY:key}).ready,false);
  }
});
test('hosted creation uses fixed EUR item sums, card-only allowlist, replicated metadata and no fiscal side effects',async()=>{
  const f=fixture(),created=await f.provider.createPayment(f.order),request=f.requests[0],b=new URLSearchParams(request.options.body);
  assert.equal(request.url,'https://api.stripe.com/v1/checkout/sessions');assert.equal(request.options.method,'POST');
  assert.equal(b.get('mode'),'payment');assert.equal(b.get('allowed_payment_method_types[0]'),'card');assert.equal(b.get('payment_method_types[0]'),null);
  assert.equal(b.get('allowed_payment_method_types[1]'),null);assert.equal(b.get('automatic_tax[enabled]'),'false');
  assert.equal(b.get('adaptive_pricing[enabled]'),'false');assert.equal(b.get('invoice_creation[enabled]'),'false');
  assert.equal(b.get('client_reference_id'),f.order.identifier);assert.equal(b.get('line_items[2][quantity]'),'2');
  assert.equal(b.get('line_items[2][price_data][unit_amount]'),'3000');assert.equal(b.get('line_items[0][price_data][currency]'),'eur');
  for(const [key,value] of Object.entries(metadata(f.order))){assert.equal(b.get(`metadata[${key}]`),value);assert.equal(b.get(`payment_intent_data[metadata][${key}]`),value);}
  assert.equal(b.get('success_url'),`https://circ-coimbra.org/conta/inscricoes?stripe=return&order=${OID}`);
  assert.equal(b.get('cancel_url'),`https://circ-coimbra.org/conta/inscricoes?stripe=cancel&order=${OID}`);
  assert.ok(!/TESTE|sandbox/i.test(b.get('line_items[0][price_data][product_data][name]')));
  assert.ok(![...b.keys()].some(key=>/subscription|tax_rates|customer_email|customer_tax/.test(key)));
  assert.deepEqual(created,{reference:SID,entity:null,stripe:{id:SID,url:f.session.url,expiresAt:f.session.expires_at,status:'open',paymentStatus:'unpaid',paymentIntentId:null}});
});
test('idempotency key is stable for the persisted UUID and changes for a different order',async()=>{
  const f=fixture();await f.provider.createPayment(f.order);await f.provider.createPayment(structuredClone(f.order));
  const first=f.requests[0].options.headers['Idempotency-Key'];assert.equal(typeof first,'string');assert.ok(first.length>16);
  assert.equal(f.requests[1].options.headers['Idempotency-Key'],first);
  const other=makeOrder();Object.assign(other,{id:OID2,identifier:`circ_live_${OID2.replaceAll('-','')}`});
  f.session=makeSession(other);await f.provider.createPayment(other);assert.notEqual(f.requests[2].options.headers['Idempotency-Key'],first);
});
test('supplemental ledger metadata remains supplemental in both Stripe objects',async()=>{
  const order=makeOrder();order.kind='supplementary';order.quote.kind='supplementary';const f=fixture(order);
  await f.provider.createPayment(order);const b=new URLSearchParams(f.requests[0].options.body);
  assert.equal(b.get('metadata[order_kind]'),'supplementary');assert.equal(b.get('payment_intent_data[metadata][order_kind]'),'supplementary');
});
test('read-only session inspection makes one GET and does not inspect the instrument or mutate its order',async()=>{
  const f=fixture();f.paid();const before=structuredClone(f.order),current=await f.provider.inspectReference(f.order);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.method,'GET');assert.equal(f.requests[0].url,`https://api.stripe.com/v1/checkout/sessions/${SID}`);
  assert.equal(current.status,'complete');assert.equal(current.paymentStatus,'paid');assert.equal(current.paymentIntentId,PID);assert.equal(current.url,null);
  assert.deepEqual(f.order,before);assert.deepEqual(Object.keys(current).sort(),['id','url','expiresAt','status','paymentStatus','paymentIntentId'].sort());
});

for(const [label,change] of [
  ['test mode',o=>{o.environment='sandbox';}],['different event',o=>{o.eventId='other';}],['different method',o=>{o.method='multibanco';}],
  ['invalid owner',o=>{o.userId='owner/email';}],['registration mismatch',o=>{o.registrationId='circ-2027-other';}],['invalid UUID',o=>{o.id='not-an-order';}],
  ['identifier mismatch',o=>{o.identifier='circ_live_wrong';}],['quote kind mismatch',o=>{o.quote.kind='supplementary';}],['quote currency mismatch',o=>{o.quote.currency='USD';}],
  ['quote sum mismatch',o=>{o.quote.lines[0].amountCents++;}],['quote unit multiplication mismatch',o=>{o.quote.lines[2].quantity=1;}],
  ['quote unknown item',o=>{o.quote.lines[0].code='unapproved-product';}],['fractional price',o=>{o.quote.lines[0].unitAmountCents=95.1;}],
  ['no quote lines',o=>{o.quote.lines=[];}],['quote total mismatch',o=>{o.quote.amountCents++;}],['currency mismatch',o=>{o.currency='USD';}],
])test(`invalid ${label} is rejected before creating a session`,async()=>{
  const f=fixture();change(f.order);await assert.rejects(()=>f.provider.createPayment(f.order),StripeLiveError);assert.equal(f.requests.length,0);
});

for(const [label,change] of [
  ['test session',s=>{s.livemode=false;}],['test ID',s=>{s.id='cs_test_syntheticSession12345';}],['amount',s=>{s.amount_total=1;}],
  ['currency',s=>{s.currency='usd';}],['mode',s=>{s.mode='subscription';}],['owner metadata',s=>{s.metadata.owner='other';}],
  ['registration metadata',s=>{s.metadata.registration_id='circ-2027-other';}],['kind metadata',s=>{s.metadata.order_kind='supplementary';}],
  ['integration metadata',s=>{s.metadata.integration='circ-checkout-sandbox';}],['identifier',s=>{s.client_reference_id='other';}],
  ['extra payment method',s=>{s.payment_method_types=['card','klarna'];}],['wallet pseudo-method',s=>{s.payment_method_types=['apple_pay'];}],
  ['unknown payment status',s=>{s.payment_status='pending';}],['paid without intent',s=>{s.status='complete';s.payment_status='paid';s.payment_intent=null;}],
  ['paid while open',s=>{s.payment_status='paid';s.payment_intent=PID;}],
  ['payment waived for positive quote',s=>{s.status='complete';s.payment_status='no_payment_required';}],['invalid expiry',s=>{s.expires_at=0;}],
])test(`session ${label} cannot be used as matching payment proof`,()=>{
  const order=makeOrder(),session=makeSession(order);change(session);assert.throws(()=>matchStripeLiveSession(session,order),StripeLiveError);
});
test('session cannot silently replace an already persisted reference',()=>{
  const order=makeOrder();order.reference='cs_live_otherSyntheticSession12345';assert.throws(()=>matchStripeLiveSession(makeSession(),order),StripeLiveError);
});
test('hosted URLs allow only the exact Stripe Checkout session path and HTTPS origin',()=>{
  assert.equal(safeLiveCheckoutUrl(`https://checkout.stripe.com/c/pay/${SID}#fragment`,SID),`https://checkout.stripe.com/c/pay/${SID}#fragment`);
  for(const url of ['javascript:alert(1)',`http://checkout.stripe.com/c/pay/${SID}`,`https://checkout.stripe.com.evil.invalid/c/pay/${SID}`,
    `https://user@checkout.stripe.com/c/pay/${SID}`,`https://checkout.stripe.com:444/c/pay/${SID}`,`https://evil.invalid/c/pay/${SID}`,
    'https://checkout.stripe.com/c/pay/cs_test_syntheticSession12345',`https://checkout.stripe.com/c/pay/${SID}/extra`])assert.equal(safeLiveCheckoutUrl(url,SID),null);
});
for(const [status,definite] of [[302,false],[400,true],[401,true],[403,true],[404,false],[409,false],[429,false],[500,false],[503,false]])
  test(`creation HTTP ${status} is ${definite?'definite':'uncertain'} without leaking provider text or retrying`,async()=>{
    const f=fixture();f.setStatus(status);await assert.rejects(()=>f.provider.createPayment(f.order),error=>{
      assert.ok(error instanceof StripeLiveError);assert.equal(error.definite,definite);assert.ok(!String(error).includes('private-error'));return true;
    });assert.equal(f.requests.length,1);
  });
test('timeout is uncertain and never causes an automatic second creation',async()=>{
  const f=fixture();f.setTransport(Object.assign(new Error('private timeout'),{name:'TimeoutError'}));
  await assert.rejects(()=>f.provider.createPayment(f.order),error=>error instanceof StripeLiveError&&error.definite===false);
  assert.equal(f.requests.length,1);
});
test('malformed JSON, invalid UTF8 or oversized successful responses remain uncertain and never retry the provider POST',async()=>{
  for(const body of ['{malformed',new Uint8Array([0xc3,0x28]),JSON.stringify({padding:'x'.repeat(262145)})]){
    let calls=0;
    const provider=createStripeLive({apiKey:API_KEY,fetchImpl:async()=>{calls++;return new Response(body,{status:200});}});
    await assert.rejects(()=>provider.createPayment(makeOrder()),error=>error instanceof StripeLiveError&&error.definite===false);
    assert.equal(calls,1);
  }
});
test('paid instrument lookup is separate, verifies the PaymentIntent and returns only fiscal classification',async()=>{
  const f=fixture();f.paid();const current=await f.provider.inspectReference(f.order),instrument=await f.provider.inspectInstrument(f.order,current);
  assert.deepEqual(instrument,{funding:'credit',wallet:'apple_pay'});assert.equal(f.requests.length,2);
  const request=f.requests[1],url=new URL(request.url);assert.equal(url.pathname,`/v1/payment_intents/${PID}`);
  assert.equal(url.searchParams.get('expand[]'),'payment_method');assert.equal(request.options.method,'GET');
  const serialized=JSON.stringify(instrument);for(const privateValue of ['4242','2030','fingerprint','pm_privateInstrumentOnly','1234','exp_month'])assert.ok(!serialized.includes(privateValue));
});
test('instrument debit, prepaid and unknown funding are preserved for the fiscal policy owner',async()=>{
  for(const funding of ['debit','prepaid','unknown']){
    const f=fixture();f.paid();f.intent.payment_method.card.funding=funding;f.intent.payment_method.card.wallet={type:'google_pay'};
    const current=await f.provider.inspectReference(f.order);assert.deepEqual(await f.provider.inspectInstrument(f.order,current),{funding,wallet:'google_pay'});
  }
});
test('ordinary cards have no wallet and do not expose the expanded payment method',async()=>{
  const f=fixture();f.paid();f.intent.payment_method.card.wallet=null;const current=await f.provider.inspectReference(f.order);
  assert.deepEqual(await f.provider.inspectInstrument(f.order,current),{funding:'credit',wallet:null});
});
for(const [label,change] of [
  ['different ID',p=>{p.id='pi_different';}],['test mode',p=>{p.livemode=false;}],['not succeeded',p=>{p.status='processing';}],
  ['wrong intent amount',p=>{p.amount=1;}],
  ['wrong received amount',p=>{p.amount_received=1;}],['wrong currency',p=>{p.currency='usd';}],['wrong metadata',p=>{p.metadata.order_id=OID2;}],
  ['unexpanded instrument',p=>{p.payment_method='pm_unexpanded';}],['test instrument',p=>{p.payment_method.livemode=false;}],
  ['not a card',p=>{p.payment_method.type='paypal';}],
])test(`instrument ${label} is refused without changing financial session confirmation`,async()=>{
  const f=fixture();f.paid();const current=await f.provider.inspectReference(f.order);change(f.intent);
  await assert.rejects(()=>f.provider.inspectInstrument(f.order,current),StripeLiveError);
  assert.equal(current.paymentStatus,'paid');assert.equal(current.status,'complete');assert.equal(f.requests.filter(r=>r.options.method==='POST').length,0);
});
test('instrument permission failure leaves successful financial inspection available',async()=>{
  const f=fixture();f.paid();const current=await f.provider.inspectReference(f.order);f.setStatus(403);
  await assert.rejects(()=>f.provider.inspectInstrument(f.order,current),StripeLiveError);assert.equal(current.paymentStatus,'paid');assert.equal(current.paymentIntentId,PID);
  assert.equal(f.requests.length,2);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,0);
});
test('instrument cannot be requested for an unpaid or different normalized session',async()=>{
  const f=fixture();f.order.reference=SID;const current=await f.provider.inspectReference(f.order),before=f.requests.length;
  for(const value of [current,{...current,id:'cs_live_differentSession12345',status:'complete',paymentStatus:'paid',paymentIntentId:PID},
    {...current,status:'complete',paymentStatus:'paid',paymentIntentId:'pi_invalid/URL'}])
    await assert.rejects(()=>f.provider.inspectInstrument(f.order,value),StripeLiveError);
  assert.equal(f.requests.length,before);
});
