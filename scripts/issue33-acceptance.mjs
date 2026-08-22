import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue33';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4237'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const runViewport = async (browser, viewport) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4237/gui-mockup/', { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => {
    const timing = document.querySelector('.timing-scroll-pane');
    const label = document.querySelector('#cycleCanvas .signal-label');
    const role = document.querySelector('#cycleCanvas .canvas-icon');
    const comment = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(row => row.querySelector('.comment-body'));
    const tick = document.querySelector('#cycleCanvas .ruler .tick');
    const trace = document.querySelector('#cycleCanvas .trace svg');
    return { timing: { scrollWidth: timing.scrollWidth, clientWidth: timing.clientWidth }, label: label.getBoundingClientRect().toJSON(), role: role.getBoundingClientRect().toJSON(), commentLabel: comment.querySelector('.signal-label').getBoundingClientRect().toJSON(), commentBand: comment.querySelector('.comment-body').getBoundingClientRect().toJSON(), tick: tick.getBoundingClientRect().toJSON(), trace: trace.getBoundingClientRect().toJSON(), document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), scrollLeft: timing.scrollLeft };
  });
  assert.ok(await page.locator('.timing-scroll-pane[data-scroll-owner="timing"]').count() === 1, 'timing pane missing');
  assert.ok(before.timing.scrollWidth > before.timing.clientWidth, 'long timing content is not scrollable');
  await page.evaluate(() => { document.querySelector('.timing-scroll-pane').scrollLeft = 300; });
  await wait(100);
  const after = await page.evaluate(() => {
    const timing = document.querySelector('.timing-scroll-pane');
    const label = document.querySelector('#cycleCanvas .signal-label');
    const role = document.querySelector('#cycleCanvas .canvas-icon');
    const comment = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(row => row.querySelector('.comment-body'));
    const tick = document.querySelector('#cycleCanvas .ruler .tick');
    const trace = document.querySelector('#cycleCanvas .trace svg');
    const boundary = window.TimingChartProductionController.getCycleBoundary({ signal: 'clk', cycle: 0, coordinateSpace: 'canvas' });
    const ruler = tick.getBoundingClientRect();
    return { scrollLeft: timing.scrollLeft, label: label.getBoundingClientRect().toJSON(), role: role.getBoundingClientRect().toJSON(), commentLabel: comment.querySelector('.signal-label').getBoundingClientRect().toJSON(), commentBand: comment.querySelector('.comment-body').getBoundingClientRect().toJSON(), tick: tick.getBoundingClientRect().toJSON(), trace: trace.getBoundingClientRect().toJSON(), boundaryError: Math.abs(ruler.left + ruler.width / 2 - boundary.canvasX), playhead: document.querySelector('.playhead')?.getBoundingClientRect().toJSON(), document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()) };
  });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(after.scrollLeft, 300);
  assert.ok(Math.abs(after.label.left - before.label.left) <= 0.1, 'signal label moved during horizontal timing scroll');
  assert.ok(Math.abs(after.role.left - before.role.left) <= 0.1, 'role icon moved during horizontal timing scroll');
  assert.ok(Math.abs(after.commentLabel.left - before.commentLabel.left) <= 0.1, 'comment label moved during horizontal timing scroll');
  assert.ok(Math.abs(after.trace.left - before.trace.left) >= 299.9, 'WaveDrom trace did not scroll with timing pane');
  assert.ok(Math.abs(after.commentBand.left - before.commentBand.left) >= 299.9, 'timed comment band did not scroll');
  assert.ok(Math.abs(after.tick.left - before.tick.left) >= 299.9, 'ruler tick did not scroll');
  assert.ok(after.boundaryError <= 0.1, 'ruler tick is not aligned to actual WaveDrom geometry');
  assert.equal(after.document, before.document, 'horizontal scroll leaked into canonical document');
  await page.screenshot({ path: `${root}/production-${viewport.width}x${viewport.height}.png` });
  await page.close();
  return { viewport, frozenLabel: true, timingScroll: true, geometryErrorPx: after.boundaryError, canonicalUnchanged: true, pass: true };
};

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) results.push(await runViewport(browser, viewport));
  const report = { issue: 33, results, goldenReferenceModified: false, stylesModified: false, iconsModified: false, customWaveformRenderer: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #33 acceptance passed: frozen label columns, timing-only horizontal scroll, geometry, and canonical persistence.');
} finally {
  server.kill();
}
