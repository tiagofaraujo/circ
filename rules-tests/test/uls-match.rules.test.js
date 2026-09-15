'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { after, afterEach, before, test } = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-circ-2027';
const PILOT_EMAIL = 'pilot@example.test';
const EVENT_ID = 'circ-2027';
const MEC = '7315';
const NAME_KEY = 'ANA FILIPA SA';
const PROFILE_NAME = 'Ana Filipa de Sá';
let testEnv;

function userDb(uid, email = PILOT_EMAIL) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
}

async function seedProfileAndRoster(uid, {
  profileName = PROFILE_NAME,
  rosterProfileName = PROFILE_NAME,
  pilot = true,
} = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', uid), {
      name: profileName,
      roles: pilot ? { ulsPilot: true } : {},
    });
    await setDoc(doc(db, 'ulsRoster', MEC), {
      eventId: EVENT_ID,
      active: true,
      nameKey: NAME_KEY,
      profileName: rosterProfileName,
    });
  });
}

function claimBatch(db, uid, { mec = MEC, nameKey = NAME_KEY } = {}) {
  const batch = writeBatch(db);
  const common = { userId: uid, eventId: EVENT_ID, mec, nameKey, method: 'mec-name-match' };
  batch.set(doc(db, 'users', uid), { ulsNameKey: nameKey, updatedAt: serverTimestamp() }, { merge: true });
  batch.set(doc(db, 'ulsMecClaims', EVENT_ID + '_' + mec), { ...common, claimedAt: serverTimestamp() });
  batch.set(doc(db, 'ulsEligibility', uid), { ...common, status: 'matched', matchedAt: serverTimestamp() });
  return batch.commit();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterEach(async () => testEnv.clearFirestore());
after(async () => testEnv.cleanup());

test('ordinary profiles cannot create a ULS key outside a claim', async () => {
  await assertSucceeds(setDoc(doc(userDb('new-user'), 'users', 'new-user'), {
    name: 'Utilizador Novo',
    email: 'pilot@example.test',
  }));
  await assertFails(setDoc(doc(userDb('forged-user'), 'users', 'forged-user'), {
    name: PROFILE_NAME,
    ulsNameKey: NAME_KEY,
  }));
});

test('pilot can atomically claim the matching MEC and name', async () => {
  await seedProfileAndRoster('pilot');
  const db = userDb('pilot');
  await assertSucceeds(claimBatch(db, 'pilot'));
  const eligibility = await assertSucceeds(getDoc(doc(db, 'ulsEligibility', 'pilot')));
  if (!eligibility.exists() || eligibility.data().mec !== MEC) throw new Error('Eligibility was not stored.');
});

test('wrong profile name cannot claim the MEC', async () => {
  await seedProfileAndRoster('pilot', { profileName: 'Outra Pessoa' });
  await assertFails(claimBatch(userDb('pilot'), 'pilot'));
});

test('a forged name key cannot claim a roster entry for an unrelated saved name', async () => {
  await seedProfileAndRoster('pilot', { profileName: 'Pessoa Diferente' });
  await assertFails(claimBatch(userDb('pilot'), 'pilot'));
});

test('a participant cannot save a name key outside the validated atomic claim', async () => {
  await seedProfileAndRoster('pilot');
  const profileRef = doc(userDb('pilot'), 'users', 'pilot');
  await assertFails(updateDoc(profileRef, { ulsNameKey: NAME_KEY }));
  await assertSucceeds(updateDoc(profileRef, { name: 'Maria do Carmo' }));
});

test('a non-pilot account cannot claim a valid pair', async () => {
  await seedProfileAndRoster('other', { pilot: false });
  await assertFails(claimBatch(userDb('other', 'outra@example.com'), 'other'));
});

test('a MEC cannot be claimed by a second account', async () => {
  await seedProfileAndRoster('pilot');
  await assertSucceeds(claimBatch(userDb('pilot'), 'pilot'));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'second'), {
      name: PROFILE_NAME,
      roles: { ulsPilot: true },
    });
  });
  await assertFails(claimBatch(userDb('second'), 'second'));
});

test('the private roster cannot be read before a match', async () => {
  await seedProfileAndRoster('pilot');
  await assertFails(getDoc(doc(userDb('pilot'), 'ulsRoster', MEC)));
});

