import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveStore } from '../payments/checkout-live-store.mjs';

const orderId='11111111-1111-4111-8111-111111111111', decisionId='22222222-2222-4222-8222-222222222222',key='a'.repeat(64);
const registrationId='circ-2027-participant';
const root='projects/circ-test/databases/(default)/documents';
const fields = data => Object.fromEntries(Object.entries(data).map(([key,value])=>[key,typeof value==='string'?{stringValue:value}
  :typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:{mapValue:{fields:fields(value)}}]));
const input=()=>({orderId,paymentVersion:'p1',registrationVersion:'r1',
  payment:{id:orderId,eventId:'circ-2027',registrationId,userId:'participant',environment:'production',provider:'internal_bank_transfer',method:'bank_transfer',status:'paid'},
  registration:{userId:'participant',eventId:'circ-2027',registrationKey:'circ-2027:participant',primaryRegistration:true,
    isTest:false,testMode:false,status:'confirmed',payment:{status:'paid'},entitlements:{congressMode:'onsite'}},fiscalJob:{id:orderId,paymentMethod:'bank_transfer'},
  creditClaim:{key,decisionId,orderId,environment:'production',eventId:'circ-2027'},
  audit:{action:'payment.bank-transfer.confirmed',orderId,registrationId},
});
const batch = (body,{creditExists=false,guardName,changed=false}={}) => body.documents.map((name,index)=>({
  ...(index===0?{transaction:'tx1'}:{}),
  ...(name===`${root}/registrations/${registrationId}`?{found:{name,updateTime:'r1',fields:fields({...input().registration,status:'submitted',payment:{status:'pending'},entitlements:{congressMode:''}})}}
    :name===`${root}/payments/${orderId}`?{found:{name,updateTime:'p1'}}
      :name===guardName?{found:{name,updateTime:changed?'newer':'student1'}}
        :creditExists&&name===`${root}/settings/circ-bank-credit-live-${key}`?{found:{name,updateTime:'credit-already-used'}}:{missing:name}),
}));

test('bank confirmation atomically claims a unique credit alongside payment, registration, fiscal job and audit',async()=>{
  const calls=[];const store=createCheckoutLiveStore({projectId:'circ-test',uid:'participant',token:'service',fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body,headers:options.headers});
    if(url.endsWith(':batchGet'))return Response.json(batch(body));
    if(url.endsWith(':runQuery'))return Response.json([]);
    return Response.json({writeResults:[]});
  }});
  await store.confirmBankTransferPaid(input());assert.equal(calls.length,3);
  const commit=calls.find(call=>call.url.endsWith(':commit'));
  assert.equal(commit.body.transaction,'tx1');
  const writes=commit.body.writes;assert.equal(writes.length,6);
  assert.deepEqual(writes.map(write=>write.currentDocument),[{updateTime:'p1'},{updateTime:'r1'},{exists:false},{exists:false},{exists:false},{exists:false}]);
  assert.match(writes[2].update.name,new RegExp(`/documents/${orderId}$`));
  assert.ok(writes[3].update.name.endsWith(`/settings/circ-bank-credit-live-${key}`));
  assert.ok(writes[4].update.name.endsWith(`/auditLogs/bank-live-${orderId}-${decisionId}`));
  assert.equal(writes[5].update.name,`${root}/settings/circ-2027-paid-capacity-v1`);
  assert.equal(calls[0].headers.Authorization,'Bearer service');
});

test('reused-credit CAS conflicts cannot partially update a second payment',async()=>{
  const calls=[];const store=createCheckoutLiveStore({projectId:'circ-test',uid:'participant',token:'service',fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    if(url.endsWith(':batchGet'))return Response.json(batch(body,{creditExists:true}));
    return Response.json({});
  }});
  await assert.rejects(store.confirmBankTransferPaid(input()),error=>error.code==='conflict');
  assert.equal(calls.filter(call=>call.url.endsWith(':commit')).length,0);
  assert.equal(calls.filter(call=>call.url.endsWith(':rollback')).length,3);
  const before=calls.length,bad=input();bad.creditClaim.key='invalid';await assert.rejects(store.confirmBankTransferPaid(bad),error=>error.code==='storage_invalid');assert.equal(calls.length,before);
});

test('bank-credit lookup and bounded admin listing use fixed production collections and filters',async()=>{
  const calls=[];const root='projects/circ-test/databases/(default)/documents';
  const store=createCheckoutLiveStore({projectId:'circ-test',uid:'admin',token:'admin-session',fetchImpl:async(url,options)=>{
    calls.push({url,options,body:options.body?JSON.parse(options.body):null});
    if(options.method==='GET')return Response.json({fields:{orderId:{stringValue:orderId}},updateTime:'credit1'});
    return Response.json([{document:{name:`${root}/payments/${orderId}`,fields:{method:{stringValue:'bank_transfer'}},updateTime:'p1'}}]);
  }});
  assert.equal((await store.bankCredit(key)).data.orderId,orderId);assert.ok(calls[0].url.endsWith(`/settings/circ-bank-credit-live-${key}`));
  const list=await store.adminBankTransfers();assert.equal(list[0].id,orderId);assert.equal(list[0].data.method,'bank_transfer');
  const query=calls[1].body.structuredQuery;assert.equal(query.limit,101);
  assert.deepEqual(query.where.compositeFilter.filters.slice(0,4).map(filter=>[filter.fieldFilter.field.fieldPath,filter.fieldFilter.value.stringValue]),[
    ['eventId','circ-2027'],['environment','production'],['method','bank_transfer'],['provider','internal_bank_transfer'],
  ]);
  assert.equal(query.where.compositeFilter.filters.length,4);
  assert.deepEqual(query.orderBy,[{field:{fieldPath:'__name__'},direction:'ASCENDING'}]);
  assert.equal(query.startAt,undefined);
  await store.adminBankTransfers({after:orderId});
  assert.deepEqual(calls[2].body.structuredQuery.startAt,{values:[{referenceValue:`${root}/payments/${orderId}`}],before:false});
  await assert.rejects(store.adminBankTransfers({after:'../../settings/private'}),error=>error.code==='invalid_request');
});

test('bank confirmation serializes eligibility guards with the credit claim and rejects changed approval before commit',async()=>{
  const root='projects/circ-test/databases/(default)/documents',guardName=`${root}/studentVerifications/participant`;
  for(const changed of [false,true]){
    const calls=[];const store=createCheckoutLiveStore({projectId:'circ-test',uid:'participant',token:'service',fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);calls.push({url,body});
      if(url.endsWith(':batchGet'))return Response.json(batch(body,{guardName,changed}));
      if(url.endsWith(':runQuery'))return Response.json([]);
      return Response.json({});
    }});
    if(changed){await assert.rejects(store.confirmBankTransferPaid({...input(),guards:[{name:guardName,version:'student1'}]}),error=>error.code==='conflict');
      assert.equal(calls.filter(call=>call.url.endsWith(':commit')).length,0);assert.equal(calls.at(-1).url.endsWith(':rollback'),true);
    }else{await store.confirmBankTransferPaid({...input(),guards:[{name:guardName,version:'student1'}]});const commit=calls.find(call=>call.url.endsWith(':commit'));assert.equal(commit.body.transaction,'tx1');assert.equal(commit.body.writes.length,6);}
  }
});
