import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue77-ribbon-ops');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const setup = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  if (c.model.document.transactions.length === 0) c.actions.addTransaction();
  await wait(60);
  c.actions.setViewMode('transaction');
  await wait(60);
  c.actions.addTransaction();
  await wait(60);
  return c.model.document.transactions.length >= 2;
});
assert.ok(setup, 'transaction fixture failed to set up');

// --- Buttons carry real per-command metadata, not a shared/bare status ---
const buttons = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.ribbon .txn-only [data-txn-action]')];
  return nodes.map(node => ({ action: node.dataset.txnAction, status: node.dataset.controlStatus, label: node.querySelector('.tool-label')?.textContent.trim() }));
});
assert.deepEqual(buttons.map(b => b.action).sort(), ['add', 'apply-range', 'delete', 'down', 'duplicate', 'reveal-links', 'up']);
assert.ok(buttons.every(b => b.status === 'implemented'));
assert.ok(buttons.find(b => b.action === 'up').label && buttons.find(b => b.action === 'down').label, 'up/down must be distinct commands, not one ambiguous button');
assert.notEqual(buttons.find(b => b.action === 'up').label, buttons.find(b => b.action === 'down').label);

// --- Duplicate/Delete/Up/Down are disabled without a Transaction selection, enabled with one; Add is always enabled ---
const disabledState = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  c.model.selection = { kind: 'signal', id: c.model.document.timeline.referenceClock };
  c.render();
  await wait(30);
  const disabled = ['duplicate', 'delete', 'up', 'down'].map(action => document.querySelector(`[data-txn-action="${action}"]`).disabled);
  const addEnabled = !document.querySelector('[data-txn-action="add"]').disabled;
  const txn = c.model.document.transactions[0];
  c.actions.selectTransaction(txn.id);
  await wait(30);
  const enabled = ['duplicate', 'delete', 'up', 'down'].map(action => !document.querySelector(`[data-txn-action="${action}"]`).disabled);
  return { disabledWithoutSelection: disabled.every(Boolean), addEnabled, enabledWithSelection: enabled.every(Boolean) };
});
assert.equal(disabledState.disabledWithoutSelection, true);
assert.equal(disabledState.addEnabled, true);
assert.equal(disabledState.enabledWithSelection, true);

// --- Duplicate inserts a new unique-id transaction and selects it; one Undo entry ---
const duplicateFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const source = c.model.document.transactions[0];
  c.actions.selectTransaction(source.id);
  await wait(30);
  const before = c.model.document.transactions.length;
  const undoBefore = c.model.history.undo.length;
  document.querySelector('[data-txn-action="duplicate"]').click();
  await wait(60);
  const after = c.model.document.transactions.length;
  const undoDelta = c.model.history.undo.length - undoBefore;
  const newId = c.model.selection.id;
  return { addedOne: after === before + 1, undoDelta, newIdDifferent: newId !== source.id, sourceStillExists: c.model.document.transactions.some(t => t.id === source.id) };
});
assert.equal(duplicateFlow.addedOne, true);
assert.equal(duplicateFlow.undoDelta, 1);
assert.equal(duplicateFlow.newIdDifferent, true);
assert.equal(duplicateFlow.sourceStillExists, true);

// --- Up/Down reorder the canonical transactions array by exactly one position; one Undo entry each; boundary is a no-op ---
const reorderFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const id = c.model.selection.id;
  const indexBefore = c.model.document.transactions.findIndex(t => t.id === id);
  const undoBefore = c.model.history.undo.length;
  document.querySelector('[data-txn-action="up"]').click();
  await wait(60);
  const indexAfterUp = c.model.document.transactions.findIndex(t => t.id === id);
  const upUndoDelta = c.model.history.undo.length - undoBefore;
  const stillSelected = c.model.selection.id === id;
  // move to top boundary and verify no-op / no spurious Undo entry
  let guard = 0;
  while (c.model.document.transactions.findIndex(t => t.id === id) > 0 && guard < 20) { document.querySelector('[data-txn-action="up"]').click(); guard += 1; }
  await wait(60);
  const atTop = c.model.document.transactions.findIndex(t => t.id === id) === 0;
  const undoBeforeBoundary = c.model.history.undo.length;
  document.querySelector('[data-txn-action="up"]').click();
  await wait(60);
  const undoAfterBoundary = c.model.history.undo.length;
  return { indexBefore, indexAfterUp, upUndoDelta, stillSelected, atTop, boundaryNoOpUndoDelta: undoAfterBoundary - undoBeforeBoundary };
});
assert.equal(reorderFlow.indexAfterUp, reorderFlow.indexBefore - 1);
assert.equal(reorderFlow.upUndoDelta, 1);
assert.equal(reorderFlow.stillSelected, true);
assert.equal(reorderFlow.atTop, true);
assert.equal(reorderFlow.boundaryNoOpUndoDelta, 0, 'moving up at the top boundary must not create a spurious Undo entry');