test('a matched participant can observe only the claimed roster entry', async () => {
  await seedProfileAndRoster('pilot');
  const db = userDb('pilot');
  await assertSucceeds(claimBatch(db, 'pilot'));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'ulsRoster', '9999'), {
      eventId: EVENT_ID,
      active: true,
      nameKey: 'OUTRA PESSOA',
      profileName: 'Outra Pessoa',
    });
  });

  await assertSucceeds(getDoc(doc(db, 'ulsRoster', MEC)));
  await assertFails(getDoc(doc(db, 'ulsRoster', '9999')));
  await assertFails(getDocs(collection(db, 'ulsRoster')));
});

test('the participant name is locked after a match while other profile fields remain editable', async () => {
  await seedProfileAndRoster('pilot');
  const db = userDb('pilot');
  await assertSucceeds(claimBatch(db, 'pilot'));
  await assertFails(updateDoc(doc(db, 'users', 'pilot'), {
    name: 'Outro Nome',
    ulsNameKey: 'OUTRO NOME',
  }));
  await assertSucceeds(updateDoc(doc(db, 'users', 'pilot'), { mobile: '900000000' }));
});

test('a matched account can delete its personal profile without releasing the MEC', async () => {
  await seedProfileAndRoster('pilot');
  const db = userDb('pilot');
  await assertSucceeds(claimBatch(db, 'pilot'));
  await assertSucceeds(deleteDoc(doc(db, 'users', 'pilot')));

  const deletedProfile = await assertSucceeds(getDoc(doc(db, 'users', 'pilot')));
  if (deletedProfile.exists()) throw new Error('The personal profile was not deleted.');

  const eligibility = await assertSucceeds(getDoc(doc(db, 'ulsEligibility', 'pilot')));
  if (!eligibility.exists()) throw new Error('The MEC reservation was released unexpectedly.');
});


test('admins can update a retained ULS registration after personal profile deletion', async () => {
  await seedProfileAndRoster('pilot');
  const participantDb = userDb('pilot');
  await assertSucceeds(claimBatch(participantDb, 'pilot'));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'registrations', 'retained-registration'), {
      userId: 'pilot',
      eventId: EVENT_ID,
      isTest: false,
      status: 'confirmed',
      selection: { profile: 'uls' },
    });
  });

  await assertSucceeds(deleteDoc(doc(participantDb, 'users', 'pilot')));

  const adminDb = testEnv.authenticatedContext('admin', {
    email: 'circ.chuc@gmail.com',
    email_verified: true,
  }).firestore();
  await assertSucceeds(updateDoc(doc(adminDb, 'registrations', 'retained-registration'), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  }));
});


const ADMIN = { uid: 'admin', email: 'circ.chuc@gmail.com' };
const REGISTRATION_ID = 'revoked-registration';

function registrationData() {
  return {
    userId: 'pilot',
    eventId: EVENT_ID,
    isTest: false,
    status: 'confirmed',
    selection: { profile: 'uls', courseAffiliation: 'uls', congressMode: 'virtual' },
    entitlements: { congressMode: 'virtual', morningCourse: false },
    payment: { status: 'paid', amountCents: 10000, currency: 'EUR' },
  };
}

async function prepareRevokedRegistration({ deleteProfile = false } = {}) {
  await seedProfileAndRoster('pilot');
  const participantDb = userDb('pilot');
  await assertSucceeds(claimBatch(participantDb, 'pilot'));
  const adminDb = userDb(ADMIN.uid, ADMIN.email);
  const registrationRef = doc(adminDb, 'registrations', REGISTRATION_ID);

  // Create through the actual rules while the match is active.
  await assertSucceeds(setDoc(registrationRef, registrationData()));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'ulsRoster', MEC), { active: false });
  });
  if (deleteProfile) await assertSucceeds(deleteDoc(doc(participantDb, 'users', 'pilot')));
  return { adminDb, participantDb, registrationRef };
}

