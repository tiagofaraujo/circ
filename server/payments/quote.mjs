import { CONGRESS_RATES, COURSE_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE,
  getRegistrationPeriod } from '../../src/data/registration2027.js';

const EVENT = 'circ-2027';
export const MIN_DISCOUNTED_PAYMENT_CENTS = 100;
export const REGISTRATION_DISCOUNT_SCOPE = 'registration';
export const ORGANIZER_BENEFIT_CENTS = Math.round((2 * COURSE_RATES.uls + DINNER_RATE) * 100);
function fail(code) { throw new Error(`checkout/${code}`); }

export function hasOrganizerBenefit(quote) {
  const selection = quote?.selection;
  return quote?.kind === 'primary' && quote.discount === undefined
    && quote.organizerBenefit?.amountCents === ORGANIZER_BENEFIT_CENTS
    && selection?.profile === 'uls' && selection.congressMode === 'onsite'
    && selection.morningCourse === true && selection.afternoonCourse === true
    && Number.isSafeInteger(selection.dinnerQuantity) && selection.dinnerQuantity >= 1;
}

export function organizerVoucherOnOrder(payment) {
  const hash = payment.organizerVoucherHash;
  if (hash === undefined && payment.quote?.organizerBenefit === undefined) return false;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || !hasOrganizerBenefit(payment.quote)) {
    fail('organizer-voucher-not-applicable');
  }
  return true;
}

export function allowsFullCongressDiscount(selection, discount) {
  return selection?.profile === 'uls' && selection.congressMode === 'onsite' && discount?.type === 'fixed';
}

export function congressDiscountCents(admissionCents, discount, selection) {
  const { type, value } = discount || {};
  if (!Number.isSafeInteger(value) || value <= 0
    || !['percentage', 'fixed'].includes(type)
    || (type === 'percentage' && value >= 10000)) fail('invalid-discount');
  const amountCents = type === 'fixed' ? value : Math.round(admissionCents * value / 10000);
  if (amountCents <= 0 || amountCents > admissionCents
    || (amountCents === admissionCents && !allowsFullCongressDiscount(selection, discount))) fail('discount-not-applicable');
  return amountCents;
}

export function applyFixedRegistrationDiscount(lines, value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('invalid-discount');
  const subtotal = lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1
      || !Number.isSafeInteger(line.unitAmountCents) || line.unitAmountCents < 1
      || !Number.isSafeInteger(line.amountCents) || line.amountCents !== line.quantity * line.unitAmountCents) {
      fail('invalid-amount');
    }
    return sum + line.amountCents;
  }, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0) fail('invalid-amount');
  if (value > subtotal) fail('discount-not-applicable');

  const grossCents = BigInt(subtotal);
  const parts = lines.map((line, index) => {
    const weightedCents = BigInt(line.amountCents) * BigInt(value);
    return { index, cents: Number(weightedCents / grossCents), remainder: Number(weightedCents % grossCents) };
  });
  const roundingCents = value - parts.reduce((sum, part) => sum + part.cents, 0);
  // Allocate the leftover cents to the largest remainders, with catalogue order breaking ties.
  const roundingOrder = parts.slice().sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const part of roundingOrder.slice(0, roundingCents)) part.cents += 1;

  return lines.flatMap(({ code, quantity, amountCents }, index) => {
    const net = amountCents - parts[index].cents;
    const unitAmountCents = Math.floor(net / quantity);
    const roundedUp = net % quantity;
    const roundedDown = quantity - roundedUp;
    const rows = [{ code, quantity: roundedDown, unitAmountCents, amountCents: roundedDown * unitAmountCents }];
    if (roundedUp) {
      rows.push({ code, quantity: roundedUp, unitAmountCents: unitAmountCents + 1, amountCents: roundedUp * (unitAmountCents + 1) });
    }
    return rows;
  });
}

// Domain layer only. These records MUST come from authenticated server reads,
// never the request body. The future checkout transaction must re-read them.
function assertEligibility(profile, context) {
  const { uid, profileName, student, uls, claim, roster } = context;
  if (typeof uid !== 'string' || !uid || context.emailVerified !== true) fail('sign-in-required');
  if (!Object.hasOwn(CONGRESS_RATES, profile)) fail('invalid-profile');
  if (profile === 'student' && !(student?.userId === uid && student.eventId === EVENT
    && student.academicYear === '2026/2027' && student.status === 'approved'
    && typeof profileName === 'string' && profileName.trim().length >= 5
    && profileName.length <= 200 && student.profileName === profileName)) fail('student-not-approved');
  if (profile === 'uls' && !(uls?.userId === uid && uls.eventId === EVENT
    && uls.status === 'matched' && uls.method === 'mec-name-match'
    && /^\d{1,12}$/.test(uls.mec || '') && typeof uls.nameKey === 'string'
    && uls.nameKey.length >= 5 && uls.nameKey.length <= 160
    && claim?.userId === uid && claim.eventId === EVENT && claim.mec === uls.mec
    && claim.nameKey === uls.nameKey && claim.method === uls.method
    && roster?.active === true && roster.eventId === EVENT
    && roster.nameKey === uls.nameKey)) fail('uls-not-verified');
}

