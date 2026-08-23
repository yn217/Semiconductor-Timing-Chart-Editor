import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifacts', 'issue147');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.model?.waveGeometry));
await page.evaluate(() => window.TimingChartProductionController.waveformIdle);

const snap = page.locator('#ribbonHome .toggles label').filter({ hasText: 'スナップ' }).locator('input');
const snapshot = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const host = window.TimingChartTimingViewport.getScrollHost();
  const wave = document.querySelector('#cycleCanvas .wave');
  const surface = document.querySelector('#cycleCanvas .waveform-render-surface');
  const grid = document.querySelector('#cycleCanvas [data-live-grid]');
  const hostRect = host.getBoundingClientRect();
  const childExtents = [...host.children].map(node => {
    const rect = node.getBoundingClientRect();
    return { tag: node.tagName, className: node.className, liveGrid: node.dataset.liveGrid || null, right: rect.right - hostRect.left + host.scrollLeft, width: rect.width, styleWidth: node.style.width || null, minWidth: node.style.minWidth || null };
  }).sort((a, b) => b.right - a.right);
  return {
    snap: c.model.view.guides.snap,
    homeChecked: document.querySelector('#ribbonHome .toggles label input[data-view-guide="snap"]')?.checked,
    viewState: document.querySelector('#ribbonView [data-view-command="snap"]')?.dataset.state,
    clientWidth: host.clientWidth,
    scrollWidth: host.scrollWidth,
    scrollLeft: host.scrollLeft,
    ratio: host.scrollWidth / host.clientWidth,
    waveScrollWidth: wave.scrollWidth,
    surfaceWidth: surface?.getBoundingClientRect().width || 0,
    gridWidth: grid?.getBoundingClientRect().width || 0,
    liveGridCount: document.querySelectorAll('#cycleCanvas [data-live-grid]').length,
    liveGridChildren: grid?.childElementCount || 0,
    surfaceCount: document.querySelectorAll('#cycleCanvas .waveform-render-surface').length,
    laneCount: document.querySelectorAll('#cycleCanvas .waveform-surface-row').length,
    minimapCount: document.querySelectorAll('.inspector [data-live-minimap]').length,
    timingDomCount: host.querySelectorAll('*').length,
    canonical: JSON.stringify(c.getSerializableDocument()),
    dirty: c.model.persistence.dirty,
    undo: c.model.history.undo.length,
    redo: c.model.history.redo.length,
    metrics: {
      waveDromRenders: c.renderMetrics.waveDromRenders,
      geometryBuilds: c.renderMetrics.geometryBuilds,
      gridRebuilds: c.renderMetrics.gridRebuilds,
      minimapOverviewRebuilds: c.renderMetrics.minimapOverviewRebuilds,
      appFullRenders: c.renderMetrics.appFullRenders
    },
    definingChild: childExtents[0] || null
  };
});

const invariantKeys = ['clientWidth', 'scrollWidth', 'waveScrollWidth', 'surfaceWidth', 'gridWidth', 'liveGridCount', 'liveGridChildren', 'surfaceCount', 'laneCount', 'minimapCount', 'timingDomCount', 'canonical', 'dirty', 'undo', 'redo'];
const metricKeys = ['waveDromRenders', 'geometryBuilds', 'gridRebuilds', 'minimapOverviewRebuilds', 'appFullRenders'];
const compact = ({ canonical, ...value }) => ({ ...value, canonicalBytes: canonical.length });
const runToggles = async (name, transitions = 100) => {
  const before = await snapshot();
  const checkpoints = [{ iteration: 0, ...compact(before) }];
  let state = before.snap;
  for (let iteration = 1; iteration <= transitions; iteration += 1) {
    state = !state;
    await snap.setChecked(state);
    const current = await snapshot();
    assert.equal(current.snap, state, `${name} model state ${iteration}`);
    assert.equal(current.homeChecked, state, `${name} Home state ${iteration}`);
    assert.equal(current.viewState, state ? 'on' : 'off', `${name} View state ${iteration}`);
    for (const key of invariantKeys) assert.deepEqual(current[key], before[key], `${name} ${key} drifted at ${iteration}`);
    for (const key of metricKeys) assert.equal(current.metrics[key], before.metrics[key], `${name} ${key} changed at ${iteration}`);
    if ([1, 10, 50, 100].includes(iteration)) checkpoints.push({ iteration, ...compact(current) });
  }
  return { name, transitions, before: compact(before), after: compact(await snapshot()), checkpoints };
};

