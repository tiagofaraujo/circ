'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMec, normalizeName, normalizeProfileName, prepareRecords, planRosterWrite } = require('../scripts/import-uls-roster');

test('normalises the pilot name exactly like the browser', () => {
  assert.equal(normalizeName('Ana Filipa de Sá'), 'ANA FILIPA SA');
  assert.equal(normalizeName('ANA FILIPA SA'), 'ANA FILIPA SA');
});

test('normalises punctuation and Portuguese particles', () => {
  assert.equal(normalizeName("Maria  d'Ávila-Santos"), 'MARIA AVILA SANTOS');
});

test('validates MEC and full-name input', () => {
  assert.equal(normalizeMec(' 7315 '), '7315');
  assert.throws(() => normalizeMec('42A6'), /Invalid MEC/);
  assert.throws(() => normalizeName('de'), /Invalid full name/);
});

test('preserves the exact private profile name while trimming whitespace', () => {
  assert.equal(normalizeProfileName('  Tiago  Fernando Conde de Araújo  '), 'Tiago Fernando Conde de Araújo');
});

const RECORD = prepareRecords([{ mec: '007315', name: 'ANA FILIPA SA' }])[0];
const EXISTING = { eventId: 'circ-2027', active: true, nameKey: 'ANA FILIPA SA', profileName: 'Ana Filipa de Sá' };

test('prepares the whole list, preserves identifier zeros and rejects duplicates', () => {
  assert.equal(RECORD.mec, '007315');
  assert.throws(() => prepareRecords([{ mec: 7315, name: 'Ana Filipa Sá' }, { mec: '7315', name: 'Ana Filipa Sá' }]), /Duplicate/);
  assert.throws(() => prepareRecords([]), /1–500/);
  assert.throws(() => prepareRecords([{ mec: 1234, name: '' }]), /Invalid full name/);
});

test('preserves an existing pilot entry with equivalent spelling', () => {
  assert.deepEqual(planRosterWrite(EXISTING, RECORD), { operation: 'keep', data: {} });
  assert.equal(EXISTING.profileName, 'Ana Filipa de Sá');
});

test('reimporting does not reactivate or overwrite existing staff entries', () => {
  assert.deepEqual(planRosterWrite({ ...EXISTING, active: false }, RECORD), { operation: 'keep', data: {} });
  assert.deepEqual(planRosterWrite({ ...EXISTING, nameKey: '' }, RECORD), {
    operation: 'update', data: { nameKey: 'ANA FILIPA SA' },
  });
});

test('a new record contains only the data needed for roster matching', () => {
  assert.deepEqual(planRosterWrite(null, RECORD), {
    operation: 'create', data: {
      eventId: 'circ-2027', active: true, nameKey: 'ANA FILIPA SA', profileName: 'ANA FILIPA SA',
    },
  });
});

test('conflicting identities and invalid previous states abort the import', () => {
  for (const previous of [
    { ...EXISTING, nameKey: 'OUTRA PESSOA' },
    { ...EXISTING, profileName: 'Outra Pessoa' },
    { ...EXISTING, eventId: 'circ-2025' },
    { ...EXISTING, active: 'true' },
  ]) assert.throws(() => planRosterWrite(previous, RECORD), /conflicts/);
});
