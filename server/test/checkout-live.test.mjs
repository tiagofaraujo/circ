import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { createLivePilotPreviewApi } from '../payments/live-pilot-preview.mjs';

const ID='af91d4b0-d844-4a37-a71e-05f939a04f83';
const env={FIREBASE_PROJECT_ID:'circ-coimbra',LIVE_CHECKOUT_ENABLED:'true',EUPAGO_LIVE_API_KEY:'live-key',FIREBASE_PAYMENTS_SERVICE_ACCOUNT:'configured',
  EUPAGO_LIVE_WEBHOOK_KEY:'webhook-key',EUPAGO_LIVE_CHANNEL:'CIRC 2027',TOCONLINE_OAUTH_CLIENT_ID:'client',
  TOCONLINE_OAUTH_CLIENT_SECRET:'secret',TOCONLINE_OAUTH_URL:'https://oauth.example.test',TOCONLINE_API_URL:'https://api.example.test/api',TOCONLINE_SESSION_KEY:'session-key'};
const claims={sub:'admin',email:'circ.chuc@gmail.com',email_verified:true};
const selection={profile:'external',congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0};
const profile={name:'Pessoa Teste',taxNumber:'203821432',billingAddress:'Rua Teste 1',billingPostalCode:'3030-471',billingCity:'Coimbra',billingCountry:'Portugal'};

function fixture({identity=claims,date='2026-10-23T20:00:00Z',context={}}={}){
  let registration=null,payment=null,providerCalls=0;
  const currentProfile=structuredClone(profile);
  const store={
    registrationId:`circ-2027-${identity.sub}`,
    registration:async()=>({data:registration,version:registration?'r2':null}),
    payment:async id=>({data:id===ID?payment:null,version:payment?'p2':null}),
    context:async()=>({uid:identity.sub,emailVerified:true,guards:[],...context}),
    profile:async()=>({data:currentProfile,version:'u1'}),
    createPendingPrimary:async({registration:r,payment:p})=>{registration=structuredClone(r);payment=structuredClone(p);return{registrationVersion:'r1',paymentVersion:'p1'};},
    updatePendingProvider:async({registration:r,payment:p})=>{registration=structuredClone(r);payment=structuredClone(p);return{registrationVersion:'r2',paymentVersion:'p2'};},
    updatePayment:async(id,p)=>{payment=structuredClone(p);return{data:payment,version:'p2'};},
  };
  const api=createCheckoutLiveApi({
    verify:async()=>identity,tokenProvider:async()=> 'service-token',storeFactory:()=>store,
    providerFactory:()=>({createPayment:async()=>{providerCalls++;return{reference:'123456789',entity:'12345'};}}),
    now:()=> date,
  });
  const previewApi=createLivePilotPreviewApi({verify:async()=>identity,tokenProvider:async()=> 'service-token',storeFactory:()=>store,now:()=>date});
  const req=(path,body)=>new Request(`https://circ.local/api/checkout/live${path}`,{method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer user-token',Origin:'https://circ.local',...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{call:(path,body,configuration=env)=>api(req(path,body),configuration),
    preview:async(configuration=env,selected='external')=>await(await previewApi(req('/pilot-preview',{profile:selected}),configuration)).json(),
    setDate:value=>{date=value;},
    profile:()=>currentProfile,providerCalls:()=>providerCalls,payment:()=>payment,registration:()=>registration};
}

test('admin pilot creates one real pending Multibanco order with frozen billing data',async()=>{
  const f=fixture();
  const q=await f.preview();
  assert.equal(q.quote.amountCents,9500);
  const response=await f.call('/orders',{id:ID,selection,stamp:q.stamp,billingStamp:q.billingStamp,pilotConfirmation:'CRIAR REFERENCIA REAL',method:'multibanco',pilotAcknowledged:true});
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
  const q=await f.preview();
  const body={id:ID,selection,stamp:q.stamp,billingStamp:q.billingStamp,pilotConfirmation:'CRIAR REFERENCIA REAL',method:'multibanco',pilotAcknowledged:true};
  assert.equal((await f.call('/orders',body)).status,201);
  // Match the ordering changes possible after a Firestore round-trip.
  f.payment().quote=Object.fromEntries(Object.entries(f.payment().quote).reverse());
  f.payment().quote.selection=Object.fromEntries(Object.entries(f.payment().quote.selection).reverse());
  f.payment().billingSnapshot=Object.fromEntries(Object.entries(f.payment().billingSnapshot).reverse());
  const second=await f.call('/orders',body);
  assert.equal(second.status,200);
  assert.equal((await second.json()).order.reference,'123456789');
  assert.equal(f.providerCalls(),1);
});

const pilotOrder=q=>({id:ID,selection,stamp:q.stamp,billingStamp:q.billingStamp,pilotConfirmation:'CRIAR REFERENCIA REAL',method:'multibanco',pilotAcknowledged:true});

test('billing changed after preview is rejected before reserving a registration or contacting EuPago',async()=>{
  const f=fixture(); const q=await f.preview();
  f.profile().billingAddress='Outra morada 2';
  const response=await f.call('/orders',pilotOrder(q));
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'billing-preview-changed');
  assert.equal(f.providerCalls(),0); assert.equal(f.registration(),null);
});

