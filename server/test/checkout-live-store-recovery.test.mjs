import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutLiveStore } from '../payments/checkout-live-store.mjs';

const id='af91d4b0-d844-4a37-a71e-05f939a04f83';
const name=`projects/circ-coimbra/databases/(default)/documents/payments/${id}`;
const document={name,fields:{userId:{stringValue:'admin'},environment:{stringValue:'production'}},updateTime:'version'};
test('recovery queries only the authenticated primary registration, reads at most two matches and never writes',async()=>{
  const requests=[];
  const store=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'service-token',fetchImpl:async(url,options)=>{
    requests.push({url,options}); return Response.json([{document}]);
  }});
  assert.deepEqual(await store.primaryPayment(),{id,data:{userId:'admin',environment:'production'},version:'version'});
  assert.equal(requests.length,1); assert.match(requests[0].url,/\/documents:runQuery$/);
  assert.deepEqual(JSON.parse(requests[0].options.body),{structuredQuery:{from:[{collectionId:'payments'}],
    where:{compositeFilter:{op:'AND',filters:[
      {fieldFilter:{field:{fieldPath:'registrationId'},op:'EQUAL',value:{stringValue:'circ-2027-admin'}}},
      {fieldFilter:{field:{fieldPath:'environment'},op:'EQUAL',value:{stringValue:'production'}}},
    ]}},limit:2}});
});
test('missing, multiple and malformed recovery documents cannot yield an arbitrary order',async()=>{
  for(const [rows,error] of [[[{readTime:'empty'}],null],[[{document},{document}],/order_recovery_ambiguous/],
    [[{document:{...document,name:'projects/other/databases/(default)/documents/payments/'+id}}],/storage_invalid/]]){
    const store=createCheckoutLiveStore({projectId:'circ-coimbra',uid:'admin',token:'token',fetchImpl:async()=>Response.json(rows)});
    if(error)await assert.rejects(()=>store.primaryPayment(),error);
    else assert.equal(await store.primaryPayment(),null);
  }
});
