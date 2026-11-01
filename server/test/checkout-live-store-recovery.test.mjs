import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveStore } from '../payments/checkout-live-store.mjs';

const id='af91d4b0-d844-4a37-a71e-05f939a04f83';
const name=`projects/circ-coimbra/databases/(default)/documents/payments/${id}`;
const document={name,fields:{userId:{stringValue:'admin'},environment:{stringValue:'production'}},updateTime:'version'};
test('recovery queries only the authenticated primary registration with bounded cursor pages and never writes',async()=>{
  const requests=[];
  const store=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'service-token',fetchImpl:async(url,options)=>{
    requests.push({url,options}); return Response.json([{document}]);
  }});
  assert.deepEqual(await store.primaryPayment(),{id,data:{userId:'admin',environment:'production'},version:'version'});
  assert.equal(requests.length,1); assert.match(requests[0].url,/\/documents:runQuery$/);
  assert.deepEqual(JSON.parse(requests[0].options.body),{structuredQuery:{from:[{collectionId:'payments'}],
    where:{compositeFilter:{op:'AND',filters:[
      {fieldFilter:{field:{fieldPath:'userId'},op:'EQUAL',value:{stringValue:'admin'}}},
      {fieldFilter:{field:{fieldPath:'registrationId'},op:'EQUAL',value:{stringValue:'circ-2027-admin'}}},
      {fieldFilter:{field:{fieldPath:'environment'},op:'EQUAL',value:{stringValue:'production'}}},
      {fieldFilter:{field:{fieldPath:'quote.kind'},op:'EQUAL',value:{stringValue:'primary'}}},
    ]}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:25}});
});

function row(number,{archived=true}={}){
  const id=`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
  return{document:{name:`projects/circ-coimbra/databases/(default)/documents/payments/${id}`,
    fields:{id:{stringValue:id},userId:{stringValue:'admin'},environment:{stringValue:'production'},...(archived?{registrationArchiveId:{stringValue:'archive-old'}}:{})},updateTime:`v${number}`}};
}

test('historical pages cannot hide a later unique current primary order',async()=>{
  const pages=[Array.from({length:25},(_,i)=>row(i+1)),[row(26),row(27,{archived:false})]],requests=[];
  const store=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'token',fetchImpl:async(url,options)=>{
    requests.push(JSON.parse(options.body).structuredQuery);return Response.json(pages.shift());
  }});
  const current=await store.primaryPayment();assert.equal(current.id,row(27).document.fields.id.stringValue);assert.equal(requests.length,2);
  assert.deepEqual(requests[1].startAt,{values:[{referenceValue:row(25).document.name}],before:false});
});

test('all historical results yield no current order and active matches on separate pages remain ambiguous',async()=>{
  const empty=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'token',fetchImpl:async()=>Response.json([row(1),row(2)])});
  assert.equal(await empty.primaryPayment(),null);
  const pages=[[row(1,{archived:false}),...Array.from({length:24},(_,i)=>row(i+2))],[row(26,{archived:false})]];
  const ambiguous=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'token',fetchImpl:async()=>Response.json(pages.shift())});
  await assert.rejects(ambiguous.primaryPayment(),/order_recovery_ambiguous/);
});

test('a bounded but incomplete historical scan fails closed instead of reporting no current order',async()=>{
  let calls=0;
  const store=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'token',fetchImpl:async()=>{
    const offset=calls++*25;return Response.json(Array.from({length:25},(_,i)=>row(offset+i+1)));
  }});
  await assert.rejects(store.primaryPayment(),/order_recovery_scan_limit/);assert.equal(calls,10);
});
test('missing, multiple and malformed recovery documents cannot yield an arbitrary order',async()=>{
  for(const [rows,error] of [[[{readTime:'empty'}],null],[[{document},{document}],/order_recovery_ambiguous/],
    [[{document:{...document,name:'projects/other/databases/(default)/documents/payments/'+id}}],/storage_invalid/]]){
    const store=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'token',fetchImpl:async()=>Response.json(rows)});
    if(error)await assert.rejects(()=>store.primaryPayment(),error);
    else assert.equal(await store.primaryPayment(),null);
  }
});
