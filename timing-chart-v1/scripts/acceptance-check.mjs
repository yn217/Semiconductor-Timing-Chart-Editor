import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('gui-mockup/index.html', 'utf8');
const source = ['app-ui.js', 'production-controller.js', 'production-document.js', 'production-time-axis.js', 'production-waveform.js', 'production-annotations.js', 'wavedrom-adapter.js']
  .map(file => fs.readFileSync(`gui-mockup/${file}`, 'utf8')).join('\n');
const css = fs.readFileSync('gui-mockup/styles.css', 'utf8');

for (const selector of ['id="leftAdd"', 'id="cycleCanvas"', 'id="bottomContent"', 'id="inspectorBody"', 'id="transactionCanvas"']) {
  assert.ok(html.includes(selector), `missing locked GUI hook: ${selector}`);
}
for (const tab of ['signal', 'annotation', 'problems', 'json', 'transaction']) assert.match(html, new RegExp(`data-tab="${tab}"`));
for (const script of ['generated/waveskin-default-3.6.2.js', 'generated/wavedrom-3.6.2.min.js', 'production-controller.js', 'production-waveform.js']) assert.ok(html.includes(script), `missing production script: ${script}`);
for (const marker of ['formatVersion', 'start', 'values', 'signalGroups', 'annotations', 'transactions', 'toWaveJson', 'RenderWaveForm', 'getCycleBoundary', 'getAnchor']) assert.ok(source.includes(marker), `production semantic marker missing: ${marker}`);
assert.match(source, /JSON\.parse/);
assert.match(source, /documentHistory/);
assert.match(source, /dataset\.renderer/);
assert.match(css, /\.ribbon/);
assert.match(css, /\.bottom/);
assert.equal(fs.existsSync('gui-mockup/vendor/wavedrom.min.js'), false);
assert.equal(fs.existsSync('gui-mockup/vendor/waveskin-default.js'), false);
console.log('Accepted: locked GUI hooks, canonical production model, WaveDrom runtime mount, persistence, and overlay paths are present.');