function itemsFrom(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) fail('invalid-selection');
  for (const key of ['morningCourse', 'afternoonCourse']) {
    if (selection[key] !== undefined && typeof selection[key] !== 'boolean') fail('invalid-selection');
  }
  const quantity = selection.dinnerQuantity ?? 0;
  if (!Number.isSafeInteger(quantity) || quantity < 0) fail('invalid-quantity');
  return { morningCourse: selection.morningCourse === true,
    afternoonCourse: selection.afternoonCourse === true, dinnerQuantity: quantity };
}

function catalogueLines(profile, congressMode, items, ratePeriod, organizerVoucher = false) {
  const lines = [];
  const add = (code, quantity, euro) => {
    if (quantity) lines.push({ code, quantity, unitAmountCents: Math.round(euro * 100),
      amountCents: quantity * Math.round(euro * 100) });
  };
  if (congressMode === 'onsite') add('congress-onsite', 1, CONGRESS_RATES[profile][ratePeriod]);
  if (congressMode === 'virtual') add('congress-virtual', 1, VIRTUAL_CONGRESS_RATE);
  const courseRate = organizerVoucher ? 0 : COURSE_RATES[profile === 'uls' ? 'uls' : 'external'];
  add('course-morning', Number(items.morningCourse), courseRate);
  add('course-afternoon', Number(items.afternoonCourse), courseRate);
  add('dinner', items.dinnerQuantity - Number(organizerVoucher), DINNER_RATE);
  return lines;
}

// Rebuild the priced rows from the catalogue for payment and fiscal validation.
export function fixedRegistrationDiscountLines(quote) {
  const discount = quote?.discount;
  const selection = quote?.selection;
  if (quote?.eventId !== EVENT || quote.kind !== 'primary' || quote.currency !== 'EUR'
    || !['early', 'regular'].includes(quote.ratePeriod) || quote.organizerBenefit !== undefined
    || discount?.type !== 'fixed' || discount.scope !== REGISTRATION_DISCOUNT_SCOPE || discount.amountCents !== discount.value
    || !selection || !Object.hasOwn(CONGRESS_RATES, selection.profile) || !['onsite', 'virtual'].includes(selection.congressMode)
    || selection.courseAffiliation !== (selection.profile === 'uls' ? 'uls' : 'external')
    || typeof selection.morningCourse !== 'boolean' || typeof selection.afternoonCourse !== 'boolean'
    || !Number.isSafeInteger(selection.dinnerQuantity) || selection.dinnerQuantity < 0) fail('invalid-discount');

  const lines = applyFixedRegistrationDiscount(catalogueLines(selection.profile, selection.congressMode, selection, quote.ratePeriod), discount.value);
  const amountCents = lines.reduce((total, line) => total + line.amountCents, 0);
  if (amountCents !== quote.amountCents || amountCents > 9999900
    || (amountCents > 0 && amountCents < MIN_DISCOUNTED_PAYMENT_CENTS)) fail('invalid-amount');
  return lines;
}

function makeQuote(profile, congressMode, items, now, kind, voucherDiscount, organizerVoucher = false) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('invalid-date');
  const ratePeriod = getRegistrationPeriod(now);
  let lines = catalogueLines(profile, congressMode, items, ratePeriod, organizerVoucher);
  let discount;
  if (voucherDiscount !== undefined) {
    if (congressMode === 'courses-only') fail('discount-not-applicable');
    if (voucherDiscount?.scope === REGISTRATION_DISCOUNT_SCOPE) {
      if (kind !== 'primary' || voucherDiscount.type !== 'fixed') fail('invalid-discount');
      lines = applyFixedRegistrationDiscount(lines, voucherDiscount.value);
      discount = { type: 'fixed', value: voucherDiscount.value, amountCents: voucherDiscount.value, scope: REGISTRATION_DISCOUNT_SCOPE };
    } else {
      if (voucherDiscount?.scope !== undefined) fail('invalid-discount');
      const admission = lines[0];
      const amountCents = congressDiscountCents(admission.unitAmountCents, voucherDiscount, { profile, congressMode });
      discount = { type: voucherDiscount.type, value: voucherDiscount.value, amountCents };
      admission.unitAmountCents -= amountCents;
      admission.amountCents = admission.unitAmountCents;
    }
  }
  const amountCents = lines.reduce((total, line) => total + line.amountCents, 0);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || (!discount && amountCents === 0)
    || amountCents > 9999900) fail('invalid-amount');
  if (discount && amountCents > 0 && amountCents < MIN_DISCOUNTED_PAYMENT_CENTS) fail('discount-not-applicable');
  return { eventId: EVENT, kind, currency: 'EUR', amountCents, ratePeriod, lines,
    selection: { profile, courseAffiliation: profile === 'uls' ? 'uls' : 'external', congressMode, ...items },
    ...(organizerVoucher ? { organizerBenefit: { amountCents: ORGANIZER_BENEFIT_CENTS } } : {}),
    ...(discount ? { discount } : {}) };
}