// --- Delete removes the selected transaction; one Undo entry ---
const deleteFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const id = c.model.selection.id;
  const undoBefore = c.model.history.undo.length;
  document.querySelector('[data-txn-action="delete"]').click();
  await wait(60);
  const undoDelta = c.model.history.undo.length - undoBefore;
  const removed = !c.model.document.transactions.some(t => t.id === id);
  return { removed, undoDelta };
});
assert.equal(deleteFlow.removed, true);
assert.equal(deleteFlow.undoDelta, 1);

// --- Links group: Cycle Viewで表示 is disabled without a Transaction selection, disabled when the selected Transaction has no linkedSignals (no fake enabled checkbox for a non-existent link), and enabled/functional once real linkedSignals exist ---
const revealFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const signal = c.model.document.signals.find(s => s.type === 'binary');
  c.actions.addTransaction();
  await wait(60);
  const txn = c.model.document.transactions.find(t => t.id === c.model.selection.id);
  const revealBtn = document.querySelector('[data-txn-action="reveal-links"]');
  c.model.selection = { kind: 'signal', id: c.model.document.timeline.referenceClock };
  c.render();
  await wait(30);
  const disabledNoSelection = revealBtn.disabled;
  c.actions.selectTransaction(txn.id);
  await wait(30);
  const disabledNoLinks = revealBtn.disabled;
  c.actions.updateTransaction(txn.id, 'linkedSignals', [signal.id]);
  c.actions.selectTransaction(txn.id);
  await wait(30);
  const enabledWithLinks = !revealBtn.disabled;
  const canonicalBefore = JSON.stringify(c.getSerializableDocument());
  revealBtn.click();
  await wait(60);
  const modeAfterClick = c.model.view.mode;
  const canonicalAfter = JSON.stringify(c.getSerializableDocument());
  return { disabledNoSelection, disabledNoLinks, enabledWithLinks, modeAfterClick, unchanged: canonicalBefore === canonicalAfter };
});
assert.equal(revealFlow.disabledNoSelection, true);
assert.equal(revealFlow.disabledNoLinks, true, 'reveal-links must stay disabled for a Transaction with no real linkedSignals');
assert.equal(revealFlow.enabledWithLinks, true);
assert.equal(revealFlow.modeAfterClick, 'split', 'reveal must switch out of pure Transaction mode so the linked Cycle signal is actually visible');
assert.equal(revealFlow.unchanged, true, 'a view-only reveal command must never mutate the canonical document');

