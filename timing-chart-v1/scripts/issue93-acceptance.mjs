import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue93');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const opened = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const doc = structuredClone(c.getSerializableDocument());
  const base = doc.signals.find(signal => signal.type === 'binary');
  const group = doc.signalGroups[0];
  for (let index = 0; index < 50; index += 1) {
    const signal = structuredClone(base);
    signal.id = `large_signal_${index}`;
    signal.name = signal.id;
    signal.display = { name: signal.id };
    signal.values = [{ start: 0, value: 0 }, { start: 31, value: 1 }, { start: 91, value: 0 }];
    doc.signals.push(signal);
    group.rows.push(signal.id);
  }
  const comment = doc.signals.find(signal => signal.type === 'commentRow');
  for (let index = 0; index < 5; index += 1) {
    const row = structuredClone(comment);
    row.id = `large_comment_${index}`;
    row.title = `Comment ${index}`;
    row.body = `Comment body ${index}`;
    row.groupId = group.id;
    doc.signals.push(row);
    group.rows.push(row.id);
  }
  doc.timeline.cycleCount = 120;
  doc.timeline.end = 120;
  const clock = doc.signals.find(signal => signal.type === 'clock');
  clock.edgeCounter = { ...(clock.edgeCounter || {}), show: true, mode: 'rising', labelEvery: 10 };
  for (const annotation of doc.annotations || []) annotation.visible = true;
  return c.actions.openText(JSON.stringify(doc), { fileName: 'issue93-large.tcd', unsavedDecision: 'discard' });
});
assert.equal(opened, true, 'large fixture did not open');
await page.waitForTimeout(700);

const baseline = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  for (const key of Object.keys(c.timeAxisMetrics)) c.timeAxisMetrics[key] = 0;
  const host = window.TimingChartTimingViewport.getScrollHost();
  return {
    ruler: document.querySelector('#cycleCanvas .ruler')?.innerHTML,
    tick: (() => { const node = document.querySelector('#cycleCanvas .ruler .tick[data-cycle="20"]'); window.__issue93Refs = { tick: node, edge: document.querySelector('[data-edge-counter]'), annotation: document.querySelector('[data-annotation-id]') }; return node?.outerHTML; })(),
    edge: document.querySelector('[data-edge-counter]')?.outerHTML,
    annotation: document.querySelector('[data-annotation-id]')?.outerHTML,
    history: c.model.history.undo.length,
    document: JSON.stringify(c.getSerializableDocument()),
    host: { width: host.clientWidth, scrollWidth: host.scrollWidth }
  };
});
assert.ok(baseline.host.scrollWidth > baseline.host.width, `large fixture is not horizontally scrollable: ${JSON.stringify(baseline.host)}`);

const pane = page.locator('.timing-scroll-pane');
await pane.hover();
for (let index = 0; index < 8; index += 1) await page.mouse.wheel(900, 0);
await page.waitForTimeout(120);
const scrolled = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const host = window.TimingChartTimingViewport.getScrollHost();
  return {
    metrics: { ...c.timeAxisMetrics },
    ruler: document.querySelector('#cycleCanvas .ruler')?.innerHTML,
    tick: document.querySelector('#cycleCanvas .ruler .tick[data-cycle="20"]')?.outerHTML,
    edge: document.querySelector('[data-edge-counter]')?.outerHTML,
    annotation: document.querySelector('[data-annotation-id]')?.outerHTML,
    sameNodes: { tick: document.querySelector('#cycleCanvas .ruler .tick[data-cycle="20"]') === window.__issue93Refs.tick, edge: document.querySelector('[data-edge-counter]') === window.__issue93Refs.edge, annotation: document.querySelector('[data-annotation-id]') === window.__issue93Refs.annotation },
    scrollLeft: host.scrollLeft,
    host: { width: host.clientWidth, scrollWidth: host.scrollWidth }
  };
});
assert.ok(scrolled.scrollLeft > 0, 'real browser wheel did not horizontally scroll the timing pane');
assert.equal(scrolled.metrics.waveDromRenders, 0, 'scroll regenerated WaveDrom');
assert.equal(scrolled.metrics.rulerRebuilds, 0, 'scroll rebuilt the Ruler');
assert.equal(scrolled.metrics.edgeCounterRebuilds, 0, 'scroll rebuilt Edge Counters');
assert.equal(scrolled.metrics.annotationFullRenders, 0, 'scroll rebuilt Annotation geometry');
assert.ok(scrolled.metrics.scrollEvents > 0, 'scroll fast path was not observed');
assert.equal(scrolled.ruler, baseline.ruler, 'scroll changed Ruler DOM');
assert.equal(scrolled.tick, baseline.tick, 'scroll changed Ruler tick markup');
assert.equal(scrolled.edge, baseline.edge, 'scroll changed Edge Counter markup');
assert.equal(scrolled.annotation, baseline.annotation, 'scroll changed Annotation markup');
assert.deepEqual(scrolled.sameNodes, { tick: true, edge: true, annotation: true }, 'scroll replaced transient nodes');

const beforeResize = await page.evaluate(() => ({ metrics: { ...window.TimingChartProductionController.timeAxisMetrics }, document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), history: window.TimingChartProductionController.model.history.undo.length }));
await page.evaluate(() => { const c = window.TimingChartProductionController; for (let index = 0; index < 100; index += 1) c.scheduleTransientLayout(c.model); });
await page.waitForTimeout(160);
const afterResize = await page.evaluate(() => ({ metrics: { ...window.TimingChartProductionController.timeAxisMetrics }, document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), history: window.TimingChartProductionController.model.history.undo.length }));
assert.ok(afterResize.metrics.transientFrames - beforeResize.metrics.transientFrames < 25, `label drag was not RAF-coalesced: ${JSON.stringify({ beforeResize, afterResize })}`);
assert.equal(afterResize.document, beforeResize.document, 'resize mutated canonical document');
assert.equal(afterResize.history, beforeResize.history, 'resize preview created a semantic history entry');
assert.equal(errors.length, 0, errors.join('\n'));

const report = { issue: 93, fixture: { signals: 51, comments: 5, cycles: 120, edgeCounter: true, annotations: 'visible' }, baseline: { host: baseline.host }, scroll: scrolled, resize: { before: beforeResize, after: afterResize }, errors, pass: true };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue93-1672x941.png') });
await browser.close();
console.log('Issue #93 acceptance passed: large-document scroll avoided WaveDrom/Ruler/Edge Counter/Annotation rebuilds and resize was RAF-coalesced.');