// Voucher benefits are resolved from server-held codes before calling this function.
export function quotePrimary(selection, context, existingRegistration, now = new Date(), voucherDiscount, organizerVoucher = false) {
  // Require a deliberate server-confirmed absence, not an omitted DB lookup.
  if (existingRegistration !== null) fail('registration-exists-or-unchecked');
  const items = itemsFrom(selection);
  assertEligibility(selection.profile, context);
  if (!['onsite', 'virtual', 'courses-only'].includes(selection.congressMode)) fail('invalid-mode');
  if (organizerVoucher) {
    if (voucherDiscount !== undefined || selection.profile !== 'uls' || selection.congressMode !== 'onsite') fail('organizer-voucher-not-applicable');
    items.morningCourse = true;
    items.afternoonCourse = true;
    items.dinnerQuantity = Math.max(1, items.dinnerQuantity);
  }
  if (selection.congressMode === 'courses-only' && !items.morningCourse && !items.afternoonCourse) fail('course-required');
  return makeQuote(selection.profile, selection.congressMode, items, now, 'primary', voucherDiscount, organizerVoucher);
}

export function quoteSupplementary(selection, context, registration, now = new Date()) {
  const items = itemsFrom(selection);
  if (!registration || registration.eventId !== EVENT || registration.userId !== context.uid
    || registration.id !== `${EVENT}-${context.uid}` || registration.isTest === true
    || registration.testMode === true || registration.status !== 'confirmed'
    || registration.payment?.status !== 'paid') fail('paid-registration-required');
  const profile = registration.selection?.profile;
  assertEligibility(profile, context);
  if (selection.congressMode || (selection.profile && selection.profile !== profile)) fail('invalid-addition');
  const owned = registration.entitlements || registration.selection;
  if ((items.morningCourse && owned.morningCourse) || (items.afternoonCourse && owned.afternoonCourse)) fail('course-already-owned');
  return makeQuote(profile, '', items, now, 'supplementary');
}

// Explicit sandbox boundary. Never weaken the production supplementary guard
// or strip isTest flags to reuse it. Only isolated confirmed checkout snapshots
// can be quoted here; real eligibility still comes from server reads.
export function quoteSandboxSupplementary(selection, context, session, now = new Date()) {
  const items = itemsFrom(selection);
  if (session?.kind !== 'checkout-test' || session.environment !== 'sandbox'
    || session.eventId !== EVENT || session.owner !== context.uid
    || session.registration?.status !== 'confirmed') fail('sandbox-registration-required');
  const profile = session.registration.selection?.profile;
  assertEligibility(profile, context);
  if (selection.congressMode || (selection.profile && selection.profile !== profile)) fail('invalid-addition');
  const owned = session.registration.entitlements;
  if (!owned || (items.morningCourse && owned.morningCourse) || (items.afternoonCourse && owned.afternoonCourse)) fail('course-already-owned');
  return makeQuote(profile, '', items, now, 'supplementary');
}

export function fullyCoveredVoucherEntitlements(quote) {
  const { selection, discount, lines } = quote || {};
  if (quote?.kind !== 'primary' || quote.amountCents !== 0 || quote.currency !== 'EUR'
    || discount?.type !== 'fixed' || !Number.isSafeInteger(discount.value)
    || discount.value <= 0 || discount.value !== discount.amountCents || !selection
    || !Array.isArray(lines) || !lines.length) return null;

  const { profile, congressMode, morningCourse, afternoonCourse, dinnerQuantity } = selection;
  if (discount.scope === REGISTRATION_DISCOUNT_SCOPE) {
    let expected;
    try { expected = fixedRegistrationDiscountLines(quote); } catch { return null; }
    if (lines.length !== expected.length || !expected.every((line, index) => (
      Object.entries(line).every(([key, value]) => lines[index]?.[key] === value)
    ))) return null;
  } else if (discount.scope !== undefined || profile !== 'uls' || congressMode !== 'onsite'
    || morningCourse !== false || afternoonCourse !== false || dinnerQuantity !== 0) {
    return null;
  }
  return { congressMode, morningCourse, afternoonCourse, dinnerQuantity };
}
