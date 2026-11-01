import test from 'node:test';
import assert from 'node:assert/strict';
import { completeLiveFiscalJob } from '../payments/live-fiscal-issue.mjs';

const ID='11111111-1111-4111-8111-111111111111';
const externalReference=`CIRC27-${ID.toUpperCase()}`;
function fixture({ onIssue, providerError, failIssuedSave = false, loseCommittedResponse = false, claimedProtocol=false,
  failClaim=false,loseClaimAcknowledgement=false,failClaimRead=false } = {}) {
  let p={id:ID,userId:'owner',registrationId:'circ-2027-owner',eventId:'circ-2027',environment:'production',provider:'eupago',method:'multibanco',
    amountCents:3500,currency:'EUR',identifier:'circ_live_'+ID.replaceAll('-',''),reference:'123456789',entity:'12345',transactionId:'777',
    paidAt:'2026-11-01T12:00:00Z',paymentDate:'2026-11-01',status:'paid',fiscalStatus:'pending',
    quote:{kind:'supplementary',amountCents:3500,selection:{morningCourse:true}},billingSnapshot:{customer_business_name:'Pessoa'}};
  let r={userId:'owner',eventId:'circ-2027',primaryRegistration:true,isTest:false,testMode:false,status:'confirmed',documentCount:2,
    payment:{status:'paid',orderId:'primary-order',amountCents:9500},entitlements:{congressMode:'onsite',morningCourse:true,dinnerQuantity:2},
    openSupplementaryOrderId:ID,fiscalPendingOrderId:ID};
  let j={id:ID,userId:'owner',registrationId:'circ-2027-owner',eventId:'circ-2027',environment:'production',provider:'toconline',type:'invoice_receipt',
    paymentMethod:'multibanco',amountCents:3500,externalReference,salesDocument:{external_reference:externalReference,lines:[{item_id:57,quantity:1,unit_price:35}]},status:'pending'};
  if(claimedProtocol){p.method='bank_transfer';p.provider='internal_bank_transfer';j.paymentMethod='bank_transfer';j.issuanceProtocol='claimed-v1';}
  let pv=1,rv=1,jv=1,posts=0,commits=0,actualCommits=0;
  const clone=value=>structuredClone(value);
  const store={payment:async()=>{if(failClaimRead&&p.fiscalStatus==='issuing')throw new Error('read unavailable');return{data:clone(p),version:pv};},registration:async()=>({data:clone(r),version:rv}),document:async()=>({data:clone(j),version:jv}),
    finalizeFiscalResult:async input=>{
      commits++;
      if(input.paymentVersion!==pv||input.registrationVersion!==rv||input.documentVersion!==jv)throw Object.assign(new Error('conflict'),{code:'conflict'});
      if(failClaim&&input.document.status==='issuing')throw new Error('claim rejected before commit');
      if(failIssuedSave&&input.document.status==='issued')throw new Error('storage unavailable');
      p=clone(input.payment);r=clone(input.registration);j=clone(input.document);pv++;rv++;jv++;actualCommits++;
      if(loseClaimAcknowledgement&&input.document.status==='issuing')throw new Error('claim acknowledgement lost');
      if(loseCommittedResponse&&actualCommits===1)throw new Error('response lost');
    }};
  const mutate=changes=>{
    if(changes.payment){Object.assign(p,changes.payment);pv++;}
    if(changes.registration){Object.assign(r,changes.registration);rv++;}
    if(changes.job){Object.assign(j,changes.job);jv++;}
  };
  async function run() {
    return completeLiveFiscalJob({store,orderId:ID,payment:await store.payment(),registration:await store.registration(),job:await store.document(),
      fiscalClient:{issueFinalizedSalesDocument:async()=>{posts++;onIssue?.(mutate);if(providerError)throw providerError;return{providerDocumentId:'900',providerDocumentNo:'FR CIRC2027/10'};}},
      env:{},now:()=> '2026-11-01T12:01:00Z'});
  }
  return {run,mutate,state:()=>({payment:p,registration:r,job:j,posts,commits,actualCommits})};
}

test('registration edits during issuance are preserved by a storage-only retry',async()=>{
  const f=fixture({onIssue:mutate=>mutate({registration:{attendance:{day1:true},entitlements:{congressMode:'onsite',morningCourse:true,dinnerQuantity:3}}})});
  assert.equal(await f.run(),'issued');const s=f.state();assert.equal(s.posts,1);assert.equal(s.commits,2);
  assert.deepEqual(s.registration.attendance,{day1:true});assert.equal(s.registration.entitlements.dinnerQuantity,3);
  assert.equal(s.registration.payment.orderId,'primary-order');assert.equal(s.registration.payment.amountCents,9500);
  assert.equal(s.registration.documentCount,3);assert.equal(s.registration.openSupplementaryOrderId,undefined);assert.equal(s.registration.fiscalPendingOrderId,undefined);
});

test('a committed response lost after issuance is detected without incrementing the document count again',async()=>{
  const f=fixture({loseCommittedResponse:true});assert.equal(await f.run(),'issued');
  const s=f.state();assert.equal(s.posts,1);assert.equal(s.commits,1);assert.equal(s.actualCommits,1);assert.equal(s.registration.documentCount,3);
  assert.equal(await f.run(),'issued');assert.equal(f.state().posts,1);assert.equal(f.state().registration.documentCount,3);
});

