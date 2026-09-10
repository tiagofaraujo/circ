'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMec, normalizeName } = require('../scripts/import-uls-roster');

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