for (const deleteProfile of [false, true]) {
  test('revocation permits audited cancellation and refund batches'
    + (deleteProfile ? ' after profile deletion' : ' with the profile retained'), async () => {
    const { adminDb, participantDb, registrationRef } = await prepareRevokedRegistration({ deleteProfile });
    const revokedRoster = await assertSucceeds(getDoc(doc(participantDb, 'ulsRoster', MEC)));
    if (revokedRoster.data()?.active !== false) throw new Error('Roster revocation was not observable.');

    // Use the same registration/audit and registration/payment/audit writes as adminStore.
    const cancellation = writeBatch(adminDb);
    cancellation.update(registrationRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN,
    });
    cancellation.set(doc(adminDb, 'auditLogs', 'cancel-registration'), {
      action: 'registration.status.updated',
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      before: 'confirmed',
      after: 'cancelled',
      actor: ADMIN,
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(cancellation.commit());

    const refund = writeBatch(adminDb);
    refund.update(registrationRef, {
      'payment.status': 'refunded',
      'payment.updatedAt': serverTimestamp(),
      'payment.updatedBy': ADMIN,
      updatedAt: serverTimestamp(),
    });
    refund.set(doc(adminDb, 'payments', REGISTRATION_ID), {
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      userId: 'pilot',
      participantEmail: PILOT_EMAIL,
      amountCents: 10000,
      currency: 'EUR',
      method: '',
      reference: '',
      status: 'refunded',
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN,
    }, { merge: true });
    refund.set(doc(adminDb, 'auditLogs', 'refund-registration'), {
      action: 'payment.status.updated',
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      before: 'paid',
      after: 'refunded',
      actor: ADMIN,
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(refund.commit());

    const saved = (await getDoc(registrationRef)).data();
    if (saved.status !== 'cancelled' || saved.payment.status !== 'refunded') {
      throw new Error('Historical status/payment updates were not persisted.');
    }
    if (saved.payment.amountCents !== 10000 || saved.selection.profile !== 'uls') {
      throw new Error('The historical tariff or amount was altered.');
    }
  });
}

test('revocation blocks new ULS registrations and additional ULS orders', async () => {
  const { adminDb } = await prepareRevokedRegistration();
  await assertFails(setDoc(doc(adminDb, 'registrations', 'new-uls-registration'), registrationData()));
  await assertFails(setDoc(doc(adminDb, 'registrations', 'new-uls-course'), {
    ...registrationData(),
    selection: { profile: 'external', courseAffiliation: 'uls', morningCourse: true },
  }));
  await assertFails(setDoc(doc(adminDb, 'registrationOrders', 'new-uls-order'), {
    userId: 'pilot',
    eventId: EVENT_ID,
    registrationId: REGISTRATION_ID,
    isTest: false,
    items: { morningCourse: true },
  }));
});

test('revocation does not prevent an administrator removing all ULS benefits', async () => {
  const { registrationRef } = await prepareRevokedRegistration();
  await assertSucceeds(updateDoc(registrationRef, {
    selection: { profile: 'external', courseAffiliation: 'external', congressMode: 'virtual' },
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN,
  }));
});

const blockedHistoricalChanges = [
  ['ULS selection', () => ({ 'selection.congressMode': 'onsite' })],
  ['ULS entitlement', () => ({ 'entitlements.morningCourse': true })],
  ['payment amount', () => ({
    'payment.status': 'refunded',
    'payment.amountCents': 1,
    'payment.updatedAt': serverTimestamp(),
    'payment.updatedBy': ADMIN,
  })],
  ['participant identity', () => ({ userId: 'another-participant', status: 'cancelled' })],
  ['invalid registration status', () => ({ status: 'invalid-status' })],
  ['invalid payment status', () => ({
    'payment.status': 'invalid-status',
    'payment.updatedAt': serverTimestamp(),
    'payment.updatedBy': ADMIN,
  })],
  ['forged actor', () => ({ status: 'cancelled', updatedBy: { uid: 'other', email: 'other@example.test' } })],
  ['stale timestamp', () => ({ status: 'cancelled', updatedAt: new Date(0) })],
];
for (const [label, fields] of blockedHistoricalChanges) {
  test('historical status exception rejects ' + label, async () => {
    const { registrationRef } = await prepareRevokedRegistration();
    await assertFails(updateDoc(registrationRef, {
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN,
      ...fields(),
    }));
  });
}

test('participants cannot use the administrative historical-status exception', async () => {
  const { participantDb } = await prepareRevokedRegistration();
  await assertFails(updateDoc(doc(participantDb, 'registrations', REGISTRATION_ID), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
    updatedBy: { uid: 'pilot', email: PILOT_EMAIL },
  }));
});