test('failed issued-result writes retain the accepted provider ID as unknown with bounded commits and no second POST',async()=>{
  const f=fixture({failIssuedSave:true});assert.equal(await f.run(),'outcome_unknown');const s=f.state();
  assert.equal(s.posts,1);assert.equal(s.commits,3);assert.equal(s.job.providerDocumentId,'900');assert.equal(s.payment.fiscalDocumentId,'900');
  assert.equal(s.job.status,'outcome_unknown');assert.equal(s.registration.documentCount,2);assert.equal(s.registration.fiscalPendingOrderId,ID);
  assert.equal(await f.run(),'outcome_unknown');assert.equal(f.state().posts,1);
});

test('an issued result only clears locks belonging to its own order',async()=>{
  const f=fixture();f.mutate({registration:{openSupplementaryOrderId:'another-order'}});
  assert.equal(await f.run(),'issued');assert.equal(f.state().registration.openSupplementaryOrderId,'another-order');
  assert.equal(f.state().registration.fiscalPendingOrderId,undefined);
});

test('a concurrent refund and registration cancellation are preserved while recording the already accepted invoice',async()=>{
  const f=fixture({onIssue:mutate=>mutate({payment:{status:'refunded'},registration:{status:'cancelled',administrativeNote:'Refund recorded'}})});
  assert.equal(await f.run(),'issued');const s=f.state();assert.equal(s.payment.status,'refunded');assert.equal(s.registration.status,'cancelled');
  assert.equal(s.registration.administrativeNote,'Refund recorded');assert.equal(s.registration.documentCount,3);assert.equal(s.posts,1);
});

test('authorization failure is saved against fresh registration fields without a fiscal retry',async()=>{
  const f=fixture({providerError:Object.assign(new Error('auth'),{code:'toconline-reauthorize-required'}),
    onIssue:mutate=>mutate({registration:{attendance:{day2:true}}})});
  assert.equal(await f.run(),'pending_authorization');const s=f.state();assert.equal(s.posts,1);assert.equal(s.commits,2);
  assert.equal(s.job.errorCode,'toconline-reauthorize-required');assert.equal(s.registration.attendance.day2,true);
  assert.equal(s.registration.documentCount,2);assert.equal(s.registration.fiscalPendingOrderId,ID);
});

test('changed fiscal source identity is never overwritten after a provider success',async()=>{
  const f=fixture({onIssue:mutate=>mutate({job:{externalReference:'CIRC27-CHANGED'}})});
  assert.equal(await f.run(),'outcome_unknown');const s=f.state();assert.equal(s.posts,1);assert.equal(s.actualCommits,0);
  assert.equal(s.job.externalReference,'CIRC27-CHANGED');assert.equal(s.registration.documentCount,2);
});

test('invalid document counts keep the accepted identity for reconciliation without fabricating a new count',async()=>{
  const f=fixture();f.mutate({registration:{documentCount:-1}});assert.equal(await f.run(),'outcome_unknown');
  assert.equal(f.state().job.providerDocumentId,'900');assert.equal(f.state().registration.documentCount,-1);assert.equal(f.state().posts,1);
});


test('an uncertain payment flag blocks a new fiscal POST even if the job status is stale',async()=>{
  const f=fixture();f.mutate({payment:{fiscalStatus:'outcome_unknown'}});
  assert.equal(await f.run(),'outcome_unknown');assert.equal(f.state().posts,0);assert.equal(f.state().commits,0);
});

test('new bank protocol durably claims before its only fiscal POST and remains compatible with storage-only result retries',async()=>{
  let f;f=fixture({claimedProtocol:true,onIssue:()=>{
    const s=f.state();assert.equal(s.payment.fiscalStatus,'issuing');assert.equal(s.job.status,'issuing');
    assert.ok(s.job.issuanceAttemptId);assert.equal(s.payment.issuanceAttemptId,s.job.issuanceAttemptId);assert.equal(s.actualCommits,1);
  }});
  assert.equal(await f.run(),'issued');assert.equal(f.state().posts,1);assert.equal(f.state().actualCommits,2);
  assert.equal(f.state().registration.documentCount,3);assert.equal(await f.run(),'issued');assert.equal(f.state().posts,1);
});

test('concurrent new bank completions cannot both own the pending fiscal job',async()=>{
  const f=fixture({claimedProtocol:true});const results=await Promise.all([f.run(),f.run()]);
  assert.ok(results.includes('issued'));assert.equal(f.state().posts,1);assert.equal(f.state().registration.documentCount,3);
});

test('a lost claim acknowledgement permits the original owner to issue once after verifying its own persisted attempt',async()=>{
  const f=fixture({claimedProtocol:true,loseClaimAcknowledgement:true});assert.equal(await f.run(),'issued');
  assert.equal(f.state().posts,1);assert.equal(f.state().actualCommits,2);assert.equal(f.state().registration.documentCount,3);
});

test('failed claims remain unstarted and a missing claim read never causes a speculative fiscal POST',async()=>{
  const rejected=fixture({claimedProtocol:true,failClaim:true});assert.equal(await rejected.run(),'pending');assert.equal(rejected.state().posts,0);assert.equal(rejected.state().job.status,'pending');
  const unreadable=fixture({claimedProtocol:true,failClaimRead:true});assert.equal(await unreadable.run(),'issuing');assert.equal(unreadable.state().posts,0);assert.equal(unreadable.state().job.status,'issuing');
});

test('an orphan issuing bank claim and an uncertain bank result never receive another fiscal POST',async()=>{
  for(const status of ['issuing','outcome_unknown']){
    const f=fixture({claimedProtocol:true});f.mutate({payment:{fiscalStatus:status,issuanceAttemptId:ID},job:{status,issuanceAttemptId:ID}});
    assert.equal(await f.run(),status);assert.equal(f.state().posts,0);assert.equal(f.state().commits,0);
  }
});
