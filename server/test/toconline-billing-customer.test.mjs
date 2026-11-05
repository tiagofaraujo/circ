import test from 'node:test';
import assert from 'node:assert/strict';
import { billingCustomerFromProfile, validateBillingCustomerSnapshot } from '../payments/toconline-billing-customer.mjs';

const validCustomer = () => ({
  customer_business_name: 'José d’Ávila — Serviços Clínicos',
  customer_tax_registration_number: '203821432',
  customer_address_detail: 'Rua da Ciência, nº 38, Loja Á',
  customer_postcode: '3030-471',
  customer_city: 'São João de Coimbra',
  customer_country: 'PT',
});
const profileFor = customer => ({
  billingName: customer.customer_business_name,
  taxNumber: customer.customer_tax_registration_number,
  billingAddress: customer.customer_address_detail,
  billingPostalCode: customer.customer_postcode,
  billingCity: customer.customer_city,
  billingCountry: customer.customer_country,
});

test('maps a complete Portuguese billing profile to TOConline customer fields', () => {
  const result = billingCustomerFromProfile({
    name: 'Pessoa Teste', billingName: 'Empresa Teste, Lda.',
    taxNumber: '123456789', billingAddress: 'Rua Um, 1',
    billingPostalCode: '3000-000', billingCity: 'Coimbra', billingCountry: 'Portugal',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.customer, {
    customer_business_name: 'Empresa Teste, Lda.',
    customer_tax_registration_number: '123456789',
    customer_address_detail: 'Rua Um, 1',
    customer_postcode: '3000-000',
    customer_city: 'Coimbra',
    customer_country: 'PT',
  });
});

test('participant name is the safe fallback when no separate billing entity is provided', () => {
  const result = billingCustomerFromProfile({
    name: 'Pessoa Teste', taxNumber: '123456789', billingAddress: 'Rua Um, 1',
    billingPostalCode: '3000-000', billingCity: 'Coimbra', billingCountry: 'PT',
  });
  assert.equal(result.ok, true);
  assert.equal(result.customer.customer_business_name, 'Pessoa Teste');
});

test('invalid or incomplete fiscal data fail closed without producing a customer payload', () => {
  const result = billingCustomerFromProfile({
    name: '', taxNumber: '000000000', billingAddress: '',
    billingPostalCode: '3000', billingCity: '', billingCountry: 'Spain',
  });
  assert.equal(result.ok, false);
  assert.equal(result.customer, null);
  assert.ok(result.issues.includes('billing-name-required'));
  assert.ok(result.issues.includes('billing-tax-number-invalid'));
  assert.ok(result.issues.includes('billing-address-required'));
  assert.ok(result.issues.includes('billing-postcode-invalid'));
  assert.ok(result.issues.includes('billing-city-required'));
  assert.ok(result.issues.includes('billing-country-unmapped'));
});


test('seller NIF cannot be used as the buyer in a sales document preview', () => {
  const result = billingCustomerFromProfile({
    billingName: 'Associação Hemisfério Disciplinado - AHD',
    taxNumber: '517072262',
    billingAddress: 'Rua Romeiras, nº 38, Loja A',
    billingPostalCode: '3030-471',
    billingCity: 'Coimbra',
    billingCountry: 'Portugal',
  });
  assert.equal(result.ok, false);
  assert.equal(result.customer, null);
  assert.ok(result.issues.includes('billing-tax-number-is-seller'));
});

test('a valid frozen snapshot preserves its original identity, Unicode and every agreed byte', () => {
  const customer = Object.freeze(validCustomer()), before = JSON.stringify(customer);
  const result = validateBillingCustomerSnapshot(customer);
  assert.deepEqual(result, { ok: true, issues: [], customer });
  assert.equal(result.customer, customer);
  assert.equal(JSON.stringify(customer), before);
  assert.equal(result.customer.customer_business_name, 'José d’Ávila — Serviços Clínicos');
  assert.equal(result.customer.customer_address_detail, 'Rua da Ciência, nº 38, Loja Á');
});

test('snapshots require exactly the six own billing fields and never accept added metadata', () => {
  const invalid = [null, undefined, [], 'customer', 42,
    { ...validCustomer(), createdAt: { seconds: 1793534400 } },
    { ...validCustomer(), extra: 'not part of the frozen agreement' },
  ];
  for (const key of Object.keys(validCustomer())) {
    const customer = validCustomer(); delete customer[key]; invalid.push(customer);
  }
  const inherited = Object.create({ customer_country: 'PT' });
  Object.assign(inherited, validCustomer()); delete inherited.customer_country; invalid.push(inherited);
  for (const customer of invalid) {
    assert.deepEqual(validateBillingCustomerSnapshot(customer), {
      ok: false, issues: ['billing-customer-fields-invalid'], customer: null,
    });
  }
});

test('all snapshot fields reject non-string values without returning any billing payload', () => {
  const issues = {
    customer_business_name: 'billing-name-required',
    customer_tax_registration_number: 'billing-tax-number-invalid',
    customer_address_detail: 'billing-address-required',
    customer_postcode: 'billing-postcode-invalid',
    customer_city: 'billing-city-required',
    customer_country: 'billing-country-unmapped',
  };
  for (const [key, issue] of Object.entries(issues)) {
    for (const value of [null, undefined, 203821432, true, [], {}]) {
      const result = validateBillingCustomerSnapshot({ ...validCustomer(), [key]: value });
      assert.equal(result.ok, false, key);
      assert.equal(result.customer, null, key);
      assert.deepEqual(result.issues, [issue], key);
    }
  }
});

test('frozen names, addresses and cities must already be canonical and contain no ASCII controls', () => {
  const fields = [
    ['customer_business_name', 'billing-name-required'],
    ['customer_address_detail', 'billing-address-required'],
    ['customer_city', 'billing-city-required'],
  ];
  for (const [key, issue] of fields) {
    for (const value of ['', ' Leading space', 'Trailing space ', 'Repeated  spaces', 'Line\nbreak', 'Tab\tbreak',
      'Value\u0000with control', 'Value\u001fwith control', 'Value\u007fwith control']) {
      const customer = Object.freeze({ ...validCustomer(), [key]: value }), before = JSON.stringify(customer);
      const result = validateBillingCustomerSnapshot(customer);
      assert.deepEqual(result, { ok: false, issues: [issue], customer: null }, key);
      assert.equal(JSON.stringify(customer), before);
    }
  }
});

test('snapshot text accepts the exact Unicode limits and rejects the next character', () => {
  for (const [key, maximum, issue] of [
    ['customer_business_name', 180, 'billing-name-required'],
    ['customer_address_detail', 250, 'billing-address-required'],
    ['customer_city', 100, 'billing-city-required'],
  ]) {
    const customer = Object.freeze({ ...validCustomer(), [key]: 'Á'.repeat(maximum) });
    const valid = validateBillingCustomerSnapshot(customer);
    assert.equal(valid.ok, true, key); assert.equal(valid.customer, customer);
    assert.deepEqual(validateBillingCustomerSnapshot({ ...customer, [key]: 'Á'.repeat(maximum + 1) }),
      { ok: false, issues: [issue], customer: null }, key);
  }
});

test('snapshot tax number requires the exact valid Portuguese checksum and cannot be the seller', () => {
  for (const value of ['203821433', '000000000', '111111111', '20382143', '2038214320', '203 821432',
    ' 203821432', '203821432 ', '+203821432', 'PT203821432']) {
    assert.deepEqual(validateBillingCustomerSnapshot({ ...validCustomer(), customer_tax_registration_number: value }),
      { ok: false, issues: ['billing-tax-number-invalid'], customer: null }, value);
  }
  assert.deepEqual(validateBillingCustomerSnapshot({ ...validCustomer(), customer_tax_registration_number: '517072262' }),
    { ok: false, issues: ['billing-tax-number-is-seller'], customer: null });
});

test('snapshots accept only canonical PT and a complete Portuguese postcode', () => {
  for (const value of ['', 'pt', 'Portugal', 'PT ', ' PT', 'ES']) {
    assert.deepEqual(validateBillingCustomerSnapshot({ ...validCustomer(), customer_country: value }),
      { ok: false, issues: ['billing-country-unmapped'], customer: null }, value);
  }
  for (const value of ['', '3030', '3030471', '3030 471', '303-471', '3030-47', '3030-471 ', ' 3030-471', '3030-471\n']) {
    assert.deepEqual(validateBillingCustomerSnapshot({ ...validCustomer(), customer_postcode: value }),
      { ok: false, issues: ['billing-postcode-invalid'], customer: null }, value);
  }
});

test('profiles normalize once to the same accepted snapshot without changing the supplied profile', () => {
  const expected = validCustomer(), profile = Object.freeze({
    ...profileFor(expected), billingName: '  José d’Ávila  —\tServiços Clínicos  ',
    taxNumber: ' 203 821 432 ', billingAddress: ' Rua da Ciência,\n nº 38, Loja Á ',
    billingPostalCode: ' 3030-471 ', billingCity: ' São  João de Coimbra ', billingCountry: ' portugal - continente ',
  }), before = JSON.stringify(profile);
  const result = billingCustomerFromProfile(profile);
  assert.deepEqual(result, { ok: true, issues: [], customer: expected });
  assert.equal(JSON.stringify(profile), before);
  assert.deepEqual(validateBillingCustomerSnapshot(result.customer), result);
  assert.equal(validateBillingCustomerSnapshot(result.customer).customer, result.customer);
});

test('birth date, mobile and profession are optional and never enter the customer snapshot', () => {
  const expected = validCustomer(), base = profileFor(expected);
  const withoutOptional = billingCustomerFromProfile(base);
  const withOptional = billingCustomerFromProfile({ ...base, birthDate: '', mobile: null, profession: undefined,
    dateOfBirth: 'not a date', phone: { private: true } });
  assert.deepEqual(withoutOptional, { ok: true, issues: [], customer: expected });
  assert.deepEqual(withOptional, withoutOptional);
  assert.deepEqual(Object.keys(withOptional.customer).sort(), Object.keys(expected).sort());
});
