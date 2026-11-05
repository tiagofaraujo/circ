import { capacitySummary, capacityDecision, selectionFootprint, paidFootprint } from './paid-capacity.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const LOCK = 'circ-2027-paid-capacity-v1';

// Every admission shares this transaction lock. Counts are derived from current
// paid registrations, so existing participants, vouchers, refunds and archived
// registrations need no counter migration or compensating increment/decrement.
export function createPaidCapacityStore({ root, call, fields, decode }) {
  const endpoint = `https://firestore.googleapis.com/v1/${root}`;
  const lockName = `${root}/settings/${LOCK}`;
  const unwrap = doc => ({ ...decode({ mapValue: { fields: doc.fields || {} } }), id: doc.name.slice(`${root}/registrations/`.length) });

  async function summary(transaction) {
    const registrations = [], seen = new Set();
    let after = null;
    for (let page = 0; page < 100; page++) {
      const rows = await call(`${endpoint}:runQuery`, 'POST', {
        ...(transaction ? { transaction } : {}),
        structuredQuery: {
          from: [{ collectionId: 'registrations' }],
          // One indexed field avoids introducing a production composite index.
          where: { fieldFilter: { field: { fieldPath: 'payment.status' }, op: 'EQUAL', value: { stringValue: 'paid' } } },
          select: { fields: ['eventId', 'userId', 'registrationKey', 'primaryRegistration', 'status', 'isTest', 'testMode', 'registrationArchiveId', 'registrationArchivedAt', 'payment.status', 'entitlements', 'selection'].map(fieldPath => ({ fieldPath })) },
          orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
          limit: 500,
        },
      });
      if (!Array.isArray(rows)) fail('capacity-unavailable');
      const docs = rows.filter(row => row.document).map(row => row.document);
      for (const doc of docs) {
        if (!doc.name?.startsWith(`${root}/registrations/`) || doc.name.slice(`${root}/registrations/`.length).includes('/') || seen.has(doc.name)) fail('capacity-unavailable');
        seen.add(doc.name); registrations.push(unwrap(doc));
      }
      if (docs.length < 500) return capacitySummary(registrations);
      after = docs.at(-1).name;
    }
    fail('capacity-unavailable');
  }

  async function commit({ checks = [], writes, selection, nextRegistration, registrationName, onFull = 'reject' }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let transaction;
      try {
        const names = [...new Set([...checks.map(check => check.name), lockName])];
        const batch = await call(`${endpoint}:batchGet`, 'POST', { documents: names, newTransaction: { readWrite: {} } });
        if (!Array.isArray(batch) || !(transaction = batch.find(row => row.transaction)?.transaction)) fail('capacity-unavailable');
        for (const check of checks) {
          const row = batch.find(item => item.found?.name === check.name || item.missing === check.name);
          if (!row || (check.version === null ? row.missing !== check.name : row.found?.updateTime !== check.version)) fail('conflict');
        }
        const lock = batch.find(row => row.found?.name === lockName || row.missing === lockName);
        if (!lock) fail('capacity-unavailable');
        const lockData = lock.found ? decode({ mapValue: { fields: lock.found.fields || {} } }) : null;
        if (lockData && (!Number.isSafeInteger(lockData.revision) || lockData.revision < 0 || lockData.revision >= Number.MAX_SAFE_INTEGER)) fail('capacity-unavailable');
        const currentDoc = batch.find(row => row.found?.name === registrationName)?.found;
        const previousRegistration = currentDoc ? unwrap(currentDoc) : null;
        const next = nextRegistration ? { ...nextRegistration, id: registrationName.slice(`${root}/registrations/`.length) } : null;
        const before = paidFootprint(previousRegistration), after = paidFootprint(next);
        const needed = selection ? selectionFootprint(selection) : Object.fromEntries(Object.keys(after).map(key => [key, Math.max(0, after[key] - before[key])]));
        // A virtual-only purchase never needs a seat read or a finite quota.
        const counted = Object.values(needed).some(value => value > 0) ? await summary(transaction) : null;
        const decision = counted ? capacityDecision(counted, { previousRegistration, nextRegistration: next, ...(selection ? { selection } : {}) })
          : { allocated: true, unavailable: [], delta: needed };
        if (!decision.allocated && onFull !== 'hold') throw Object.assign(new Error('capacity-full'), { code: 'capacity-full', unavailable: decision.unavailable });
        const rawWrites = typeof writes === 'function' ? writes(decision, previousRegistration) : writes;
        const result = await call(`${endpoint}:commit`, 'POST', { transaction, writes: [...rawWrites,
          { update: { name: lockName, fields: fields({ eventId: 'circ-2027', revision: (lockData?.revision || 0) + 1 }) },
            currentDocument: lock.found ? { updateTime: lock.found.updateTime } : { exists: false } },
        ] });
        return { ...result, ...decision };
      } catch (error) {
        if (transaction) { try { await call(`${endpoint}:rollback`, 'POST', { transaction }); } catch {} }
        if (error?.code === 'conflict' && attempt < 2) continue;
        throw error;
      }
    }
    fail('conflict');
  }

  return { summary: () => summary(), commit };
}
