import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue96');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const snapshot = () => page.evaluate(() => ({
  document: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()),
  history: window.TimingChartProductionController.model.history.undo.length,
  dirty: window.TimingChartProductionController.model.persistence.dirty,
  revision: window.TimingChartProductionController.model.documentRevision,
  metrics: structuredClone(window.TimingChartProductionController.model.persistenceMetrics)
}));
const resetMetrics = () => page.evaluate(() => { for (const key of Object.keys(window.TimingChartProductionController.model.persistenceMetrics)) window.TimingChartProductionController.model.persistenceMetrics[key] = 0; });
const delta = (before, after) => Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));

await resetMetrics();
const beforeEdit = await snapshot();
const edit = await page.evaluate(() => window.TimingChartProductionController.actions.updateSignalValue('req_valid', 1, 'value', '0'));
assert.equal(edit, true);
const afterEdit = await snapshot();
const editDelta = delta(beforeEdit.metrics, afterEdit.metrics);
assert.equal(editDelta.commands, 1);
assert.equal(editDelta.serializableSnapshots, 2);
assert.equal(editDelta.structuredClones, 2);
assert.equal(editDelta.validations, 1);
assert.equal(editDelta.fullRenders, 1);
assert.equal(editDelta.fullDocumentStringifies, 0, 'history equality still stringifies full snapshots');
assert.ok(editDelta.comparisonNodes > 0, 'canonical snapshot comparison was not measured');
assert.equal(afterEdit.history, beforeEdit.history + 1);
assert.equal(afterEdit.dirty, true);

await resetMetrics();
const beforeInvalid = await snapshot();
const invalid = await page.evaluate(() => window.TimingChartProductionController.dispatchDocumentCommand('Invalid duplicate start', () => { const signal = window.TimingChartProductionController.selectors.getSignal('req_valid'); signal.values[1].start = 0; }));
assert.equal(invalid, false);
const afterInvalid = await snapshot();
const invalidDelta = delta(beforeInvalid.metrics, afterInvalid.metrics);
assert.equal(afterInvalid.document, beforeInvalid.document);
assert.equal(afterInvalid.history, beforeInvalid.history);
assert.equal(afterInvalid.dirty, beforeInvalid.dirty);
assert.equal(invalidDelta.commands, 1);
assert.equal(invalidDelta.serializableSnapshots, 1);
assert.equal(invalidDelta.validations, 1);
assert.equal(invalidDelta.fullRenders, 1, 'validation failure rendered more than once');
assert.equal(invalidDelta.fullDocumentStringifies, 0);

const contextBeforeUndo = await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.timeSelection.cycle = 6; c.model.editor.rowIndex = 1; c.model.view.scope = []; return { selection: structuredClone(c.model.selection), cycle: c.model.timeSelection.cycle, scope: structuredClone(c.model.view.scope), revision: c.model.documentRevision }; });
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.undo()), true);
const undone = await page.evaluate(() => { const c = window.TimingChartProductionController; return { value: c.model.document.signals.find(s => s.id === 'req_valid').values[1].value, selection: structuredClone(c.model.selection), cycle: c.model.timeSelection.cycle, scope: structuredClone(c.model.view.scope), revision: c.model.documentRevision, dirty: c.model.persistence.dirty }; });
assert.equal(undone.value, 1);
assert.deepEqual(undone.selection, contextBeforeUndo.selection);
assert.equal(undone.cycle, contextBeforeUndo.cycle);
assert.deepEqual(undone.scope, contextBeforeUndo.scope);
assert.equal(undone.revision, contextBeforeUndo.revision - 1);
assert.equal(undone.dirty, false);
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.redo()), true);
assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(s => s.id === 'req_valid').values[1].value), 0);

