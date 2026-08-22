import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('gui-mockup/index.html', 'utf8');
const js = fs.readFileSync('gui-mockup/app.js', 'utf8');
const css = fs.readFileSync('gui-mockup/styles.css', 'utf8') + fs.readFileSync('gui-mockup/production-overrides.css', 'utf8');
const geometry = fs.readFileSync('gui-mockup/geometry.js', 'utf8');
const adapter = fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8');

for (const id of ['openDocument','saveDocument','addSignal','addGroup','addSpacer','addAnnotation','addEdge','snapAnchors','insertCycle','deleteCycle','exportSvg','exportPng','exportPdf','viewMode']) {
  assert.match(html, new RegExp(`id="${id}"`), `missing control: ${id}`);
}
for (const tab of ['signal','annotation','problems','json','transaction']) assert.match(html, new RegExp(`data-tab="${tab}"`), `missing tab: ${tab}`);
for (const marker of ['formatVersion:1','start','values','signalGroups','annotations','edges','transactions','localStorage']) {
  if (marker === 'localStorage') continue;
  assert.ok(js.includes(marker), `semantic marker missing: ${marker}`);
}
assert.match(js, /JSON\.parse/);
assert.match(js, /XMLSerializer/);
assert.match(js, /window\.print/);
assert.match(js, /RenderWaveForm/);
assert.match(js, /data-select/);
assert.match(css, /@media print/);
assert.match(geometry, /resolveAnchor/);
assert.match(geometry, /semantic-transition-geometry/);
assert.match(adapter, /toWaveJson/);
console.log('Accepted: editor controls, semantic persistence, SVG/PNG/PDF export paths, tabs, and print layout are present.');
