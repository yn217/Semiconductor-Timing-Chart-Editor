import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const manifestPath = 'artifacts/gui-phase3a/golden-manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const [file, expected] of Object.entries(manifest.files)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(actual, expected, `Golden changed: ${file}`);
}
console.log(`Golden Manifest PASS: ${Object.keys(manifest.files).length} locked files, SHA-256 verified.`);
