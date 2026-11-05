import { getUserAccess, isAdminUser } from './firebaseClient';

test('the designated verified account receives registration consultation without administrator powers', () => {
  const user = { uid: 'paulo', email: 'paulojaneiro77@gmail.com', emailVerified: true };
  expect(getUserAccess(user)).toMatchObject({ canViewRegistrations: true, hasBackOfficeAccess: true,
    isAdmin: false, canManageRegistrations: false, canManageSubmissions: false,
    canUseSecretariat: false, canReviewSubmissions: false, canTestSubmissions: false });
  expect(isAdminUser(user)).toBe(false);
});

test.each([
  { email: 'paulojaneiro77@gmail.com', emailVerified: false },
  { email: 'paulojaneiro77+other@gmail.com', emailVerified: true },
  { email: 'paulojaneiro77@gmail.com.attacker.test', emailVerified: true },
  { email: 'other@example.test', emailVerified: true },
  null,
])('unverified, unrelated and lookalike accounts cannot consult registrations: %j', user => {
  expect(getUserAccess(user).canViewRegistrations).toBe(false);
});

test('an editable account role cannot self-grant registration consultation or financial management', () => {
  expect(getUserAccess({ email: 'other@example.test', emailVerified: true }, {
    registrations: true, registrationReports: true, admin: true,
  })).toMatchObject({ canViewRegistrations: false, canManageRegistrations: false, isAdmin: false });
});

test('email comparison uses a normalized exact address and preserves the owner permissions', () => {
  expect(getUserAccess({ email: ' PAULOJANEIRO77@GMAIL.COM ', emailVerified: true }).canViewRegistrations).toBe(true);
  expect(getUserAccess({ email: 'circ.chuc@gmail.com', emailVerified: true })).toMatchObject({
    canViewRegistrations: true, canManageRegistrations: true, isAdmin: true,
  });
});
