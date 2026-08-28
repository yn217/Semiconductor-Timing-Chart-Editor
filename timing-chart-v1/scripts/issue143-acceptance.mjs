import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifacts', 'issue143');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.model?.waveGeometry));
await page.evaluate(() => window.TimingChartProductionController.waveformIdle);

const snapshot = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const host = window.TimingChartTimingViewport.getScrollHost();
  const wave = document.querySelector('#cycleCanvas .wave');
  const mini = document.querySelector('.mini-canvas');
  const rect = wave.getBoundingClientRect();
  return {
    scrollWidth: host.scrollWidth, scrollHeight: host.scrollHeight,
    wave: { width: rect.width, height: rect.height, minWidth: wave.style.minWidth, minHeight: wave.style.minHeight },
    miniExtent: { rows: mini?.querySelectorAll('[data-minimap-row]').length || 0, width: mini?.querySelector('[data-live-minimap]')?.getAttribute('viewBox') || null },
    metrics: { ...(c.viewMetrics || {}), render: { ...(c.renderMetrics || {}) } },
    document: JSON.stringify(c.getSerializableDocument())
  };
});

const stableKeys = ['scrollWidth', 'scrollHeight', 'wave', 'miniExtent', 'document'];
const refreshMany = async (count = 100) => {
  // The first call may normalize a legacy/previously inflated derived scene
  // size. Idempotence is measured after that one authoritative normalization.
  await page.evaluate(() => window.TimingChartProductionController.renderMinimap());
  const before = await snapshot();
  for (let i = 0; i < count; i += 1) await page.evaluate(() => window.TimingChartProductionController.renderMinimap());
  const after = await snapshot();
  for (const key of stableKeys) assert.deepEqual(after[key], before[key], `${key} changed after idempotent MiniMap refresh`);
  assert.equal(after.metrics.minimapSceneSizeWrites || 0, before.metrics.minimapSceneSizeWrites || 0, 'scene-size write occurred during idempotent refresh');
  return { before, after, refreshes: count };
};

const reports = [];
reports.push({ name: 'startup', ...(await refreshMany()) });
const host = page.locator('.timing-scroll-pane');
for (const position of ['start', 'middle', 'end']) {
  await host.evaluate((node, position) => { node.scrollLeft = position === 'start' ? 0 : position === 'middle' ? Math.max(0, (node.scrollWidth - node.clientWidth) / 2) : Math.max(0, node.scrollWidth - node.clientWidth); node.scrollTop = position === 'start' ? 0 : position === 'middle' ? Math.max(0, (node.scrollHeight - node.clientHeight) / 2) : Math.max(0, node.scrollHeight - node.clientHeight); }, position);
  reports.push({ name: `scroll-${position}`, ...(await refreshMany()) });
}

const firstSignal = await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(signal => signal.type !== 'clock' && signal.type !== 'commentRow')?.id);
assert.ok(firstSignal);
await page.evaluate(id => window.TimingChartProductionController.actions.setSignalVisibility(id, false), firstSignal);
await page.evaluate(() => window.TimingChartProductionController.renderMinimap());
await page.evaluate(id => window.TimingChartProductionController.actions.setSignalVisibility(id, true), firstSignal);
reports.push({ name: 'eye-off-on', ...(await refreshMany(20)) });

for (const size of [1280, 1024, 1672]) {
  await page.setViewportSize({ width: size, height: 720 });
  await page.evaluate(() => window.TimingChartProductionController.renderMinimap());
  reports.push({ name: `resize-${size}`, ...(await refreshMany(20)) });
}

assert.deepEqual(errors, []);
const controller = await page.evaluate(() => ({ metrics: window.TimingChartProductionController.viewMetrics, renderMetrics: window.TimingChartProductionController.renderMetrics }));
const report = { issue: 143, reports: reports.map(({ before, after, ...rest }) => ({ ...rest, before, after })), metrics: controller, pageErrors: errors, pass: true };
await page.screenshot({ path: path.join(out, 'production-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log('Issue #143 acceptance passed: 100-refresh MiniMap extent remained stable and scene-size writes were idempotent.');
