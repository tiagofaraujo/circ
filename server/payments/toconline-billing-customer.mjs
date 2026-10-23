// Read-only conversion of a participant profile into the TOConline customer fields used by an FR preview.
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
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
export function billingCustomerFromProfile(profile) {
  const name = clean(profile?.billingName) || clean(profile?.name);
  const nif = clean(profile?.taxNumber).replace(/\s/g, '');
  const address = clean(profile?.billingAddress);
  const postalCode = clean(profile?.billingPostalCode).toUpperCase();
  const city = clean(profile?.billingCity);
  const country = countryCode(profile?.billingCountry);
  const issues = [];
  if (!name || name.length > 180) issues.push('billing-name-required');
  if (country !== 'PT') issues.push('billing-country-unmapped');
  if (!validPortugueseTaxNumber(nif)) issues.push('billing-tax-number-invalid');
  if (!address || address.length > 250) issues.push('billing-address-required');
  if (!/^\d{4}-\d{3}$/.test(postalCode)) issues.push('billing-postcode-invalid');
  if (!city || city.length > 100) issues.push('billing-city-required');
  if (issues.length) return { ok: false, issues, customer: null };
  return { ok: true, issues: [], customer: {
    customer_business_name: name,
    customer_tax_registration_number: nif,
    customer_address_detail: address,
    customer_postcode: postalCode,
    customer_city: city,
    customer_country: 'PT',
  } };
}
