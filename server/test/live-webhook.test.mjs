import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLivePaymentWebhook } from '../payments/live-webhook.mjs';
import { quotePrimary } from '../payments/quote.mjs';

const ID='af91d4b0-d844-4a37-a71e-05f939a04f83';
const UID='user1';
const identifier=`circ_live_${ID.replaceAll('-','')}`;
const key='live-signing-key';
const env={FIREBASE_PROJECT_ID:'circ-coimbra',LIVE_CHECKOUT_ENABLED:'true',EUPAGO_LIVE_WEBHOOK_KEY:key,EUPAGO_LIVE_CHANNEL:'CIRC LIVE',
  EUPAGO_LIVE_API_KEY:'live-api-key',FIREBASE_PAYMENTS_SERVICE_ACCOUNT:'configured'};
const selection={profile:'external',courseAffiliation:'external',congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0};
const quote=quotePrimary(selection,{uid:UID,emailVerified:true},null,new Date('2026-11-15T12:00:00Z'));
const billing={customer_business_name:'Pessoa Teste',customer_tax_registration_number:'203821432',customer_address_detail:'Rua Teste 1',
  customer_postcode:'3030-471',customer_city:'Coimbra',customer_country:'PT'};

function payload({date='2026-11-15T12:00:00Z',amount='95.00000',trid='777'}={}){
  return {channel:{name:'CIRC LIVE'},transaction:{identifier,method:'PC:PT',entity:12345,reference:123456789,trid,
    amount:{value:amount,currency:'EUR'},date,status:'Paid'}};
}
function signed(body){
  const text=JSON.stringify(body);
  const sig=createHmac('sha256',key).update(text).digest('base64');
  return new Request('https://circ.local/api/payments/live/notifications',{method:'POST',
    headers:{'Content-Type':'application/json','X-Signature':sig},body:text});
}
function fixture({fiscalError=null,initialPayment=null,notFound=false}={}){
  let payment=initialPayment||{eventId:'circ-2027',id:ID,environment:'production',registrationId:`circ-2027-${UID}`,userId:UID,status:'pending',
    amountCents:9500,currency:'EUR',method:'multibanco',identifier,reference:'123456789',entity:'12345',transactionId:null,paidAt:null,
    provider:'eupago',quote,billingSnapshot:billing,createdAt:'2026-11-15T10:00:00Z',updatedAt:'2026-11-15T10:00:00Z'};
  let registration={eventId:'circ-2027',userId:UID,registrationKey:`circ-2027:${UID}`,primaryRegistration:true,participantName:'Pessoa Teste',
    participantEmail:'pessoa@example.test',registrationType:'CIRC 2027 · Presencial',status:'submitted',isTest:false,testMode:false,
    selection:{...selection,dinner:false,ratePeriod:'early'},entitlements:{congressMode:'',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
    addOnOrderCount:0,documentCount:0,payment:{status:'pending',amountCents:9500,currency:'EUR',method:'multibanco',reference:'123456789'},
    createdAt:'2026-11-15T10:00:00Z',updatedAt:'2026-11-15T10:00:00Z'};
  let document=null,issueCalls=0,confirmCalls=0,finalizeCalls=0;
  const store={
    registration:async()=>({data:structuredClone(registration),version:registration.status==='submitted'?'r1':'r2'}),
    payment:async()=>({data:structuredClone(payment),version:payment.fiscalStatus?'p3':payment.status==='paid'?'p2':'p1'}),
    document:async()=>({data:structuredClone(document),version:document?'d1':null}),
    context:async()=>({uid:UID,emailVerified:true,guards:[]}),
    updatePendingProvider:async({payment:p,registration:r})=>{payment=structuredClone(p);registration=structuredClone(r);return{paymentVersion:'p2',registrationVersion:'r2'};},
    confirmPrimaryPaid:async({payment:p,registration:r,fiscalJob})=>{confirmCalls++;payment=structuredClone(p);registration=structuredClone(r);document=structuredClone(fiscalJob);return true;},
    finalizeFiscalResult:async({payment:p,registration:r,document:d})=>{finalizeCalls++;payment=structuredClone(p);registration=structuredClone(r);document=structuredClone(d);return true;},
  };
  const handler=createLivePaymentWebhook({
    tokenProvider:async()=> 'service-token',
    paymentLookup:async()=>({data:notFound?null:structuredClone(payment),version:payment.status==='paid'?'p2':'p1'}),
    storeFactory:()=>store,
    providerFactory:()=>({inspectReference:async()=>({providerState:'paga'})}),
    fiscalClient:{issueFinalizedSalesDocument:async()=>{issueCalls++;if(fiscalError)throw fiscalError;return{providerDocumentId:'321',providerDocumentNo:'FR CIRC2027/1'};}},
    now:()=> '2026-11-15T12:01:00Z',
  });
  return{call:(body,configuration=env)=>handler(signed(body),configuration),raw:(request,configuration=env)=>handler(request,configuration),state:()=>({payment,registration,document}),calls:()=>({issueCalls,confirmCalls,finalizeCalls})};
}

test('signed PAID webhook confirms payment once and issues one FR',async()=>{
  const f=fixture();
  const response=await f.call(payload());
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{received:true,duplicate:false,fiscalStatus:'issued'});
  const s=f.state();
  assert.equal(s.payment.status,'paid');
  assert.equal(s.payment.fiscalStatus,'issued');
  assert.equal(s.registration.status,'confirmed');
  assert.equal(s.registration.documentCount,1);
  assert.equal(s.document.status,'issued');
  assert.equal(s.document.providerDocumentNo,'FR CIRC2027/1');
  assert.deepEqual(f.calls(),{issueCalls:1,confirmCalls:1,finalizeCalls:1});
});

