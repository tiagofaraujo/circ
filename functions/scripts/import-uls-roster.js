'use strict';

// Source data must stay OUTSIDE the repository. Names and preferred work locations are not imported.
const fs = require('node:fs');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { normalizeMec, EVENT_ID } = require('../ulsVerification');

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
  const path = flag('--file');
  const projectId = flag('--project');
  if (!path || !projectId) throw new Error('Usage: node scripts/import-uls-roster.js --file /private/mec-list.json --project PROJECT_ID [--apply]');
  const input = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!Array.isArray(input) || !input.length || input.length > 500) throw new Error('Expected 1–500 MEC strings.');
  const ids = input.map(normalizeMec);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate MECs found. Nothing imported.');
  console.log(`Validated ${ids.length} MECs for ${EVENT_ID}, project ${projectId}. No names or emails are printed.`);
  if (!args.includes('--apply')) { console.log('Dry run only. Add --apply to import using Application Default Credentials.'); return; }
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    const refs = ids.map((id) => db.doc(`ulsRoster/${id}`));
    const existing = await Promise.all(refs.map((ref) => transaction.get(ref)));
    refs.forEach((ref, index) => {
      // Re-imports must not reactivate a record that an operator has deliberately revoked.
      if (!existing[index].exists) transaction.create(ref, { eventId: EVENT_ID, active: true, importedAt: new Date() });
    });
  });
  console.log('Import completed. Existing records and claims were preserved.');
}
main().catch(() => { console.error('Import failed. Check input, project and permissions. No staff identifiers are logged.'); process.exitCode = 1; });
