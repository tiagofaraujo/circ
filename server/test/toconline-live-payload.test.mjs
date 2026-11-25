import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveOnsiteMultibancoFR, buildLiveMultibancoFR, buildLivePaymentFR } from '../payments/toconline-live-payload.mjs';

import { quotePrimary, quoteSupplementary } from '../payments/quote.mjs';
import { LIVE_PAYMENT_MAPPING_REGISTRY } from '../payments/live-payment-methods.mjs';

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

test('all payment methods retain foreign billing and omit absent tax identifiers without changing course taxes', () => {
  const customer = Object.freeze({ ...billing.customer, customer_country: 'GB',
    customer_tax_registration_number: '', customer_postcode: 'SW1A 1AA', customer_city: 'London' });
  const before = JSON.stringify(customer);
  const source = primary({ congressMode: 'courses-only', morningCourse: true });
  for (const [method, extra] of [['multibanco', {}], ['mbway', {}], ['bank_transfer', { bankAccountId: 2 }], ['stripe_card', { cardFunding: 'credit' }]]) {
    const payload = buildLivePaymentFR({ orderId: ID, quote: source, billing: { customer }, paymentDate: '2026-11-15', method, ...extra });
    assert.equal(payload.customer_country, 'GB');
    assert.equal(payload.customer_postcode, 'SW1A 1AA');
    assert.equal(Object.hasOwn(payload, 'customer_tax_registration_number'), false);
    assert.equal(payload.lines[0].tax_country_region, 'PT');
    assert.equal(payload.lines[0].tax_code, 'NOR');
    assert.equal(payload.lines[0].tax_percentage, 23);
    assert.equal(JSON.stringify(customer), before);
  }
});
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

test('organisation discounts preserve fiscal items and quantities while invoicing the amount paid and indicating the discount',()=>{
  const source=quotePrimary(selected({morningCourse:true,dinnerQuantity:2}),ctx,null,new Date('2026-11-15T12:00:00Z'),
    {type:'percentage',value:2000});
  for(const [method,extra] of [['multibanco',{}],['mbway',{}],['bank_transfer',{bankAccountId:2}],['stripe_card',{cardFunding:'credit'}]]){
    const result=buildLivePaymentFR({orderId:ID,quote:source,billing,paymentDate:'2026-11-15',method,...extra});
    assert.deepEqual(result.lines.map(line=>[line.item_id,line.quantity,line.unit_price,line.tax_code]),[
      [55,1,76,'ISE'],[57,1,35,'NOR'],[59,2,30,'ISE'],
    ]);
    assert.equal(result.lines.reduce((total,line)=>total+Math.round(line.unit_price*100)*line.quantity,0),source.amountCents);
    assert.match(result.notes,/Desconto na inscrição 19,00 €/);
  }
  for(const mutate of [
    value=>{value.discount.amountCents++;}, value=>{value.discount.type='unknown';},
    value=>{value.lines[1].unitAmountCents--;value.lines[1].amountCents--;value.amountCents--;}, value=>{delete value.discount;},
  ]){
    const tampered=structuredClone(source);mutate(tampered);
    assert.throws(()=>build(tampered),/live-fiscal\/source-mismatch/);
  }
  assert.throws(()=>build({...supplementary({morningCourse:true}),discount:{type:'fixed',value:100,amountCents:100}}),
    /live-fiscal\/source-mismatch/);
});

test('a fully covered ULS admission leaves only charged items on a positive invoice-receipt', () => {
  const base = { userId: ctx.uid, eventId: 'circ-2027', mec: '123', nameKey: 'PESSOA TESTE', method: 'mec-name-match' };
  const verified = { ...ctx, uls: { ...base, status: 'matched' }, claim: base,
    roster: { active: true, eventId: 'circ-2027', nameKey: base.nameKey } };
  const discount = { type: 'fixed', value: 5500 };
  const date = new Date('2026-11-15T12:00:00Z');
  const source = quotePrimary(selected({ profile: 'uls', morningCourse: true }), verified, null, date, discount);
  const result = build(source);
  assert.equal(source.lines[0].unitAmountCents, 0);
  assert.equal(source.amountCents, 2000);
  assert.deepEqual(result.lines.map(line => [line.item_id, line.quantity, line.unit_price, line.tax_code]), [[57, 1, 20, 'NOR']]);
  assert.equal(result.tax_exemption_reason_id, undefined);
  assert.match(result.notes, /Desconto na inscrição 55,00 €/);
  const zeroTotal = quotePrimary(selected({ profile: 'uls' }), verified, null, date, discount);
  assert.throws(() => build(zeroTotal), /live-fiscal\/unsupported-order/);
});

