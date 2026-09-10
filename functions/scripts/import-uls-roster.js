'use strict';

const fs = require('node:fs');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const EVENT_ID = 'circ-2027';

function normalizeMec(value) {
  const mec = String(value || '').trim();
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

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const path = flag('--file');
  const projectId = flag('--project');
  if (!path || !projectId) {
    throw new Error('Usage: node scripts/import-uls-roster.js --file /private/mec-list.json --project PROJECT_ID [--apply]');
  }

  const input = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!Array.isArray(input) || !input.length || input.length > 500) {
    throw new Error('Expected 1–500 objects containing mec and name.');
  }
  const records = input.map((entry) => ({
    mec: normalizeMec(entry?.mec),
    nameKey: normalizeName(entry?.name),
  }));
  if (new Set(records.map((entry) => entry.mec)).size !== records.length) {
    throw new Error('Duplicate MECs found. Nothing imported.');
  }

  console.log('Validated ' + records.length + ' MEC/name records for ' + EVENT_ID + ', project ' + projectId + '. No identifiers are printed.');
  if (!args.includes('--apply')) {
    console.log('Dry run only. Add --apply to import using Application Default Credentials.');
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const refs = records.map((entry) => db.doc('ulsRoster/' + entry.mec));
    const existing = await Promise.all(refs.map((ref) => transaction.get(ref)));
    refs.forEach((ref, index) => {
      const previous = existing[index].exists ? existing[index].data() : null;
      if (previous && (
        previous.eventId !== EVENT_ID
        || (previous.nameKey && previous.nameKey !== records[index].nameKey)
      )) {
        throw new Error('Existing roster data conflicts with this import. Nothing imported.');
      }
    });
    refs.forEach((ref, index) => {
      const previous = existing[index].exists ? existing[index].data() : null;
      if (!previous) {
        transaction.create(ref, {
          eventId: EVENT_ID,
          active: true,
          nameKey: records[index].nameKey,
          importedAt: new Date(),
        });
      } else if (!previous.nameKey) {
        transaction.update(ref, { nameKey: records[index].nameKey });
      }
    });
  });
  console.log('Import completed. Existing active/revoked states and claims were preserved.');
}

if (require.main === module) {
  main().catch(() => {
    console.error('Import failed. Check input, project and permissions. No staff identifiers are logged.');
    process.exitCode = 1;
  });
}

module.exports = { normalizeMec, normalizeName };
