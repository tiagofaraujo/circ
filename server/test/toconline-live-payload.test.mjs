import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveOnsiteMultibancoFR } from '../payments/toconline-live-payload.mjs';

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
