import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveFiscalResumeApi } from '../payments/live-fiscal-resume.mjs';
import { buildLivePaymentFR } from '../payments/toconline-live-payload.mjs';
import { quotePrimary } from '../payments/quote.mjs';
import { createWorker } from '../worker.mjs';
const ID='649d2dbd-6125-4212-bfa8-22035a3a55e7';
const identity={sub:'admin',email:'circ.chuc@gmail.com',email_verified:true};
const env={FIREBASE_PROJECT_ID:'circ-coimbra',LIVE_CHECKOUT_ENABLED:'false'};
const confirmation={confirmation:'RETOMAR FATURACAO AUTORIZADA'};
function fixture({error=null,failIssuedSave=false,waitForIssue=false,ownerId='admin',profile='external',amountCents=9500,method='multibanco',loseClaimAcknowledgement=false}={}){
  const quote=quotePrimary({profile:'external',congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
    {uid:'admin',emailVerified:true},null,new Date('2026-11-01T12:00:00Z'));
  quote.selection.profile=profile; quote.selection.courseAffiliation=profile==='uls'?'uls':'external';
  quote.amountCents=amountCents; quote.lines[0].unitAmountCents=amountCents; quote.lines[0].amountCents=amountCents;
  const billing={customer_business_name:'Pessoa Teste',customer_tax_registration_number:'203821432',customer_country:'PT'};
  const bank=method==='bank_transfer', creditKey='a'.repeat(64);
  let credit=bank?{kind:'bank-credit-live',environment:'production',eventId:'circ-2027',orderId:ID,decisionId:ID,requestHash:'test-request-hash',creditReference:'STATEMENT/2026/1',creditKey,bookingDate:'2026-11-01',amountCents,currency:'EUR'}:null;
  let payment={id:ID,userId:ownerId,eventId:'circ-2027',registrationId:`circ-2027-${ownerId}`,environment:'production',provider:bank?'internal_bank_transfer':'eupago',method,
    amountCents,currency:'EUR',identifier:'circ_live_'+ID.replaceAll('-',''),status:'paid',reference:'238871433',entity:'12477',
    paidAt:'2026-11-01T07:54:00Z',paymentDate:'2026-11-01',transactionId:'777',fiscalStatus:'pending_authorization',quote,billingSnapshot:billing};
  if(bank)Object.assign(payment,{reference:ID,entity:null,transactionId:`bank_${creditKey}`,bankTransfer:{status:'confirmed',revision:1,iban:'PT50003300004567422451905',
    billingAccount:{source:'company_bank_accounts',id:7,ibanLast4:'1905'},confirmation:{...credit}}});
  let registration={selection:{...quote.selection},userId:ownerId,eventId:'circ-2027',primaryRegistration:true,isTest:false,testMode:false,status:'confirmed',documentCount:0,
    payment:{status:'paid',amountCents,currency:'EUR',method,reference:payment.reference}};
  const salesDocument=buildLivePaymentFR({orderId:ID,quote,billing:{customer:billing},paymentDate:payment.paymentDate,method,...(bank?{bankAccountId:7}:{})});
  let job={id:ID,eventId:'circ-2027',registrationId:payment.registrationId,userId:ownerId,type:'invoice_receipt',environment:'production',
    status:'pending_authorization',provider:'toconline',externalReference:salesDocument.external_reference,amountCents,
    paymentMethod:method,salesDocument,errorCode:'toconline-reauthorize-required'};
  let version=1,writes=0,issueCalls=0,claims=identity;
  let signalIssue,releaseIssue;
  const issuing=new Promise(resolve=>{signalIssue=resolve;});
  const release=new Promise(resolve=>{releaseIssue=resolve;});
  const snapshot=data=>({data:structuredClone(data),version:String(version)});
  const store={registrationId:payment.registrationId,payment:async()=>snapshot(payment),registration:async()=>snapshot(registration),document:async()=>snapshot(job),bankCredit:async()=>snapshot(credit),
    finalizeFiscalResult:async input=>{
      if([input.paymentVersion,input.registrationVersion,input.documentVersion].some(v=>v!==String(version)))throw Object.assign(new Error('conflict'),{code:'conflict'});
      if(failIssuedSave&&input.document.status==='issued')throw new Error('storage failed after issuance');
      payment=structuredClone(input.payment);registration=structuredClone(input.registration);job=structuredClone(input.document);version++;writes++;
      if(loseClaimAcknowledgement&&input.document.status==='issuing')throw new Error('claim response lost');
      return true;
    }};
  const api=createLiveFiscalResumeApi({verify:async()=>claims,tokenProvider:async()=> 'service-token',paymentLookup:async()=>snapshot(payment),storeFactory:()=>store,
    fiscalClient:{issueFinalizedSalesDocument:async(runtime,payload)=>{
      issueCalls++;assert.equal(payload.external_reference,salesDocument.external_reference);signalIssue();if(waitForIssue)await release;
      if(error)throw error;return{providerDocumentId:'900',providerDocumentNo:'FR CIRC2027/1'};
    }},now:()=> '2026-11-01T09:40:00Z'});
  const call=(body=confirmation,options={})=>api(new Request(`https://circ.local/api/checkout/live/orders/${ID}/fiscal-resume`,{
    method:'POST',headers:{Authorization:'Bearer token',Origin:'https://circ.local','Content-Type':'application/json',...options},body:JSON.stringify(body)}),env);
  return{call,issuing,release:()=>releaseIssue(),setClaims:v=>{claims=v;},state:()=>({payment,registration,job,credit,writes,issueCalls})};
}
test('an authorization-blocked paid job resumes once even with checkout closed and returns its original order',async()=>{
  const f=fixture();const response=await f.call();assert.equal(response.status,200);
  assert.equal((await response.json()).order.fiscalStatus,'issued');
  const s=f.state();assert.equal(s.issueCalls,1);assert.equal(s.registration.documentCount,1);assert.equal(s.payment.status,'paid');
  assert.equal(s.job.providerDocumentNo,'FR CIRC2027/1');assert.equal(s.job.errorCode,null);assert.ok(s.job.resumeAttemptId);
  assert.equal((await f.call()).status,409);assert.equal(f.state().issueCalls,1);
});
test('concurrent resumes claim the existing job before POST and cannot issue twice',async()=>{
  const f=fixture({waitForIssue:true});const first=f.call();await f.issuing;
  assert.equal(f.state().payment.fiscalStatus,'issuing');assert.equal((await f.call()).status,409);
  f.release();assert.equal((await first).status,200);assert.equal(f.state().issueCalls,1);
});
test('unknown outcomes, existing provider IDs, refunds and payload differences fail before any provider call',async()=>{
  for(const mutate of [s=>{s.payment.fiscalStatus='outcome_unknown';},s=>{s.job.status='issued';},s=>{s.job.providerDocumentId='123';},
    s=>{s.job.errorCode='toconline-live-outcome-unknown';},s=>{s.payment.status='refunded';},s=>{s.payment.userId='another';},
    s=>{s.payment.environment='sandbox';},s=>{s.job.salesDocument.notes='altered';},s=>{s.registration.documentCount=1;},s=>{s.payment.amountCents=15000;}]){
    const f=fixture();mutate(f.state());const response=await f.call();assert.ok([404,409].includes(response.status));
    assert.equal(f.state().writes,0);assert.equal(f.state().issueCalls,0);
  }
});
test('authorization, explicit confirmation and origin are required',async()=>{
  const f=fixture();assert.equal((await f.call({},{})).status,400);assert.equal((await f.call({...confirmation,amount:1})).status,400);
  assert.equal((await f.call(confirmation,{Origin:'https://other.test'})).status,403);
  f.setClaims({...identity,email:'other@example.test'});assert.equal((await f.call()).status,403);
  f.setClaims({...identity,email_verified:false});assert.equal((await f.call()).status,403);
  assert.equal(f.state().issueCalls,0);assert.equal(f.state().writes,0);
});
test('a renewed authorization failure stays resumable but an ambiguous POST is never resumable',async()=>{
  for(const [error,status] of [[Object.assign(new Error(),{code:'toconline-reauthorize-required'}),'pending_authorization'],
    [Object.assign(new Error(),{code:'toconline-live-outcome-unknown',uncertain:true}),'outcome_unknown']]){
    const f=fixture({error});assert.equal((await f.call()).status,200);assert.equal(f.state().job.status,status);
    assert.equal(f.state().registration.documentCount,0);
    if(status==='outcome_unknown'){assert.equal((await f.call()).status,409);assert.equal(f.state().issueCalls,1);}
  }
});
test('provider success followed by persistence failure is uncertain and cannot cause another issuance',async()=>{
  const f=fixture({failIssuedSave:true});await f.call();const s=f.state();
  assert.equal(s.job.status,'outcome_unknown');assert.equal(s.job.providerDocumentId,'900');
  assert.equal((await f.call()).status,409);assert.equal(f.state().issueCalls,1);
});

test('worker reaches the protected resume route while new checkout creation is disabled',async()=>{
  const worker=createWorker(async()=>identity);
  const response=await worker.fetch(new Request(`https://circ.local/api/checkout/live/orders/${ID}/fiscal-resume`,{
    method:'POST',headers:{Authorization:'Bearer token',Origin:'https://circ.local','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(response.status,400);assert.equal((await response.json()).error,'fiscal-confirmation-required');
});

test('administrator resumes a different attendee\'s ULS55 paid job without changing its owner or amount',async()=>{
 const f=fixture({ownerId:'uls-participant',profile:'uls',amountCents:5500});
 const response=await f.call(); assert.equal(response.status,200);
 const state=f.state(); assert.equal(state.issueCalls,1); assert.equal(state.payment.userId,'uls-participant');
 assert.equal(state.payment.amountCents,5500); assert.equal(state.registration.userId,'uls-participant');
 assert.equal(state.job.resumedBy.uid,'admin'); assert.equal(state.job.status,'issued');
});

test('ordinary participants cannot use the administrative resume route, even for their own job',async()=>{
 const f=fixture({ownerId:'participant'});f.setClaims({sub:'participant',email:'participant@example.test',email_verified:true});
 assert.equal((await f.call()).status,403); assert.equal(f.state().issueCalls,0); assert.equal(f.state().writes,0);
});

test('bank transfer authorization resumes against its frozen company account and unique credited entry',async()=>{
  const f=fixture({method:'bank_transfer',ownerId:'participant'});
  const response=await f.call();assert.equal(response.status,200);assert.equal((await response.json()).order.fiscalStatus,'issued');
  const s=f.state();assert.equal(s.issueCalls,1);assert.equal(s.job.salesDocument.payment_mechanism,'TR');assert.equal(s.job.salesDocument.bank_account_id,7);
  assert.equal(s.payment.method,'bank_transfer');assert.equal(s.registration.documentCount,1);assert.equal((await f.call()).status,409);
});

test('bank fiscal resume rejects changed or missing credit identity before a fiscal POST',async()=>{
  for(const mutate of [s=>{s.credit.orderId='another-order';},s=>{s.credit.requestHash='changed';},s=>{s.payment.bankTransfer.billingAccount.ibanLast4='9999';},
    s=>{s.payment.bankTransfer.confirmation.bookingDate='2026-11-02';},s=>{s.job.salesDocument.bank_account_id=8;},s=>{s.payment.transactionId='different';}]){
    const f=fixture({method:'bank_transfer'});mutate(f.state());assert.equal((await f.call()).status,409);assert.equal(f.state().issueCalls,0);assert.equal(f.state().writes,0);
  }
});

function markUnstartedBank(f){const state=f.state();state.payment.fiscalStatus='pending';state.job.status='pending';state.job.issuanceProtocol='claimed-v1';delete state.job.errorCode;return f;}

test('a new bank job whose credit acknowledgement was lost is administratively issuable exactly once',async()=>{
  const f=markUnstartedBank(fixture({method:'bank_transfer',ownerId:'participant'}));
  assert.equal((await f.call()).status,200);assert.equal(f.state().issueCalls,1);assert.equal(f.state().job.status,'issued');
  assert.ok(f.state().job.issuanceAttemptId);assert.equal(f.state().job.issuanceAttemptId,f.state().payment.issuanceAttemptId);
  assert.equal((await f.call()).status,409);assert.equal(f.state().issueCalls,1);assert.equal(f.state().registration.documentCount,1);
});

test('only the invocation that verifies its own bank claim can issue after a lost claim acknowledgement',async()=>{
  const f=markUnstartedBank(fixture({method:'bank_transfer',loseClaimAcknowledgement:true}));
  assert.equal((await f.call()).status,200);assert.equal(f.state().issueCalls,1);assert.equal(f.state().job.status,'issued');
});

test('legacy pending jobs, stale bank claims and uncertain results cannot be resumed as unstarted',async()=>{
  for(const mutate of [s=>{delete s.job.issuanceProtocol;},s=>{s.job.issuanceAttemptId=ID;},s=>{s.payment.issuanceAttemptId=ID;},
    s=>{s.job.issuanceStartedAt='2026-11-01T09:00:00Z';},s=>{s.job.resumeAttemptId=ID;},s=>{s.job.status='issuing';s.payment.fiscalStatus='issuing';},
    s=>{s.job.status='outcome_unknown';s.payment.fiscalStatus='outcome_unknown';},s=>{s.payment.fiscalDocumentId=900;}]){
    const f=markUnstartedBank(fixture({method:'bank_transfer'}));mutate(f.state());assert.equal((await f.call()).status,409);
    assert.equal(f.state().issueCalls,0);assert.equal(f.state().writes,0);
  }
});

test('a known authorization failure in the claimed bank protocol receives a fresh claim after explicit recovery',async()=>{
  const f=fixture({method:'bank_transfer'});const s=f.state();s.job.issuanceProtocol='claimed-v1';s.job.issuanceAttemptId=ID;s.payment.issuanceAttemptId=ID;
  assert.equal((await f.call()).status,200);assert.equal(f.state().issueCalls,1);assert.notEqual(f.state().job.issuanceAttemptId,ID);
});

test('a claimed MB WAY invoice uses OU and resumes safely after a known authorization failure',async()=>{
  const f=fixture({method:'mbway'});const s=f.state();s.job.issuanceProtocol='claimed-v1';s.job.issuanceAttemptId=ID;s.payment.issuanceAttemptId=ID;
  assert.equal(s.job.salesDocument.payment_mechanism,'OU');assert.match(s.job.salesDocument.notes,/MB WAY via EuPago/);
  assert.equal((await f.call()).status,200);assert.equal(f.state().issueCalls,1);assert.equal(f.state().job.status,'issued');
  assert.notEqual(f.state().job.issuanceAttemptId,ID);assert.equal((await f.call()).status,409);assert.equal(f.state().issueCalls,1);
});

test('a new MB WAY job without any started claim is recoverable, while an orphan issuing claim is blocked',async()=>{
  const f=fixture({method:'mbway'});f.state().payment.fiscalStatus='pending';f.state().job.status='pending';f.state().job.issuanceProtocol='claimed-v1';delete f.state().job.errorCode;
  assert.equal((await f.call()).status,200);assert.equal(f.state().issueCalls,1);
  const orphan=fixture({method:'mbway'});orphan.state().payment.fiscalStatus='issuing';orphan.state().job.status='issuing';orphan.state().job.issuanceProtocol='claimed-v1';
  orphan.state().job.issuanceAttemptId=ID;orphan.state().payment.issuanceAttemptId=ID;
  assert.equal((await orphan.call()).status,409);assert.equal(orphan.state().issueCalls,0);
});
