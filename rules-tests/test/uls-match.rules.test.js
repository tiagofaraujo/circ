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
let testEnv;

function userDb(uid, email = PILOT_EMAIL) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();
}

async function seedProfileAndRoster(uid, nameKey = NAME_KEY, pilot = true) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', uid), {
      name: 'Ana Filipa de Sá',
      ulsNameKey: nameKey,
      roles: pilot ? { ulsPilot: true } : {},
    });
    await setDoc(doc(db, 'ulsRoster', MEC), {
      eventId: EVENT_ID,
      active: true,
      nameKey: NAME_KEY,
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

test('pilot can atomically claim the matching MEC and name', async () => {
  await seedProfileAndRoster('pilot');
  const db = userDb('pilot');
  await assertSucceeds(claimBatch(db, 'pilot'));
  const eligibility = await assertSucceeds(getDoc(doc(db, 'ulsEligibility', 'pilot')));
  if (!eligibility.exists() || eligibility.data().mec !== MEC) throw new Error('Eligibility was not stored.');
});

test('wrong profile name cannot claim the MEC', async () => {
  await seedProfileAndRoster('pilot', 'OUTRA PESSOA');
  await assertFails(claimBatch(userDb('pilot'), 'pilot', { nameKey: 'OUTRA PESSOA' }));
});

test('a non-pilot account cannot claim a valid pair', async () => {
  await seedProfileAndRoster('other', NAME_KEY, false);
  await assertFails(claimBatch(userDb('other', 'outra@example.com'), 'other'));
});

test('a MEC cannot be claimed by a second account', async () => {
  await seedProfileAndRoster('pilot');
  await assertSucceeds(claimBatch(userDb('pilot'), 'pilot'));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'second'), {
      name: 'Ana Filipa de Sá',
      ulsNameKey: NAME_KEY,
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
