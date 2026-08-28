import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue10';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4203'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4203/', { waitUntil: 'networkidle' });
  const from = { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } };
  const to = { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: 0 } };
  const add = (lineType, arrowhead, id) => page.evaluate(({ from, to, lineType, arrowhead, id }) => window.TimingChartProductionController.actions.addDependency(from, to, { id, lineType, arrowhead, label: id, labelOffset: { x: 7, y: -9 } }), { from, to, lineType, arrowhead, id });
  for (const [lineType, arrowhead] of [['straight', 'end'], ['orthogonal', 'start'], ['curve', 'both'], ['diagonal', 'none']]) {
    const result = await add(lineType, arrowhead, `edge_${lineType}`);
    if (!result) throw new Error(JSON.stringify(await page.evaluate(() => ({ validation: window.TimingChartProductionController.model.validation, lastError: window.TimingChartProductionController.model.persistence.lastError }))));
  }
  const resolved = await page.evaluate(() => Object.fromEntries(window.TimingChartProductionController.model.document.annotations.filter(a => a.type === 'dependency').map(a => [a.id, { from: window.TimingChartProductionAnnotations.resolve(a.from), to: window.TimingChartProductionAnnotations.resolve(a.to) }])));
  for (const value of Object.values(resolved)) { assert.equal(value.from.source, 'wavedrom-svg'); assert.equal(value.to.source, 'wavedrom-svg'); }
  const overlay = await page.evaluate(() => ({ lines: document.querySelectorAll('[data-production-overlay="annotations"] line[data-annotation-id]').length, paths: document.querySelectorAll('[data-production-overlay="annotations"] path[data-annotation-id]').length, markers: document.querySelectorAll('[data-production-overlay="annotations"] marker').length, arrowheads: [...document.querySelectorAll('[data-production-overlay="annotations"] [marker-start],[data-production-overlay="annotations"] [marker-end]')].map(e => [e.getAttribute('marker-start'), e.getAttribute('marker-end')]), labels: [...document.querySelectorAll('[data-production-overlay="annotations"] text[data-annotation-part="label"]')].map(e => e.dataset.annotationId) }));
  assert.ok(overlay.lines >= 5); assert.ok(overlay.paths >= 1); assert.ok(overlay.markers >= 1); assert.ok(overlay.arrowheads.some(value => value[1])); assert.ok(overlay.arrowheads.some(value => value[0])); assert.equal(overlay.labels.length, 4);
  const before = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  await page.evaluate(() => window.TimingChartProductionController.actions.updateAnnotation('edge_straight', 'labelOffset.x', 31));
  const afterLabel = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  assert.equal(afterLabel.annotations.find(a => a.id === 'edge_straight').labelOffset.x, 31);
  await page.evaluate(() => window.TimingChartProductionController.actions.insertCycles(2, 2));
  const afterInsert = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  const moved = afterInsert.annotations.find(a => a.id === 'edge_straight'); const original = before.annotations.find(a => a.id === 'edge_straight');
  assert.equal(moved.from.cycle, original.from.cycle + 2); assert.equal(moved.to.cycle, original.to.cycle + 2); assert.equal(moved.labelOffset.x, 31);
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.document.signals.some(s => s.wave || s.waveJson || s.pathFor)), false);
  await page.screenshot({ path: `${root}/dependency-arrows.png` });
  const report = { endpoints: Object.fromEntries(Object.entries(resolved).map(([id, value]) => [id, { from: value.from.source, to: value.to.source }])), styles: ['straight', 'orthogonal', 'curve', 'diagonal'], arrowheads: overlay.arrowheads, independentLabelOffset: true, timelineTracking: true, runtimeSignalRenderer: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #10 acceptance passed: WaveDrom-anchored dependency edges, styles, arrowheads, labels, persistence, and timeline tracking.');
} finally { server.kill(); }