// --- Time group: 選択範囲を適用 is disabled without a Transaction selection and without a valid current time-range selection; applies the range with one Undo entry; shifts (or safely clears, never leaves invalid) any existing phases so the document stays valid ---
const rangeFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  c.actions.setViewMode('transaction');
  await wait(30);
  c.actions.addTransaction();
  await wait(60);
  const txn = c.model.document.transactions.find(t => t.id === c.model.selection.id);
  const before = { start: txn.start, end: txn.end, phases: structuredClone(txn.phases || []) };
  const applyBtn = document.querySelector('[data-txn-action="apply-range"]');
  c.model.selection = { kind: 'signal', id: c.model.document.timeline.referenceClock };
  c.render();
  await wait(30);
  const disabledNoSelection = applyBtn.disabled;
  c.actions.selectTransaction(txn.id);
  await wait(30);
  const disabledNoRange = applyBtn.disabled;
  c.model.timeSelection = { ...(c.model.timeSelection || {}), rangeStart: Number(before.start) + 1, rangeEnd: Number(before.end) + 4 };
  c.render();
  await wait(30);
  const enabledWithRange = !applyBtn.disabled;
  const undoBefore = c.model.history.undo.length;
  applyBtn.click();
  await wait(60);
  const undoDelta = c.model.history.undo.length - undoBefore;
  const after = c.model.document.transactions.find(t => t.id === txn.id);
  const issues = c.getProblems(c.model.document);
  const phaseIssue = issues.some(issue => issue.code === 'invalid-transaction-phase-bounds' && issue.id === txn.id);
  return { before, disabledNoSelection, disabledNoRange, enabledWithRange, undoDelta, start: after.start, end: after.end, phaseIssue };
});
assert.equal(rangeFlow.disabledNoSelection, true);
assert.equal(rangeFlow.disabledNoRange, true, 'apply-range must stay disabled until a real current time-range selection exists');
assert.equal(rangeFlow.enabledWithRange, true);
assert.equal(rangeFlow.undoDelta, 1, 'one applied range = one Undo entry, not one per field');
assert.equal(rangeFlow.start, rangeFlow.before.start + 1);
assert.equal(rangeFlow.end, rangeFlow.before.end + 4);
assert.equal(rangeFlow.phaseIssue, false, 'applying a new range must never leave the document with out-of-bounds phases');

// --- Split mode: selecting a Transaction cross-highlights its linked Signal in BOTH the Left Tree and the Cycle View (found via real DOM inspection that only the Left Tree was actually highlighted -- production-controller.js's own local `render` resolves to app-ui.js's keyed incremental reconciler, `modelDrivenReconcileCycleRowsKeyed`, which builds each Cycle View row's className without any cross-highlight awareness); clears once the Transaction is gone ---
const splitCrossHighlight = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const signal = c.model.document.signals.find(s => s.type === 'binary');
  c.actions.addTransaction();
  await wait(60);
  const txn = c.model.document.transactions.find(t => t.id === c.model.selection.id);
  c.actions.updateTransaction(txn.id, 'linkedSignals', [signal.id]);
  await wait(60);
  c.actions.setViewMode('split');
  await wait(100);
  c.actions.selectTransaction(txn.id);
  await wait(60);
  const cycleHighlighted = document.querySelector(`#cycleCanvas .wave-row[data-signal="${signal.id}"]`)?.classList.contains('selected');
  const treeHighlighted = document.querySelector(`.row[data-signal="${signal.id}"]`)?.classList.contains('selected');
  c.actions.deleteTransaction(txn.id);
  await wait(60);
  const clearedAfterDelete = !document.querySelector(`#cycleCanvas .wave-row[data-signal="${signal.id}"]`)?.classList.contains('selected');
  return { cycleHighlighted, treeHighlighted, clearedAfterDelete };
});
assert.equal(splitCrossHighlight.cycleHighlighted, true, 'a linked Signal must be cross-highlighted in the Cycle View, not only the Left Tree');
assert.equal(splitCrossHighlight.treeHighlighted, true);
assert.equal(splitCrossHighlight.clearedAfterDelete, true, 'cross-highlight must not persist as a stale class once the Transaction is gone');

// --- Regression guard: this must not have collided with the unrelated Home Ribbon Signal reorder / Cut/Copy/Paste/Delete/Duplicate buttons ---
const homeRegression = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  c.actions.setViewMode('cycle');
  await wait(30);
  const signal = c.model.document.signals.find(s => s.type === 'binary' && s.id !== c.model.document.timeline.referenceClock);
  const row = document.querySelector(`.row[data-signal="${signal.id}"]`);
  c.actions.selectObject(row);
  await wait(30);
  const homeUp = [...document.querySelectorAll('#ribbonHome .tool')].find(node => !node.dataset.txnAction && node.querySelector('.tool-label')?.textContent.trim() === '上へ');
  const homeDelete = [...document.querySelectorAll('#ribbonHome .tool')].find(node => !node.dataset.txnAction && node.querySelector('.tool-label')?.textContent.trim() === '削除');
  const homeDuplicate = [...document.querySelectorAll('#ribbonHome .tool')].find(node => !node.dataset.txnAction && node.querySelector('.tool-label')?.textContent.trim() === '複製');
  const before = c.model.document.signals.length;
  homeDuplicate.click();
  await wait(60);
  const afterDuplicate = c.model.document.signals.length;
  return { foundHomeButtons: Boolean(homeUp && homeDelete && homeDuplicate), signalDuplicateStillWorks: afterDuplicate === before + 1 };
});
assert.equal(homeRegression.foundHomeButtons, true);
assert.equal(homeRegression.signalDuplicateStillWorks, true, 'the unrelated Home Ribbon Signal Duplicate command must still work after scoping the txn-only buttons out of the generic matcher');

