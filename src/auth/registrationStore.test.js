import { getFirebaseFirestore, isAdminUser } from './firebaseClient';
import { saveAdminTestRegistration, saveAdminTestAddOnOrder } from './registrationStore';

jest.mock('./firebaseClient', () => ({ getFirebaseFirestore: jest.fn(), isAdminUser: jest.fn() }));
const user = { uid: 'admin', email: 'admin@example.test', displayName: 'Test Administrator' };
let records;

beforeEach(() => {
  records = new Map();
  let nextId = 0;
  window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'timestamp', increment: (n) => n } } };
  isAdminUser.mockReturnValue(true);
  getFirebaseFirestore.mockReturnValue({
    collection: (name) => ({ doc: (id = `generated-${++nextId}`) => ({ id, path: `${name}/${id}` }) }),
    runTransaction: async (callback) => callback({
      get: async (ref) => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
      set: (ref, value) => records.set(ref.path, value),
      update: (ref, value) => records.set(ref.path, { ...records.get(ref.path), ...value }),
    }),
  });
});

test('a student registration retains both selected courses and their charged total', async () => {
  await saveAdminTestRegistration(user, {
    profile: 'student', courseAffiliation: 'uls', congressMode: 'courses-only', period: 'early',
    morningCourse: true, afternoonCourse: true, total: 70,
  });
  expect(records.get('registrations/test-admin')).toMatchObject({
    isTest: true,
    selection: { profile: 'student', courseAffiliation: 'external', morningCourse: true, afternoonCourse: true },
    entitlements: { morningCourse: true, afternoonCourse: true },
    payment: { amountCents: 7000 },
  });
});

test('an older student registration can buy a remaining course at 35 euros, without duplicating entitlements', async () => {
  records.set('registrations/test-admin', {
    selection: { profile: 'student', congressMode: 'onsite', morningCourse: true },
    payment: { amountCents: 9500, status: 'paid' },
  });
  const orderId = await saveAdminTestAddOnOrder(user, { morningCourse: true, afternoonCourse: true, dinnerQuantity: 1 });
  expect(records.get(`registrationOrders/${orderId}`)).toMatchObject({
    isTest: true,
    items: { morningCourse: false, afternoonCourse: true, dinnerQuantity: 1 },
    payment: { amountCents: 6500 },
  });
  expect(records.get('registrations/test-admin')).toMatchObject({
    entitlements: { morningCourse: true, afternoonCourse: true, dinnerQuantity: 1 },
    payment: { amountCents: 9500, status: 'paid' },
  });
  await expect(saveAdminTestAddOnOrder(user, { morningCourse: true, afternoonCourse: true }))
    .rejects.toThrow('registrations/no-new-additions');
});

test('allowing student courses does not expose administrative test writes to participants', async () => {
  isAdminUser.mockReturnValue(false);
  await expect(saveAdminTestRegistration(user, { profile: 'student', morningCourse: true }))
    .rejects.toThrow('registrations/admin-only');
  await expect(saveAdminTestAddOnOrder(user, { morningCourse: true }))
    .rejects.toThrow('registrations/admin-only');
  expect(records.size).toBe(0);
});