test('fixed registration vouchers keep VAT framing and exact split-quantity amounts on every fiscal payment payload', () => {
  const base = { userId: ctx.uid, eventId: 'circ-2027', mec: '123', nameKey: 'PESSOA TESTE', method: 'mec-name-match' };
  const verified = { ...ctx, uls: { ...base, status: 'matched' }, claim: base,
    roster: { active: true, eventId: 'circ-2027', nameKey: base.nameKey } };
  const selection = selected({ profile: 'uls', morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 });
  const date = new Date('2026-11-15T12:00:00Z');
  const source = quotePrimary(selection, verified, null, date, {type: 'fixed', value: 7003, scope: 'registration'});
  assert.equal(source.amountCents, 8497);
  for (const [method, extra] of [['multibanco', {}], ['mbway', {}], ['bank_transfer', { bankAccountId: 2 }], ['stripe_card', { cardFunding: 'credit' }]]) {
    const result = buildLivePaymentFR({orderId: ID, quote: source, billing, paymentDate: '2026-11-15', method, ...extra});
    assert.deepEqual(result.lines.map(line => [line.item_id, line.quantity, line.unit_price, line.tax_code, line.tax_percentage]), [
      [55, 1, 30.15, 'ISE', 0], [57, 1, 10.96, 'NOR', 23], [58, 1, 10.97, 'NOR', 23],
      [59, 1, 16.44, 'ISE', 0], [59, 1, 16.45, 'ISE', 0],
    ]);
    assert.equal(result.tax_exemption_reason_id, 9);
    assert.equal(result.lines.reduce((sum, line) => sum + line.quantity * Math.round(line.unit_price * 100), 0), 8497);
    assert.match(result.notes, /Desconto na inscrição 70,03 €/);
  }
  const altered = structuredClone(source);
  altered.lines[0].unitAmountCents -= 1;
  altered.lines[0].amountCents -= 1;
  altered.lines[1].unitAmountCents += 1;
  altered.lines[1].amountCents += 1;
  assert.throws(() => build(altered), /live-fiscal\/source-mismatch/);
  const zero = quotePrimary(selection, verified, null, date, {type: 'fixed', value: 15500, scope: 'registration'});
  assert.equal(zero.amountCents, 0);
  assert.throws(() => build(zero), /live-fiscal\/unsupported-order/);
});

test('course-only primary order has23 percent VAT and no exemption header',()=>{
  const source=primary({congressMode:'courses-only',morningCourse:true,afternoonCourse:true});const result=build(source);
  assert.equal(source.amountCents,7000);assert.equal(result.tax_exemption_reason_id,undefined);
  assert.deepEqual(result.lines.map(line=>line.item_id),[57,58]);
  assert.ok(result.lines.every(line=>line.tax_code==='NOR'&&line.tax_percentage===23));
});

