import { aggregateRegistrationAnalytics } from './registrationAnalytics';

const selected = { profile: 'external', congressMode: 'onsite', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 };
const registration = (uid, changes = {}) => ({ id: `circ-2027-${uid}`, eventId: 'circ-2027', userId: uid,
  registrationKey: `circ-2027:${uid}`, primaryRegistration: true, isTest: false, testMode: false,
  status: 'confirmed', selection: { ...selected }, entitlements: { ...selected },
  payment: { status: 'paid', amountCents: 9500, orderId: `order-${uid}` }, ...changes });
const payment = (r, changes = {}) => ({ id: r.payment.orderId, eventId: 'circ-2027', environment: 'production',
  userId: r.userId, registrationId: r.id, kind: 'primary', status: 'pending', quote: { selection: r.selection }, ...changes });
const offering = (stats, key) => stats.offerings.find(item => item.key === key);
const profile = (stats, key) => stats.profiles.find(item => item.key === key);

test('counts granted paid rights and requested pending choices independently, including every dinner ticket', () => {
  const paid = registration('paid', { selection: { ...selected, profile: 'uls' },
    entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 3 } });
  const pending = registration('pending', { status: 'submitted', selection: { ...selected, profile: 'student', congressMode: 'virtual', morningCourse: true, dinnerQuantity: 2 },
    entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 },
    payment: { orderId: 'pending-order', status: 'pending' } });
  const result = aggregateRegistrationAnalytics([paid, pending], [payment(pending)]);
  expect(result.overview).toMatchObject({ total: 2, paid: 1, pending: 1, confirmed: 1, review: 0 });
  expect(offering(result, 'onsite')).toMatchObject({ paid: 1, pending: 0, limit: 400, remaining: 399 });
  expect(offering(result, 'virtual')).toMatchObject({ paid: 0, pending: 1, limit: null, remaining: null });
  expect(offering(result, 'morningCourse')).toMatchObject({ paid: 1, pending: 1, remaining: 169 });
  expect(offering(result, 'afternoonCourse')).toMatchObject({ paid: 1, pending: 0 });
  expect(offering(result, 'dinnerQuantity')).toMatchObject({ paid: 3, pending: 2 });
  expect(profile(result, 'uls')).toMatchObject({ total: 1, paid: 1, pending: 0 });
  expect(profile(result, 'student').offerings.virtual).toEqual({ paid: 0, pending: 1 });
});

test('includes a paid zero-price company voucher and legacy confirmed grants with nullish selection fallback', () => {
  const voucher = registration('voucher', { payment: { status: 'paid', amountCents: 0, method: 'company_voucher' } });
  const legacy = registration('legacy', { entitlements: undefined, selection: { ...selected, morningCourse: true, dinnerQuantity: 2 } });
  const result = aggregateRegistrationAnalytics([voucher, legacy]);
  expect(result.overview.paid).toBe(2);
  expect(offering(result, 'onsite').paid).toBe(2);
  expect(offering(result, 'morningCourse').paid).toBe(1);
  expect(offering(result, 'dinnerQuantity').paid).toBe(2);
});

test('never turns selected but ungranted rights into paid places, including empty grant maps', () => {
  const empty = registration('empty', { entitlements: {} });
  const declined = registration('declined', { selection: { ...selected, morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 },
    entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } });
  const result = aggregateRegistrationAnalytics([empty, declined]);
  expect(result.overview.paid).toBe(2);
  expect(result.offerings.every(item => item.paid === 0)).toBe(true);
});

