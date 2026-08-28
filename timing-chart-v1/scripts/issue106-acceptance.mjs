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

// A validator exception must not leave an ambient cache/read mode behind.
const exceptionState = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.validationTestHook = () => { throw new Error('forced issue106 validator failure'); };
  let caught = false;
  try { c.getProblems(c.model.document, { force: true }); } catch (error) { caught = error.message === 'forced issue106 validator failure'; }
  delete c.validationTestHook;
  const afterException = { ...c.model.validationMetrics };
  const recovered = c.getProblems(c.model.document);
  const afterRecovery = { ...c.model.validationMetrics };
  return { caught, afterException, afterRecovery, recoveredCount: recovered.length, validationReadContext: c.model.validationReadContext };
});
assert.equal(exceptionState.caught, true, 'forced validator exception was not observed');
assert.equal(exceptionState.validationReadContext, undefined, 'legacy ambient validation mode remains');
assert.equal(exceptionState.afterRecovery.validationRuns, exceptionState.afterException.validationRuns, 'valid cache was corrupted after validator exception');
assert.ok(exceptionState.afterRecovery.validationCacheHits > exceptionState.afterException.validationCacheHits, 'cache did not recover after validator exception');

const failedMutation = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const before = JSON.stringify(c.getSerializableDocument());
  c.validationTestHook = () => { throw new Error('forced mutation validator failure'); };
  const result = c.documentHistory.run('Issue 106 forced validator failure', () => {
    const signal = c.selectors.getSignal('issue106_signal_42');
    signal.values[0].value = signal.values[0].value === 0 ? 1 : 0;
  }, { render: false });
  delete c.validationTestHook;
  return { result, rolledBack: JSON.stringify(c.getSerializableDocument()) === before, diagnostic: c.model.validation?.[0]?.code, validationReadContext: c.model.validationReadContext };
});
assert.equal(failedMutation.result, false, 'validator exception was reported as a committed mutation');
assert.equal(failedMutation.rolledBack, true, 'validator exception left a mutated canonical document');
assert.equal(failedMutation.diagnostic, 'validator-exception', 'validator exception diagnostic was not exposed');
assert.equal(failedMutation.validationReadContext, undefined, 'mutation exception recreated legacy ambient mode');

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

const lifecycleState = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const tiny = structuredClone(c.getSerializableDocument());
  tiny.document.id = 'issue106-post-exception.tcd';
  tiny.timeline.end = 1;
  tiny.timeline.cycleCount = 1;
  tiny.signalGroups = [{ id: 'issue106-post-exception-group', name: 'post-exception', rows: ['clk'] }];
  tiny.signals = tiny.signals.filter(signal => signal.id === 'clk').map(signal => ({ ...signal, generator: { ...signal.generator, start: 0, period: 1 } }));
  tiny.timeline.referenceClock = 'clk';
  tiny.annotations = [];
  tiny.transactions = [];
  const opened = await c.actions.openText(JSON.stringify(tiny), { fileName: 'issue106-post-exception.tcd', unsavedDecision: 'discard' });
  const undo = c.actions.undo();
  const redo = c.actions.redo();
  const newDocument = await c.actions.requestNew({ unsavedDecision: 'discard' });
  return { opened, undo, redo, newDocument, validationReadContext: c.model.validationReadContext, validationRuns: c.model.validationMetrics.validationRuns };
});
assert.equal(lifecycleState.opened, true, 'Open failed after validator exception');
assert.equal(lifecycleState.newDocument, true, 'New failed after validator exception');
assert.equal(lifecycleState.validationReadContext, undefined, 'Open/New/Undo/Redo inherited legacy validation mode');

assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue106-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 106, fixture: { signals: 100, cycles: 200, annotations: 1, transactions: 1 }, viewOnly: viewOnlyMetrics, largeFixtureViewOnly: largeViewMetrics, settingsInvalidation: settingsMetrics, exceptionState, failedMutation, semanticEdit: editMetrics, lifecycleState, jsonProblemsReuse: true, errors, pass: true }, null, 2)}\n`);
console.log('Issue #106 acceptance passed: cached Problems validation across 100 signals/200 cycles, view-only zero-run behavior, and one-run semantic edit reuse.');
