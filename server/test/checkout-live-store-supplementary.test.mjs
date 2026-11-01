import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveStore } from '../payments/checkout-live-store.mjs';
const id='11111111-1111-4111-8111-111111111111', root='projects/circ-test/databases/(default)/documents';
const registration={eventId:'circ-2027',userId:'participant',isTest:false,testMode:false,openSupplementaryOrderId:id,addOnOrderCount:1};
const payment={id,kind:'supplementary',environment:'production',userId:'participant',registrationId:'circ-2027-participant'};
function fixture(stale=false){
 const calls=[];
 const store=createCheckoutLiveStore({projectId:'circ-test',uid:'participant',token:'fake-service',fetchImpl:async(url,options)=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
  if(url.endsWith(':batchGet'))return Response.json([{transaction:'transaction-1',found:{name:`${root}/registrations/circ-2027-participant`,updateTime:stale?'newer-version':'r1'}},{missing:`${root}/payments/${id}`}]);
  if(url.endsWith(':commit'))return Response.json({writeResults:[{updateTime:'r2'},{updateTime:'p1'}]});
  if(url.endsWith(':rollback'))return Response.json({});
  throw new Error('unexpected request');
 }});
 return{store,calls};
}
test('supplementary reservation conditionally updates the existing registration and creates one payment in a transaction',async()=>{
 const f=fixture();const result=await f.store.createPendingSupplementary({orderId:id,registration,registrationVersion:'r1',payment});
 assert.deepEqual(result,{registrationVersion:'r2',paymentVersion:'p1'});
 const commit=f.calls.find(call=>call.url.endsWith(':commit'));
 assert.equal(commit.body.transaction,'transaction-1');assert.equal(commit.body.writes.length,2);
 assert.deepEqual(commit.body.writes[0].currentDocument,{updateTime:'r1'});
 assert.deepEqual(commit.body.writes[1].currentDocument,{exists:false});
 assert.equal(commit.body.writes[0].update.fields.openSupplementaryOrderId.stringValue,id);
 assert.equal(commit.body.writes[1].update.fields.kind.stringValue,'supplementary');
});
test('a concurrent registration change aborts reservation before any commit',async()=>{
 const f=fixture(true);await assert.rejects(f.store.createPendingSupplementary({orderId:id,registration,registrationVersion:'r1',payment}),error=>error.code==='conflict');
 assert.ok(!f.calls.some(call=>call.url.endsWith(':commit')));assert.ok(f.calls.some(call=>call.url.endsWith(':rollback')));
});
