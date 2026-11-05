const EVENT = 'circ-2027';

export const CAPACITY_LIMITS = Object.freeze({ onsite: 400, morningCourse: 170, afternoonCourse: 170 });
const keys = Object.keys(CAPACITY_LIMITS);
const empty = () => ({ onsite: 0, morningCourse: 0, afternoonCourse: 0 });

// Virtual congress attendance and dinners have no capacity limit here. Each
// course is an individual entitlement, irrespective of the congress mode.
export function selectionFootprint(selection) {
  return {
    onsite: Number(selection?.congressMode === 'onsite'),
    morningCourse: Number(selection?.morningCourse === true),
    afternoonCourse: Number(selection?.afternoonCourse === true),
  };
}

export function paidFootprint(registration) {
  const r = registration;
  if (!r || r.eventId !== EVENT || typeof r.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.userId)
    || r.primaryRegistration !== true || r.isTest !== false || r.testMode !== false
    || r.status !== 'confirmed' || r.payment?.status !== 'paid'
    || r.registrationArchiveId || r.registrationArchivedAt) return empty();
  // Query results supply the document ID. Store mutations may supply only the
  // canonical registration key; neither arbitrary IDs nor historical copies count.
  if (r.id !== undefined ? r.id !== `${EVENT}-${r.userId}` : r.registrationKey !== `${EVENT}:${r.userId}`) return empty();
  if (r.registrationKey !== undefined && r.registrationKey !== `${EVENT}:${r.userId}`) return empty();
  return selectionFootprint(r.entitlements ?? r.selection);
}

export function capacitySummary(registrations) {
  if (!Array.isArray(registrations)) throw new TypeError('capacity/invalid-registrations');
  const paid = empty();
  for (const registration of registrations) {
    const footprint = paidFootprint(registration);
    for (const key of keys) paid[key] += footprint[key];
  }
  return {
    limits: { ...CAPACITY_LIMITS },
    paid,
    remaining: Object.fromEntries(keys.map(key => [key, Math.max(0, CAPACITY_LIMITS[key] - paid[key])])),
  };
}

// The summary includes the previous active registration. Positive changes need
// a vacancy; refunds/removals and unchanged rights need none. A prepayment
// selection is only an availability check and never reserves a place.
export function capacityDecision(summary, { previousRegistration, nextRegistration, selection } = {}) {
  if (!summary?.paid || keys.some(key => !Number.isSafeInteger(summary.paid[key]) || summary.paid[key] < 0)) {
    throw new TypeError('capacity/invalid-summary');
  }
  const previous = selection === undefined ? paidFootprint(previousRegistration) : empty();
  const next = selection === undefined ? paidFootprint(nextRegistration) : selectionFootprint(selection);
  const delta = Object.fromEntries(keys.map(key => [key, next[key] - previous[key]]));
  const unavailable = keys.filter(key => delta[key] > 0 && summary.paid[key] + delta[key] > CAPACITY_LIMITS[key]);
  return { allocated: unavailable.length === 0, unavailable, delta };
}
