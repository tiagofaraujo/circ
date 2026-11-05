const EVENT = 'circ-2027';
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const PENDING = new Set(['pending', 'awaiting_confirmation', 'creating', 'creation_unknown']);
const CLOSED = new Set(['expired', 'cancelled', 'failed', 'creation_failed', 'refunded']);

export const ANALYTICS_OFFERINGS = Object.freeze([
  { key: 'onsite', label: 'Congresso presencial', limit: 400 },
  { key: 'virtual', label: 'Congresso virtual', limit: null },
  { key: 'morningCourse', label: 'Curso · Ressonância magnética', limit: 170 },
  { key: 'afternoonCourse', label: 'Curso · Via Verde AVC', limit: 170 },
  { key: 'dinnerQuantity', label: 'Bilhetes de jantar', limit: null },
]);

export const ANALYTICS_PROFILES = Object.freeze([
  { key: 'uls', label: 'Interno · ULS Coimbra' },
  { key: 'external', label: 'Externo' },
  { key: 'student', label: 'Aluno' },
  { key: 'unknown', label: 'Perfil por identificar' },
]);

const quantity = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const offerCounts = () => Object.fromEntries([...ANALYTICS_OFFERINGS.map(item => item.key), 'coursesOnly']
  .map(key => [key, { paid: 0, pending: 0 }]));

function canonicalRegistration(r) {
  return Boolean(r && r.eventId === EVENT && typeof r.userId === 'string' && UID.test(r.userId)
    && r.primaryRegistration === true && r.isTest === false && r.testMode === false
    && r.id === `${EVENT}-${r.userId}`
    && (r.registrationKey === undefined || r.registrationKey === `${EVENT}:${r.userId}`)
    && r.archived !== true && !r.registrationArchiveId && !r.registrationArchivedAt);
}

function timestamp(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const result = typeof value === 'string' ? Date.parse(value) : 0;
  return Number.isFinite(result) ? result : 0;
}

function latestById(items) {
  const indexed = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string') continue;
    const previous = indexed.get(item.id);
    if (!previous || timestamp(item.updatedAt || item.createdAt) > timestamp(previous.updatedAt || previous.createdAt)) indexed.set(item.id, item);
  }
  return indexed;
}

function orderFor(registration, id, kind, payments) {
  const p = payments.get(id);
  return p && p.eventId === EVENT && p.environment === 'production'
    && p.userId === registration.userId && p.registrationId === registration.id
    && (p.kind || p.quote?.kind) === kind && p.isTest !== true && p.testMode !== true
    && !p.registrationArchiveId && !p.registrationArchivedAt && p.archived !== true
    && !p.replacementOrderId ? p : null;
}

function footprint(selection) {
  const s = selection && typeof selection === 'object' && !Array.isArray(selection) ? selection : {};
  return {
    onsite: Number(s.congressMode === 'onsite'),
    virtual: Number(s.congressMode === 'virtual'),
    morningCourse: Number(s.morningCourse === true),
    afternoonCourse: Number(s.afternoonCourse === true),
    dinnerQuantity: quantity(s.dinnerQuantity),
    coursesOnly: Number(!['onsite', 'virtual'].includes(s.congressMode) && (s.morningCourse === true || s.afternoonCourse === true)),
  };
}

/** Read-only totals. Money received and rights granted are deliberately separate. */
export function aggregateRegistrationAnalytics(registrations = [], payments = []) {
  const overview = { total: 0, paid: 0, pending: 0, confirmed: 0, review: 0, cancelled: 0,
    refunded: 0, excluded: 0, closedUnpaid: 0, drafts: 0 };
  const counts = offerCounts();
  const profiles = ANALYTICS_PROFILES.map(profile => ({ ...profile, total: 0, paid: 0, pending: 0, review: 0, offerings: offerCounts() }));
  const paymentIndex = latestById(Array.isArray(payments) ? payments : []);
  const rows = Array.isArray(registrations) ? registrations : [];
  const canonical = rows.filter(canonicalRegistration);
  const unique = latestById(canonical);
  overview.excluded = rows.length - unique.size;
  let pendingSupplementary = 0;

  function addOffers(profile, values, state) {
    for (const key of Object.keys(counts)) {
      const value = quantity(values[key]);
      counts[key][state] += value;
      profile.offerings[key][state] += value;
    }
  }

  for (const r of unique.values()) {
    const paymentStatus = r.payment?.status;
    if (paymentStatus === 'refunded') { overview.refunded += 1; continue; }
    if (r.status === 'cancelled' || paymentStatus === 'cancelled') { overview.cancelled += 1; continue; }
    const primary = orderFor(r, r.payment?.orderId, 'primary', paymentIndex);
    const received = paymentStatus === 'paid' || primary?.status === 'paid';
    const confirmed = r.status === 'confirmed' && paymentStatus === 'paid';
    if (!received && r.status === 'draft') { overview.drafts += 1; continue; }
    if (!received && (CLOSED.has(primary?.status) || CLOSED.has(r.payment?.closedUnpaidStatus))) {
      overview.closedUnpaid += 1; continue;
    }
    // A registration may still say pending after its provider order has closed.
    // Only the currently linked, open order establishes an unpaid pending request.
    const pending = !received && PENDING.has(paymentStatus) && primary && PENDING.has(primary.status)
      && !primary.paidAt && !primary.transactionId && !primary.capacityStatus;
    let review = Boolean(r.capacityReviewOrderId || (!received && !pending) || (received && !confirmed)
      || primary?.status === 'review_required');
    const profileKey = ['uls', 'external', 'student'].includes(r.selection?.profile) ? r.selection.profile : 'unknown';
    const profile = profiles.find(item => item.key === profileKey);
    overview.total += 1;
    profile.total += 1;
    if (received) { overview.paid += 1; profile.paid += 1; }
    if (confirmed) overview.confirmed += 1;
    if (pending) { overview.pending += 1; profile.pending += 1; addOffers(profile, footprint(r.selection), 'pending'); }
    // Nullish fallback preserves intentionally empty or false granted rights.
    const owned = confirmed ? footprint(r.entitlements ?? r.selection) : footprint(null);
    if (confirmed) addOffers(profile, owned, 'paid');

    const supplementary = orderFor(r, r.openSupplementaryOrderId, 'supplementary', paymentIndex);
    if (confirmed && supplementary && PENDING.has(supplementary.status) && !supplementary.capacityStatus
      && !supplementary.paidAt && !supplementary.transactionId) {
      const requested = footprint(supplementary.quote?.selection);
      // Supplements never create another congress registration or double-count an owned course.
      requested.onsite = 0; requested.virtual = 0; requested.coursesOnly = 0;
      requested.morningCourse = Math.max(0, requested.morningCourse - owned.morningCourse);
      requested.afternoonCourse = Math.max(0, requested.afternoonCourse - owned.afternoonCourse);
      addOffers(profile, requested, 'pending');
      pendingSupplementary += 1;
    }
    if (r.openSupplementaryOrderId && (!supplementary || supplementary.status === 'review_required'
      || supplementary.capacityStatus === 'review_required')) review = true;
    if (review) { overview.review += 1; profile.review += 1; }
  }

  return {
    overview,
    offerings: ANALYTICS_OFFERINGS.map(item => ({ ...item, ...counts[item.key],
      remaining: item.limit === null ? null : Math.max(0, item.limit - counts[item.key].paid) })),
    profiles,
    pendingSupplementary,
  };
}
