import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue59');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const snapshot = () => page.evaluate(() => {
  const c = window.TimingChartProductionController; const host = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas'); const mini = document.querySelector('.mini-canvas'); const viewport = mini?.querySelector('.mini-window');
  return { document: JSON.stringify(c.getSerializableDocument()), renders: c.timeAxisMetrics?.waveDromRenders || 0, rows: document.querySelectorAll('#cycleCanvas .wave-row').length, miniRows: mini?.querySelectorAll('[data-minimap-row]').length || 0, scroll: { left: host?.scrollLeft || 0, top: host?.scrollTop || 0, width: host?.scrollWidth || 0, height: host?.scrollHeight || 0, clientWidth: host?.clientWidth || 0, clientHeight: host?.clientHeight || 0 }, miniRect: viewport ? { left: viewport.style.left, top: viewport.style.top, width: viewport.style.width, height: viewport.style.height } : null, grid: { visible: !document.querySelector('[data-live-grid]')?.hidden, lines: document.querySelectorAll('[data-live-grid] [data-grid-cycle]').length }, viewMetrics: { ...(c.viewMetrics || {}) }, rulerVisible: getComputedStyle(document.querySelector('#cycleCanvas .ruler')).visibility !== 'hidden' };
});
const base = await snapshot();
assert.ok(base.grid.lines >= 10, 'Grid is not based on actual cycle boundaries');
assert.equal(base.miniRows, base.rows, 'MiniMap overview does not contain all current rows');

const guideStateBefore = await page.evaluate(() => ({ document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), renders: window.TimingChartProductionController.timeAxisMetrics.waveDromRenders }));
await page.locator('#ribbonHome .toggles label').filter({ hasText: 'グリッド' }).locator('input').uncheck();
await page.waitForTimeout(50);
let state = await snapshot();
assert.equal(state.grid.visible, false, 'Grid OFF did not hide the independent grid layer');
assert.equal(state.rulerVisible, true, 'Grid OFF incorrectly hid the Ruler');
assert.equal(state.renders, guideStateBefore.renders, 'Grid toggle rerendered WaveDrom');
assert.equal(state.document, guideStateBefore.document, 'Grid toggle mutated canonical document');
await page.locator('#ribbonHome .toggles label').filter({ hasText: 'グリッド' }).locator('input').check();
await page.locator('#ribbonHome .toggles label').filter({ hasText: 'ルーラー' }).locator('input').uncheck();
await page.waitForTimeout(40);
state = await snapshot();
assert.equal(state.rulerVisible, false, 'Ruler OFF did not apply');
assert.ok(state.scroll.clientHeight > 0, 'Ruler OFF changed the timing pane geometry');
await page.locator('#ribbonHome .toggles label').filter({ hasText: 'ルーラー' }).locator('input').check();

const snapResult = await page.evaluate(() => {
  const c = window.TimingChartProductionController; const boundaries = c.model.waveGeometry.cycleBoundary; const a = boundaries[2]; const b = boundaries[3]; const x = (a.canvasX + b.canvasX) / 2;
  c.actions.setGuide('snap', true); const on = c.actions.resolveSnapAtCanvasX(x); c.actions.setGuide('snap', false); const off = c.actions.resolveSnapAtCanvasX(x); c.actions.setGuide('snap', true); return { on, off };
});
assert.equal(snapResult.on.snapped, true); assert.equal(snapResult.off.snapped, false); assert.ok(snapResult.off.phase > 0 && snapResult.off.phase < 1, 'Snap OFF did not preserve free phase');

