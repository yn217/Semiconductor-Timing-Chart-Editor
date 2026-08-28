import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifacts', 'issue146');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.model?.waveGeometry));
await page.evaluate(() => window.TimingChartProductionController.waveformIdle);

const snapshot = label => page.evaluate(label => {
  const c = window.TimingChartProductionController;
  const ruler = document.querySelector('#cycleCanvas .wave > .ruler');
  const rows = [...document.querySelectorAll('#cycleCanvas .wave > .wave-row')].filter(row => !row.hidden && getComputedStyle(row).display !== 'none');
  const rulerRect = ruler.getBoundingClientRect();
  const rowRects = rows.map(row => ({ id: row.dataset.signalId || row.dataset.signal, top: row.getBoundingClientRect().top, bottom: row.getBoundingClientRect().bottom }));
  const reference = c.selectors.getReferenceClock();
  const tickErrors = [...ruler.querySelectorAll('.tick[data-cycle]')].map(tick => {
    const boundary = c.getCycleBoundary({ signal: reference.id, cycle: Number(tick.dataset.cycle), coordinateSpace: 'canvas' });
    const tickRect = tick.getBoundingClientRect();
    const visualX = tickRect.left + tickRect.width / 2;
    const error = Math.abs(visualX - boundary.canvasX);
    return { cycle: Number(tick.dataset.cycle), error, visualX, styleX: rulerRect.left + Number.parseFloat(tick.style.left || 0), boundaryX: boundary.canvasX, rulerLeft: rulerRect.left };
  });
  const canonical = c.model.document.signalGroups.flatMap(group => group.rows || []);
  const timing = [...document.querySelectorAll('#cycleCanvas .wave > .wave-row')].map(row => row.dataset.signalId || row.dataset.signal);
  return {
    label,
    ruler: { top: rulerRect.top, bottom: rulerRect.bottom, visible: getComputedStyle(ruler).visibility !== 'hidden', firstElement: ruler === ruler.parentElement.firstElementChild },
    firstRowTop: Math.min(...rowRects.map(row => row.top)),
    lastRowBottom: Math.max(...rowRects.map(row => row.bottom)),
    rulerAboveRows: rulerRect.bottom <= Math.min(...rowRects.map(row => row.top)) + 0.1,
    maxTickErrorPx: Math.max(0, ...tickErrors.map(item => item.error)),
    worstTicks: tickErrors.filter(item => item.error > 0.1).sort((a,b) => b.error-a.error).slice(0, 5),
    orderExact: JSON.stringify(canonical) === JSON.stringify(timing),
    metrics: { waveDrom: c.renderMetrics.waveDromRenders, geometry: c.renderMetrics.geometryBuilds, ruler: c.renderMetrics.rulerRebuilds, full: c.renderMetrics.appFullRenders }
  };
}, label);
const assertSnapshot = value => {
  assert.equal(value.ruler.firstElement, true, `${value.label}: ruler is not the first timing child`);
  assert.equal(value.rulerAboveRows, true, `${value.label}: ruler is below a row`);
  assert.equal(value.orderExact, true, `${value.label}: timing order differs from canonical`);
  assert.ok(value.maxTickErrorPx <= 0.1, `${value.label}: tick error ${value.maxTickErrorPx}px ${JSON.stringify(value.worstTicks)}`);
};
const states = [];
let state = await snapshot('startup'); assertSnapshot(state); states.push(state);
const initialRulerTop = state.ruler.top;

const group = page.locator('#groups > .group').filter({ has: page.locator(':scope > .row[data-signal]') }).first();
const target = group.locator(':scope > .row[data-signal]').nth(1);
await target.click();
const up = page.locator('#ribbonHome .tool').filter({ hasText: '上へ' }).first();
const down = page.locator('#ribbonHome .tool').filter({ hasText: '下へ' }).first();
for (let index = 0; index < 10; index += 1) {
  for (const [name, button] of [['up', up], ['down', down]]) {
    const before = await snapshot(`${name}-${index + 1}-before`);
    await button.click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await snapshot(`${name}-${index + 1}`); assertSnapshot(after); states.push(after);
    assert.equal(after.metrics.waveDrom, before.metrics.waveDrom, `${after.label}: WaveDrom regenerated`);
    assert.equal(after.metrics.geometry, before.metrics.geometry, `${after.label}: Geometry rebuilt`);
    assert.equal(after.metrics.ruler, before.metrics.ruler, `${after.label}: Ruler rebuilt`);
    assert.ok(Math.abs(after.ruler.top - initialRulerTop) <= 0.1, `${after.label}: ruler Y moved`);
  }
}

