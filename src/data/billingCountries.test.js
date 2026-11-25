import { BILLING_COUNTRY_CODES, billingCountryCode, billingCountryOptions } from './billingCountries';

test('Portuguese and English country selections share all canonical supported codes', () => {
  expect(new Set(BILLING_COUNTRY_CODES).size).toBe(249);
  for (const language of ['pt', 'en']) {
    const options = billingCountryOptions(language);
    expect(options).toHaveLength(249);
    for (const { code, name } of options) {
      expect(billingCountryCode(code)).toBe(code);
      expect(billingCountryCode(name)).toBe(code);
    }
  }
});

test('legacy country names and common abbreviations resolve without defaulting unknown countries to Portugal', () => {
  for (const [name, code] of [['Portugal - continente', 'PT'], [' Reino Unido ', 'GB'], ['UK', 'GB'],
    ['United Kingdom', 'GB'], ['França', 'FR'], ['Brasil', 'BR'], ['USA', 'US'], ['es', 'ES']]) {
    expect(billingCountryCode(name)).toBe(code);
  }
  for (const value of ['', 'Atlantis', 'ZZ', 'EU', null, {}, 123]) expect(billingCountryCode(value)).toBeNull();
});