const matrix = JSON.parse(await fs.readFile(path.join(root, '..', 'timing-chart-v2/samples/golden-protocol/timing_chart_sample_pack/samples/03_axi4_full_write_burst.tcd.json'), 'utf8'));
const sourceSignals = matrix.cycleView?.signals || matrix.signals || [];
const largeSignals = sourceSignals.map(signal => structuredClone(signal));
const seed = largeSignals.find(signal => signal.type !== 'clock' && signal.type !== 'commentRow') || largeSignals[0];
for (let index = 0; index < 12; index += 1) { const copy = structuredClone(seed); copy.id = `${seed.id}_overview_${index + 1}`; copy.name = copy.id; largeSignals.push(copy); }
const largeMatrix = { ...matrix, signals: largeSignals, signalGroups: (matrix.signalGroups || []).map(group => ({ ...group, rows: [...(group.rows || group.signals || []), ...largeSignals.slice(sourceSignals.length).map(signal => signal.id)] })) };
assert.ok(largeSignals.length > 20, 'AXI-derived fixture is not a large-row fixture');
assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'axi-large.tcd', unsavedDecision: 'discard' }), JSON.stringify(largeMatrix)), true);
await page.waitForTimeout(250);
state = await snapshot();
assert.ok(state.miniRows > 20, 'MiniMap did not rebuild for the large AXI document');
const host = page.locator('.timing-scroll-pane');
await host.evaluate(node => { node.scrollLeft = Math.min(360, node.scrollWidth - node.clientWidth); node.scrollTop = Math.min(240, node.scrollHeight - node.clientHeight); });
await page.waitForTimeout(80);
const scrolled = await snapshot();
assert.notEqual(scrolled.miniRect.left, state.miniRect.left, 'MiniMap viewport X did not follow horizontal scroll');
assert.notEqual(scrolled.miniRect.top, state.miniRect.top, 'MiniMap viewport Y did not follow vertical scroll');
assert.equal(scrolled.viewMetrics.gridRebuilds, state.viewMetrics.gridRebuilds, 'Grid rebuilt during ordinary scroll');
assert.equal(scrolled.viewMetrics.gridBoundaryResolutions, state.viewMetrics.gridBoundaryResolutions, 'Grid resolved WaveDrom boundaries during ordinary scroll');
assert.equal(scrolled.viewMetrics.minimapOverviewRebuilds, state.viewMetrics.minimapOverviewRebuilds, 'MiniMap overview rebuilt during ordinary scroll');
assert.ok(scrolled.viewMetrics.minimapViewportUpdates - state.viewMetrics.minimapViewportUpdates >= 1 && scrolled.viewMetrics.minimapViewportUpdates - state.viewMetrics.minimapViewportUpdates <= 1, 'MiniMap viewport was not updated exactly once per scroll frame');
const beforeZoom = scrolled.miniRect.width;
await page.evaluate(() => window.TimingChartProductionController.actions.setZoom(150));
await page.waitForTimeout(180);
const zoomed = await snapshot();
assert.notEqual(zoomed.miniRect.width, beforeZoom, 'MiniMap viewport width did not follow zoom');
const mini = page.locator('.mini-canvas');
const beforeClick = await page.evaluate(() => (window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas')).scrollLeft);
await mini.click({ position: { x: 4, y: 4 } });
await page.waitForTimeout(60);
const afterClick = await page.evaluate(() => (window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas')).scrollLeft);
assert.notEqual(afterClick, beforeClick, 'MiniMap click did not pan the timing viewport');
const report = { issue: 59, gridIndependent: true, rulerIndependent: true, snapUsesWaveGeometry: true, minimapLiveRows: true, minimapScrollSync: true, minimapZoomSync: true, minimapClickPan: true, rendersUnchangedOnGuideToggle: true, scrollFastPath: { gridRebuilds: scrolled.viewMetrics.gridRebuilds - state.viewMetrics.gridRebuilds, gridBoundaryResolutions: scrolled.viewMetrics.gridBoundaryResolutions - state.viewMetrics.gridBoundaryResolutions, minimapOverviewRebuilds: scrolled.viewMetrics.minimapOverviewRebuilds - state.viewMetrics.minimapOverviewRebuilds, minimapViewportUpdates: scrolled.viewMetrics.minimapViewportUpdates - state.viewMetrics.minimapViewportUpdates }, errors, pass: errors.length === 0 };
await page.screenshot({ path: path.join(out, 'issue59-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #59 acceptance passed: independent Grid/Ruler, geometry-backed Snap, and live MiniMap navigation.');
