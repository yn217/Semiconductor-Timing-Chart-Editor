import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockJson = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const pinned = packageJson.devDependencies?.wavedrom || packageJson.dependencies?.wavedrom;
assert.equal(typeof pinned, 'string', 'WaveDrom must be pinned in package.json');
assert.ok(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pinned), `WaveDrom must use an exact version, got ${pinned}`);
assert.equal(lockJson.packages?.['']?.devDependencies?.wavedrom || lockJson.packages?.['']?.dependencies?.wavedrom, pinned, 'package-lock pin differs from package.json');

const dependencyRoot = path.join(root, 'node_modules', 'wavedrom');
const dependency = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'package.json'), 'utf8'));
assert.equal(dependency.version, pinned, 'installed WaveDrom version differs from the pinned version');
const outputRoot = path.join(root, 'gui-mockup', 'generated');
fs.mkdirSync(outputRoot, { recursive: true });
const sources = [
  { source: path.join(dependencyRoot, 'wavedrom.min.js'), output: `wavedrom-${pinned}.min.js`, kind: 'runtime' },
  { source: path.join(dependencyRoot, 'skins', 'default.js'), output: `waveskin-default-${pinned}.js`, kind: 'skin' }
];
const files = {};
for (const item of sources) {
  assert.ok(fs.existsSync(item.source), `missing pinned WaveDrom source: ${item.source}`);
  const destination = path.join(outputRoot, item.output);
  fs.copyFileSync(item.source, destination);
  const hash = value => crypto.createHash('sha256').update(fs.readFileSync(value)).digest('hex');
  files[item.kind] = { path: `gui-mockup/generated/${item.output}`, source: `node_modules/wavedrom/${path.relative(dependencyRoot, item.source).replaceAll(path.sep, '/')}`, sha256: hash(destination) };
}
const manifest = { package: 'wavedrom', version: pinned, source: 'node_modules/wavedrom', files };
fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated WaveDrom ${pinned} runtime and default skin from node_modules/wavedrom.`);
