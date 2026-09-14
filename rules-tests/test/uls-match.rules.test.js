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
  deleteDoc,
  doc,
  getDoc,
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

test('the private roster cannot be read by the participant', async () => {
  await seedProfileAndRoster('pilot');
  await assertFails(getDoc(doc(userDb('pilot'), 'ulsRoster', MEC)));
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
