import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue99');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const fixture = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const clock = c.selectors.getReferenceClock();
  const count = Number(c.model.document.timeline.cycleCount);
  const start = Math.max(0, count - 5);
  const end = Math.max(start + 1, count - 1);
  const startBoundary = c.getCycleBoundary({ signal: clock.id, cycle: start, coordinateSpace: 'canvas' });
  const endBoundary = c.getCycleBoundary({ signal: clock.id, cycle: end, coordinateSpace: 'canvas' });
  if (!(startBoundary?.source === 'wavedrom-svg' && endBoundary?.source === 'wavedrom-svg')) throw new Error('missing WaveDrom geometry');
  return { start, end, selectedSignal: c.model.document.signals.find(signal => signal.type !== 'commentRow')?.id };
});
await page.locator(`#cycleCanvas .ruler .tick[data-cycle="${fixture.start}"]`).click();
await page.locator(`#cycleCanvas .ruler .tick[data-cycle="${fixture.end}"]`).click({ modifiers: ['Shift'] });

const result = await page.evaluate(async ({ start, end, selectedSignal }) => {
  const c = window.TimingChartProductionController;
  const clock = c.selectors.getReferenceClock();

  // The range above was established by real Playwright clicks on the production ruler.
  const range = structuredClone(c.model.timeSelection);
  if (range.rangeStart !== start || range.rangeEnd !== end || range.range !== undefined) throw new Error(`non-canonical time selection: ${JSON.stringify(range)}`);

  // Keep an ordinary signal selected: an explicit time range must win for Fit Selection.
  c.model.selection = { kind: 'signal', id: selectedSignal };
  const before = { document: JSON.stringify(c.getSerializableDocument()), undo: c.model.history.undo.length, waveRenders: c.metrics?.waveRenders ?? c.waveRenderCount ?? 0 };
  const fitted = c.actions.fitSelection();
  await new Promise(resolve => setTimeout(resolve, 160));
  const afterRange = structuredClone(c.model.timeSelection);
  const after = { document: JSON.stringify(c.getSerializableDocument()), undo: c.model.history.undo.length, waveRenders: c.metrics?.waveRenders ?? c.waveRenderCount ?? 0, zoom: c.model.view.zoom };
  const selectedStart = c.getCycleBoundary({ signal: clock.id, cycle: start, coordinateSpace: 'canvas' });
  const selectedEnd = c.getCycleBoundary({ signal: clock.id, cycle: end, coordinateSpace: 'canvas' });
  const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
  const viewport = scrollHost.getBoundingClientRect();
  const startInViewport = selectedStart.canvasX - scrollHost.scrollLeft;
  const endInViewport = selectedEnd.canvasX - scrollHost.scrollLeft;
  const visible = endInViewport - startInViewport <= scrollHost.clientWidth + 24 && scrollHost.scrollLeft >= 0 && scrollHost.scrollLeft <= scrollHost.scrollWidth - scrollHost.clientWidth + 1;

  // A single cycle remains deterministic when no range exists.
  c.model.selection = { kind: 'time', id: null };
  c.model.timeSelection.rangeStart = null;
  c.model.timeSelection.rangeEnd = null;
  c.model.timeSelection.cycle = 3;
  const single = c.actions.fitSelection();
  return { fitted, range, afterRange, before, after, visible, single, errors: [], geometry: { start: selectedStart.canvasX, end: selectedEnd.canvasX, startInViewport, endInViewport, viewportLeft: viewport.left, viewportRight: viewport.right } };
}, fixture);

assert.equal(result.fitted, true, 'Fit Selection did not run');
assert.equal(result.range.range, undefined, 'legacy nested time range representation is present');
assert.equal(result.afterRange.rangeStart, result.range.rangeStart, 'Fit Selection changed rangeStart');
assert.equal(result.afterRange.rangeEnd, result.range.rangeEnd, 'Fit Selection changed rangeEnd');
assert.equal(result.after.document, result.before.document, 'document changed during Fit Selection');
assert.equal(result.after.undo, result.before.undo, 'history changed during Fit Selection');
assert.equal(result.after.waveRenders, result.before.waveRenders, 'Fit Selection regenerated WaveDrom');
assert.equal(result.visible, true, `selected range is not visible: ${JSON.stringify(result.geometry)}`);
assert.equal(result.single, true, 'single-cycle Fit Selection failed');
assert.equal(errors.length, 0, errors.join('\n'));
const source = await fs.readFile(path.join(root, 'gui-mockup', 'zoom-fix.js'), 'utf8');
assert.equal(source.includes('time?.range?.start'), false, 'legacy nested time range lookup remains');
assert.equal(source.includes('time.rangeStart'), true, 'canonical rangeStart lookup is missing');
const report = { issue: 99, result, sourceGuards: { canonicalRangeOnly: true, realRulerAction: true, pass: true }, pass: true };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue99-1672x941.png') });
await browser.close();
console.log('Issue #99 acceptance passed: Fit Selection uses the canonical rangeStart/rangeEnd created by the ruler action.');
