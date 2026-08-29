export const REGISTRATION_OPEN_DATE = '2026-11-15';
export const EARLY_RATE_END = '2027-01-31T23:59:59Z';

export const CONGRESS_RATES = {
  uls: { early: 55, regular: 90 },
  external: { early: 95, regular: 150 },
  student: { early: 60, regular: 95 },
};

export const VIRTUAL_CONGRESS_RATE = 60;
export const COURSE_RATES = { uls: 20, external: 35 };
export const DINNER_RATE = 30;

export function getRegistrationPeriod(referenceDate = new Date()) {
  return referenceDate.getTime() <= new Date(EARLY_RATE_END).getTime() ? 'early' : 'regular';
}

export function getCongressRate(profile, mode, period) {
  if (mode === 'virtual') return VIRTUAL_CONGRESS_RATE;
  if (mode !== 'onsite' || !CONGRESS_RATES[profile]) return 0;
  return CONGRESS_RATES[profile][period] || 0;
}

export function getCourseRate(courseAffiliation) {
  if (!courseAffiliation) return 0;
  return courseAffiliation === 'uls' ? COURSE_RATES.uls : COURSE_RATES.external;
}

export function calculateRegistrationTotal({
  profile,
  courseAffiliation,
  congressMode,
  morningCourse,
  afternoonCourse,
  dinner,
  period,
}) {
  const congress = getCongressRate(profile, congressMode, period);
  const courseUnit = getCourseRate(courseAffiliation);
  const courseCount = Number(Boolean(morningCourse)) + Number(Boolean(afternoonCourse));
  const courses = courseUnit * courseCount;
  const dinnerAmount = congressMode === 'onsite' && dinner ? DINNER_RATE : 0;

  return {
    congress,
    courseUnit,
    courseCount,
    courses,
    dinner: dinnerAmount,
    total: congress + courses + dinnerAmount,
  };
}

export function formatEuro(amount) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}
