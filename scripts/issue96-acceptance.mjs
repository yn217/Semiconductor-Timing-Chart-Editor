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
assert.equal(editDelta.fullDocumentStringifies, 2);
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
  for (let index = 0; index < 100; index += 1) { const id = `perf_signal_${index}`; doc.signals.push({ id, name: id, type: 'binary', role: 'internal', source: { instancePath: [], signalName: id }, display: { name: id }, values: [{ start: 0, value: index % 2 }] }); group.rows.push(id); }
  return JSON.stringify(doc);
});
assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue96-100.tcd', unsavedDecision: 'discard' }), fixture), true);
await resetMetrics();
const beforeLarge = await snapshot();
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.updateSignalValue('perf_signal_42', 0, 'value', '1')), true);
const afterLarge = await snapshot();
const largeDelta = delta(beforeLarge.metrics, afterLarge.metrics);
assert.equal(largeDelta.serializableSnapshots, 2);
assert.equal(largeDelta.structuredClones, 2);
assert.equal(largeDelta.validations, 1);
assert.equal(largeDelta.fullRenders, 1);
assert.equal(largeDelta.fullDocumentStringifies, 2);

assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue96-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 96, onePrePostSnapshot: true, revisionDirty: true, atomicInvalidEdit: true, oneRenderOnFailure: true, undoRedoContext: true, largeFixture100Signals: true, metrics: { edit: editDelta, invalid: invalidDelta, large: largeDelta }, errors, pass: true }, null, 2)}\n`);
console.log('Issue #96 acceptance passed: revision Dirty tracking, one pre/post snapshot, atomic rollback, one failure render, Undo/Redo context, and 100-Signal metrics.');