const reports = [await runToggles('startup')];
const functional = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const boundaries = c.model.waveGeometry.cycleBoundary;
  const x = (boundaries[2].canvasX + boundaries[3].canvasX) / 2;
  c.actions.setGuide('snap', true); const on = c.actions.resolveSnapAtCanvasX(x);
  c.actions.setGuide('snap', false); const off = c.actions.resolveSnapAtCanvasX(x);
  c.actions.setGuide('snap', true);
  return { on, off };
});
assert.equal(functional.on.snapped, true);
assert.equal(functional.off.snapped, false);
assert.ok(functional.off.phase > 0 && functional.off.phase < 1);

const ahb = await fs.readFile(path.join(root, 'samples', 'golden-protocol', 'timing_chart_sample_pack', 'samples', '02_ahb_lite_pipelined_transfer.tcd.json'), 'utf8');
assert.equal(await page.evaluate(text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue147-ahb.tcd', unsavedDecision: 'discard' }), ahb), true);
await page.evaluate(async () => { const c = window.TimingChartProductionController; await c.openIdle; await c.waveformIdle; });
reports.push(await runToggles('ahb-open'));

const large = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const base = structuredClone(c.getSerializableDocument());
  const clock = structuredClone(base.signals.find(signal => signal.type === 'clock'));
  clock.id = 'issue147_clk'; clock.name = clock.display.name = 'issue147_clk';
  const signals = [clock, ...Array.from({ length: 99 }, (_, index) => {
    const isBus = index % 7 === 0;
    return {
      id: `issue147_signal_${index}`, name: `issue147_signal_${index}`,
      type: isBus ? 'bus' : 'binary', role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
      ...(isBus ? { width: 8 } : {}),
      source: { instancePath: [], signalName: `issue147_signal_${index}` },
      display: { name: `issue147_signal_${index}` },
      values: [{ start: 0, value: isBus ? '00' : 0 }, { start: 250, value: isBus ? 'A5' : 1 }]
    };
  })];
  base.document.id = 'issue147-100x500.tcd';
  base.timeline.cycleCount = 500; base.timeline.end = 500; base.timeline.referenceClock = clock.id;
  base.signals = signals;
  base.signalGroups = [{ id: 'issue147_group', name: 'Issue 147', rows: signals.map(signal => signal.id), style: { background: '#f6faff' } }];
  base.annotations = [];
  base.transactions = [];
  return JSON.stringify(base);
});
assert.equal(await page.evaluate(text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue147-100x500.tcd', unsavedDecision: 'discard' }), large), true);
await page.evaluate(async () => { const c = window.TimingChartProductionController; await c.openIdle; await c.waveformIdle; });
reports.push(await runToggles('100-signals-500-cycles'));

const combinations = [];
for (const grid of [false, true]) for (const ruler of [false, true]) for (const minimap of [false, true]) {
  await page.evaluate(({ grid, ruler, minimap }) => {
    const actions = window.TimingChartProductionController.actions;
    actions.setGuide('grid', grid); actions.setGuide('ruler', ruler); actions.setGuide('minimap', minimap);
  }, { grid, ruler, minimap });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  combinations.push({ grid, ruler, minimap, report: await runToggles(`combination-${Number(grid)}${Number(ruler)}${Number(minimap)}`, 10) });
}

assert.deepEqual(errors, []);
const acceptance = {
  issue: 147,
  rootCause: 'Snap used the shared apply() path, which rebuilt Grid/MiniMap. MiniMap then derived wave minWidth from its own current extent plus padding, creating positive width feedback.',
  observedBeforeFix: { viewport: '1672x941', baselineScrollWidth: 1664, firstSnapTransitionScrollWidth: 1688, driftPx: 24 },
  reports,
  combinations,
  functional,
  pageErrors: errors,
  pass: true
};
await page.screenshot({ path: path.join(out, 'production-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
await browser.close();
console.log('Issue #147 acceptance passed: 300 primary + 80 combination Snap transitions, 0px extent drift, 0 unrelated render-domain deltas.');
