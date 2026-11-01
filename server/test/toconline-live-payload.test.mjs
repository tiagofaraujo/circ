import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveOnsiteMultibancoFR, buildLiveMultibancoFR } from '../payments/toconline-live-payload.mjs';

import { quotePrimary, quoteSupplementary } from '../payments/quote.mjs';

const billing={customer:{customer_business_name:'Pessoa Teste',customer_tax_registration_number:'203821432',customer_address_detail:'Rua Teste 1',customer_postcode:'3030-471',customer_city:'Coimbra',customer_country:'PT'}};
const quote={eventId:'circ-2027',kind:'primary',currency:'EUR',amountCents:9500,ratePeriod:'early',
  selection:{profile:'external',courseAffiliation:'external',congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0},
  lines:[{code:'congress-onsite',quantity:1,unitAmountCents:9500,amountCents:9500}]};

test('live onsite Multibanco FR uses validated CIRC2027 series and ISE M07 service',()=>{
  const p=buildLiveOnsiteMultibancoFR({orderId:'af91d4b0-d844-4a37-a71e-05f939a04f83',quote,billing,paymentDate:'2026-11-15'});
  assert.equal(p.document_type,'FR');
  assert.equal(p.document_series_id,244);
  assert.equal(p.payment_mechanism,'MB');
  assert.equal(p.tax_exemption_reason_id,9);
  assert.equal(p.lines[0].item_id,55);
  assert.equal(p.lines[0].tax_code,'ISE');
  assert.equal(p.lines[0].unit_price,95);
});

test('mixed/course/dinner orders remain blocked from first live fiscal cut',()=>{
  const mixed=structuredClone(quote);
  mixed.amountCents=13000;
  mixed.selection.morningCourse=true;
  mixed.lines.push({code:'course-morning',quantity:1,unitAmountCents:3500,amountCents:3500});
  assert.throws(()=>buildLiveOnsiteMultibancoFR({orderId:'af91d4b0-d844-4a37-a71e-05f939a04f83',quote:mixed,billing,paymentDate:'2026-11-15'}),/unsupported-order/);
});

const ID='af91d4b0-d844-4a37-a71e-05f939a04f83';
const ctx={uid:'participant',emailVerified:true};
const selected=changes=>({profile:'external',congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0,...changes});
const primary=changes=>quotePrimary(selected(changes),ctx,null,new Date('2026-11-15T12:00:00Z'));
const build=source=>buildLiveMultibancoFR({orderId:ID,quote:source,billing,paymentDate:'2026-11-15'});
function supplementary(changes) {
  const registration={id:'circ-2027-participant',eventId:'circ-2027',userId:'participant',status:'confirmed',isTest:false,testMode:false,
    payment:{status:'paid'},selection:selected({}),entitlements:{congressMode:'onsite',morningCourse:false,afternoonCourse:false,dinnerQuantity:0}};
  return quoteSupplementary({morningCourse:false,afternoonCourse:false,dinnerQuantity:0,...changes},ctx,registration,new Date('2026-11-15T12:00:00Z'));
}

test('catalogue builder preserves the complete legacy onsite payload for frozen-job comparisons',()=>{
  assert.deepEqual(build(quote),buildLiveOnsiteMultibancoFR({orderId:ID,quote,billing,paymentDate:'2026-11-15'}));
  assert.equal(build(quote).notes,'CIRC 2027 — inscrição presencial');
  assert.equal(build(quote).external_reference,`CIRC27-${ID.toUpperCase()}`);
});

test('virtual congress maps to the existing service56 and M07 exemption',()=>{
  const source=primary({congressMode:'virtual'});const result=build(source);
  assert.equal(source.amountCents,6000);assert.equal(result.lines.length,1);
  assert.equal(result.lines[0].item_id,56);assert.equal(result.lines[0].unit_price,60);
  assert.equal(result.lines[0].tax_code,'ISE');assert.equal(result.tax_exemption_reason_id,9);
});

test('mixed basket retains gross catalogue prices and the established header-only exemption contract',()=>{
  const source=primary({morningCourse:true,afternoonCourse:true,dinnerQuantity:2});const result=build(source);
  assert.equal(source.amountCents,22500);
  assert.deepEqual(result.lines.map(line=>[line.item_id,line.quantity,line.unit_price,line.tax_code,line.tax_percentage]),[
    [55,1,95,'ISE',0],[57,1,35,'NOR',23],[58,1,35,'NOR',23],[59,2,30,'ISE',0],
  ]);
  assert.equal(result.tax_exemption_reason_id,9);assert.equal(result.vat_included_prices,true);
  assert.ok(result.lines.every(line=>!Object.hasOwn(line,'tax_exemption_reason_id')));
  assert.equal(result.lines.reduce((total,line)=>total+Math.round(line.unit_price*100)*line.quantity,0),source.amountCents);
});

test('course-only primary order has23 percent VAT and no exemption header',()=>{
  const source=primary({congressMode:'courses-only',morningCourse:true,afternoonCourse:true});const result=build(source);
  assert.equal(source.amountCents,7000);assert.equal(result.tax_exemption_reason_id,undefined);
  assert.deepEqual(result.lines.map(line=>line.item_id),[57,58]);
  assert.ok(result.lines.every(line=>line.tax_code==='NOR'&&line.tax_percentage===23));
});

test('supplementary dinner and course orders are independent FRs with unchanged catalogue quantities and rules',()=>{
  const dinner=build(supplementary({dinnerQuantity:3}));
  assert.equal(dinner.lines.length,1);assert.equal(dinner.lines[0].quantity,3);assert.equal(dinner.lines[0].unit_price,30);
  assert.equal(dinner.tax_exemption_reason_id,9);assert.equal(dinner.notes,'CIRC 2027 — pedido complementar');
  const course=build(supplementary({morningCourse:true}));
  assert.equal(course.lines.length,1);assert.equal(course.lines[0].item_id,57);assert.equal(course.tax_exemption_reason_id,undefined);
});

test('inconsistent, duplicate, unknown or changed source lines fail before producing a fiscal payload',()=>{
  const original=primary({morningCourse:true});
  const mutations=[
    source=>{source.amountCents++;},source=>{source.lines[0].unitAmountCents--;},source=>{source.lines[0].quantity=2;},
    source=>{source.lines[1].code='unknown';},source=>{source.lines.push({...source.lines[0]});},
    source=>{source.selection.morningCourse=false;},source=>{source.selection.courseAffiliation='uls';},
    source=>{source.kind='sandbox';},source=>{source.selection.dinnerQuantity=-1;},
  ];
  for(const change of mutations){const source=structuredClone(original);change(source);assert.throws(()=>build(source),/live-fiscal\/(unsupported-order|source-mismatch)/);}
});

test('invalid dates, foreign billing and billing fields capable of overriding document controls are rejected',()=>{
  for(const changes of [{paymentDate:'2026-02-30'},{orderId:'not-a-uuid'},
    {billing:{customer:{...billing.customer,customer_country:'ES'}}},{billing:{customer:{...billing.customer,payment_mechanism:'OTHER'}}}]){
    assert.throws(()=>buildLiveMultibancoFR({orderId:ID,quote,billing,paymentDate:'2026-11-15',...changes}),/unsupported-order/);
  }
});
