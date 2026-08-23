import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const result = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  document.querySelector('#groups .row[data-signal="req_valid"]')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const key of Object.keys(controller.renderMetrics)) controller.renderMetrics[key] = 0;
  const before = structuredClone(controller.model.document.signals.find(signal => signal.id === 'req_valid').values);
  const metricsBefore = { ...controller.renderMetrics };
  const input = document.querySelector('#bottomContent [data-editor-field="value"][data-editor-index="1"]');
  if (!input) throw new Error('signal value editor not found');
  input.value = '0';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const signal = controller.model.document.signals.find(item => item.id === 'req_valid');
  return {
    before,
    after: structuredClone(signal.values),
    revision: controller.model.documentRevision,
    metrics: { ...controller.renderMetrics },
    metricsBefore,
    skipTimeAxisResizeRevision: controller.skipTimeAxisResizeRevision,
    appFullRenderDelta: controller.renderMetrics.appFullRenders,
    pageErrors: []
  };
});
result.pageErrors = errors;
assert.equal(result.after[1].value, 0);
assert.notEqual(result.revision, 0);
assert.equal(result.metrics.appFullRenders - result.metricsBefore.appFullRenders, 0);
assert.equal(result.metrics.waveDromRenders - result.metricsBefore.waveDromRenders, 1);
assert.equal(result.metrics.geometryBuilds - result.metricsBefore.geometryBuilds, 1);
assert.equal(result.metrics.rulerRebuilds - result.metricsBefore.rulerRebuilds, 0);
assert.equal(result.metrics.transactionRenders - result.metricsBefore.transactionRenders, 0);
assert.equal(errors.length, 0, errors.join('\n'));
await browser.close();
console.log('Issue #126 signal edit acceptance passed:', JSON.stringify(result));
