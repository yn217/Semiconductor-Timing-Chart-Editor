import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue9';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4202'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4202/', { waitUntil: 'networkidle' });
  const add = (type, seed) => page.evaluate(({ type, seed }) => window.TimingChartProductionController.actions.addAnnotation(type, seed), { type, seed });
  const documentOf = () => page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  const resolve = id => page.evaluate(id => { const a = window.TimingChartProductionController.model.document.annotations.find(item => item.id === id); const anchor = a.anchor || a.start || a.from; return window.TimingChartProductionAnnotations.resolve(anchor); }, id);

  await add('verticalLine', { id: 'issue9_vline', anchor: { signal: 'clk', cycle: 2, point: 'rising', offset: { x: 0, y: 0 } } });
  const vline = await resolve('issue9_vline');
  const direct = await page.evaluate(() => window.TimingChartProductionController.getAnchor({ signal: 'clk', cycle: 2, edge: 'rising', coordinateSpace: 'canvas' }));
  assert.equal(vline.source, 'wavedrom-svg');
  assert.ok(Math.abs(vline.x - direct.canvasX) <= 0.1, 'V-line is not at WaveDrom rising-edge X');

  await add('marker', { id: 'issue9_offset', anchor: { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 17, y: -12 } } });
  const beforeResize = await resolve('issue9_offset');
  await page.setViewportSize({ width: 1280, height: 720 }); await wait(80); await page.evaluate(() => window.TimingChartProductionController.render());
  const afterResize = await resolve('issue9_offset');
  assert.equal(afterResize.semantic.offset.x, 17); assert.equal(afterResize.semantic.offset.y, -12); assert.equal(afterResize.source, 'wavedrom-svg');

  await add('range', { id: 'issue9_ripple', start: { signal: 'req_valid', cycle: 3, point: 'cycle-boundary', offset: { x: 4, y: -20 } }, end: { signal: 'ready', cycle: 6, point: 'cycle-boundary', offset: { x: 8, y: -20 } } });
  const beforeInsert = await documentOf();
  await page.evaluate(() => window.TimingChartProductionController.actions.insertCycles(2, 2));
  const afterInsert = await documentOf();
  const beforeRange = beforeInsert.annotations.find(a => a.id === 'issue9_ripple'); const afterRange = afterInsert.annotations.find(a => a.id === 'issue9_ripple');
  assert.equal(afterRange.start.cycle, beforeRange.start.cycle + 2); assert.equal(afterRange.end.cycle, beforeRange.end.cycle + 2); assert.deepEqual(afterRange.start.offset, beforeRange.start.offset); assert.deepEqual(afterRange.end.offset, beforeRange.end.offset);

  const signalBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.model.document.signals));
  await page.evaluate(() => window.TimingChartProductionController.actions.updateAnnotation('issue9_offset', 'label', 'edited'));
  const signalAfter = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.model.document.signals));
  assert.equal(signalAfter, signalBefore, 'Annotation edit mutated waveform data');
  assert.equal(await page.locator('#cycleCanvas .trace [data-custom-signal-trace]').count(), 0);
  await page.screenshot({ path: `${root}/issue9-annotation.png` });
  const report = { vline: { source: vline.source, geometryErrorPx: Math.abs(vline.x - direct.canvasX) }, resizeOffset: afterResize.semantic.offset, ripple: { start: [beforeRange.start.cycle, afterRange.start.cycle], end: [beforeRange.end.cycle, afterRange.end.cycle] }, waveformUnchanged: signalAfter === signalBefore, customSignalTraceCount: 0, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #9 acceptance passed: WaveDrom geometry snap, pixel offsets, ripple tracking, and waveform isolation.');
} finally { server.kill(); }