test('organizer coverage bills only the congress and dinners beyond the included one', () => {
  const base = { userId: ctx.uid, eventId: 'circ-2027', mec: '123', nameKey: 'PESSOA TESTE', method: 'mec-name-match' };
  const verified = { ...ctx, uls: { ...base, status: 'matched' }, claim: base,
    roster: { active: true, eventId: 'circ-2027', nameKey: base.nameKey } };
  const date = new Date('2026-11-15T12:00:00Z');
  const included = quotePrimary(selected({ profile: 'uls' }), verified, null, date, undefined, true);
  assert.deepEqual(build(included).lines.map(line => [line.item_id, line.quantity, line.unit_price]), [[55, 1, 55]]);
  const extras = quotePrimary(selected({ profile: 'uls', dinnerQuantity: 3 }), verified, null, date, undefined, true);
  assert.deepEqual(build(extras).lines.map(line => [line.item_id, line.quantity, line.unit_price]), [[55, 1, 55], [59, 2, 30]]);
  const invalid = structuredClone(extras);
  invalid.organizerBenefit.amountCents++;
  assert.throws(() => build(invalid), /live-fiscal\/source-mismatch/);
  delete invalid.organizerBenefit;
  assert.throws(() => build(invalid), /live-fiscal\/source-mismatch/);
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

test('invalid dates, unsupported billing countries and billing fields capable of overriding document controls are rejected',()=>{
  for(const changes of [{paymentDate:'2026-02-30'},{orderId:'not-a-uuid'},
    {billing:{customer:{...billing.customer,customer_country:'ZZ'}}},{billing:{customer:{...billing.customer,payment_mechanism:'OTHER'}}}]){
    assert.throws(()=>buildLiveMultibancoFR({orderId:ID,quote,billing,paymentDate:'2026-11-15',...changes}),/unsupported-order/);
  }
});

test('every production payment method rejects incomplete or invalid frozen billing before building an FR',()=>{
  const mutations=[
    customer=>{delete customer.customer_address_detail;},customer=>{delete customer.customer_postcode;},customer=>{delete customer.customer_city;},
    customer=>{customer.customer_business_name='   ';},customer=>{customer.customer_tax_registration_number='203821431';},
    customer=>{customer.customer_tax_registration_number='517072262';},customer=>{customer.customer_tax_registration_number=203821432;},
    customer=>{customer.customer_address_detail='';},customer=>{customer.customer_address_detail='Rua\u0000Um';},
    customer=>{customer.customer_address_detail='a'.repeat(251);},customer=>{customer.customer_postcode='3030';},
    customer=>{customer.customer_city='';},customer=>{customer.customer_city='c'.repeat(101);},
    customer=>{customer.customer_country='Portugal';},customer=>{customer.payment_mechanism='OTHER';},
  ];
  for(const [method,extra] of [['multibanco',{}],['mbway',{}],['bank_transfer',{bankAccountId:2}],['stripe_card',{cardFunding:'credit'}]]){
    for(const change of mutations){
      const customer=structuredClone(billing.customer);change(customer);
      assert.throws(()=>buildLivePaymentFR({orderId:ID,quote,billing:{customer},paymentDate:'2026-11-15',method,...extra}),/live-fiscal\/unsupported-order/);
    }
  }
});

test('a valid frozen billing snapshot is copied byte-for-byte for every payment mechanism without mutation',()=>{
  const customer=Object.freeze({...billing.customer,customer_business_name:'João D’Ávila & Filhos, Lda.',customer_address_detail:'Praça da Sé, n.º 10 — Loja A'});
  const before=JSON.stringify(customer);
  for(const [method,extra,mechanism] of [['multibanco',{},'MB'],['mbway',{},'OU'],['bank_transfer',{bankAccountId:2},'TR'],
    ['stripe_card',{cardFunding:'credit'},'CC'],['stripe_card',{cardFunding:'debit'},'DC']]){
    const result=buildLivePaymentFR({orderId:ID,quote,billing:{customer},paymentDate:'2026-11-15',method,...extra});
    assert.deepEqual(Object.fromEntries(Object.keys(customer).map(key=>[key,result[key]])),customer);
    assert.equal(result.payment_mechanism,mechanism);assert.equal(JSON.stringify(customer),before);
  }
});

test('bank transfer FR uses documented TR only with a validated company billing account',()=>{
  const input={orderId:ID,quote:primary({morningCourse:true}),billing,paymentDate:'2026-11-15',method:'bank_transfer'};
  const result=buildLivePaymentFR({...input,bankAccountId:7});
  assert.equal(result.payment_mechanism,'TR');assert.equal(result.bank_account_id,7);
  assert.deepEqual(result.lines,build(input.quote).lines);
  for(const bankAccountId of [undefined,null,0,-1,'7',1.5])assert.throws(()=>buildLivePaymentFR({...input,bankAccountId}),/bank-account-unconfirmed/);
  assert.throws(()=>buildLivePaymentFR({...input,method:'multibanco',bankAccountId:7}),/bank-account-unconfirmed/);
});

test('unknown payment mappings cannot produce definitive invoice payloads',()=>{
  for(const method of ['unsupported','card','OU','__proto__'])assert.throws(()=>buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-15',method}),/payment-mechanism-unconfirmed/);
});

test('MB WAY uses the documented generic OU category with explicit provider note and no claimed sales API acceptance',()=>{
  const payload=buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-15',method:'mbway'});
  assert.equal(payload.payment_mechanism,'OU');assert.equal(payload.notes,'CIRC 2027 — inscrição presencial · MB WAY via EuPago');
  assert.deepEqual(payload.lines,build(quote).lines);assert.equal(payload.bank_account_id,undefined);
  assert.equal(LIVE_PAYMENT_MAPPING_REGISTRY.mappings.mbway.status,'documented-generic');
  assert.equal(LIVE_PAYMENT_MAPPING_REGISTRY.mappings.mbway.salesApiValidated,false);
  assert.equal(LIVE_PAYMENT_MAPPING_REGISTRY.mappings.mbway.sources.length,2);
});

test('Stripe fiscal payload distinguishes verified credit and debit and rejects unclassified funding',()=>{
  for(const [cardFunding,mechanism] of [['credit','CC'],['debit','DC']]){
    const payload=buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-15',method:'stripe_card',cardFunding});
    assert.equal(payload.payment_mechanism,mechanism);assert.match(payload.notes,/Cartão via Stripe/);assert.deepEqual(payload.lines,build(quote).lines);
  }
  for(const cardFunding of [undefined,'unknown','prepaid','CC','__proto__'])assert.throws(()=>buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-15',method:'stripe_card',cardFunding}),/payment-mechanism-unconfirmed/);
});

test('Stripe wallet fiscal mapping preserves taxes and uses generic OU only for verified wallet types',()=>{
  for(const stripePaymentType of ['link','paypal']){
    const payload=buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-17',method:'stripe_card',cardFunding:'unknown',stripePaymentType});
    assert.equal(payload.payment_mechanism,'OU');assert.deepEqual(payload.lines,build(quote).lines);
    assert.throws(()=>buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-17',method:'stripe_card',cardFunding:'credit',stripePaymentType}),/payment-mechanism-unconfirmed/);
  }
  for(const stripePaymentType of ['mb_way','klarna','__proto__'])assert.throws(()=>buildLivePaymentFR({orderId:ID,quote,billing,paymentDate:'2026-11-17',method:'stripe_card',cardFunding:'credit',stripePaymentType}),/payment-mechanism-unconfirmed/);
});
