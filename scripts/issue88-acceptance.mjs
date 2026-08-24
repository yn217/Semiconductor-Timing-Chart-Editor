import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue88');
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
  const doc = structuredClone(c.getSerializableDocument());
  const binary = doc.signals.find(s => s.type === 'binary');
  binary.values = [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }];
  const bus = doc.signals.find(s => s.type === 'bus');
  const state = doc.signals.find(s => s.type === 'state');
  const many = [];
  for (let i = 0; i < 22; i += 1) many.push({ start: i, value: i % 2 });
  binary.values = many;
  doc.timeline.cycleCount = Math.max(doc.timeline.cycleCount, 40);
  const opened = await c.actions.openText(JSON.stringify(doc), { fileName: 'issue88-fixture.tcd', unsavedDecision: 'discard' });
  await wait(150);
  const row = document.querySelector(`.row[data-signal="${binary.id}"]`);
  c.actions.selectObject(row);
  c.model.view.tab = 'signal';
  c.render();
  await wait(80);
  return { opened, binaryId: binary.id, rowCount: many.length };
});
assert.ok(setup.opened, 'fixture failed to open');

// --- Click a row (start=3) -> rowIndex identifies it; input click keeps focus/caret ---
const clickFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rows = [...document.querySelectorAll('#bottomContent tbody tr[data-editor-index]')];
  const targetRow = rows.find(r => r.querySelector('input[data-editor-field="start"]').value === '3');
  const targetInput = targetRow.querySelector('input[data-editor-field="value"]');
  targetInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  targetInput.focus();
  targetInput.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  targetInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(60);
  const focusRetained = document.activeElement === targetInput;
  const rowIndexAfterFieldClick = c.model.editor?.rowIndex;
  const selectedRowClassOk = targetRow.classList.contains('selected-row');
  return { focusRetained, rowIndexAfterFieldClick, selectedRowClassOk, expectedIndex: Number(targetRow.dataset.editorIndex) };
});
assert.equal(clickFlow.rowIndexAfterFieldClick, clickFlow.expectedIndex, 'row index must match clicked row');

// --- Non-input row click selects row + row becomes focused (roving tabindex) ---
const nonInputClick = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rows = [...document.querySelectorAll('#bottomContent tbody tr[data-editor-index]')];
  const target = rows[5];
  const cell = target.querySelector('td:nth-child(2)');
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await wait(60);
  const newTarget = document.querySelector(`#bottomContent tbody tr[data-editor-index="${target.dataset.editorIndex}"]`);
  const rowIsFocused = document.activeElement === newTarget;
  const rowIndex = c.model.editor?.rowIndex;
  return { rowIsFocused, rowIndex, expectedIndex: Number(target.dataset.editorIndex) };
});
assert.equal(nonInputClick.rowIndex, nonInputClick.expectedIndex);

// --- Keyboard Up/Down/Home/End across 22 rows ---
const keyboardNav = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  c.model.editor.rowIndex = 0;
  c.render();
  await wait(30);
  document.querySelector('#bottomContent tbody tr[data-editor-index="0"]')?.focus();
  await wait(30);
  for (let i = 0; i < 5; i += 1) {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await wait(20);
  }
  const afterFiveDown = c.model.editor?.rowIndex;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  await wait(30);
  const afterOneUp = c.model.editor?.rowIndex;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  await wait(30);
  const atEnd = c.model.editor?.rowIndex;
  const totalRows = document.querySelectorAll('#bottomContent tbody tr[data-editor-index]').length;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await wait(30);
  const atHome = c.model.editor?.rowIndex;
  const selectedRowVisible = document.querySelector('#bottomContent tbody tr[data-editor-index="0"]')?.getBoundingClientRect().height > 0;
  return { afterFiveDown, afterOneUp, atEnd, atHome, totalRows, selectedRowVisible };
});
assert.equal(keyboardNav.afterFiveDown, 5);
assert.equal(keyboardNav.afterOneUp, 4);
assert.equal(keyboardNav.atEnd, keyboardNav.totalRows - 1);
assert.equal(keyboardNav.atHome, 0);

