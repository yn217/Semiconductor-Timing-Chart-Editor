import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue53');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const base = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
const snapshot = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  return { document: c.getSerializableDocument(), history: c.model.history.undo.length, redo: c.model.history.redo.length, dirty: c.model.persistence.dirty };
});
const reset = async () => {
  assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue53-base.tcd', unsavedDecision: 'discard' }), base), true);
  await page.waitForTimeout(35);
};
const invoke = name => page.evaluate(async action => {
  const c = window.TimingChartProductionController;
  const comment = c.selectors.getComments()[0]?.id;
  const calls = {
    signalNameAlignment: () => c.actions.setSignalNameAlignment('center'),
    busWidthAlignment: () => c.actions.setBusWidthAlignment('center'),
    legendVisible: () => c.actions.setLegendVisible(false),
    clock: () => c.actions.updateClock('clk', 'period', 2),
    signalValue: () => c.actions.updateSignalValue('req_valid', 0, 'start', 1),
    comment: () => c.actions.updateComment(comment, 'body', 'Issue 53 changed'),
    annotation: () => c.actions.addAnnotation('marker', { id: 'issue53-marker', label: 'Issue 53' }),
    transaction: () => c.actions.addTransaction({ id: 'issue53-transaction', name: 'Issue 53', start: 1, end: 3, linkedSignals: ['req_valid'], phases: [] }),
    cycle: () => c.actions.insertCycles(2, 1),
    group: () => c.actions.addGroup('Issue 53 group', { id: 'issue53-group' })
  };
  return calls[action]?.();
}, name);

const report = { issue: 53, cases: {}, staticAudit: {}, errors };
const mutationCases = [
  ['signalNameAlignment', 'layout.signalNameAlign'],
  ['busWidthAlignment', 'layout.busWidthAlign'],
  ['legendVisible', 'legend.show'],
  ['clock', 'signals[clk].generator.period'],
  ['signalValue', 'signals[req_valid].values[0].start'],
  ['comment', 'comment.body'],
  ['annotation', 'annotations'],
  ['transaction', 'transactions'],
  ['cycle', 'timeline.cycleCount'],
  ['group', 'signalGroups']
];

for (const [name, field] of mutationCases) {
  console.log(`Issue #53 case: ${name}`);
  await reset();
  const before = await snapshot();
  const result = await invoke(name);
  const after = await snapshot();
  assert.equal(Boolean(result), true, `${name} action failed`);
  assert.equal(after.dirty, true, `${name} did not mark Dirty`);
  assert.equal(after.history, before.history + 1, `${name} did not create one history entry`);
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.undo()), true, `${name} Undo failed`);
  const restored = await snapshot();
  assert.deepEqual(restored.document, before.document, `${name} Undo did not restore ${field}`);
  report.cases[name] = { field, dirty: true, oneHistoryEntry: true, exactUndo: true, pass: true };
  console.log(`Issue #53 case passed: ${name}`);
}

await reset();
console.log('Issue #53 case: no-op / rollback / transient');
const noOpBefore = await snapshot();
assert.equal(await invoke('signalNameAlignment'), true);
const noOpAfter = await snapshot();
assert.equal(noOpAfter.history, noOpBefore.history + 1, 'center alignment is not a no-op after reset');
await page.evaluate(() => window.TimingChartProductionController.actions.undo());
const noOpBaseline = await snapshot();
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.setSignalNameAlignment('left')), true);
const noOp = await snapshot();
assert.equal(noOp.history, noOpBaseline.history, 'no-op mutation created history');
assert.equal(noOp.dirty, false, 'no-op mutation marked Dirty');
report.cases.noOp = { historyUnchanged: true, clean: true, pass: true };

await reset();
console.log('Issue #53 case: save');
const failedBefore = await snapshot();
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.updateSignalValue('req_valid', 0, 'start', 3)), false);
const failedAfter = await snapshot();
assert.deepEqual(failedAfter.document, failedBefore.document, 'failed validation changed the document');
assert.equal(failedAfter.history, failedBefore.history, 'failed validation created history');
assert.equal(failedAfter.dirty, false, 'failed validation marked Dirty');
report.cases.failedValidationRollback = { atomic: true, noHistory: true, clean: true, pass: true };

await reset();
console.log('Issue #53 case: unsaved open protection');
const transientBefore = await snapshot();
assert.equal(await page.evaluate(() => { const c = window.TimingChartProductionController; const row = document.querySelector('#leftPanel .row[data-signal="clk"]'); c.actions.selectObject(row); c.actions.setZoom(1.5); c.actions.setCurrentCycle(4); return true; }), true);
const transientAfter = await snapshot();
assert.deepEqual(transientAfter.document, transientBefore.document, 'transient view operation changed canonical document');
assert.equal(transientAfter.history, transientBefore.history, 'transient view operation created history');
assert.equal(transientAfter.dirty, false, 'transient view operation marked Dirty');
report.cases.transientView = { selectionZoomCycleExcluded: true, pass: true };

await reset();
await invoke('signalValue');
assert.equal((await snapshot()).dirty, true);
await page.evaluate(() => { window.showSaveFilePicker = undefined; });
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.saveAs({ fileName: 'issue53.tcd' })), true);
assert.equal((await snapshot()).dirty, false, 'Save did not reset Dirty');
report.cases.save = { dirtyReset: true, pass: true };

await reset();
await invoke('signalValue');
const protectedDocument = (await snapshot()).document;
assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue53-other.tcd', unsavedDecision: 'cancel' }), base), false);
assert.deepEqual((await snapshot()).document, protectedDocument, 'Open bypassed unsaved-change protection');
report.cases.unsavedOpenProtection = { cancelPreservedDocument: true, pass: true };

const controllerSource = await fs.readFile(path.join(root, 'gui-mockup', 'production-controller.js'), 'utf8');
const documentSource = await fs.readFile(path.join(root, 'gui-mockup', 'production-document.js'), 'utf8');
const annotationSource = await fs.readFile(path.join(root, 'gui-mockup', 'annotation-ribbon.js'), 'utf8');
for (const forbidden of ['wrapMutation']) assert.equal(documentSource.includes(forbidden), false, `legacy ${forbidden} boundary remains`);
const boundaryMarkers = {
  setSignalNameAlignment: 'transactionRun(\'Align signal name column\'',
  setBusWidthAlignment: 'transactionRun(\'Align bus width column\'',
  setLegendVisible: 'transactionRun(\'Change legend visibility\'',
  updateClock: 'return transactionRun(`Change clock ${field}`',
  updateSignalValue: 'return transactionRun(`Change signal ${field}`',
  addSignalValue: 'return transactionRun(\'Add signal value\'',
  updateComment: 'return transactionRun(`Change comment ${field}`'
};
for (const [required, marker] of Object.entries(boundaryMarkers)) assert.ok(controllerSource.includes(marker), `${required} is not explicitly owned by transactionRun`);
assert.match(annotationSource, /dispatchDocumentCommand/);
assert.match(await fs.readFile(path.join(root, 'gui-mockup/production-time-axis.js'), 'utf8'), /documentHistory\.run/);
report.staticAudit = { noPostHocWrapList: true, controllerPersistentActionsUseBoundary: true, annotationRibbonUsesBoundary: true, timeAxisUsesBoundary: true, pass: true };

report.errors = errors;
report.pass = errors.length === 0 && Object.values(report.cases).every(item => item.pass) && report.staticAudit.pass;
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue53-1672x941.png') });
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #53 acceptance passed: explicit persistent mutation boundary, rollback/no-op semantics, transient exclusion, Save/Open protection, and mutation audit.');
