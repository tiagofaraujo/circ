import policy from '../../src/data/circ2027FiscalPolicy.json' with { type: 'json' };
import { CONGRESS_RATES, COURSE_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE } from '../../src/data/registration2027.js';
import { LIVE_FISCAL_PAYMENT_MECHANISMS } from './live-payment-methods.mjs';

const EVENT = 'circ-2027';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const META = Object.freeze({
  'congress-onsite': ['CIRC27-CONG-P', 'Inscrição CIRC 2027 — Congresso presencial'],
  'congress-virtual': ['CIRC27-CONG-O', 'Inscrição CIRC 2027 — Congresso online'],
  'course-morning': ['CIRC27-CURSO-M', 'CIRC 2027 — Curso pré-congresso manhã'],
  'course-afternoon': ['CIRC27-CURSO-T', 'CIRC 2027 — Curso pré-congresso tarde'],
  dinner: ['CIRC27-JANTAR', 'CIRC 2027 — Jantar do congresso'],
});
const customerFields = ['customer_business_name', 'customer_tax_registration_number', 'customer_address_detail', 'customer_postcode', 'customer_city', 'customer_country'];
const fail = (code = 'unsupported-order') => { throw new Error(`live-fiscal/${code}`); };

function validateSource(quote) {
  if (quote?.eventId !== EVENT || !['primary', 'supplementary'].includes(quote.kind) || quote.currency !== 'EUR'
    || !Number.isSafeInteger(quote.amountCents) || quote.amountCents <= 0 || quote.amountCents > 9999900
    || !Array.isArray(quote.lines) || !quote.lines.length || !['early', 'regular'].includes(quote.ratePeriod)) fail();
  const selection = quote.selection;
  if (!selection || !Object.hasOwn(CONGRESS_RATES, selection.profile)
    || typeof selection.morningCourse !== 'boolean' || typeof selection.afternoonCourse !== 'boolean'
    || !Number.isSafeInteger(selection.dinnerQuantity) || selection.dinnerQuantity < 0
    || selection.courseAffiliation !== (selection.profile === 'uls' ? 'uls' : 'external')) fail();
  if (quote.kind === 'primary' ? !['onsite', 'virtual', 'courses-only'].includes(selection.congressMode) : selection.congressMode !== '') fail();
  if (quote.kind === 'primary' && selection.congressMode === 'courses-only' && !selection.morningCourse && !selection.afternoonCourse) fail();
  const expected = [];
  const add = (code, quantity, euro) => { if (quantity) expected.push({ code, quantity, unitAmountCents: Math.round(euro * 100) }); };
  if (selection.congressMode === 'onsite') add('congress-onsite', 1, CONGRESS_RATES[selection.profile][quote.ratePeriod]);
  if (selection.congressMode === 'virtual') add('congress-virtual', 1, VIRTUAL_CONGRESS_RATE);
  const courseRate = selection.profile === 'uls' ? COURSE_RATES.uls : COURSE_RATES.external;
  add('course-morning', Number(selection.morningCourse), courseRate);
  add('course-afternoon', Number(selection.afternoonCourse), courseRate);
  add('dinner', selection.dinnerQuantity, DINNER_RATE);
  if (expected.length !== quote.lines.length) fail();
  let total = 0;
  for (let index = 0; index < expected.length; index++) {
    const source = quote.lines[index], line = expected[index];
    const amount = line.quantity * line.unitAmountCents;
    if (!source || source.code !== line.code || source.quantity !== line.quantity || source.unitAmountCents !== line.unitAmountCents
      || !Number.isSafeInteger(source.amountCents) || !Number.isSafeInteger(amount) || source.amountCents !== amount) fail('source-mismatch');
    total += amount;
  }
  if (!Number.isSafeInteger(total) || total !== quote.amountCents) fail('source-mismatch');
}

