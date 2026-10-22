import { CONGRESS_RATES, COURSE_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE, EARLY_RATE_END } from '../../src/data/registration2027.js';

// Internal rehearsal only. Never changes a payment, entitlement or fiscal payload.
// An order date, notification arrival time or editable document date is NOT payment evidence.
export const PRICING_POLICY_VERSION = 'circ2027-payment-date-20261022';
const CUTOFF_DATE = EARLY_RATE_END.slice(0, 10); // 31 January is wholly in the early phase, Europe/Lisbon.
const validDate = value => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function pricingPaymentSnapshot(order) {
  const credit = order?.bankTransfer?.confirmation;
  return order?.method === 'bank_transfer' ? {
    status: order.bankTransfer?.status ?? null,
    simulated: credit?.simulated ?? null,
    bookingDate: credit?.bookingDate ?? null,
    amountCents: credit?.amountCents ?? null,
    currency: credit?.currency ?? null,
  } : null;
}

export function inspectRehearsalPricing(order) {
  const base = {
    version: PRICING_POLICY_VERSION, timeZone: 'Europe/Lisbon', earlyLastDate: CUTOFF_DATE,
    status: 'unverified', reason: null, simulationBlocked: false, liveWritesEnabled: false,
    profile: order?.quote?.selection?.profile ?? null,
    quotedPeriod: order?.quote?.ratePeriod ?? null,
    paymentDate: null, paymentDateSource: null, paymentPeriod: null,
    paidCents: Number.isSafeInteger(order?.amountCents) ? order.amountCents : null,
    expectedCents: null, differenceCents: null, lines: [],
  };
  const incomplete = reason => ({ ...base, reason });
  const invalid = reason => ({ ...base, status: 'invalid', reason, simulationBlocked: true });
  if (order?.environment !== 'sandbox' || order.status !== 'confirmed' || order.currency !== 'EUR'
    || order.quote?.eventId !== 'circ-2027') return invalid('invalid-test-payment');
  if (!Object.hasOwn(CONGRESS_RATES, base.profile || '')) return incomplete('saved-profile-unavailable');
  if (order.method !== 'bank_transfer') return incomplete('provider-payment-date-not-mapped');
  const credit = order.bankTransfer?.confirmation;
  if (!credit?.bookingDate) return incomplete('bank-credit-date-unavailable');
  if (order.bankTransfer.status !== 'confirmed' || credit.simulated !== true
    || !validDate(credit.bookingDate) || credit.currency !== 'EUR'
    || !Number.isSafeInteger(credit.amountCents) || credit.amountCents <= 0
    || credit.amountCents !== order.amountCents || order.quote.amountCents !== order.amountCents) return invalid('invalid-bank-credit-evidence');
  base.paymentDate = credit.bookingDate;
  base.paymentDateSource = 'sandbox-bank-credit-booking-date';
  base.paymentPeriod = credit.bookingDate <= CUTOFF_DATE ? 'early' : 'regular';
  const sourceLines = order.quote.lines;
  if (!Array.isArray(sourceLines) || !sourceLines.length) return invalid('invalid-saved-lines');
  const seen = new Set();
  let paidTotal = 0;
  let expectedTotal = 0;
  for (const line of sourceLines) {
    if (!line || seen.has(line.code) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
      || !Number.isSafeInteger(line.amountCents) || line.amountCents <= 0
      || line.amountCents % line.quantity !== 0) return invalid('invalid-saved-lines');
    seen.add(line.code);
    let euros;
    switch (line.code) {
      case 'congress-onsite': euros = CONGRESS_RATES[base.profile][base.paymentPeriod]; break;
      case 'congress-virtual': euros = VIRTUAL_CONGRESS_RATE; break;
      case 'course-morning':
      case 'course-afternoon': euros = base.profile === 'uls' ? COURSE_RATES.uls : COURSE_RATES.external; break;
      case 'dinner': euros = DINNER_RATE; break;
      default: return invalid('unknown-saved-service');
    }
    if (line.code !== 'dinner' && line.quantity !== 1) return invalid('invalid-saved-lines');
    const expectedUnitCents = Math.round(euros * 100);
    const expectedLineCents = expectedUnitCents * line.quantity;
    const paidUnitCents = line.amountCents / line.quantity;
    if (!Number.isSafeInteger(expectedLineCents)
      || (line.unitAmountCents !== undefined && line.unitAmountCents !== paidUnitCents)) return invalid('invalid-saved-lines');
    paidTotal += line.amountCents;
    expectedTotal += expectedLineCents;
    base.lines.push({ code: line.code, quantity: line.quantity, paidUnitCents, expectedUnitCents,
      paidCents: line.amountCents, expectedCents: expectedLineCents, matches: expectedLineCents === line.amountCents });
  }
  if ((seen.has('congress-onsite') && seen.has('congress-virtual'))
    || !Number.isSafeInteger(paidTotal) || !Number.isSafeInteger(expectedTotal)
    || paidTotal !== order.amountCents) return invalid('invalid-saved-lines');
  const matches = base.lines.every(line => line.matches);
  return { ...base, status: matches ? 'matches' : 'mismatch', reason: matches ? null : 'payment-date-tariff-mismatch',
    simulationBlocked: !matches, expectedCents: expectedTotal, differenceCents: expectedTotal - paidTotal };
}