const fixture = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const doc = structuredClone(c.getSerializableDocument());
  const group = doc.signalGroups[0];
  doc.timeline.end = 600;
  doc.timeline.cycleCount = 600;
  for (let index = 0; index < 120; index += 1) { const id = `perf_signal_${index}`; const values = Array.from({ length: 12 }, (_, valueIndex) => ({ start: valueIndex * 50, value: (index + valueIndex) % 2 })); doc.signals.push({ id, name: id, type: 'binary', role: 'internal', source: { instancePath: [], signalName: id }, display: { name: id }, values }); group.rows.push(id); }
  doc.annotations = [{ id: 'issue96_annotation', type: 'marker', label: 'performance marker', anchor: { signal: 'req_valid', cycle: 50, point: 'rising', offset: { x: 0, y: 0 } } }];
  doc.transactions = [{ id: 'issue96_transaction', name: 'performance transaction', start: 100, end: 200, phases: [] }];
  doc.bookmarks = [{ id: 'issue96_bookmark', name: 'performance bookmark', start: 300, comment: 'fixture' }];
  doc.timeGroups = [{ id: 'issue96_time_group', name: 'performance range', start: 350, end: 450, comment: 'fixture' }];
  return JSON.stringify(doc);
});
assert.equal(await page.evaluate(text => { const c = window.TimingChartProductionController; c.replaceDocument(JSON.parse(text), { render: false }); c.model.documentRevision = 0; return true; }, fixture), true);
await resetMetrics();
const beforeLarge = await snapshot();
assert.equal(await page.evaluate(() => { const c = window.TimingChartProductionController; return c.documentHistory.run('Issue 96 large fixture edit', () => { c.selectors.getSignal('perf_signal_42').values[0].value = 1; }, { render: false }); }), true);
const afterLarge = await snapshot();
const largeDelta = delta(beforeLarge.metrics, afterLarge.metrics);
assert.equal(largeDelta.serializableSnapshots, 2);
assert.equal(largeDelta.structuredClones, 2);
assert.equal(largeDelta.validations, 1);
assert.equal(largeDelta.fullRenders, 0);
assert.equal(largeDelta.fullDocumentStringifies, 0);

await resetMetrics();
const repeatedEdits = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const started = performance.now();
  for (let index = 0; index < 60; index += 1) {
    const id = `perf_signal_${index % 120}`;
    const signal = c.selectors.getSignal(id);
    const next = signal.values[0].value === 0 ? 1 : 0;
    if (!signal) throw new Error(`missing ${id}`);
    if (!c.documentHistory.run(`Issue 96 repeated edit ${index}`, () => { signal.values[0].value = next; }, { render: false })) throw new Error(`edit ${index} failed`);
  }
  return { elapsedMs: performance.now() - started, metrics: structuredClone(c.model.persistenceMetrics), revision: c.model.documentRevision };
});
assert.equal(repeatedEdits.metrics.commands, 60);
assert.equal(repeatedEdits.metrics.serializableSnapshots, 120);
assert.equal(repeatedEdits.metrics.structuredClones, 120);
assert.equal(repeatedEdits.metrics.validations, 60);
assert.equal(repeatedEdits.metrics.fullRenders, 0);
assert.equal(repeatedEdits.metrics.fullDocumentStringifies, 0);
assert.ok(repeatedEdits.metrics.fullDocumentStringifyBytes === 0);
assert.equal(repeatedEdits.revision, 61);

assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue96-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 96, onePrePostSnapshot: true, revisionDirty: true, atomicInvalidEdit: true, oneRenderOnFailure: true, undoRedoContext: true, largeFixture: { signals: 129, cycles: 600, annotations: 1, transactions: 1, bookmarks: 1, timeGroups: 1 }, repeatedEdits: { count: 60, elapsedMs: repeatedEdits.elapsedMs, metrics: repeatedEdits.metrics }, metrics: { edit: editDelta, invalid: invalidDelta, large: largeDelta }, errors, pass: true }, null, 2)}\n`);
console.log('Issue #96 acceptance passed: revision Dirty tracking, structural snapshot equality, atomic rollback, and 60-edit large-document characterization.');