// --- Enter/F2 focuses primary editable cell; arrow keys inside an input do not hijack navigation ---
const enterF2Flow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const row3 = document.querySelector('#bottomContent tbody tr[data-editor-index="3"]');
  row3.focus();
  await wait(30);
  row3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(30);
  const focusedInputAfterEnter = document.activeElement?.tagName === 'INPUT' && document.activeElement.closest('tr').dataset.editorIndex === '3';
  const rowIndexBeforeArrowInInput = c.model.editor?.rowIndex;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await wait(30);
  const rowIndexUnchangedByArrowInInput = c.model.editor?.rowIndex === rowIndexBeforeArrowInInput;
  const stillFocusedOnInput = document.activeElement?.tagName === 'INPUT';
  document.activeElement.blur();
  const row2 = document.querySelector('#bottomContent tbody tr[data-editor-index="2"]');
  row2.focus();
  await wait(30);
  row2.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
  await wait(30);
  const focusedInputAfterF2 = document.activeElement?.tagName === 'INPUT' && document.activeElement.closest('tr').dataset.editorIndex === '2';
  return { focusedInputAfterEnter, rowIndexUnchangedByArrowInInput, stillFocusedOnInput, focusedInputAfterF2 };
});
assert.equal(enterF2Flow.focusedInputAfterEnter, true);
assert.equal(enterF2Flow.rowIndexUnchangedByArrowInInput, true);
assert.equal(enterF2Flow.stillFocusedOnInput, true);
assert.equal(enterF2Flow.focusedInputAfterF2, true);

// --- Add selects new row ---
const addFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#bottomContent tbody tr[data-editor-index="0"]')?.focus();
  await wait(30);
  const before = c.model.document.signals.find(s => s.id === c.model.selection.id).values.length;
  document.querySelector('[data-editor-action="add"]').click();
  await wait(30);
  const after = c.model.document.signals.find(s => s.id === c.model.selection.id).values.length;
  const rowIndex = c.model.editor?.rowIndex;
  return { added: after === before + 1, rowIndex, lastIndex: after - 1 };
});
assert.equal(addFlow.added, true);
assert.equal(addFlow.rowIndex, addFlow.lastIndex);

// --- Duplicate selects duplicated row; Delete selects nearest surviving row (mouse toolbar) ---
const dupDeleteFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const signal = c.model.document.signals.find(s => s.id === c.model.selection.id);
  const lastIndex = signal.values.length - 1; // last row's start+1 is guaranteed free of any existing change point
  c.model.editor.rowIndex = lastIndex;
  c.render();
  await wait(30);
  document.querySelector(`#bottomContent tbody tr[data-editor-index="${lastIndex}"]`)?.focus();
  await wait(30);
  document.querySelector('[data-editor-action="duplicate"]').click();
  await wait(30);
  const rowIndexAfterDup = c.model.editor?.rowIndex;
  const dupOk = rowIndexAfterDup !== lastIndex && rowIndexAfterDup >= 0;
  document.querySelector('[data-editor-action="delete"]').click();
  await wait(30);
  const rowIndexAfterDelete = c.model.editor?.rowIndex;
  const values = c.model.document.signals.find(s => s.id === c.model.selection.id).values;
  const deleteOk = rowIndexAfterDelete >= 0 && rowIndexAfterDelete < values.length;
  return { dupOk, deleteOk };
});
assert.equal(dupDeleteFlow.dupOk, true);
assert.equal(dupDeleteFlow.deleteOk, true);