const ahb = await fs.readFile(path.join(root, 'samples', 'golden-protocol', 'timing_chart_sample_pack', 'samples', '02_ahb_lite_pipelined_transfer.tcd.json'), 'utf8');
assert.equal(await page.evaluate(text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue146-ahb.tcd', unsavedDecision: 'discard' }), ahb), true);
await page.evaluate(async () => { const c = window.TimingChartProductionController; await c.openIdle; await c.waveformIdle; });
state = await snapshot('ahb-open'); assertSnapshot(state); states.push(state);

const combinations = [];
for (const grid of [false, true]) for (const ruler of [false, true]) {
  await page.evaluate(({ grid, ruler }) => { const a = window.TimingChartProductionController.actions; a.setGuide('grid', grid); a.setGuide('ruler', ruler); }, { grid, ruler });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const current = await snapshot(`grid-${grid}-ruler-${ruler}`); assertSnapshot(current); combinations.push({ grid, ruler, state: current });
  assert.equal(current.ruler.visible, ruler);
}

const zoomAndScroll = [];
for (const zoom of [50, 100, 150, 200]) {
  await page.evaluate(zoom => window.TimingChartProductionController.actions.setZoom(zoom), zoom);
  await page.evaluate(async () => { const c = window.TimingChartProductionController; await c.waveformIdle; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const current = await snapshot(`zoom-${zoom}`); assertSnapshot(current); zoomAndScroll.push(current);
}
await page.locator('.timing-scroll-pane').evaluate(host => { host.scrollLeft = Math.min(500, host.scrollWidth - host.clientWidth); host.dispatchEvent(new Event('scroll')); });
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
state = await snapshot('horizontal-scroll'); assertSnapshot(state); zoomAndScroll.push(state);

const large = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const value = structuredClone(c.getSerializableDocument());
  const clock = structuredClone(value.signals.find(signal => signal.type === 'clock'));
  clock.id = 'issue146_clk'; clock.name = clock.display.name = clock.id;
  const rows = Array.from({ length: 99 }, (_, index) => ({
    id: `issue146_signal_${index}`, name: `issue146_signal_${index}`, type: index % 7 === 0 ? 'bus' : 'binary',
    role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output', ...(index % 7 === 0 ? { width: 8 } : {}),
    source: { instancePath: [], signalName: `issue146_signal_${index}` }, display: { name: `issue146_signal_${index}` },
    values: [{ start: 0, value: index % 7 === 0 ? '00' : 0 }, { start: 250, value: index % 7 === 0 ? 'A5' : 1 }]
  }));
  value.document.id = 'issue146-100x500.tcd'; value.timeline.cycleCount = 500; value.timeline.end = 500; value.timeline.referenceClock = clock.id;
  value.signals = [clock, ...rows]; value.signalGroups = [{ id: 'issue146_group', name: 'Issue 146', rows: value.signals.map(signal => signal.id) }]; value.annotations = []; value.transactions = [];
  return JSON.stringify(value);
});
assert.equal(await page.evaluate(text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue146-100x500.tcd', unsavedDecision: 'discard' }), large), true);
await page.evaluate(async () => { const c = window.TimingChartProductionController; await c.openIdle; await c.waveformIdle; });
state = await snapshot('100-signals-500-cycles'); assertSnapshot(state); states.push(state);
await page.locator('#groups > .group > .row[data-signal]').nth(2).click();
const beforeLarge = await snapshot('large-before-reorder');
const started = Date.now(); await up.click();
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const largeLatencyMs = Date.now() - started;
const afterLarge = await snapshot('large-after-reorder'); assertSnapshot(afterLarge); states.push(afterLarge);
assert.equal(afterLarge.metrics.waveDrom, beforeLarge.metrics.waveDrom);
assert.equal(afterLarge.metrics.geometry, beforeLarge.metrics.geometry);
assert.equal(afterLarge.metrics.ruler, beforeLarge.metrics.ruler);
assert.deepEqual(pageErrors, []);

const acceptance = { issue: 146, states, combinations, zoomAndScroll, largeLatencyMs, maxTickErrorPx: Math.max(...states.map(item => item.maxTickErrorPx), ...zoomAndScroll.map(item => item.maxTickErrorPx)), pageErrors, pass: true };
await page.screenshot({ path: path.join(out, 'production-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
await browser.close();
console.log(`Issue #146 acceptance passed: ruler remains first/top, max tick error ${acceptance.maxTickErrorPx}px, large reorder ${largeLatencyMs}ms.`);