test('pilot creation requires explicit confirmation, reviewed billing and complete webhook configuration',async()=>{
  for(const changes of [{pilotConfirmation:undefined},{billingStamp:undefined},{pilotConfirmation:'PREVIEW'}]){
    const f=fixture(); const q=await f.preview();
    const response=await f.call('/orders',{...pilotOrder(q),...changes});
    assert.equal(response.status,400); assert.equal(f.providerCalls(),0); assert.equal(f.registration(),null);
  }
  for(const changes of [{EUPAGO_LIVE_WEBHOOK_KEY:''},{EUPAGO_LIVE_CHANNEL:'CIRC 2027 '},{TOCONLINE_SESSION_KEY:''}]){
    const f=fixture(); const q=await f.preview();
    const response=await f.call('/orders',pilotOrder(q),{...env,...changes});
    assert.equal(response.status,503); assert.equal(f.providerCalls(),0); assert.equal(f.registration(),null);
  }
});

test('turning checkout off blocks creation but still allows an owner to recover an existing production order',async()=>{
  const f=fixture(); const q=await f.preview();
  await f.call('/orders',pilotOrder(q));
  const disabled={...env,LIVE_CHECKOUT_ENABLED:'false'};
  assert.equal((await f.call('/orders',pilotOrder(q),disabled)).status,503);
  const result=await f.call(`/orders/${ID}`,undefined,disabled);
  assert.equal(result.status,200); assert.equal((await result.json()).order.reference,'123456789');
  assert.equal(f.providerCalls(),1);
  f.payment().userId='another-user';
  assert.equal((await f.call(`/orders/${ID}`,undefined,disabled)).status,404);
});

test('public checkout retains its existing opening date and does not require pilot-only fields',async()=>{
  const identity={sub:'user1',email:'participant@example.test',email_verified:true};
  const early=fixture({identity});
  assert.equal((await early.call('/quote',{selection,pilotAcknowledged:true})).status,403);
  assert.equal(early.providerCalls(),0);
  const opened=fixture({identity,date:'2026-11-15T12:00:00Z'});
  const q=await(await opened.call('/quote',{selection})).json();
  assert.equal((await opened.call('/orders',{id:ID,selection,stamp:q.stamp,method:'multibanco'})).status,201);
  assert.equal(opened.providerCalls(),1);
});

