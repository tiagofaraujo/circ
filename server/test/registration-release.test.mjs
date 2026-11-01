import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationReleaseApi } from '../payments/registration-release.mjs';
import { releaseFields, decodeReleaseValue } from '../payments/registration-release-store.mjs';

const orderId='11111111-1111-4111-8111-111111111111',archiveId='22222222-2222-4222-8222-222222222222';
const uid='target-person',registrationId=`circ-2027-${uid}`,email='araujotiagofc@gmail.com';
const time='2026-11-01T12:00:00.000Z',key='a'.repeat(64),requestHash='b'.repeat(64);
const admin={sub:'administrator',email:'circ.chuc@gmail.com',email_verified:true};
function fixture(){
  const root='projects/circ-demo/databases/(default)/documents';
  const record=(collection,id,data,version=time)=>({id,name:`${root}/${collection}/${id}`,data,fields:releaseFields(data),version});
  let registration=record('registrations',registrationId,{eventId:'circ-2027',userId:uid,primaryRegistration:true,isTest:false,testMode:false,
    participantEmail:email,participantName:'Pessoa Modelo',status:'confirmed',documentCount:1,addOnOrderCount:0,
    payment:{orderId,status:'paid',method:'bank_transfer',reference:orderId,amountCents:5500,currency:'EUR'},
    createdAt:time,updatedAt:time,selection:{profile:'uls',congressMode:'onsite'},entitlements:{congressMode:'onsite'}});
  // The complete original raw Firestore representation must survive in archive.
  registration.fields.createdAt={timestampValue:time};
  const profile=record('users',uid,{email,name:'Pessoa Modelo',privateProfileField:'retained'});
  const payments=[record('payments',orderId,{id:orderId,kind:'primary',quote:{kind:'primary',eventId:'circ-2027',amountCents:5500},
    eventId:'circ-2027',userId:uid,registrationId,environment:'production',provider:'internal_bank_transfer',method:'bank_transfer',
    identifier:`circ_live_${orderId.replaceAll('-','')}`,status:'paid',amountCents:5500,currency:'EUR',reference:orderId,
    transactionId:`bank_${key}`,paidAt:time,paymentDate:'2026-11-01',fiscalStatus:'issued',fiscalDocumentId:'750',fiscalDocumentNo:'FR CIRC2027/7',
    bankTransfer:{status:'confirmed',paymentReference:orderId,confirmation:{decisionId:archiveId,requestHash,creditKey:key,
      creditReference:'BANK-REF-42',bookingDate:'2026-11-01',amountCents:5500,currency:'EUR',confirmedAt:time}}})];
  const documents=[record('documents',orderId,{id:orderId,eventId:'circ-2027',userId:uid,registrationId,environment:'production',provider:'toconline',
    type:'invoice_receipt',orderKind:'primary',status:'issued',amountCents:5500,paymentMethod:'bank_transfer',providerDocumentId:'750',
    providerDocumentNo:'FR CIRC2027/7',issuedAt:time,salesDocument:{type:'FR',payment_mechanism:'TR',document_no:'stored-original'}})];
  const credit=record('settings',`circ-bank-credit-live-${key}`,{key,kind:'bank-credit-live',eventId:'circ-2027',environment:'production',
    orderId,decisionId:archiveId,requestHash,creditReference:'BANK-REF-42',bookingDate:'2026-11-01',amountCents:5500,currency:'EUR'});
  const archives=[],legacy=[],calls=[];let commits=0,lostAck=false,conflict=false;
  const store={
    begin:async options=>{calls.push(['begin',options]);return'fake-transaction';},
    rollback:async tx=>{assert.equal(tx,'fake-transaction');calls.push(['rollback']);},
    readRegistration:async(id,tx)=>{assert.equal(id,registrationId);assert.equal(tx,'fake-transaction');calls.push(['readRegistration']);return registration||{data:null};},
    readProfile:async(id,tx)=>{assert.equal(id,uid);assert.equal(tx,'fake-transaction');return profile;},
    related:async(collection,id,tx)=>{assert.equal(id,registrationId);assert.equal(tx,'fake-transaction');return{payments,documents,registrationOrders:legacy}[collection];},
    readCredit:async(k,tx)=>{assert.equal(k,key);assert.equal(tx,'fake-transaction');return credit;},
    findArchive:async(id,stamp,tx)=>{assert.equal(tx,'fake-transaction');calls.push(['findArchive']);return archives.filter(row=>row.data.registrationId===id&&row.data.stamp===stamp);},
    readArchive:async(id,tx)=>{assert.equal(tx,'fake-transaction');return archives.find(row=>row.data.archiveId===id)||{data:null};},
    commit:async args=>{
      commits++;calls.push(['commit',args]);if(conflict)throw Object.assign(new Error('conflict'),{code:'conflict'});
      assert.equal(args.transaction,'fake-transaction');assert.equal(args.registration,registration);
      const original=registration;
      const data=decodeReleaseValue({mapValue:{fields:args.archiveFields}});
      archives.push(record('settings',`circ-registration-release-${args.archiveId}`,data));
      const marker={registrationArchiveId:args.archiveId,registrationArchivedAt:args.archivedAt};
      for(const row of [...args.payments,...args.documents]){Object.assign(row.data,marker);Object.assign(row.fields,releaseFields(marker));row.version='2026-11-01T12:01:00.000Z';}
      registration=null;
      assert.deepEqual(args.archiveFields.registration.mapValue.fields,original.fields);
      if(lostAck)throw new Error('lost commit acknowledgement');
    },
  };
  let claims=admin;
  const api=createRegistrationReleaseApi({verify:async()=>claims,storeFactory:({projectId,token})=>{
    assert.equal(projectId,'circ-demo');assert.equal(token,'fake-admin');return store;},now:()=>time,makeArchiveId:()=>archiveId});
  const request=(body,options={})=>new Request(`https://circ.test/api/admin/registrations/${registrationId}/release`,{
    method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer fake-admin',Origin:'https://circ.test',...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const call=(body,options)=>api(request(body,options),{FIREBASE_PROJECT_ID:'circ-demo'});
  const sync=row=>{row.fields=releaseFields(row.data);};
  const preview=async()=>{const response=await call();assert.equal(response.status,200);return response.json();};
  return{call,preview,calls,payments,documents,legacy,profile,credit,archives,sync,record,
    get registration(){return registration;},set registration(value){registration=value;},get commits(){return commits;},
    setClaims:value=>{claims=value;},setLostAck:()=>{lostAck=true;},setConflict:()=>{conflict=true;}};
}
const confirmation=stamp=>({stamp,confirmation:'LIBERTAR NOVA INSCRICAO'});

test('preview is read-only and returns only the target confirmation data',async()=>{
  const f=fixture(),p=await f.preview();
  assert.deepEqual(Object.keys(p).sort(),['registrationId','email','name','amountCents','currency','paymentStatus','documentNumbers','stamp','allowed'].sort());
  assert.equal(p.amountCents,5500);assert.equal(p.email,email);assert.match(p.stamp,/^[a-f0-9]{64}$/);
  assert.deepEqual(p.documentNumbers,['FR CIRC2027/7']);assert.equal(f.commits,0);assert.equal(f.registration.data.payment.status,'paid');
  assert.deepEqual(f.calls[0],['begin',{readOnly:true}]);assert.deepEqual(f.calls.at(-1),['rollback']);
});
test('confirmed release archives complete registration and preserves financial records, credit and profile',async()=>{
  const f=fixture(),p=await f.preview(),payment=structuredClone(f.payments[0].data),document=structuredClone(f.documents[0].data),credit=structuredClone(f.credit),profile=structuredClone(f.profile);
  const result=await f.call(confirmation(p.stamp));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{released:true,archiveId,registrationId});assert.equal(f.registration,null);assert.equal(f.commits,1);
  for(const [current,original] of [[f.payments[0].data,payment],[f.documents[0].data,document]]){
    const{registrationArchiveId:marker,registrationArchivedAt,...rest}=current;assert.equal(marker,archiveId);assert.equal(registrationArchivedAt,time);assert.deepEqual(rest,original);
  }
  assert.deepEqual(f.credit,credit);assert.deepEqual(f.profile,profile);
  assert.equal(f.archives[0].data.registration.createdAt,time);assert.equal(f.archives[0].data.registration.payment.status,'paid');
  const args=f.calls.find(row=>row[0]==='commit')[1];assert.deepEqual(args.archiveFields.registration.mapValue.fields.createdAt,{timestampValue:time});
});
test('a lost commit acknowledgement replays the original receipt without reading/deleting a new registration',async()=>{
  const f=fixture(),p=await f.preview(),replacement=f.record('registrations',registrationId,{userId:uid,status:'submitted',newRegistration:true});
  f.setLostAck();assert.equal((await f.call(confirmation(p.stamp))).status,503);assert.equal(f.registration,null);
  f.registration=replacement;const before=f.calls.length;
  const replay=await f.call(confirmation(p.stamp));assert.equal(replay.status,200);assert.equal(f.commits,1);assert.equal(f.registration,replacement);
  assert.ok(!f.calls.slice(before).some(row=>row[0]==='readRegistration'));assert.equal((await replay.json()).archiveId,archiveId);
});
test('source change after preview returns conflict without committing',async()=>{
  const f=fixture(),p=await f.preview();f.registration.data.internalNote='changed';f.sync(f.registration);
  const result=await f.call(confirmation(p.stamp));assert.equal(result.status,409);assert.equal((await result.json()).error,'registration-changed');assert.equal(f.commits,0);
});
test('transaction conflict never retries or removes the registration',async()=>{
  const f=fixture(),p=await f.preview();f.setConflict();const result=await f.call(confirmation(p.stamp));
  assert.equal(result.status,409);assert.equal(f.commits,1);assert.ok(f.registration);assert.equal(f.archives.length,0);
});
test('only the exact verified administrator may obtain a preview or release',async()=>{
  for(const claims of [{...admin,email_verified:false},{...admin,email:'other@example.test'},{...admin,email:'CIRC.CHUC@gmail.com'}]){
    const f=fixture();f.setClaims(claims);assert.equal((await f.call()).status,403);assert.equal(f.calls.length,0);
  }
});
test('POST requires exact origin, bounded JSON schema and explicit confirmation',async()=>{
  const f=fixture(),p=await f.preview();
  assert.equal((await f.call(confirmation(p.stamp),{headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await f.call({...confirmation(p.stamp),extra:true})).status,400);
  assert.equal((await f.call({stamp:p.stamp,confirmation:'SIM'})).status,400);assert.equal(f.commits,0);
});
test('missing registration is reported without changing any retained ledger',async()=>{
  const f=fixture();f.registration=null;const response=await f.call();assert.equal(response.status,404);assert.equal(f.payments.length,1);assert.equal(f.commits,0);
});
test('target mismatch and unfinished/ambiguous registrations are blocked',async()=>{
  for(const change of [r=>{r.participantEmail='someone@example.test';},r=>{r.isTest=true;},r=>{r.voucherId='company';},
    r=>{r.openSupplementaryOrderId=archiveId;},r=>{r.fiscalPendingOrderId=orderId;},r=>{r.lastClosedSupplementaryOrderId=archiveId;},
    r=>{r.payment.status='pending';},r=>{r.documentCount=2;},r=>{r.addOnOrderCount=1;},r=>{r.paymentAttemptOrderIds=[orderId,archiveId];}]){
    const f=fixture();change(f.registration.data);f.sync(f.registration);const response=await f.call();assert.equal(response.status,409);assert.equal((await response.json()).error,'registration-release-blocked');assert.equal(f.commits,0);
  }
});
test('all linked real payments must be settled and have the matching issued FR',async()=>{
  const changes=[f=>{f.payments[0].data.status='pending';},f=>{f.payments[0].data.status='review_required';},f=>{f.payments[0].data.fiscalStatus='outcome_unknown';},
    f=>{f.payments[0].data.fiscalDocumentId='999';},f=>{f.documents[0].data.status='issuing';},f=>{f.documents[0].data.paymentMethod='multibanco';},
    f=>{f.documents[0].data.providerDocumentNo='RC OTHER/1';},f=>{f.credit.data.amountCents=9500;},f=>{f.documents.push(f.record('documents',archiveId,{...f.documents[0].data,id:archiveId}));},
    f=>{f.legacy.push(f.record('registrationOrders','legacy',{registrationId}));},f=>{f.profile.data.email='wrong@example.test';}];
  for(const change of changes){const f=fixture();change(f);for(const row of [...f.payments,...f.documents,f.credit,f.profile])f.sync(row);
    const response=await f.call();assert.equal(response.status,409);assert.equal(f.commits,0);}
});
test('truncated financial listings fail closed rather than archive only a subset',async()=>{
  const f=fixture();while(f.payments.length<26)f.payments.push(f.payments[0]);assert.equal((await f.call()).status,409);assert.equal(f.commits,0);
});
test('older archived financial rows are validated and excluded from the current release',async()=>{
  const f=fixture(),oldId='33333333-3333-4333-8333-333333333333',oldArchive='44444444-4444-4444-8444-444444444444';
  const archivedAt='2026-10-30T12:00:00.000Z',marker={registrationArchiveId:oldArchive,registrationArchivedAt:archivedAt};
  f.archives.push(f.record('settings',`circ-registration-release-${oldArchive}`,{kind:'registration-release',eventId:'circ-2027',registrationId,userId:uid,email,
    archiveId:oldArchive,released:true,stamp:'c'.repeat(64),archivedAt,paymentIds:[oldId],documentIds:[oldId]}));
  const oldPayment=f.record('payments',oldId,{...f.payments[0].data,id:oldId,...marker});
  const oldDocument=f.record('documents',oldId,{...f.documents[0].data,id:oldId,...marker});f.payments.push(oldPayment);f.documents.push(oldDocument);
  const p=await f.preview(),old=structuredClone([oldPayment,oldDocument]);assert.equal((await f.call(confirmation(p.stamp))).status,200);
  assert.deepEqual([oldPayment,oldDocument],old);assert.deepEqual(f.archives.at(-1).data.paymentIds,[orderId]);assert.deepEqual(f.archives.at(-1).data.documentIds,[orderId]);
});
test('unproven archive markers cannot hide a linked unsettled payment',async()=>{
  const f=fixture();f.payments[0].data.registrationArchiveId=archiveId;f.payments[0].data.registrationArchivedAt=time;f.sync(f.payments[0]);
  assert.equal((await f.call()).status,409);assert.equal(f.commits,0);
});

function stripeFixture(){
  const f=fixture(),p=f.payments[0].data,r=f.registration.data,d=f.documents[0].data;
  Object.assign(p,{provider:'stripe',method:'stripe_card',reference:'cs_live_archivedStripeSession',transactionId:'pi_archivedStripeIntent',
    stripe:{id:'cs_live_archivedStripeSession',status:'complete',paymentStatus:'paid',paymentIntentId:'pi_archivedStripeIntent'},stripeInstrument:{funding:'credit',wallet:'apple_pay'}});
  delete p.bankTransfer;r.payment.method='stripe_card';r.payment.reference=p.reference;d.paymentMethod='stripe_card';d.salesDocument.payment_mechanism='CC';
  for(const row of [f.payments[0],f.registration,f.documents[0]])f.sync(row);return f;
}

test('a settled Stripe registration archives only its active registration while preserving issued payment and invoice references',async()=>{
  const f=stripeFixture(),preview=await f.preview(),before=structuredClone([f.payments[0].data,f.documents[0].data]);
  assert.equal((await f.call(confirmation(preview.stamp))).status,200);assert.equal(f.registration,null);
  for(const [index,row] of [f.payments[0],f.documents[0]].entries()){
    const{registrationArchiveId,registrationArchivedAt,...data}=row.data;assert.equal(registrationArchiveId,archiveId);assert.ok(registrationArchivedAt);assert.deepEqual(data,before[index]);
  }
});

test('Stripe archival rejects mismatched session, intent and unconfirmed funding before mutation',async()=>{
  for(const mutate of [p=>{p.stripe.id='cs_live_differentSession';},p=>{p.stripe.paymentIntentId='pi_differentIntent';},
    p=>{p.stripe.paymentStatus='unpaid';},p=>{p.stripeInstrument.funding='unknown';},p=>{p.transactionId='bank_claim';}]){
    const f=stripeFixture();mutate(f.payments[0].data);f.sync(f.payments[0]);assert.equal((await f.call()).status,409);assert.equal(f.commits,0);
  }
});
