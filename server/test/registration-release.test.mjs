import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrationReleaseApi } from '../payments/registration-release.mjs';
import { releaseFields, decodeReleaseValue, RegistrationReleaseStoreError } from '../payments/registration-release-store.mjs';

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
  const archives=[],legacy=[],calls=[],storeTokens=[];let commits=0,lostAck=false,conflict=false;
  const store={
    begin:async ({readOnly=true}={})=>{assert.equal(readOnly,true);calls.push(['begin',{readOnly}]);return'fake-transaction';},
    rollback:async tx=>{assert.equal(tx,'fake-transaction');calls.push(['rollback']);},
    readRegistration:async(id,tx)=>{assert.equal(id,registrationId);assert.equal(tx,'fake-transaction');calls.push(['readRegistration']);return registration||{data:null};},
    readProfile:async(id,tx)=>{assert.equal(id,uid);assert.equal(tx,'fake-transaction');return profile;},
    related:async(collection,id,tx)=>{assert.equal(id,registrationId);assert.equal(tx,'fake-transaction');return{payments,documents,registrationOrders:legacy}[collection];},
    readCredit:async(k,tx)=>{assert.equal(k,key);assert.equal(tx,'fake-transaction');return credit;},
    findArchive:async(id,stamp,tx)=>{assert.equal(tx,'fake-transaction');calls.push(['findArchive']);return archives.filter(row=>row.data.registrationId===id&&row.data.stamp===stamp);},
    readArchive:async(id,tx)=>{assert.equal(tx,'fake-transaction');return archives.find(row=>row.data.archiveId===id)||{data:null};},
    commit:async args=>{
      commits++;calls.push(['commit',args]);if(conflict)throw Object.assign(new Error('conflict'),{code:'conflict'});
      assert.equal(Object.hasOwn(args,'transaction'),false);assert.equal(args.registration,registration);
      assert.ok(Array.isArray(args.guards));
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
  const api=createRegistrationReleaseApi({
    verify:async token=>{assert.equal(token,'fake-admin');if(!claims)throw new Error('invalid-session');return claims;},
    storeFactory:({projectId,token})=>{
      assert.equal(projectId,'circ-demo');assert.equal(token,'fake-admin');storeTokens.push(token);return store;
    },
    now:()=>time,makeArchiveId:()=>archiveId,
  });
  const request=(body,options={})=>new Request(`https://circ.test/api/admin/registrations/${registrationId}/release`,{
    method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer fake-admin',Origin:'https://circ.test',...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const call=(body,options)=>api(request(body,options),{FIREBASE_PROJECT_ID:'circ-demo'});
  const sync=row=>{row.fields=releaseFields(row.data);};
  const preview=async()=>{const response=await call();assert.equal(response.status,200);return response.json();};
  return{call,preview,calls,payments,documents,legacy,profile,credit,archives,sync,record,store,storeTokens,
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
  assert.deepEqual(f.storeTokens,['fake-admin']);
});
test('confirmed release archives complete registration and preserves financial records, credit and profile',async()=>{
  const f=fixture(),p=await f.preview(),payment=structuredClone(f.payments[0].data),document=structuredClone(f.documents[0].data),credit=structuredClone(f.credit),profile=structuredClone(f.profile);
  const result=await f.call(confirmation(p.stamp));assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{released:true,archiveId,registrationId});assert.equal(f.registration,null);assert.equal(f.commits,1);
  assert.deepEqual(f.storeTokens,['fake-admin','fake-admin']);
  for(const [current,original] of [[f.payments[0].data,payment],[f.documents[0].data,document]]){
    const{registrationArchiveId:marker,registrationArchivedAt,...rest}=current;assert.equal(marker,archiveId);assert.equal(registrationArchivedAt,time);assert.deepEqual(rest,original);
  }
  assert.deepEqual(f.credit,credit);assert.deepEqual(f.profile,profile);
  assert.equal(f.archives[0].data.registration.createdAt,time);assert.equal(f.archives[0].data.registration.payment.status,'paid');
  const args=f.calls.find(row=>row[0]==='commit')[1];assert.deepEqual(args.archiveFields.registration.mapValue.fields.createdAt,{timestampValue:time});
  assert.deepEqual(args.guards.map(({name,version})=>({name,version})).sort((a,b)=>a.name.localeCompare(b.name)),
    [credit,profile].map(({name,version})=>({name,version})));
  assert.deepEqual(f.calls.filter(row=>row[0]==='begin'),[['begin',{readOnly:true}],['begin',{readOnly:true}]]);
  assert.deepEqual(f.calls.at(-1),['rollback']);
});
test('a lost commit acknowledgement replays the original receipt without reading/deleting a new registration',async()=>{
  const f=fixture(),p=await f.preview(),replacement=f.record('registrations',registrationId,{userId:uid,status:'submitted',newRegistration:true});
  f.setLostAck();const unavailable=await f.call(confirmation(p.stamp));
  assert.equal(unavailable.status,503);
  assert.deepEqual(await unavailable.json(),{error:'registration-release-unavailable',diagnostic:'release-commit-unexpected'});
  assert.equal(f.registration,null);
  f.registration=replacement;const before=f.calls.length;
  const replay=await f.call(confirmation(p.stamp));assert.equal(replay.status,200);assert.equal(f.commits,1);assert.equal(f.registration,replacement);
  assert.ok(!f.calls.slice(before).some(row=>row[0]==='readRegistration'));assert.equal((await replay.json()).archiveId,archiveId);
  assert.deepEqual(f.storeTokens,['fake-admin','fake-admin','fake-admin']);
  assert.deepEqual(f.calls.at(-1),['rollback']);
});
test('source change after preview returns conflict without committing',async()=>{
  const f=fixture(),p=await f.preview();f.registration.data.internalNote='changed';f.sync(f.registration);
  const result=await f.call(confirmation(p.stamp));assert.equal(result.status,409);assert.equal((await result.json()).error,'registration-changed');assert.equal(f.commits,0);
});
test('transaction conflict never retries or removes the registration',async()=>{
  const f=fixture(),p=await f.preview();f.setConflict();const result=await f.call(confirmation(p.stamp));
  assert.equal(result.status,409);assert.equal(f.commits,1);assert.ok(f.registration);assert.equal(f.archives.length,0);
});
test('POST storage errors expose only an allowlisted stage and cause, with no attempted release',async()=>{
  const cases=[
    ['begin','begin','http-403','http-403'],
    ['findArchive','lookup','http-400','http-400'],
    ['readRegistration','inspect','network','network'],
    ['commit','commit','timeout','timeout'],
    ['commit','commit','sensitive-upstream-value','response'],
  ];
  for(const [operation,stage,cause,expected] of cases){
    const f=fixture(),preview=await f.preview();
    f.store[operation]=async()=>{throw new RegistrationReleaseStoreError('storage_unavailable',cause);};
    const response=await f.call(confirmation(preview.stamp));
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'registration-release-unavailable',diagnostic:`release-${stage}-${expected}`});
    assert.ok(f.registration);assert.equal(f.commits,0);
  }
});
test('only the exact verified administrator may obtain a preview or release',async()=>{
  const body=confirmation('a'.repeat(64));
  for(const claims of [{...admin,email_verified:false},{...admin,email:'other@example.test'},{...admin,email:'CIRC.CHUC@gmail.com'},{...admin,sub:'bad/path'}]){
    const f=fixture();f.setClaims(claims);
    assert.equal((await f.call()).status,403);assert.equal((await f.call(body)).status,403);
    assert.equal(f.calls.length,0);assert.deepEqual(f.storeTokens,[]);
  }
  const f=fixture();f.setClaims(null);
  assert.equal((await f.call(body,{headers:{Authorization:''}})).status,401);
  assert.equal((await f.call(body)).status,401);
  assert.deepEqual(f.storeTokens,[]);
});
test('POST requires exact origin, bounded JSON schema and explicit confirmation',async()=>{
  const f=fixture(),p=await f.preview();
  assert.equal((await f.call(confirmation(p.stamp),{headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await f.call(confirmation(p.stamp),{headers:{Origin:''}})).status,403);
  assert.equal((await f.call(confirmation(p.stamp),{headers:{'Content-Type':'text/plain'}})).status,400);
  assert.equal((await f.call({...confirmation(p.stamp),extra:true})).status,400);
  assert.equal((await f.call({stamp:p.stamp,confirmation:'SIM'})).status,400);assert.equal(f.commits,0);
  assert.deepEqual(f.storeTokens,['fake-admin']);
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

const closedId='33333333-3333-4333-8333-333333333333';
function addClosedSupplement(f,status='cancelled'){
  const identifier=`circ_live_${closedId.replaceAll('-','')}`,reference='82980768';
  const row=f.record('payments',closedId,{
    id:closedId,eventId:'circ-2027',registrationId,userId:uid,environment:'production',
    kind:'supplementary',quote:{kind:'supplementary',eventId:'circ-2027',amountCents:4000,currency:'EUR'},
    amountCents:4000,currency:'EUR',provider:'eupago',method:'mbway',identifier,reference,entity:null,
    status,providerState:status,retryAllowed:true,transactionId:null,paidAt:null,
    providerClosure:{source:'eupago-reference-info',state:status,checkedAt:time,reference,identifier,entity:null},
  });
  f.payments.push(row);
  f.registration.data.lastClosedSupplementaryOrderId=closedId;
  f.sync(f.registration);
  return row;
}

test('provider-confirmed cancelled or expired unpaid supplement is archived with the original paid order and FR',async()=>{
  for(const status of ['cancelled','expired']){
    const f=fixture(),closed=addClosedSupplement(f,status);
    const original=structuredClone(closed.data),preview=await f.preview();
    assert.deepEqual(preview.documentNumbers,['FR CIRC2027/7']);
    assert.equal(preview.amountCents,5500);assert.equal(f.commits,0);
    assert.equal((await f.call(confirmation(preview.stamp))).status,200);
    const{registrationArchiveId,registrationArchivedAt,...preserved}=closed.data;
    assert.deepEqual(preserved,original);assert.equal(registrationArchiveId,archiveId);assert.equal(registrationArchivedAt,time);
    assert.equal(f.registration,null);assert.equal(f.commits,1);
    assert.deepEqual(f.archives[0].data.paymentIds,[orderId,closedId]);
    assert.deepEqual(f.archives[0].data.documentIds,[orderId]);
    assert.equal(f.archives[0].data.registration.lastClosedSupplementaryOrderId,closedId);
  }
});

test('closed supplementary pointer requires authenticated provider closure evidence and absence of payment or fiscal evidence',async()=>{
  const changes=[
    p=>{p.status='pending';},p=>{p.kind='primary';},p=>{p.userId='another';},p=>{p.environment='sandbox';},
    p=>{p.retryAllowed=false;},p=>{p.providerState='paga';},p=>{p.providerClosure.source='browser';},
    p=>{p.providerClosure.checkedAt='invalid';},p=>{p.providerClosure.reference='82980769';},
    p=>{p.providerClosure.identifier='different';},p=>{p.providerClosure.entity='10045';},
    p=>{p.paidAt=time;},p=>{p.transactionId='captured';},p=>{p.fiscalStatus='pending';},
    p=>{p.fiscalDocumentId='750';},p=>{p.replacementOrderId=orderId;},
  ];
  for(const change of changes){
    const f=fixture(),closed=addClosedSupplement(f);
    change(closed.data);f.sync(closed);
    const response=await f.call();assert.equal(response.status,409);
    assert.deepEqual(await response.json(),{error:'registration-release-blocked',reason:'closed-attempt-unverified'});
    assert.equal(f.commits,0);
  }
  const f=fixture();addClosedSupplement(f);
  f.documents.push(f.record('documents',closedId,{...f.documents[0].data,id:closedId,orderKind:'supplementary',paymentMethod:'mbway'}));
  const response=await f.call();assert.equal(response.status,409);
  assert.equal((await response.json()).reason,'closed-attempt-unverified');assert.equal(f.commits,0);
});

test('late capture recorded after preview prevents release without removing the registration',async()=>{
  const f=fixture(),closed=addClosedSupplement(f),preview=await f.preview();
  Object.assign(closed.data,{status:'review_required',transactionId:'late-credit',paidAt:time});f.sync(closed);
  const response=await f.call(confirmation(preview.stamp));
  assert.equal(response.status,409);assert.equal((await response.json()).reason,'closed-attempt-unverified');
  assert.ok(f.registration);assert.equal(f.commits,0);
});

test('blocked previews provide the administrator with a bounded diagnostic and no ledger fields',async()=>{
  const cases=[
    ['registration-state',f=>{f.registration.data.isTest=true;}],
    ['open-payment',f=>{f.registration.data.openSupplementaryOrderId=closedId;}],
    ['fiscal-pending',f=>{f.registration.data.fiscalPendingOrderId=orderId;}],
    ['profile-mismatch',f=>{f.profile.data.email='other@example.test';}],
    ['linked-order',f=>{f.legacy.push(f.record('registrationOrders','legacy',{registrationId}));}],
    ['archive-mismatch',f=>{f.payments[0].data.registrationArchivedAt=time;}],
    ['document-mismatch',f=>{f.documents.length=0;}],
  ];
  for(const [reason,change] of cases){
    const f=fixture();change(f);
    const response=await f.call();assert.equal(response.status,409);
    assert.deepEqual(await response.json(),{error:'registration-release-blocked',reason});assert.equal(f.commits,0);
    f.setClaims({...admin,email:'other@example.test'});
    const denied=await f.call();assert.equal(denied.status,403);
    assert.deepEqual(await denied.json(),{error:'admin-required'});
  }
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
  const args=f.calls.find(row=>row[0]==='commit')[1];
  assert.deepEqual(args.guards.map(({name,version})=>({name,version})).sort((a,b)=>a.name.localeCompare(b.name)),
    [f.profile,f.credit,f.archives[0],oldPayment,oldDocument].map(({name,version})=>({name,version})).sort((a,b)=>a.name.localeCompare(b.name)));
  assert.deepEqual(args.payments.map(row=>row.id),[orderId]);assert.deepEqual(args.documents.map(row=>row.id),[orderId]);
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