test('duplicate PAID callback never triggers a second fiscal issue',async()=>{
  const paid={eventId:'circ-2027',id:ID,environment:'production',registrationId:`circ-2027-${UID}`,userId:UID,status:'paid',
    amountCents:9500,currency:'EUR',method:'multibanco',identifier,reference:'123456789',entity:'12345',transactionId:'777',paidAt:'2026-11-15T12:00:00Z',
    provider:'eupago',quote,billingSnapshot:billing,fiscalStatus:'issued'};
  const f=fixture({initialPayment:paid});
  const response=await f.call(payload());
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{received:true,duplicate:true,fiscalStatus:'issued'});
  assert.deepEqual(f.calls(),{issueCalls:0,confirmCalls:0,finalizeCalls:0});
});

test('TOConline ambiguous outcome is persisted and webhook still acknowledges paid transaction',async()=>{
  const error=Object.assign(new Error('unknown'),{code:'toconline-live-outcome-unknown',uncertain:true});
  const f=fixture({fiscalError:error});
  const response=await f.call(payload());
  assert.equal(response.status,200);
  assert.equal((await response.json()).fiscalStatus,'outcome_unknown');
  assert.equal(f.state().payment.status,'paid');
  assert.equal(f.state().payment.fiscalStatus,'outcome_unknown');
  assert.equal(f.state().document.status,'outcome_unknown');
  assert.deepEqual(f.calls(),{issueCalls:1,confirmCalls:1,finalizeCalls:1});
});

test('regular-period payment with early amount is sent to review and no FR is attempted',async()=>{
  const f=fixture();
  const response=await f.call(payload({date:'2027-02-01T12:00:00Z'}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{received:true,reviewRequired:true});
  assert.equal(f.state().payment.status,'review_required');
  assert.equal(f.state().payment.reviewReason,'payment-date-tariff-mismatch');
  assert.equal(f.state().registration.status,'submitted');
  assert.deepEqual(f.calls(),{issueCalls:0,confirmCalls:0,finalizeCalls:0});
});

test('timezone-less payment on tariff boundary is reviewed rather than auto-issued',async()=>{
  const f=fixture();
  const response=await f.call(payload({date:'2027-01-31T23:59:59'}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).reviewRequired,true);
  assert.equal(f.state().payment.reviewReason,'payment-timezone-ambiguous');
  assert.equal(f.calls().issueCalls,0);
});

test('invalid calendar date is rejected before payment lookup or fiscal work',async()=>{
  const f=fixture();
  const response=await f.call(payload({date:'2027-02-30T12:00:00Z'}));
  assert.equal(response.status,422);
  assert.deepEqual(await response.json(),{error:'invalid_event'});
  assert.deepEqual(f.calls(),{issueCalls:0,confirmCalls:0,finalizeCalls:0});
});

test('closing or expiring reference creation still confirms an existing paid order exactly once',async()=>{
  for(const configuration of [{...env,LIVE_CHECKOUT_ENABLED:'false'}, {...env,LIVE_PILOT_UNTIL:'2026-10-31T13:00:00Z'}]){
    const f=fixture();
    assert.equal((await f.call(payload(),configuration)).status,200);
    assert.equal(f.state().registration.status,'confirmed'); assert.equal(f.state().document.status,'issued');
    assert.equal((await f.call(payload(),configuration)).status,200);
    assert.deepEqual(f.calls(),{issueCalls:1,confirmCalls:1,finalizeCalls:1});
  }
});

test('closed checkout webhook refuses unknown orders and invalid signatures without fiscal work',async()=>{
  const disabled={...env,LIVE_CHECKOUT_ENABLED:'false'};
  const unknown=fixture({notFound:true});
  assert.equal((await unknown.call(payload(),disabled)).status,404);
  assert.deepEqual(unknown.calls(),{issueCalls:0,confirmCalls:0,finalizeCalls:0});
  const f=fixture(); const request=signed(payload()); request.headers.set('X-Signature','invalid');
  assert.equal((await f.raw(request,disabled)).status,401);
  assert.deepEqual(f.calls(),{issueCalls:0,confirmCalls:0,finalizeCalls:0});
});

test('a late duplicate paid callback cannot reactivate a refunded registration or issue another FR',async()=>{
  const f=fixture({initialPayment:{eventId:'circ-2027',id:ID,environment:'production',registrationId:`circ-2027-${UID}`,userId:UID,status:'refunded',
    amountCents:9500,currency:'EUR',method:'multibanco',identifier,reference:'123456789',entity:'12345',transactionId:'777',
    paidAt:'2026-11-15T12:00:00Z',provider:'eupago',quote,billingSnapshot:billing,fiscalStatus:'issued'}});
  const response=await f.call(payload());
  assert.equal(response.status,200); assert.equal((await response.json()).duplicate,true);
  assert.equal(f.state().payment.status,'refunded');
  assert.deepEqual(f.calls(),{issueCalls:0,confirmCalls:0,finalizeCalls:0});
});
