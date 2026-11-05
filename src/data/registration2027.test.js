import { calculateRegistrationTotal, getCourseRate, isRegistrationOpen, REGISTRATION_OPEN_AT } from './registration2027';

test('registration opens exactly at midnight in Lisbon on 15 November, using an absolute timestamp', () => {
  expect(REGISTRATION_OPEN_AT).toBe('2026-11-15T00:00:00Z');
  expect(isRegistrationOpen(new Date('2026-11-14T23:59:59.999Z'))).toBe(false);
  expect(isRegistrationOpen('2026-11-15T00:00:00Z')).toBe(true);
  expect(isRegistrationOpen('2026-11-14T23:30:00-01:00')).toBe(true);
  expect(isRegistrationOpen('2026-11-15T00:30:00+01:00')).toBe(false);
  expect(isRegistrationOpen('invalid')).toBe(false);
  expect(isRegistrationOpen(new Date('invalid'))).toBe(false);
});

test.each([
  [true, false, 1, 35],
  [false, true, 1, 35],
  [true, true, 2, 70],
])('student courses-only charges each selected course', (morningCourse, afternoonCourse, courseCount, total) => {
  expect(calculateRegistrationTotal({
    profile: 'student', congressMode: 'courses-only', period: 'early', morningCourse, afternoonCourse,
  })).toMatchObject({ congress: 0, courseUnit: 35, courseCount, courses: total, total });
});

test.each([
  ['onsite', 'early', 60, 160],
  ['onsite', 'regular', 95, 195],
  ['virtual', 'early', 60, 160],
])('student courses add to the chosen congress and optional dinner', (congressMode, period, congress, total) => {
  expect(calculateRegistrationTotal({
    profile: 'student', courseAffiliation: 'external', congressMode, period,
    morningCourse: true, afternoonCourse: true, dinnerQuantity: 1,
  })).toMatchObject({ congress, courses: 70, dinner: 30, total });
});

test('student rates work for legacy registrations and cannot inherit the ULS course discount', () => {
  for (const affiliation of [undefined, '', 'external', 'uls']) {
    expect(getCourseRate('student', affiliation)).toBe(35);
  }
  expect(getCourseRate('uls', 'uls')).toBe(20);
  expect(getCourseRate('external', 'external')).toBe(35);
});
