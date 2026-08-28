import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lockJson = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('gui-mockup/generated/manifest.json', 'utf8'));
const pinned = packageJson.devDependencies?.wavedrom || packageJson.dependencies?.wavedrom;
assert.equal(manifest.version, pinned);
assert.equal(lockJson.packages[''].devDependencies?.wavedrom || lockJson.packages[''].dependencies?.wavedrom, pinned);
for (const file of Object.values(manifest.files)) {
  assert.ok(fs.existsSync(file.path), `generated runtime missing: ${file.path}`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  assert.equal(hash, file.sha256, `generated runtime hash mismatch: ${file.path}`);
}
assert.equal(fs.existsSync('gui-mockup/vendor/wavedrom.min.js'), false, 'independent vendor WaveDrom remains');
assert.equal(fs.existsSync('gui-mockup/vendor/waveskin-default.js'), false, 'independent vendor WaveDrom skin remains');
const html = fs.readFileSync('gui-mockup/index.html', 'utf8');
assert.match(html, new RegExp(`generated/waveskin-default-${pinned.replaceAll('.', '\\.')}.js`));
assert.match(html, new RegExp(`generated/wavedrom-${pinned.replaceAll('.', '\\.')}.min.js`));
console.log(`WaveDrom runtime source check passed: ${pinned}, generated assets verified.`);
