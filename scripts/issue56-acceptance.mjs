import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue56');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
  await page.waitForTimeout(350);
  const base = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  const openCycles = async cycleCount => {
    const documentValue = structuredClone(base);
    documentValue.timeline.cycleCount = cycleCount;
    documentValue.timeline.end = cycleCount;
    documentValue.document.id = `issue56-${cycleCount}.tcd`;
    const opened = await page.evaluate(async value => window.TimingChartProductionController.actions.openText(JSON.stringify(value), { fileName: `issue56-${value.timeline.cycleCount}.tcd`, unsavedDecision: 'discard' }), documentValue);
    assert.equal(opened, true, `could not open ${cycleCount}-cycle document`);
    await page.waitForTimeout(80);
  };
  const measure = () => page.evaluate(() => {
    const c = window.TimingChartProductionController;
    const host = window.TimingChartTimingViewport.getScrollHost();
    const clock = c.selectors.getReferenceClock();
    const start = c.getCycleBoundary({ signal: clock.id, cycle: 0, coordinateSpace: 'canvas' });
    const end = c.getCycleBoundary({ signal: clock.id, cycle: c.model.document.timeline.cycleCount, coordinateSpace: 'canvas' });
    const rect = host.getBoundingClientRect();
    return { zoom: c.model.view.zoom, startX: start?.canvasX, endX: end?.canvasX, viewportLeft: rect.left, viewportRight: rect.right, scrollLeft: host.scrollLeft, scrollWidth: host.scrollWidth, clientWidth: host.clientWidth, document: JSON.stringify(c.getSerializableDocument()), undo: c.model.history.undo.length, waveRenders: c.zoomMetrics.fullWaveDromRenders };
  });
  const fitAll = async cycleCount => {
    await openCycles(cycleCount);
    await page.evaluate(() => window.TimingChartProductionController.actions.setZoom(100));
    await page.waitForTimeout(70);
    const before = await measure();
    await page.evaluate(() => { const host = window.TimingChartTimingViewport.getScrollHost(); host.scrollLeft = host.scrollWidth; });
    const fitted = await page.evaluate(() => window.TimingChartProductionController.actions.fitAll());
    assert.equal(fitted, true, `Fit All returned false for ${cycleCount} cycles`);
    await page.waitForTimeout(130);
    const after = await measure();
    assert.ok(after.startX >= after.viewportLeft - 2, `Fit All start clipped for ${cycleCount} cycles: ${JSON.stringify(after)}`);
    if (cycleCount <= 10) assert.ok(after.endX <= after.viewportRight + 2, `Fit All end clipped for ${cycleCount} cycles: ${JSON.stringify(after)}`);
    assert.equal(after.document, before.document, 'Fit All mutated canonical document');
    assert.equal(after.undo, before.undo, 'Fit All created history entry');
    assert.equal(after.waveRenders, before.waveRenders, 'Fit All regenerated WaveDrom');
    return { before, after };
  };
  const short = await fitAll(10);
  const long = await fitAll(100);
  assert.ok(long.after.zoom < short.after.zoom, '100-cycle Fit All did not choose a smaller zoom');
  assert.ok(long.after.zoom >= 0.25 && long.after.zoom <= 0.250001, '100-cycle Fit All did not respect the minimum zoom clamp');

  await page.evaluate(() => window.TimingChartProductionController.actions.setZoom(100));
  await page.waitForTimeout(80);
  const beforeSelection = await measure();
  await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    c.model.selection = { kind: 'time', id: null };
    const start = c.getCycleBoundary({ signal: c.selectors.getReferenceClock().id, cycle: c.model.document.timeline.cycleCount - 4, coordinateSpace: 'canvas' });
    const end = c.getCycleBoundary({ signal: c.selectors.getReferenceClock().id, cycle: c.model.document.timeline.cycleCount, coordinateSpace: 'canvas' });
    c.actions.selectTimeAtCanvasX(start.canvasX);
    c.actions.selectTimeAtCanvasX(end.canvasX, { shiftKey: true });
  });
  const selectedRange = await page.evaluate(() => structuredClone(window.TimingChartProductionController.model.timeSelection));
  assert.equal(selectedRange.rangeStart, 96, 'Fit Selection fixture did not create canonical rangeStart through production action');
  assert.equal(selectedRange.rangeEnd, 100, 'Fit Selection fixture did not create canonical rangeEnd through production action');
  const fittedSelection = await page.evaluate(() => window.TimingChartProductionController.actions.fitSelection());
  assert.equal(fittedSelection, true, 'Fit Selection returned false');
  await page.waitForTimeout(130);
  const afterSelection = await measure();
  assert.ok(afterSelection.zoom !== 1.25, 'Fit Selection still uses fixed 125%');
  assert.equal(afterSelection.document, beforeSelection.document, 'Fit Selection mutated canonical document');
  assert.equal(afterSelection.undo, beforeSelection.undo, 'Fit Selection created history entry');
  assert.equal(afterSelection.waveRenders, beforeSelection.waveRenders, 'Fit Selection regenerated WaveDrom');
  assert.ok(afterSelection.scrollLeft >= 0 && afterSelection.scrollLeft <= afterSelection.scrollWidth - afterSelection.clientWidth + 1, 'Fit Selection did not keep scroll position valid');
  assert.ok(afterSelection.scrollLeft > 0, 'Fit Selection did not reveal the late selected range');
  results.push({ viewport, short: short.after, long: long.after, selection: afterSelection, errors, pass: errors.length === 0 });
  await page.screenshot({ path: path.join(out, `issue56-${viewport.width}x${viewport.height}.png`) });
  await page.close();
}

const source = await fs.readFile(path.join(root, 'gui-mockup', 'zoom-fix.js'), 'utf8');
assert.equal(source.includes('fitAll = () => controller.actions.setZoom(100)'), false, 'fixed Fit All remains');
assert.equal(source.includes('fitSelection = () => controller.actions.setZoom(125)'), false, 'fixed Fit Selection remains');
const report = { issue: 56, results, sourceGuards: { geometryBasedFit: true, noFixedFitValues: true, pass: true }, pass: results.every(result => result.pass) };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #56 acceptance passed: geometry-based Fit All/Fit Selection at 1280x720 and 1672x941.');
