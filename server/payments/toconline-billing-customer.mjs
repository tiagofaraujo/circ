// One billing contract for both current profiles and already frozen orders.
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const SELLER_TAX_NUMBER = '517072262';
const customerFields = Object.freeze(['customer_business_name', 'customer_tax_registration_number', 'customer_address_detail',
  'customer_postcode', 'customer_city', 'customer_country']);
const countryCode = value => {
  const v = clean(value).toLowerCase();
  return ['pt', 'portugal', 'portugal - continente', 'portugal continente'].includes(v) ? 'PT' : null;
};
function validPortugueseTaxNumber(value) {
  if (!/^\d{9}$/.test(value) || new Set(value).size === 1) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 8).reduce((acc, digit, index) => acc + digit * (9 - index), 0);
  const mod = sum % 11;
  return (mod < 2 ? 0 : 11 - mod) === digits[8];
}
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
  && value === clean(value) && !/[\u0000-\u001f\u007f]/.test(value);

// Frozen billing is validated without normalizing, replacing, or mutating it.
// Changing it here would change the payload agreed before payment and the hash
// used when resuming an already persisted fiscal job.
export function validateBillingCustomerSnapshot(customer) {
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)
    || Object.keys(customer).length !== customerFields.length
    || customerFields.some(key => !Object.hasOwn(customer, key))
    || Object.keys(customer).some(key => !customerFields.includes(key))) {
    return { ok: false, issues: ['billing-customer-fields-invalid'], customer: null };
  }
  const issues = [];
  if (!validText(customer.customer_business_name, 180)) issues.push('billing-name-required');
  if (customer.customer_country !== 'PT') issues.push('billing-country-unmapped');
  const nif = customer.customer_tax_registration_number;
  if (typeof nif !== 'string' || !validPortugueseTaxNumber(nif)) issues.push('billing-tax-number-invalid');
  else if (nif === SELLER_TAX_NUMBER) issues.push('billing-tax-number-is-seller');
  if (!validText(customer.customer_address_detail, 250)) issues.push('billing-address-required');
  if (typeof customer.customer_postcode !== 'string' || !/^\d{4}-\d{3}$/.test(customer.customer_postcode)) issues.push('billing-postcode-invalid');
  if (!validText(customer.customer_city, 100)) issues.push('billing-city-required');
  return issues.length ? { ok: false, issues, customer: null } : { ok: true, issues: [], customer };
}

export function billingCustomerFromProfile(profile) {
  const name = clean(profile?.billingName) || clean(profile?.name);
  const nif = clean(profile?.taxNumber).replace(/\s/g, '');
  const address = clean(profile?.billingAddress);
  const postalCode = clean(profile?.billingPostalCode).toUpperCase();
  const city = clean(profile?.billingCity);
  const country = countryCode(profile?.billingCountry);
  return validateBillingCustomerSnapshot({
    customer_business_name: name,
    customer_tax_registration_number: nif,
    customer_address_detail: address,
    customer_postcode: postalCode,
    customer_city: city,
    customer_country: country,
  });
}