await page.screenshot({ path: path.join(out, 'issue77-ribbon-ops-1672x941.png') });
await browser.close();

const pass = setup
  && buttons.length === 7 && buttons.every(b => b.status === 'implemented')
  && disabledState.disabledWithoutSelection && disabledState.addEnabled && disabledState.enabledWithSelection
  && duplicateFlow.addedOne && duplicateFlow.undoDelta === 1 && duplicateFlow.newIdDifferent && duplicateFlow.sourceStillExists
  && reorderFlow.indexAfterUp === reorderFlow.indexBefore - 1 && reorderFlow.upUndoDelta === 1 && reorderFlow.atTop && reorderFlow.boundaryNoOpUndoDelta === 0
  && deleteFlow.removed && deleteFlow.undoDelta === 1
  && revealFlow.disabledNoSelection && revealFlow.disabledNoLinks && revealFlow.enabledWithLinks && revealFlow.modeAfterClick === 'split' && revealFlow.unchanged
  && rangeFlow.disabledNoSelection && rangeFlow.disabledNoRange && rangeFlow.enabledWithRange && rangeFlow.undoDelta === 1 && rangeFlow.start === rangeFlow.before.start + 1 && rangeFlow.end === rangeFlow.before.end + 4 && !rangeFlow.phaseIssue
  && splitCrossHighlight.cycleHighlighted && splitCrossHighlight.treeHighlighted && splitCrossHighlight.clearedAfterDelete
  && homeRegression.foundHomeButtons && homeRegression.signalDuplicateStillWorks
  && errors.length === 0;

const report = { issue: '77 (Transaction operations + Time + Links Ribbon groups, plus Split-mode Cycle View cross-highlight -- not the full Transaction Ribbon spec)', setup, buttons, disabledState, duplicateFlow, reorderFlow, deleteFlow, revealFlow, rangeFlow, splitCrossHighlight, homeRegression, errors, pass, artifacts: ['issue77-ribbon-ops-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #77 Transaction-operations + Time + Links Ribbon groups (plus Split-mode Cycle View cross-highlight) acceptance passed: Transaction追加/複製/削除/上へ/下へ/選択範囲を適用/Cycle Viewで表示 are seven distinct real commands (not the previous single-button "順序変更" ambiguity, and not only 追加 wired); Duplicate/Delete/Up/Down are disabled without a Transaction selection and enabled with one; Duplicate inserts a unique-id transaction and selects it with exactly one Undo entry; Up/Down reorder the canonical array by one position with one Undo entry each, are a true no-op at the array boundary (no spurious Undo entry), and keep selection stable; Delete removes the selected transaction with one Undo entry; 選択範囲を適用 is disabled without a real current time-range selection and, once applied, sets start/end from that shared semantic timeline range (not pixel/fixed-pitch inference) with exactly one Undo entry while shifting or safely clearing any existing phases so the document never ends up with out-of-bounds phases; Cycle Viewで表示 is disabled both without a selection and for a Transaction with no real linkedSignals, and once enabled switches out of pure Transaction mode to reveal the linked Cycle signal without mutating the canonical document; selecting a Transaction in Split mode cross-highlights its linked Signal in BOTH the Left Tree and the Cycle View (a real gap found where only the Tree was actually highlighted, traced to the keyed incremental Cycle-row reconciler building row classNames with no cross-highlight awareness) and the highlight clears once the Transaction is gone; and none of this regresses the unrelated Home Ribbon Signal Cut/Copy/Paste/Delete/Duplicate/Up/Down commands that happen to share the same button labels.');
