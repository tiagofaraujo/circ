// Keep this scoped allowlist aligned with canManageRegistrations in firestore.rules.
// These accounts manage registrations and billing, not global administration.
const registrationManagementEmails = ['circ.chuc@gmail.com', 'paulojaneiro77@gmail.com'];

export function hasRegistrationManagementAccess(email, emailVerified) {
  return emailVerified === true && typeof email === 'string'
    && registrationManagementEmails.includes(email.trim().toLowerCase());
}
