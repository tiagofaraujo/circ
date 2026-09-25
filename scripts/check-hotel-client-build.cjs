const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Catch stale bundles/source maps as well as accidental frontend imports.
const root = path.resolve(__dirname, '../build/static/js');
assert.ok(fs.existsSync(root), 'Build the application before checking public assets.');
for (const name of fs.readdirSync(root)) {
  if (!/\.(js|map)$/.test(name)) continue;
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  for (const privateCode of ['TCOIWED', 'NHDINESWED']) {
    assert.ok(!source.includes(privateCode), `Protected hotel data found in public asset ${name}`);
  }
}
console.log('Public JavaScript and source maps contain no protected hotel booking codes.');