test('excludes tests, missing production flags, archives, copies and another event, and deduplicates canonical snapshots', () => {
  const valid = registration('valid');
  const rows = [valid, { ...valid }, registration('test', { isTest: true }), registration('mode', { testMode: true }),
    registration('unknown', { isTest: undefined }), registration('archived', { archived: true }),
    registration('archive-id', { registrationArchiveId: 'archive' }), registration('archive-date', { registrationArchivedAt: '2026-11-01' }),
    registration('bad-key', { registrationKey: 'circ-2027:elsewhere' }), registration('copy', { id: 'copy' }),
    registration('other-event', { eventId: 'other' }), registration('not-primary', { primaryRegistration: false })];
  const result = aggregateRegistrationAnalytics(rows);
  expect(result.overview).toMatchObject({ total: 1, paid: 1, excluded: rows.length - 1 });
  expect(offering(result, 'onsite').paid).toBe(1);
});

test('cancelled, refunded, draft and closed unpaid registrations do not occupy places or active totals', () => {
  const expired = registration('expired', { status: 'submitted', payment: { status: 'pending', orderId: 'expired-order' } });
  const failed = registration('failed', { status: 'submitted', payment: { status: 'pending', orderId: 'failed-order' } });
  const result = aggregateRegistrationAnalytics([
    registration('cancelled', { status: 'cancelled' }), registration('refunded', { payment: { status: 'refunded' } }),
    registration('draft', { status: 'draft', payment: { status: 'pending' } }), expired, failed,
  ], [payment(expired, { status: 'expired' }), payment(failed, { status: 'creation_failed' })]);
  expect(result.overview).toMatchObject({ total: 0, paid: 0, pending: 0, cancelled: 1, refunded: 1, drafts: 1, closedUnpaid: 2 });
  expect(result.offerings.every(item => item.paid === 0 && item.pending === 0)).toBe(true);
});

test('paid capacity review preserves old confirmed supplementary grants but grants no primary places', () => {
  const heldPrimary = registration('held-primary', { status: 'submitted', capacityReviewOrderId: 'held-order',
    entitlements: { congressMode: '', morningCourse: false, afternoonCourse: false, dinnerQuantity: 0 } });
  const heldSupplement = registration('held-supplement', { capacityReviewOrderId: 'held-extra', openSupplementaryOrderId: 'held-extra',
    entitlements: { congressMode: 'onsite', morningCourse: true, afternoonCourse: false, dinnerQuantity: 1 } });
  const result = aggregateRegistrationAnalytics([heldPrimary, heldSupplement], [payment(heldSupplement, {
    id: 'held-extra', kind: 'supplementary', status: 'paid', capacityStatus: 'review_required',
    quote: { selection: { afternoonCourse: true, dinnerQuantity: 2 } },
  })]);
  expect(result.overview).toMatchObject({ total: 2, paid: 2, pending: 0, confirmed: 1, review: 2 });
  expect(offering(result, 'onsite').paid).toBe(1);
  expect(offering(result, 'morningCourse').paid).toBe(1);
  expect(offering(result, 'afternoonCourse')).toMatchObject({ paid: 0, pending: 0 });
  expect(offering(result, 'dinnerQuantity')).toMatchObject({ paid: 1, pending: 0 });
});

test('only the current linked unpaid supplementary order contributes pending extras without another participant', () => {
  const r = registration('addon', { openSupplementaryOrderId: 'current-extra',
    entitlements: { ...selected, morningCourse: true, dinnerQuantity: 1 } });
  const current = payment(r, { id: 'current-extra', kind: 'supplementary', status: 'pending',
    quote: { selection: { congressMode: 'onsite', morningCourse: true, afternoonCourse: true, dinnerQuantity: 2 } } });
  const stale = { ...current, id: 'old-extra', quote: { selection: { afternoonCourse: true, dinnerQuantity: 20 } } };
  const result = aggregateRegistrationAnalytics([r], [current, stale]);
  expect(result.overview).toMatchObject({ total: 1, paid: 1, pending: 0, review: 0 });
  expect(result.pendingSupplementary).toBe(1);
  expect(offering(result, 'onsite')).toMatchObject({ paid: 1, pending: 0 });
  expect(offering(result, 'morningCourse')).toMatchObject({ paid: 1, pending: 0 });
  expect(offering(result, 'afternoonCourse')).toMatchObject({ paid: 0, pending: 1 });
  expect(offering(result, 'dinnerQuantity')).toMatchObject({ paid: 1, pending: 2 });
  expect(profile(result, 'external').total).toBe(1);
});

