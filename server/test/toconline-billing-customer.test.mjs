import test from 'node:test';
import assert from 'node:assert/strict';
import { billingCustomerFromProfile } from '../payments/toconline-billing-customer.mjs';

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
