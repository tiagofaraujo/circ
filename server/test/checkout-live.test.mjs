import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';

const ID='af91d4b0-d844-4a37-a71e-05f939a04f83';
const env={FIREBASE_PROJECT_ID:'circ-coimbra',LIVE_CHECKOUT_ENABLED:'true',EUPAGO_LIVE_API_KEY:'live-key',FIREBASE_PAYMENTS_SERVICE_ACCOUNT:'configured'};
const claims={sub:'admin',email:'circ.chuc@gmail.com',email_verified:true};
const selection={profile:'external',congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0};
const profile={name:'Pessoa Teste',taxNumber:'203821432',billingAddress:'Rua Teste 1',billingPostalCode:'3030-471',billingCity:'Coimbra',billingCountry:'Portugal'};

function fixture(){
  let registration=null,payment=null,providerCalls=0;
  const store={
    registrationId:'circ-2027-admin',
    registration:async()=>({data:registration,version:registration?'r2':null}),
    payment:async id=>({data:id===ID?payment:null,version:payment?'p2':null}),
    context:async()=>({uid:'admin',emailVerified:true,guards:[]}),
    profile:async()=>({data:profile,version:'u1'}),
    createPendingPrimary:async({registration:r,payment:p})=>{registration=structuredClone(r);payment=structuredClone(p);return{registrationVersion:'r1',paymentVersion:'p1'};},
    updatePendingProvider:async({registration:r,payment:p})=>{registration=structuredClone(r);payment=structuredClone(p);return{registrationVersion:'r2',paymentVersion:'p2'};},
    updatePayment:async(id,p)=>{payment=structuredClone(p);return{data:payment,version:'p2'};},
  };
  const api=createCheckoutLiveApi({
    verify:async()=>claims,tokenProvider:async()=> 'service-token',storeFactory:()=>store,
    providerFactory:()=>({createPayment:async()=>{providerCalls++;return{reference:'123456789',entity:'12345'};}}),
    now:()=> '2026-10-23T20:00:00Z',
  });
  const req=(path,body)=>new Request(`https://circ.local/api/checkout/live${path}`,{method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer user-token',Origin:'https://circ.local',...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{call:(path,body)=>api(req(path,body),env),providerCalls:()=>providerCalls,payment:()=>payment,registration:()=>registration};
}

test('admin pilot creates one real pending Multibanco order with frozen billing data',async()=>{
  const f=fixture();
  const q=await(await f.call('/quote',{selection,pilotAcknowledged:true})).json();
  assert.equal(q.quote.amountCents,9500);
  const response=await f.call('/orders',{id:ID,selection,stamp:q.stamp,method:'multibanco',pilotAcknowledged:true});
  assert.equal(response.status,201);
  const data=await response.json();
  assert.equal(data.order.reference,'123456789');
  assert.equal(f.providerCalls(),1);
  assert.equal(f.payment().environment,'production');
  assert.equal(f.payment().billingSnapshot.customer_tax_registration_number,'203821432');
  assert.equal(f.registration().isTest,false);
  assert.equal(f.registration().status,'submitted');
});

test('same order UUID is idempotent and never creates a second provider reference',async()=>{
  const f=fixture();
  const q=await(await f.call('/quote',{selection,pilotAcknowledged:true})).json();
  const body={id:ID,selection,stamp:q.stamp,method:'multibanco',pilotAcknowledged:true};
  assert.equal((await f.call('/orders',body)).status,201);
  const second=await f.call('/orders',body);
  assert.equal(second.status,200);
  assert.equal((await second.json()).order.reference,'123456789');
  assert.equal(f.providerCalls(),1);
});

test('same UUID with changed quote is rejected as idempotency conflict',async()=>{
  const f=fixture();
  const q=await(await f.call('/quote',{selection,pilotAcknowledged:true})).json();
  await f.call('/orders',{id:ID,selection,stamp:q.stamp,method:'multibanco',pilotAcknowledged:true});
  const response=await f.call('/orders',{id:ID,selection,stamp:'0'.repeat(64),method:'multibanco',pilotAcknowledged:true});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'idempotency-conflict');
  assert.equal(f.providerCalls(),1);
});

test('live checkout stays disabled unless explicit production flag and credentials are present',async()=>{
  const f=fixture();
  const disabled={...env,LIVE_CHECKOUT_ENABLED:'false'};
  const api=createCheckoutLiveApi({verify:async()=>claims,tokenProvider:async()=> 'service-token',storeFactory:()=>assert.fail('store must not open')});
  const request=new Request('https://circ.local/api/checkout/live/config',{headers:{Authorization:'Bearer token'}});
  const config=await(await api(request,disabled)).json();
  assert.equal(config.enabled,false);
  assert.deepEqual(config.methods,[]);
});

test('admin setup diagnosis works with checkout disabled without contacting providers or storage',async()=>{
  const values={...env,LIVE_CHECKOUT_ENABLED:'false',EUPAGO_LIVE_CHANNEL:'CIRC 2027',
    EUPAGO_LIVE_API_KEY:'DO-NOT-EXPOSE-API',EUPAGO_LIVE_WEBHOOK_KEY:'DO-NOT-EXPOSE-HMAC',
    FIREBASE_PAYMENTS_SERVICE_ACCOUNT:'DO-NOT-EXPOSE-JSON',TOCONLINE_OAUTH_CLIENT_SECRET:'DO-NOT-EXPOSE-OAUTH',
    TOCONLINE_SESSION_KEY:'   '};
  const api=createCheckoutLiveApi({verify:async()=>claims,
    tokenProvider:()=>assert.fail('no service authentication'),storeFactory:()=>assert.fail('no storage'),
    providerFactory:()=>assert.fail('no payment provider')});
  const response=await api(new Request('https://circ.local/api/checkout/live/diagnostics',
    {headers:{Authorization:'Bearer admin-token'}}),values);
  assert.equal(response.status,200);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
  const data=await response.json();
  assert.equal(data.liveCheckoutEnabled,false);
  assert.equal(data.externalValidationPerformed,false);
  assert.equal(data.channelMatchesExpected,true);
  assert.equal(data.checks.EUPAGO_LIVE_API_KEY,true);
  assert.equal(data.checks.EUPAGO_LIVE_WEBHOOK_KEY,true);
  assert.equal(data.checks.TOCONLINE_OAUTH_CLIENT_ID,false);
  assert.equal(data.checks.TOCONLINE_SESSION_KEY,false);
  assert.ok(Object.values(data.checks).every(value=>typeof value==='boolean'));
  assert.ok(!JSON.stringify(data).includes('DO-NOT-EXPOSE'));
  const spaced=await(await api(new Request('https://circ.local/api/checkout/live/diagnostics',
    {headers:{Authorization:'Bearer admin-token'}}),{...values,EUPAGO_LIVE_CHANNEL:'CIRC 2027 '})).json();
  assert.equal(spaced.channelMatchesExpected,false);
});

test('setup diagnosis requires an authenticated verified admin and does not enrich public config',async()=>{
  for(const [identity,status] of [[null,401],[{...claims,email_verified:false},403],
    [{...claims,email:'participant@example.test'},403]]){
    const api=createCheckoutLiveApi({verify:async()=>identity,
      tokenProvider:()=>assert.fail('must not access service identity')});
    const response=await api(new Request('https://circ.local/api/checkout/live/diagnostics',
      {headers:identity?{Authorization:'Bearer token'}:{}}),env);
    assert.equal(response.status,status);
    assert.ok(!(await response.text()).includes('checks'));
  }
  const api=createCheckoutLiveApi({verify:async()=>({...claims,email:'participant@example.test'})});
  const response=await api(new Request('https://circ.local/api/checkout/live/config',
    {headers:{Authorization:'Bearer token'}}),{...env,LIVE_CHECKOUT_ENABLED:'false'});
  assert.ok(!Object.hasOwn(await response.json(),'checks'));
});
