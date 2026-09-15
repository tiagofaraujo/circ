'use strict';

const fs = require('node:fs');

const EVENT_ID = 'circ-2027';

function normalizeMec(value) {
  const mec = String(value ?? '').trim();
  if (!/^\d{1,12}$/.test(mec)) throw new Error('Invalid MEC.');
  return mec;
}

function normalizeName(value) {
  const nameKey = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((part) => part && !['D', 'DA', 'DAS', 'DE', 'DO', 'DOS'].includes(part))
    .join(' ');
  if (nameKey.length < 5 || nameKey.length > 160) throw new Error('Invalid full name.');
  return nameKey;
}

function normalizeProfileName(value) {
  const profileName = String(value || '').replace(/\s+/g, ' ').trim();
  if (profileName.length < 5 || profileName.length > 160) {
    throw new Error('Invalid full name.');
  }
  return profileName;
}

function prepareRecords(input) {
  if (!Array.isArray(input) || !input.length || input.length > 500) {
    throw new Error('Expected 1–500 objects containing mec and name.');
  }
  const records = input.map((entry) => ({
    mec: normalizeMec(entry?.mec),
    profileName: normalizeProfileName(entry?.name),
    nameKey: normalizeName(entry?.name),
  }));
  if (new Set(records.map((entry) => entry.mec)).size !== records.length) {
    throw new Error('Duplicate MECs found. Nothing imported.');
  }
  return records;
}

function planRosterWrite(previous, entry) {
  if (!previous) {
    return {
      operation: 'create',
      data: { eventId: EVENT_ID, active: true, nameKey: entry.nameKey, profileName: entry.profileName },
    };
  }
  // A change of spelling must not invalidate an existing claim (including the
  // original pilot). A different identity must never replace an existing MEC.
  if (previous.eventId !== EVENT_ID
    || typeof previous.active !== 'boolean'
    || (previous.nameKey && previous.nameKey !== entry.nameKey)
    || (previous.profileName && normalizeName(previous.profileName) !== entry.nameKey)) {
    throw new Error('Existing roster data conflicts with this import. Nothing imported.');
  }
  const missing = {};
  if (!previous.nameKey) missing.nameKey = entry.nameKey;
  if (!previous.profileName) missing.profileName = entry.profileName;
  return { operation: Object.keys(missing).length ? 'update' : 'keep', data: missing };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const path = flag('--file');
  const projectId = flag('--project');
  if (!path || !projectId) {
    throw new Error('Usage: node scripts/import-uls-roster.js --file /private/mec-list.json --project PROJECT_ID [--check | --apply]');
  }
  if (args.includes('--check') && args.includes('--apply')) {
    throw new Error('Choose --check or --apply, not both.');
  }
  const records = prepareRecords(JSON.parse(fs.readFileSync(path, 'utf8')));

  console.log('Validated ' + records.length + ' MEC/name records for ' + EVENT_ID + ', project ' + projectId + '. No identifiers are printed.');
  if (!args.includes('--apply') && !args.includes('--check')) {
    console.log('Local validation only. Use --check to inspect the target without writing, or --apply to import.');
    return;
  }

  const { initializeApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const summary = await db.runTransaction(async (transaction) => {
    const refs = records.map((entry) => db.doc('ulsRoster/' + entry.mec));
    const existing = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const plans = records.map((entry, index) => planRosterWrite(
      existing[index].exists ? existing[index].data() : null, entry
    ));
    const counts = { create: 0, update: 0, keep: 0, inactive: 0 };
    plans.forEach((plan, index) => {
      counts[plan.operation] += 1;
      if (existing[index].exists && existing[index].data().active === false) counts.inactive += 1;
    });
    if (args.includes('--check')) return counts;

    // All records are checked before the first write. Firestore commits this
    // import atomically; reruns preserve deactivations, spellings and claims.
    refs.forEach((ref, index) => {
      const plan = plans[index];
      if (plan.operation === 'create') transaction.create(ref, { ...plan.data, importedAt: new Date() });
      if (plan.operation === 'update') transaction.update(ref, plan.data);
    });
    return counts;
  });
  console.log('Records: ' + JSON.stringify(summary));
  console.log(args.includes('--check')
    ? 'Remote check completed. No writes performed.'
    : 'Import completed. Existing active/revoked states and claims were preserved.');
}

if (require.main === module) {
  main().catch(() => {
    console.error('Import failed. Check input, project and permissions. No staff identifiers are logged.');
    process.exitCode = 1;
  });
}

module.exports = { normalizeMec, normalizeName, normalizeProfileName, prepareRecords, planRosterWrite };
