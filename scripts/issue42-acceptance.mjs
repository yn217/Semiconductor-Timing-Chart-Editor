import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue42');
await fs.mkdir(out, { recursive: true });
const viewports = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }];
const results = [];

for (const viewport of viewports) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
  await page.waitForTimeout(350);
  const evaluate = () => page.evaluate(() => {
    const controller = window.TimingChartProductionController;
    const reference = controller.selectors.getReferenceClock();
    const row = document.querySelector('#cycleCanvas .wave-row:has(.trace)');
    const rect = row?.getBoundingClientRect();
    const boundary = cycle => controller.getCycleBoundary({ signal: reference.id, cycle, coordinateSpace: 'canvas' });
    return { row: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, boundary3: boundary(3), boundary7: boundary(7), boundaryEnd: boundary(controller.model.document.timeline.cycleCount), beforeDocument: JSON.stringify(controller.getSerializableDocument()), beforeHistory: controller.model.history.undo.length, beforeRedo: controller.model.history.redo.length };
  });
  const initial = await evaluate();
  assert(initial.row && initial.boundary3 && initial.boundaryEnd, `WaveDrom geometry unavailable at ${viewport.width}x${viewport.height}`);
  await page.mouse.click(initial.boundary3.canvasX, initial.row.y + initial.row.height / 2);
  await page.waitForTimeout(40);
  const selected3 = await page.evaluate(() => {
    const controller = window.TimingChartProductionController;
    const boundary = controller.getCycleBoundary({ signal: controller.selectors.getReferenceClock().id, cycle: 3, coordinateSpace: 'canvas' });
    const playhead = document.querySelector('#cycleCanvas .playhead').getBoundingClientRect();
    return { selection: structuredClone(controller.model.timeSelection), cycle: document.querySelector('#cycleCanvas').dataset.currentCycle, tick: document.querySelector('#cycleCanvas .ruler .tick[data-cycle="3"]')?.dataset.selected, playheadX: playhead.left, boundaryX: boundary.canvasX, document: JSON.stringify(controller.getSerializableDocument()), history: controller.model.history.undo.length, redo: controller.model.history.redo.length };
  });
  assert.equal(selected3.selection.cycle, 3);
  assert.equal(selected3.selection.source, 'waveform-geometry');
  assert.equal(selected3.cycle, '3');
  assert.equal(selected3.tick, 'true');
  assert(Math.abs(selected3.playheadX - selected3.boundaryX) <= 1, `Playhead misaligned at ${viewport.width}x${viewport.height}`);
  assert.equal(selected3.document, initial.beforeDocument);
  assert.equal(selected3.history, initial.beforeHistory);
  assert.equal(selected3.redo, initial.beforeRedo);

  const labels = await page.locator('#cycleCanvas .signal-label').all();
  await labels[0].click();
  const afterLabel = await page.evaluate(() => window.TimingChartProductionController.model.timeSelection.cycle);
  assert.equal(afterLabel, 3, 'Frozen signal label click must not select time');

  await page.evaluate(() => { const host = window.TimingChartTimingViewport.getScrollHost(); host.scrollLeft = Math.max(0, host.scrollWidth / 3); });
  await page.waitForTimeout(50);
  const scrolled = await evaluate();
  await page.mouse.click(scrolled.boundary7.canvasX, scrolled.row.y + scrolled.row.height / 2);
  await page.waitForTimeout(40);
  const selected7 = await page.evaluate(() => window.TimingChartProductionController.model.timeSelection);
  assert.equal(selected7.cycle, 7, `Scrolled geometry selected Cycle ${selected7.cycle}`);

  await page.evaluate(() => { const host = window.TimingChartTimingViewport.getScrollHost(); host.scrollLeft = 0; });
  await page.waitForTimeout(50);
  for (const zoom of [0.5, 1, 1.5, 2]) {
    await page.evaluate(value => window.TimingChartProductionController.actions.setZoom(value), zoom);
    await page.waitForTimeout(50);
    const geometry = await evaluate();
    await page.mouse.click(geometry.boundary3.canvasX, geometry.row.y + geometry.row.height / 2);
    await page.waitForTimeout(30);
    const selected = await page.evaluate(() => window.TimingChartProductionController.model.timeSelection.cycle);
    assert.equal(selected, 3, `Zoom ${zoom} selected the wrong cycle`);
  }

  await page.evaluate(() => { const host = window.TimingChartTimingViewport.getScrollHost(); host.scrollLeft = 0; });
  await page.waitForTimeout(50);
  const beforeAppend = await evaluate();
  await page.evaluate(() => { const host = window.TimingChartTimingViewport.getScrollHost(); host.scrollLeft = host.scrollWidth; });
  await page.waitForTimeout(50);
  const endGeometry = await evaluate();
  await page.mouse.click(endGeometry.boundaryEnd.canvasX, endGeometry.row.y + endGeometry.row.height / 2);
  await page.waitForTimeout(30);
  const selectedEnd = await page.evaluate(() => window.TimingChartProductionController.model.timeSelection.cycle);
  assert.equal(selectedEnd, await page.evaluate(() => window.TimingChartProductionController.model.document.timeline.cycleCount));

  await page.evaluate(() => { const host = window.TimingChartTimingViewport.getScrollHost(); host.scrollLeft = 0; });
  await page.waitForTimeout(50);
  await page.mouse.click((await evaluate()).boundary3.canvasX, (await evaluate()).row.y + (await evaluate()).row.height / 2);
  await page.waitForTimeout(30);
  const beforeInsert = await page.evaluate(() => ({ document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), cycleCount: window.TimingChartProductionController.model.document.timeline.cycleCount, history: window.TimingChartProductionController.model.history.undo.length, value: window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid')?.values.find(value => value.start === 3)?.value }));
  await page.locator('.tool').filter({ hasText: 'Cycle' }).filter({ hasText: '挿入' }).first().click();
  await page.waitForTimeout(50);
  const afterInsert = await page.evaluate(() => ({ cycle: window.TimingChartProductionController.model.timeSelection.cycle, cycleCount: window.TimingChartProductionController.model.document.timeline.cycleCount, history: window.TimingChartProductionController.model.history.undo.length, shifted: window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid')?.values.some(value => value.start === 4 && value.value === 1) }));
  assert.equal(afterInsert.cycle, 3);
  assert.equal(afterInsert.cycleCount, beforeInsert.cycleCount + 1);
  assert.equal(afterInsert.history, beforeInsert.history + 1);
  assert.equal(afterInsert.shifted, true);
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.undo()), true);
  assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), beforeInsert.document);

  const nCycleGeometry = await evaluate();
  await page.mouse.click(nCycleGeometry.boundary3.canvasX, nCycleGeometry.row.y + nCycleGeometry.row.height / 2);
  await page.waitForTimeout(30);
  await page.evaluate(() => { window.prompt = () => '2'; });
  await page.locator('.tool').filter({ hasText: 'N Cycle' }).filter({ hasText: '挿入' }).first().click();
  await page.waitForTimeout(50);
  const afterN = await page.evaluate(() => ({ cycle: window.TimingChartProductionController.model.timeSelection.cycle, cycleCount: window.TimingChartProductionController.model.document.timeline.cycleCount, history: window.TimingChartProductionController.model.history.undo.length, shifted: window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid')?.values.some(value => value.start === 5 && value.value === 1) }));
  assert.equal(afterN.cycle, 3);
  assert.equal(afterN.cycleCount, beforeInsert.cycleCount + 2);
  assert.equal(afterN.history, beforeInsert.history + 1);
  assert.equal(afterN.shifted, true);
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.undo()), true);
  assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), beforeInsert.document);

  results.push({ viewport, checks: { waveformClick: true, scroll: true, zooms: [0.5, 1, 1.5, 2], finalBoundary: true, frozenLabels: true, cycleInsert: true, nCycleInsert: true, transientOnly: selected3.document === initial.beforeDocument && selected3.history === initial.beforeHistory, errors }, pass: errors.length === 0 });
  await page.screenshot({ path: path.join(out, `issue42-${viewport.width}x${viewport.height}.png`) });
  await browser.close();
}

const report = { issue: 42, results, pass: results.every(result => result.pass) };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #42 acceptance passed: waveform geometry clicks, scroll/zoom, frozen labels, final boundary, and exact Cycle/N Cycle insertion.');
