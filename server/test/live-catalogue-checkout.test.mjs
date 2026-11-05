import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createCheckoutLiveApi } from '../payments/checkout-live.mjs';
import { createLivePaymentWebhook } from '../payments/live-webhook.mjs';
import { createLiveFiscalResumeApi } from '../payments/live-fiscal-resume.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const uid='participant', admin={sub:'admin',email:'circ.chuc@gmail.com',email_verified:true};
const env={FIREBASE_PROJECT_ID:'circ-test',LIVE_CHECKOUT_ENABLED:'true',EUPAGO_LIVE_CHANNEL:'CIRC 2027',EUPAGO_LIVE_API_KEY:'fake',EUPAGO_LIVE_WEBHOOK_KEY:'fake-hmac',
 FIREBASE_PAYMENTS_SERVICE_ACCOUNT:'fake',TOCONLINE_OAUTH_CLIENT_ID:'fake',TOCONLINE_OAUTH_CLIENT_SECRET:'fake',TOCONLINE_OAUTH_URL:'https://oauth.example.test',TOCONLINE_API_URL:'https://api.example.test/api',TOCONLINE_SESSION_KEY:'fake-key'};
const primary={profile:'external',congressMode:'onsite',morningCourse:true,afternoonCourse:false,dinnerQuantity:2};
function fixture(){
 let registration=null,rv=0,creates=0,issues=0,fiscalError=null;
 const payments=new Map(),jobs=new Map();
 const conflict=()=>{throw Object.assign(new Error('conflict'),{code:'conflict'});};
 const clone=x=>structuredClone(x);
 const snapshot=(map,id)=>{const row=map.get(id);return{data:row?clone(row.data):null,version:row?.version||null};};
 const put=(map,id,data)=>map.set(id,{data:clone(data),version:String(Number(map.get(id)?.version||0)+1)});
 const regInput=(r,version)=>{if(String(rv)!==version)conflict();registration=clone(r);rv++;};
 const store={registrationId:`circ-2027-${uid}`,registration:async()=>({data:clone(registration),version:registration?String(rv):null}),
  payment:async id=>snapshot(payments,id),document:async id=>snapshot(jobs,id),primaryPayment:async()=>{throw new Error('new primary IDs must recover directly');},
  context:async()=>({uid,emailVerified:true,guards:[]}),profile:async()=>({data:{name:'Pessoa Modelo',taxNumber:'203821432',billingAddress:'Rua Modelo 1',billingPostalCode:'3000-001',billingCity:'Coimbra',billingCountry:'Portugal'}}),
  capacity:async()=>({limits:{onsite:400,morningCourse:170,afternoonCourse:170},paid:{onsite:0,morningCourse:0,afternoonCourse:0},remaining:{onsite:400,morningCourse:170,afternoonCourse:170}}),
  createPendingPrimary:async({orderId,registration:r,payment:p})=>{if(registration||payments.has(orderId))conflict();registration=clone(r);rv++;put(payments,orderId,p);return{registrationVersion:String(rv),paymentVersion:payments.get(orderId).version};},
  createPendingSupplementary:async({orderId,registration:r,registrationVersion,payment:p})=>{if(payments.has(orderId)||registration.openSupplementaryOrderId)conflict();regInput(r,registrationVersion);put(payments,orderId,p);return{registrationVersion:String(rv),paymentVersion:payments.get(orderId).version};},
  updatePendingProvider:async({orderId,payment:p,paymentVersion,registration:r,registrationVersion})=>{if(payments.get(orderId).version!==paymentVersion)conflict();regInput(r,registrationVersion);put(payments,orderId,p);return{registrationVersion:String(rv),paymentVersion:payments.get(orderId).version};},
  updatePayment:async(id,p,version)=>{if(payments.get(id).version!==version)conflict();put(payments,id,p);},
  confirmPrimaryPaid:async({orderId,payment:p,paymentVersion,registration:r,registrationVersion,fiscalJob})=>{if(payments.get(orderId).version!==paymentVersion||jobs.has(orderId))conflict();regInput(r,registrationVersion);put(payments,orderId,p);put(jobs,orderId,fiscalJob);},
  finalizeFiscalResult:async({orderId,payment:p,paymentVersion,registration:r,registrationVersion,document,documentVersion})=>{if(payments.get(orderId).version!==paymentVersion||jobs.get(orderId).version!==documentVersion)conflict();regInput(r,registrationVersion);put(payments,orderId,p);put(jobs,orderId,document);},
 };
 const providerFactory=()=>({createPayment:async()=>{creates++;return{reference:String(123456780+creates),entity:'12345'};},inspectReference:async()=>({providerState:'paga'})});
 const fiscalClient={issueFinalizedSalesDocument:async()=>{issues++;if(fiscalError)throw fiscalError;return{providerDocumentId:String(900+issues),providerDocumentNo:`FR CIRC2027/${issues}`};}};
 const api=createCheckoutLiveApi({verify:async()=>({sub:uid,email:'participant@example.test',email_verified:true}),tokenProvider:async()=>'fake-service',storeFactory:()=>store,providerFactory,now:()=> '2026-11-15T12:00:00Z'});
 const webhook=createLivePaymentWebhook({tokenProvider:async()=>'fake-service',storeFactory:()=>store,paymentLookup:async({orderId})=>snapshot(payments,orderId),providerFactory,fiscalClient,now:()=> '2026-11-15T12:05:00Z'});
 const resume=createLiveFiscalResumeApi({verify:async()=>admin,tokenProvider:async()=>'fake-service',storeFactory:()=>store,paymentLookup:async({orderId})=>snapshot(payments,orderId),fiscalClient,now:()=> '2026-11-15T12:06:00Z'});
 const request=(path,data)=>new Request(`https://circ.test/api/checkout/live${path}`,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer fake-user',Origin:'https://circ.test',...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
 const call=(path,data)=>api(request(path,data),env);
 async function create(id,selection,kind='primary'){
  const prefix=kind==='primary'?'':'/supplementary';const qResponse=await call(`${prefix}/quote`,{selection});assert.equal(qResponse.status,200);const q=await qResponse.json();
  return call(`${prefix}/orders`,{id,selection,stamp:q.stamp,billingStamp:q.billingStamp,method:'multibanco'});
 }
 async function pay(id,date='2026-11-15T12:04:00Z'){const p=payments.get(id).data;const body=JSON.stringify({channel:{name:'CIRC 2027'},transactions:{identifier:p.identifier,method:'Multibanco',entity:p.entity,reference:p.reference,trid:id===ids[0]?'1001':'1002',amount:{value:p.amountCents/100,currency:'EUR'},date,status:'Paid'}});
  return webhook(new Request('https://circ.test/api/payments/live/notifications',{method:'POST',headers:{'Content-Type':'application/json','X-Signature':createHmac('sha256',env.EUPAGO_LIVE_WEBHOOK_KEY).update(body).digest('base64')},body}),env);}
 return{call,create,pay,resume:id=>resume(request(`/orders/${id}/fiscal-resume`,{confirmation:'RETOMAR FATURACAO AUTORIZADA'}),env),state:()=>({registration,payments,jobs,creates,issues}),setFiscalError:value=>{fiscalError=value;}};
}
test('mixed primary and supplemental purchases preserve the primary ledger and merge entitlements once',async()=>{
 const f=fixture();assert.equal((await f.create(ids[0],primary)).status,201);
 assert.equal(f.state().registration.selection.dinnerQuantity,2);assert.equal(f.state().registration.entitlements.dinnerQuantity,0);
 assert.equal((await f.pay(ids[0])).status,200);assert.equal(f.state().registration.documentCount,1);
 const originalPayment=structuredClone(f.state().registration.payment);
 const extras={morningCourse:false,afternoonCourse:true,dinnerQuantity:1};assert.equal((await f.create(ids[1],extras,'supplementary')).status,201);
 assert.deepEqual(f.state().registration.payment,originalPayment);assert.equal(f.state().registration.addOnOrderCount,1);
 assert.equal((await f.call('/supplementary/quote',{selection:extras})).status,409);
 assert.equal((await f.pay(ids[1])).status,200);
 let s=f.state();assert.deepEqual(s.registration.payment,originalPayment);assert.equal(s.registration.entitlements.morningCourse,true);assert.equal(s.registration.entitlements.afternoonCourse,true);assert.equal(s.registration.entitlements.dinnerQuantity,3);
 assert.equal(s.registration.documentCount,2);assert.equal(s.registration.supplementaryPaidAmountCents,6500);assert.ok(!s.registration.openSupplementaryOrderId);
 assert.equal((await f.pay(ids[1])).status,200);assert.equal(f.state().issues,2);assert.equal(f.state().registration.entitlements.dinnerQuantity,3);
 const recovered=await(await f.call('/primary-order')).json();assert.equal(recovered.order.id,ids[0]);assert.equal(recovered.order.kind,'primary');
 assert.equal((await f.call('/supplementary-order')).status,404);
 assert.equal((await f.call('/supplementary/quote',{selection:extras})).status,409);
 assert.equal((await f.call('/supplementary/quote',{selection:{morningCourse:false,afternoonCourse:false,dinnerQuantity:2}})).status,200);
});
test('supplemental auth failure remains recoverable and admin resumes its distinct invoice safely',async()=>{
 const f=fixture();await f.create(ids[0],primary);await f.pay(ids[0]);
 await f.create(ids[1],{morningCourse:false,afternoonCourse:true,dinnerQuantity:0},'supplementary');
 f.setFiscalError(Object.assign(new Error('auth'),{code:'toconline-reauthorize-required'}));await f.pay(ids[1]);
 assert.equal(f.state().registration.openSupplementaryOrderId,ids[1]);assert.equal(f.state().registration.documentCount,1);
 const recovered=await(await f.call('/supplementary-order')).json();assert.equal(recovered.order.status,'paid');assert.equal(recovered.order.fiscalStatus,'pending_authorization');
 f.setFiscalError(null);const resumed=await f.resume(ids[1]);assert.equal(resumed.status,200);assert.equal((await resumed.json()).order.fiscalStatus,'issued');
 assert.equal(f.state().registration.documentCount,2);assert.ok(!f.state().registration.openSupplementaryOrderId);
 assert.equal((await f.resume(ids[1])).status,409);
});
test('cancelled parents retain an incoming supplemental payment for review without reactivation',async()=>{
 const f=fixture();await f.create(ids[0],primary);await f.pay(ids[0]);await f.create(ids[1],{morningCourse:false,afternoonCourse:true,dinnerQuantity:0},'supplementary');
 f.state().registration.status='cancelled';f.state().registration.payment.status='refunded';
 const r=await f.pay(ids[1]);assert.equal(r.status,200);assert.equal((await r.json()).reviewRequired,true);
 assert.equal(f.state().payments.get(ids[1]).data.status,'review_required');assert.equal(f.state().payments.get(ids[1]).data.transactionId,'1002');
 assert.equal(f.state().registration.status,'cancelled');assert.equal(f.state().registration.payment.status,'refunded');assert.equal(f.state().issues,1);
});
test('concurrent supplementary reservations never send two requests for the same pending extras',async()=>{
 const f=fixture();await f.create(ids[0],primary);await f.pay(ids[0]);const selection={morningCourse:false,afternoonCourse:true,dinnerQuantity:0};
 const responses=await Promise.all([f.create(ids[1],selection,'supplementary'),f.create(ids[2],selection,'supplementary')]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(f.state().creates,2);
});
test('virtual and courses-only primary orders use the existing catalogue and fiscal line mapping',async()=>{
 for(const [selection,amount] of [[{...primary,congressMode:'virtual',morningCourse:false,dinnerQuantity:0},6000],[{...primary,congressMode:'courses-only',morningCourse:true,afternoonCourse:true,dinnerQuantity:1},10000]]){
  const f=fixture();const r=await f.create(ids[0],selection);assert.equal(r.status,201);assert.equal((await r.json()).order.amountCents,amount);
  assert.equal((await f.pay(ids[0])).status,200);assert.equal(f.state().registration.documentCount,1);
 }
});


test('a fixed-price virtual payment across the tariff boundary preserves its creation quote and resumes the effective fiscal quote',async()=>{
 const f=fixture();await f.create(ids[0],{...primary,congressMode:'virtual',morningCourse:false,dinnerQuantity:0});
 f.setFiscalError(Object.assign(new Error('auth'),{code:'toconline-reauthorize-required'}));
 assert.equal((await f.pay(ids[0],'2027-02-01T12:04:00Z')).status,200);
 const payment=f.state().payments.get(ids[0]).data;assert.equal(payment.quote.ratePeriod,'early');assert.equal(payment.fiscalQuote.ratePeriod,'regular');
 f.setFiscalError(null);const response=await f.resume(ids[0]);assert.equal(response.status,200);assert.equal((await response.json()).order.fiscalStatus,'issued');
});
