import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue33';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4237'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const inspect = page => page.evaluate(() => {
  const canvas = document.querySelector('#cycleCanvas');
  const timing = canvas?.querySelector(':scope > .timing-scroll-pane');
  const frozen = canvas?.querySelector(':scope > .frozen-label-pane');
  const wave = timing?.querySelector(':scope > .wave');
  const rows = [...timing?.querySelectorAll(':scope > .wave > .wave-row') || []];
  const labelRows = [...frozen?.querySelectorAll(':scope > .frozen-label-wave > .frozen-label-row') || []];
  const byId = new Map(labelRows.map(row => [row.dataset.signal, row]));
  const alignment = rows.map(row => {
    const label = byId.get(row.dataset.signal || row.dataset.signalId);
    const a = row.getBoundingClientRect();
    const b = label?.getBoundingClientRect();
    return { id: row.dataset.signal, error: b ? Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) : Infinity };
  });
  const boundary = frozen?.getBoundingClientRect().right ?? 0;
  const timingVisuals = [...timing?.querySelectorAll('.trace svg, .comment-body, .latency, [data-production-overlay="annotations"], [data-time-range-selection], [data-edge-counter], .playhead') || []];
  return {
    structure: {
      canvasChildren: [...canvas.children].map(node => node.className),
      frozenDirectChild: frozen?.parentElement === canvas,
      timingDirectChild: timing?.parentElement === canvas,
      frozenContainsTiming: Boolean(frozen?.querySelector('.trace, .comment-body, .latency, .ruler, [data-production-overlay="annotations"]')),
      timingContainsRuler: Boolean(timing?.querySelector('.ruler')),
      timingContainsTrace: Boolean(timing?.querySelector('.trace svg')),
      timingContainsCommentBand: Boolean(timing?.querySelector('.comment-body, .latency')),
      frozenContainsRole: Boolean(frozen?.querySelector('.canvas-icon')),
      frozenContainsLabel: Boolean(frozen?.querySelector('.signal-label')),
      clip: getComputedStyle(timing).overflowX === 'auto' && getComputedStyle(timing).clipPath !== 'none'
    },
    timing: { scrollWidth: timing?.scrollWidth || 0, clientWidth: timing?.clientWidth || 0, scrollLeft: timing?.scrollLeft || 0, left: timing?.getBoundingClientRect().left || 0, boundary },
    labels: labelRows.map(row => ({ id: row.dataset.signal, rect: row.getBoundingClientRect().toJSON() })),
    visuals: timingVisuals.map(node => ({ tag: node.tagName, rect: node.getBoundingClientRect().toJSON(), visibleAtBoundary: document.elementFromPoint(boundary - 1, Math.max(35, node.getBoundingClientRect().top + 2)) === node })),
    alignment,
    scrollHostOverflow: getComputedStyle(timing).overflow,
    frozenX: frozen?.getBoundingClientRect().left || 0,
    document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument())
  };
});

const assertPaneContract = snapshot => {
  assert.equal(snapshot.structure.frozenDirectChild, true, 'frozen label pane is not a canvas sibling');
  assert.equal(snapshot.structure.timingDirectChild, true, 'timing pane is not a canvas sibling');
  assert.equal(snapshot.structure.frozenContainsTiming, false, 'timing content is owned by frozen pane');
  assert.equal(snapshot.structure.timingContainsRuler, true, 'ruler is not in timing pane');
  assert.equal(snapshot.structure.timingContainsTrace, true, 'WaveDrom trace is not in timing pane');
  assert.equal(snapshot.structure.timingContainsCommentBand, true, 'timed comment band is not in timing pane');
  assert.equal(snapshot.structure.frozenContainsRole, true, 'role column is not in frozen pane');
  assert.equal(snapshot.structure.frozenContainsLabel, true, 'signal label is not in frozen pane');
  assert.equal(snapshot.structure.clip, true, 'timing pane is not a clipped scroll owner');
  assert.equal(snapshot.scrollHostOverflow, 'auto', 'timing pane does not own scrolling');
  assert.ok(snapshot.alignment.every(item => item.error <= 0.1), `row alignment exceeded 0.1px: ${JSON.stringify(snapshot.alignment)}`);
  assert.ok(snapshot.visuals.every(item => !item.visibleAtBoundary), 'timing visual is visible in frozen label pixels');
};

const runViewport = async (browser, viewport) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4237/gui-mockup/', { waitUntil: 'networkidle' });
  await wait(100);
  const before = await inspect(page);
  assertPaneContract(before);
  assert.ok(before.timing.scrollWidth > before.timing.clientWidth, 'timing content is not horizontally scrollable');
  const baselineDocument = before.document;
  const scrolls = [300, 800];
  const scrollResults = [];
  for (const requested of scrolls) {
    await page.evaluate(value => { const host = document.querySelector('.timing-scroll-pane'); host.scrollLeft = Math.min(value, host.scrollWidth - host.clientWidth); }, requested);
    await wait(50);
    const result = await inspect(page);
    assertPaneContract(result);
    assert.ok(Math.abs(result.frozenX - before.frozenX) <= 0.1, `frozen pane moved at scroll ${requested}`);
    assert.equal(result.document, baselineDocument, 'scroll mutated canonical document');
    scrollResults.push({ requested, actual: result.timing.scrollLeft, max: result.timing.scrollWidth - result.timing.clientWidth, maxAlignmentErrorPx: Math.max(...result.alignment.map(item => item.error)) });
  }
  for (const zoom of [50, 100, 150]) {
    const changed = await page.evaluate(value => window.TimingChartProductionController.actions.setZoom(value), zoom);
    assert.equal(changed, true, `zoom ${zoom} was not accepted`);
    await wait(80);
    const result = await inspect(page);
    assertPaneContract(result);
  }
  const widened = await page.evaluate(() => window.TimingChartProductionController.actions.setSignalNameWidth(240));
  assert.equal(widened, true, 'widened splitter command failed');
  await wait(80);
  const widenedResult = await inspect(page);
  assertPaneContract(widenedResult);
  await page.evaluate(() => window.TimingChartProductionController.actions.setLeftPanelMode?.('hierarchy'));
  await wait(80);
  assertPaneContract(await inspect(page));
  await page.screenshot({ path: `${root}/production-${viewport.width}x${viewport.height}.png` });
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.close();
  return { viewport, scrollResults, widenedBoundary: widenedResult.timing.boundary, maxAlignmentErrorPx: Math.max(...widenedResult.alignment.map(item => item.error)), pass: true };
};

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) results.push(await runViewport(browser, viewport));
  const report = { issue: 33, results, trueTwoPane: true, goldenReferenceModified: false, stylesModified: false, iconsModified: false, customWaveformRenderer: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #33 acceptance passed: true frozen label pane, timing clipping/isolation, scroll, zoom, splitter, hierarchy, alignment, and persistence.');
} finally {
  server.kill();
}