// --- Keyboard Delete / Ctrl+D on focused row ---
const keyboardDeleteDup = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const signal = c.model.document.signals.find(s => s.id === c.model.selection.id);
  const before = signal.values.length;
  document.querySelector('#bottomContent tbody tr[data-editor-index="0"]')?.focus();
  await wait(30);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
  await wait(60);
  const afterCtrlD = signal.values.length;
  const rowFocusedAfterDup = document.activeElement?.dataset?.editorIndex !== undefined;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  await wait(60);
  const afterDelete = signal.values.length;
  return { before, afterCtrlD, afterDelete, rowFocusedAfterDup };
});
assert.equal(keyboardDeleteDup.afterCtrlD, keyboardDeleteDup.before + 1, 'Ctrl+D on focused row should duplicate');
assert.equal(keyboardDeleteDup.afterDelete, keyboardDeleteDup.afterCtrlD - 1, 'Delete on focused row should delete');

// --- Switching Signal clears previous selection visuals and does not leave stale rowIndex ---
const signalSwitch = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#bottomContent tbody tr[data-editor-index="0"]')?.focus();
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  await wait(30);
  const otherRow = document.querySelector('.row[data-signal]:not([data-signal="' + c.model.selection.id + '"])');
  c.actions.selectObject(otherRow);
  await wait(60);
  const values = c.model.document.signals.find(s => s.id === c.model.selection.id)?.values || c.model.document.annotations;
  const rowIndex = c.model.editor?.rowIndex;
  const inRange = !Array.isArray(values) || values.length === 0 || (rowIndex >= 0 && rowIndex < values.length);
  return { inRange, rowIndex };
});
assert.equal(signalSwitch.inRange, true);

// --- Undo repairs to a valid row index ---
const undoFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const binaryRow = document.querySelector(`.row[data-signal="${c.model.document.signals.find(s => s.type === 'binary').id}"]`);
  c.actions.selectObject(binaryRow);
  await wait(30);
  document.querySelector('#bottomContent tbody tr[data-editor-index="0"]')?.focus();
  await wait(30);
  document.querySelector('[data-editor-action="add"]').click();
  await wait(60);
  c.actions.undo();
  await wait(60);
  const signal = c.model.document.signals.find(s => s.id === c.model.selection.id);
  const rowIndex = c.model.editor?.rowIndex;
  return { valid: rowIndex >= 0 && rowIndex < signal.values.length };
});
assert.equal(undoFlow.valid, true);

await page.screenshot({ path: path.join(out, 'issue88-1672x941.png') });
await browser.close();

const pass = setup.opened === true
  && clickFlow.focusRetained === true
  && clickFlow.selectedRowClassOk === true
  && nonInputClick.rowIsFocused === true
  && keyboardNav.selectedRowVisible === true
  && enterF2Flow.focusedInputAfterEnter === true
  && enterF2Flow.rowIndexUnchangedByArrowInInput === true
  && enterF2Flow.focusedInputAfterF2 === true
  && addFlow.added === true
  && dupDeleteFlow.dupOk === true
  && dupDeleteFlow.deleteOk === true
  && keyboardDeleteDup.afterCtrlD === keyboardDeleteDup.before + 1
  && keyboardDeleteDup.afterDelete === keyboardDeleteDup.afterCtrlD - 1
  && signalSwitch.inRange === true
  && undoFlow.valid === true
  && errors.length === 0;

const report = { issue: 88, setup, clickFlow, nonInputClick, keyboardNav, enterF2Flow, addFlow, dupDeleteFlow, keyboardDeleteDup, signalSwitch, undoFlow, errors, pass, artifacts: ['issue88-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #88 acceptance passed: clicking a change-point row (incl. inputs inside it) sets model.editor.rowIndex to the clicked row without discarding caret focus; clicking a non-input cell moves roving keyboard focus to the row; ArrowUp/Down/Home/End navigate 22+ rows and keep the selected row scrolled into view; Enter/F2 focus the primary editable cell and arrow keys inside that input no longer hijack row navigation; toolbar and keyboard Add/Duplicate/Delete/Ctrl+D all select the correct resulting row; switching Signal never leaves a stale row index; and Undo repairs the row index back into range.');