test.each([
  { status: 'expired' }, { status: 'cancelled' }, { status: 'paid' }, { status: 'review_required' },
  { status: 'pending', environment: 'sandbox' }, { status: 'pending', userId: 'someone-else' },
  { status: 'pending', registrationId: 'circ-2027-other' }, { status: 'pending', registrationArchiveId: 'archive' },
  { status: 'pending', replacementOrderId: 'new-order' }, { status: 'pending', transactionId: 'received' },
  { status: 'pending', paidAt: '2026-11-04' }, { status: 'pending', capacityStatus: 'review_required' },
])('unavailable, closed, mismatched or received supplementary orders never count pending: %j', changes => {
  const r = registration('addon', { openSupplementaryOrderId: 'extra' });
  const p = payment(r, { id: 'extra', kind: 'supplementary', quote: { selection: { afternoonCourse: true, dinnerQuantity: 2 } }, ...changes });
  const result = aggregateRegistrationAnalytics([r], [p]);
  expect(result.pendingSupplementary).toBe(0);
  expect(result.offerings.every(item => item.pending === 0)).toBe(true);
});

test('unknown profiles remain honest and courses-only types differ from congress plus courses', () => {
  const courses = registration('courses', { selection: { ...selected, profile: 'mystery', congressMode: 'courses-only', morningCourse: true },
    entitlements: { congressMode: '', morningCourse: true, afternoonCourse: false, dinnerQuantity: 0 } });
  const congress = registration('congress', { entitlements: { ...selected, morningCourse: true } });
  const result = aggregateRegistrationAnalytics([courses, congress]);
  expect(profile(result, 'unknown')).toMatchObject({ total: 1, paid: 1 });
  expect(profile(result, 'unknown').offerings.coursesOnly).toEqual({ paid: 1, pending: 0 });
  expect(profile(result, 'external').offerings.coursesOnly).toEqual({ paid: 0, pending: 0 });
  expect(offering(result, 'morningCourse').paid).toBe(2);
});

test('missing, mismatched or review primary orders are flagged for review rather than invented pending places', () => {
  const missing = registration('missing', { status: 'submitted', payment: { status: 'pending', orderId: 'missing-order' } });
  const review = registration('review', { status: 'submitted', payment: { status: 'awaiting_confirmation', orderId: 'review-order' } });
  const wrongOwner = registration('wrong-owner', { status: 'submitted', payment: { status: 'pending', orderId: 'wrong-order' } });
  const result = aggregateRegistrationAnalytics([missing, review, wrongOwner], [payment(review, { status: 'review_required' }), payment(wrongOwner, { userId: 'other' })]);
  expect(result.overview).toMatchObject({ total: 3, pending: 0, review: 3 });
  expect(result.offerings.every(item => item.pending === 0)).toBe(true);
});

test.each([{ paidAt: '2026-11-05' }, { transactionId: 'received' }, { capacityStatus: 'review_required' }])(
  'an inconsistent pending primary with received-payment markers requires review: %j', changes => {
    const r = registration('inconsistent', { status: 'submitted', payment: { status: 'pending', orderId: 'inconsistent-order' } });
    const result = aggregateRegistrationAnalytics([r], [payment(r, changes)]);
    expect(result.overview).toMatchObject({ total: 1, paid: 0, pending: 0, review: 1 });
    expect(result.offerings.every(item => item.pending === 0)).toBe(true);
  }
);

test('handles more than 500 registrations and clamps only remaining capacity, never paid quantities', () => {
  const result = aggregateRegistrationAnalytics(Array.from({ length: 600 }, (_, index) => registration(`person${index}`)));
  expect(result.overview).toMatchObject({ total: 600, paid: 600 });
  expect(offering(result, 'onsite')).toMatchObject({ paid: 600, remaining: 0 });
});