// Uses the existing catalogue and fiscal policy. Prices are gross values; the
// TOConline API applies each line's explicit ISE/NOR framing. The API documents
// the exemption reason on the header, required when any line is exempt.
export function buildLivePaymentFR({ orderId, quote, billing, paymentDate, method, bankAccountId }) {
  validateSource(quote);
  const mechanism = Object.hasOwn(LIVE_FISCAL_PAYMENT_MECHANISMS,method) ? LIVE_FISCAL_PAYMENT_MECHANISMS[method] : null;
  if (!mechanism) fail('payment-mechanism-unconfirmed');
  if (method === 'bank_transfer' ? !Number.isSafeInteger(bankAccountId) || bankAccountId <= 0 : bankAccountId !== undefined) fail('bank-account-unconfirmed');
  const date = new Date(`${paymentDate}T00:00:00Z`);
  if (!UUID.test(orderId || '') || !/^20\d{2}-\d{2}-\d{2}$/.test(paymentDate || '')
    || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDate
    || !billing?.customer || Array.isArray(billing.customer) || typeof billing.customer !== 'object'
    || billing.customer.customer_country !== 'PT' || !billing.customer.customer_business_name
    || !billing.customer.customer_tax_registration_number
    || Object.keys(billing.customer).some(key => !customerFields.includes(key))
    || Object.values(billing.customer).some(value => typeof value !== 'string')) fail();
  if (policy.series?.documentType !== 'FR' || !Number.isSafeInteger(policy.series.id) || policy.series.id <= 0
    || policy.exemption?.code !== 'M07' || !Number.isSafeInteger(policy.exemption.id)) fail('policy-invalid');
  const lines = quote.lines.map(source => {
    const [itemCode, description] = META[source.code] || [];
    const rule = policy.services[itemCode];
    if (!rule || !Number.isSafeInteger(rule.id) || rule.id <= 0 || rule.review
      || !['ISE', 'NOR'].includes(rule.taxCode) || !Number.isSafeInteger(rule.percentage)
      || (rule.taxCode === 'ISE' ? rule.percentage !== 0 || rule.exemptionReasonId !== policy.exemption.id
        : rule.percentage <= 0 || rule.exemptionReasonId !== null)) fail('policy-invalid');
    return { item_type: 'Service', item_id: rule.id, item_code: itemCode, description,
      quantity: source.quantity, unit_price: source.unitAmountCents / 100, unit_of_measure: 'un',
      tax_code: rule.taxCode, tax_percentage: rule.percentage, tax_country_region: 'PT' };
  });
  const legacyOnsite = quote.kind === 'primary' && quote.lines.length === 1 && quote.lines[0].code === 'congress-onsite';
  const notes=legacyOnsite?'CIRC 2027 — inscrição presencial':quote.kind==='supplementary'?'CIRC 2027 — pedido complementar':'CIRC 2027 — inscrição';
  return { document_type: 'FR', document_series_id: policy.series.id, date: paymentDate, due_date: paymentDate,
    currency_iso_code: 'EUR', ...billing.customer, external_reference: `CIRC27-${orderId.toUpperCase()}`,
    notes: method==='mbway'?`${notes} · MB WAY via EuPago`:notes,
    vat_included_prices: true, payment_mechanism: mechanism,
    ...(method === 'bank_transfer' ? { bank_account_id: bankAccountId } : {}),
    ...(lines.some(line => line.tax_code === 'ISE') ? { tax_exemption_reason_id: policy.exemption.id } : {}), lines };
}

export function buildLiveMultibancoFR(input) {
  return buildLivePaymentFR({ ...input, method: 'multibanco' });
}

// Compatibility entry point for already persisted first-phase jobs. Its payload
// remains identical so existing frozen-job hashes can still be checked safely.
export function buildLiveOnsiteMultibancoFR(input) {
  const quote = input?.quote;
  if (quote?.kind !== 'primary' || quote.selection?.congressMode !== 'onsite'
    || quote.selection.morningCourse || quote.selection.afternoonCourse || quote.selection.dinnerQuantity
    || quote.lines?.length !== 1 || quote.lines[0]?.code !== 'congress-onsite') fail();
  return buildLiveMultibancoFR(input);
}
