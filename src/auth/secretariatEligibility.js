function activeRegistration(registration) {
  const r = registration;
  if (!r || r.eventId !== 'circ-2027' || typeof r.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.userId)
    || r.primaryRegistration !== true || r.isTest !== false || r.testMode !== false
    || r.status !== 'confirmed' || r.payment?.status !== 'paid'
    || r.archived === true || r.registrationArchiveId || r.registrationArchivedAt) return false;
  // Admission must use the same canonical paid registration as the capacity count.
  if (r.id !== undefined ? r.id !== `circ-2027-${r.userId}` : r.registrationKey !== `circ-2027:${r.userId}`) return false;
  return r.registrationKey === undefined || r.registrationKey === `circ-2027:${r.userId}`;
}

export function admissionEntitlements(registration) {
  const empty = { congressMode: '', morningCourse: false, afternoonCourse: false };
  if (!activeRegistration(registration)) return empty;
  // A recorded grant map is authoritative, including empty/false grants.
  // Only older confirmed, paid registrations without a grant map use selection.
  const granted = registration.entitlements ?? registration.selection;
  if (!granted || typeof granted !== 'object' || Array.isArray(granted)) return empty;
  return {
    congressMode: ['onsite', 'virtual'].includes(granted.congressMode) ? granted.congressMode : '',
    morningCourse: granted.morningCourse === true,
    afternoonCourse: granted.afternoonCourse === true,
  };
}

export function canAttendEventDay(registration, eventDay) {
  const granted = admissionEntitlements(registration);
  if (eventDay === '2027-04-08') return granted.morningCourse || granted.afternoonCourse;
  return ['2027-04-09', '2027-04-10'].includes(eventDay) && granted.congressMode === 'onsite';
}

export function canReceiveCredential(registration) {
  const granted = admissionEntitlements(registration);
  return granted.congressMode === 'onsite' || granted.morningCourse || granted.afternoonCourse;
}