test('same UUID with changed quote is rejected as idempotency conflict',async()=>{
  const f=fixture();
  const q=await f.preview();
  await f.call('/orders',{id:ID,selection,stamp:q.stamp,billingStamp:q.billingStamp,pilotConfirmation:'CRIAR REFERENCIA REAL',method:'multibanco',pilotAcknowledged:true});
  const response=await f.call('/orders',{id:ID,selection,stamp:'0'.repeat(64),billingStamp:q.billingStamp,pilotConfirmation:'CRIAR REFERENCIA REAL',method:'multibanco',pilotAcknowledged:true});
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
    TOCONLINE_OAUTH_CLIENT_ID:undefined,
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

const windowEnv={...env,LIVE_PILOT_UNTIL:'2026-11-16T13:00:00Z'};
test('temporary pilot admits only the verified admin with acknowledgement, even after public opening',async()=>{
  const participant=fixture({identity:{...claims,sub:'participant',email:'participant@example.test'},date:'2026-11-16T12:00:00Z'});
  const config=await(await participant.call('/config',undefined,windowEnv)).json();
  assert.equal(config.enabled,false); assert.equal(config.publicOpen,false); assert.equal(config.pilotAvailable,false);
  assert.deepEqual(config.methods,[]);
  assert.equal((await participant.call('/orders',pilotOrder({}),windowEnv)).status,503);
  assert.equal(participant.registration(),null); assert.equal(participant.providerCalls(),0);
  const admin=fixture({date:'2026-11-16T12:00:00Z'});
  const q=await admin.preview(windowEnv);
  assert.equal(q.creationEnabled,true);
  assert.equal((await admin.call('/orders',{...pilotOrder(q),pilotAcknowledged:false},windowEnv)).status,403);
  assert.equal((await admin.call('/orders',pilotOrder(q),windowEnv)).status,201);
});

test('pilot expiration and invalid deadlines block new work while owners retain order reads',async()=>{
  const f=fixture({date:'2026-11-16T12:00:00Z'}); const q=await f.preview(windowEnv);
  assert.equal((await f.call('/orders',pilotOrder(q),windowEnv)).status,201);
  f.setDate(windowEnv.LIVE_PILOT_UNTIL);
  assert.equal((await f.call('/orders',pilotOrder(q),windowEnv)).status,503);
  const data=await(await f.call('/diagnostics',undefined,windowEnv)).json();
  assert.equal(data.liveCheckoutEnabled,false); assert.equal(data.privatePilot,true); assert.equal(data.pilotUntil,windowEnv.LIVE_PILOT_UNTIL);
  assert.equal((await f.call(`/orders/${ID}`,undefined,windowEnv)).status,200);
  assert.equal(f.providerCalls(),1);
  for(const deadline of ['',null,'tomorrow','2026-02-30T12:00:00Z']){
    const blocked=fixture(); const invalid={...env,LIVE_PILOT_UNTIL:deadline};
    const preview=await blocked.preview(invalid); assert.equal(preview.creationEnabled,false);
    assert.equal((await blocked.call('/orders',pilotOrder(preview),invalid)).status,503);
    assert.equal(blocked.providerCalls(),0); assert.equal(blocked.registration(),null);
  }
});

test('temporary authorization cannot create references at other legitimate server prices',async()=>{
  const deadline={...env,LIVE_PILOT_UNTIL:'2027-02-02T12:00:00Z'};
  const cases=[{date:'2027-02-01T12:00:00Z',selected:'external',amount:15000},
    {date:'2026-11-16T12:00:00Z',selected:'student',amount:6000,context:{profileName:'Pessoa Teste',
      student:{userId:'admin',eventId:'circ-2027',academicYear:'2026/2027',status:'approved',profileName:'Pessoa Teste'}}}];
  for(const {selected,amount,...options} of cases){
    const f=fixture(options); const q=await f.preview(deadline,selected);
    assert.equal(q.quote.amountCents,amount); assert.equal(q.creationEnabled,false);
    const response=await f.call('/orders',{...pilotOrder(q),selection:{...selection,profile:selected}},deadline);
    assert.equal(response.status,409); assert.equal((await response.json()).error,'live-scope-not-enabled');
    assert.equal(f.providerCalls(),0); assert.equal(f.registration(),null);
  }
});
