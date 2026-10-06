import { CONGRESS_RATES, COURSE_RATES, DINNER_RATE, VIRTUAL_CONGRESS_RATE,
  getRegistrationPeriod } from '../../src/data/registration2027.js';

const EVENT = 'circ-2027';
function fail(code) { throw new Error(`checkout/${code}`); }

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

function makeQuote(profile, congressMode, items, now, kind) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('invalid-date');
  const ratePeriod = getRegistrationPeriod(now);
  const lines = [];
  const add = (code, quantity, euro) => {
    if (quantity) lines.push({ code, quantity, unitAmountCents: Math.round(euro * 100),
      amountCents: quantity * Math.round(euro * 100) });
  };
  if (congressMode === 'onsite') add('congress-onsite', 1, CONGRESS_RATES[profile][ratePeriod]);
  if (congressMode === 'virtual') add('congress-virtual', 1, VIRTUAL_CONGRESS_RATE);
  const courseRate = profile === 'uls' ? COURSE_RATES.uls : COURSE_RATES.external;
  add('course-morning', Number(items.morningCourse), courseRate);
  add('course-afternoon', Number(items.afternoonCourse), courseRate);
  add('dinner', items.dinnerQuantity, DINNER_RATE);
  const amountCents = lines.reduce((total, line) => total + line.amountCents, 0);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 9999900) fail('invalid-amount');
  return { eventId: EVENT, kind, currency: 'EUR', amountCents, ratePeriod, lines,
    selection: { profile, courseAffiliation: profile === 'uls' ? 'uls' : 'external', congressMode, ...items } };
}

export function quotePrimary(selection, context, existingRegistration, now = new Date()) {
  // Require a deliberate server-confirmed absence, not an omitted DB lookup.
  if (existingRegistration !== null) fail('registration-exists-or-unchecked');
  const items = itemsFrom(selection);
  assertEligibility(selection.profile, context);
  if (!['onsite', 'virtual', 'courses-only'].includes(selection.congressMode)) fail('invalid-mode');
  if (selection.congressMode === 'courses-only' && !items.morningCourse && !items.afternoonCourse) fail('course-required');
  return makeQuote(selection.profile, selection.congressMode, items, now, 'primary');
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
