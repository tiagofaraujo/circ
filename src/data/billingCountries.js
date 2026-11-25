// ISO 3166-1 alpha-2 codes. Shared by the profile form and server billing
// validation so a displayed country is also accepted by checkout.
export const BILLING_COUNTRY_CODES = Object.freeze(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY '
  + 'HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ '
  + 'NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ '
  + 'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));

const codes = new Set(BILLING_COUNTRY_CODES);
const fold = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ') : '';
const names = Object.fromEntries(['pt', 'en'].map(language => [language,
  new Intl.DisplayNames([language], { type: 'region' })]));
const aliases = new Map(BILLING_COUNTRY_CODES.flatMap(code => [code, names.pt.of(code), names.en.of(code)]
  .map(name => [fold(name), code])));
for (const [name, code] of Object.entries({
  uk: 'GB', 'great britain': 'GB', 'united kingdom of great britain and northern ireland': 'GB',
  usa: 'US', 'united states of america': 'US', 'estados unidos da america': 'US',
  'portugal - continente': 'PT', 'portugal continente': 'PT',
})) aliases.set(fold(name), code);

export const isBillingCountryCode = value => typeof value === 'string' && codes.has(value);
export const billingCountryCode = value => aliases.get(fold(value)) || null;
export function billingCountryOptions(language = 'pt') {
  const locale = language === 'en' ? 'en' : 'pt';
  return BILLING_COUNTRY_CODES.map(code => ({ code, name: names[locale].of(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
