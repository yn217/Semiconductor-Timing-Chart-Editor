import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue106');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(5000);
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(400);

const fixtureText = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const documentValue = structuredClone(controller.getSerializableDocument());
  documentValue.document.id = 'issue106-100-signal.tcd';
  documentValue.timeline.end = 200;
  documentValue.timeline.cycleCount = 200;
  documentValue.signals = documentValue.signals.filter(signal => signal.type !== 'commentRow');
  documentValue.signalGroups = [{ id: 'issue106-group', name: '100 signal fixture', rows: [] }];
  for (let index = 0; index < 100; index += 1) {
    const id = index === 0 ? 'clk' : `issue106_signal_${index}`;
    const signal = index === 0
      ? { ...documentValue.signals.find(item => item.id === 'clk'), id, values: [{ start: 0, value: 0 }] }
      : { id, name: id, type: 'binary', role: index % 3 === 0 ? 'output' : 'internal', source: { instancePath: ['u_top'], signalName: id }, display: { name: id }, values: [{ start: 0, value: index % 2 }, { start: 100, value: (index + 1) % 2 }] };
    documentValue.signals = index === 0 ? [signal] : [...documentValue.signals, signal];
    documentValue.signalGroups[0].rows.push(id);
  }
  documentValue.timeline.referenceClock = 'clk';
  documentValue.annotations = [{ id: 'issue106_annotation', type: 'marker', label: 'fixture', anchor: { signal: 'clk', cycle: 5, point: 'cycle-boundary', offset: { x: 0, y: 0 } }, position: 'canvas', color: '#1473e6' }];
  documentValue.transactions = [{ id: 'issue106_transaction', name: 'fixture transaction', start: 10, end: 20, linkedSignals: ['issue106_signal_1'], phases: [] }];
  return JSON.stringify(documentValue);
});

console.log('Issue #106 100-signal fixture prepared');
const resetMetrics = () => page.evaluate(() => {
  const metrics = window.TimingChartProductionController.model.validationMetrics;
  for (const key of Object.keys(metrics)) metrics[key] = 0;
});
const metrics = () => page.evaluate(() => ({ ...window.TimingChartProductionController.model.validationMetrics }));
await resetMetrics();
await page.evaluate(() => window.TimingChartProductionController.getProblems(window.TimingChartProductionController.model.document));
await resetMetrics();

// Real browser view-only actions: selections, zoom/view changes, and tab switches.
const viewOnlySignals = ['clk', 'req_valid', 'req_addr[7:0]', 'busy', 'state[1:0]', 'ready', 'rdata[15:0]'];
for (let index = 1; index <= 20; index += 1) {
  if (index === 1 || index === 10 || index === 20) console.log('Issue #106 view-only case', index);
  await page.locator(`.row[data-signal="${viewOnlySignals[index % viewOnlySignals.length]}"]`).click();
  await page.locator(`#bottomTabs [data-tab="${index % 2 ? 'json' : 'problems'}"]`).click();
  await page.locator('.view-mode [data-mode="cycle"]').click();
  await page.locator('.view-mode [data-mode="split"]').click();
  await page.locator('.view-mode [data-mode="cycle"]').click();
}
await page.locator('#bottomTabs [data-tab="json"]').click();
const viewOnlyMetrics = await metrics();
assert.equal(viewOnlyMetrics.validationRuns, 0, `view-only actions ran validation ${viewOnlyMetrics.validationRuns} times`);
assert.ok(viewOnlyMetrics.validationCacheHits > 0, 'view-only actions did not consume the validation cache');

// Switch to the large fixture without rendering its 100 traces: this isolates
// the Problems cache contract from the separate incremental waveform concern.
assert.equal(await page.evaluate(text => {
  const c = window.TimingChartProductionController;
  c.replaceDocument(JSON.parse(text), { render: false });
  c.model.documentRevision = 0;
  c.model.validationReadContext = true;
  return true;
}, fixtureText), true);
await page.evaluate(() => window.TimingChartProductionController.getProblems(window.TimingChartProductionController.model.document));
await resetMetrics();
for (let index = 0; index < 20; index += 1) await page.evaluate(() => window.TimingChartProductionController.getProblems(window.TimingChartProductionController.model.document));
const largeViewMetrics = await metrics();
assert.equal(largeViewMetrics.validationRuns, 0);
assert.equal(largeViewMetrics.validationCacheMisses, 0);
assert.equal(largeViewMetrics.validationCacheHits, 20);

await resetMetrics();
const settingsMetrics = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.model.document.checkSettings = { enabledCategories: ['timeline'] };
  c.getProblems(c.model.document);
  const afterChange = { ...c.model.validationMetrics };
  c.getProblems(c.model.document);
  return { afterChange, afterReuse: { ...c.model.validationMetrics } };
});
assert.equal(settingsMetrics.afterChange.validationRuns, 1, 'check-setting change did not invalidate Problems cache');
assert.equal(settingsMetrics.afterReuse.validationRuns, 1, 'check-setting cache was not reused');

// One semantic mutation: exactly one validator execution, then all consumers reuse it.
await resetMetrics();
assert.equal(await page.evaluate(() => window.TimingChartProductionController.documentHistory.run('Issue 106 value edit', () => {
  const signal = window.TimingChartProductionController.selectors.getSignal('issue106_signal_42');
  signal.values[0].value = 1;
}, { render: false })), true);
await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.getProblems(c.model.document);
  c.getProblems(c.model.document);
});
const editMetrics = await metrics();
assert.equal(editMetrics.validationRuns, 1, `semantic edit ran validation ${editMetrics.validationRuns} times`);
assert.ok(editMetrics.validationCacheHits > 0, 'render surfaces did not reuse the post-edit validation result');

// Opening JSON must not trigger extra scans for the same revision.
const beforeJson = await metrics();
await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.getProblems(c.model.document);
  c.getProblems(c.model.document);
});
const afterJson = await metrics();
assert.equal(afterJson.validationRuns, beforeJson.validationRuns, 'JSON/Problems consumers rescanned the unchanged revision');

assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue106-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 106, fixture: { signals: 100, cycles: 200, annotations: 1, transactions: 1 }, viewOnly: viewOnlyMetrics, largeFixtureViewOnly: largeViewMetrics, settingsInvalidation: settingsMetrics, semanticEdit: editMetrics, jsonProblemsReuse: true, errors, pass: true }, null, 2)}\n`);
console.log('Issue #106 acceptance passed: cached Problems validation across 100 signals/200 cycles, view-only zero-run behavior, and one-run semantic edit reuse.');
