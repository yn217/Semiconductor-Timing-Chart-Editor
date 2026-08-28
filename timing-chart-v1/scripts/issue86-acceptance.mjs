import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue86');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const state = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  return { history: c.model.history.undo.length, redo: c.model.history.redo.length, document: JSON.stringify(c.getSerializableDocument()), dirty: c.model.persistence.dirty };
});
const selectSignal = async id => {
  await page.evaluate(id => document.querySelector(`#groups .row[data-signal="${CSS.escape(id)}"]`)?.click(), id);
  await page.waitForTimeout(40);
};
const selectComment = async id => {
  await page.evaluate(id => document.querySelector(`#groups .row[data-signal="${CSS.escape(id)}"]`)?.click(), id);
  await page.waitForTimeout(40);
};

const report = { issue: 86, cases: {}, errors: [] };
const registrations = await page.evaluate(() => window.TimingChartShortcutRouter.registrations);
report.cases.registry = {
  singleRouter: registrations.length > 0,
  documentCommandsDeclared: ['document.undo', 'document.redo', 'document.redo-shift', 'document.save', 'document.save-as', 'document.open', 'document.new'].every(id => registrations.some(item => item.id === id)),
  scopesDeclared: registrations.every(item => item.scope && item.owner)
};

await selectComment('comment_01');
const comment = page.locator('#bottomContent input[data-comment-field="body"]');
await comment.fill('native text');
await comment.focus();
const commentBefore = await state();
await comment.press('Control+A');
await comment.press('Control+C');
await comment.press('Control+X');
assert.equal(await comment.inputValue(), '', 'Ctrl+X did not use native text selection');
await comment.press('Control+V');
assert.equal(await comment.inputValue(), 'native text', 'Ctrl+V did not use native clipboard behavior');
await comment.press('Control+Z');
const commentAfter = await state();
report.cases.commentNativeEditing = {
  textAfterNativeUndo: await comment.inputValue(),
  documentHistoryBefore: commentBefore.history,
  documentHistoryAfter: commentAfter.history,
  canonicalUnchanged: commentBefore.document === commentAfter.document,
  pass: await comment.inputValue() === '' && commentBefore.history === commentAfter.history && commentBefore.document === commentAfter.document
};

await selectSignal('req_valid');
const valueInput = page.locator('#bottomContent input[data-editor-field="value"]').first();
await valueInput.fill('0');
await valueInput.focus();
const valueBefore = await state();
await valueInput.press('Control+A');
await valueInput.press('Control+C');
await valueInput.press('Control+X');
await valueInput.press('Control+V');
const valueAfterNative = await state();
report.cases.signalValueNativeEditing = {
  value: await valueInput.inputValue(),
  documentHistoryBefore: valueBefore.history,
  documentHistoryAfter: valueAfterNative.history,
  canonicalUnchanged: valueBefore.document === valueAfterNative.document,
  pass: await valueInput.inputValue() === '0' && valueBefore.history === valueAfterNative.history && valueBefore.document === valueAfterNative.document
};

await valueInput.fill('1');
await valueInput.dispatchEvent('change');
await page.waitForTimeout(50);
const edited = await state();
await page.locator('#cycleCanvas').click({ position: { x: 600, y: 120 } });
await page.locator('#cycleCanvas').press('Control+Z');
await page.waitForTimeout(60);
const undone = await state();
report.cases.canvasUndo = {
  editCreatedHistory: edited.history > valueBefore.history,
  historyAfterUndo: undone.history,
  valueAfterUndo: await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid').values[0].value),
  pass: edited.history > valueBefore.history && undone.history < edited.history && String((await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid').values[0].value))) === '0'
};

await page.evaluate(() => { const row = document.querySelector('#groups .row[data-signal="req_valid"]'); row.tabIndex = 0; row.focus(); });
await page.locator('#groups .row[data-signal="req_valid"]').press('Control+Y');
await page.waitForTimeout(60);
const redone = await state();
report.cases.signalTreeRedo = {
  historyAfterRedo: redone.history,
  valueAfterRedo: await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid').values[0].value),
  pass: redone.history === edited.history && String((await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(signal => signal.id === 'req_valid').values[0].value))) === '1'
};

let saveCalled = false;
await page.evaluate(() => { window.showSaveFilePicker = async ({ suggestedName }) => ({ name: suggestedName, createWritable: async () => ({ write: async () => { window.__issue86SaveWrite = true; }, close: async () => {} }) }); });
await selectSignal('req_valid');
await page.evaluate(() => { window.TimingChartProductionController.model.persistence.dirty = true; });
const editableForSave = page.locator('#bottomContent input[data-editor-field="value"]').first();
await editableForSave.focus();
await editableForSave.press('Control+S');
await page.waitForTimeout(100);
saveCalled = await page.evaluate(() => Boolean(window.__issue86SaveWrite));
report.cases.ctrlSInEditable = { saveWriteCalled: saveCalled, dirtyAfter: await page.evaluate(() => window.TimingChartProductionController.model.persistence.dirty), pass: saveCalled };

await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.persistence.dirty = true; window.__issue86BeforeCompose = c.model.history.undo.length; });
await editableForSave.focus();
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))); 
await editableForSave.press('Control+Z');
const composition = await page.evaluate(() => ({ history: window.TimingChartProductionController.model.history.undo.length, before: window.__issue86BeforeCompose }));
report.cases.imeComposition = { historyUnchanged: composition.history === composition.before, pass: composition.history === composition.before };

report.registry = registrations;
report.errors = errors;
report.pass = Object.values(report.cases).every(item => item.pass !== false) && report.cases.registry.singleRouter && report.cases.registry.documentCommandsDeclared && report.cases.registry.scopesDeclared && errors.length === 0;
await page.screenshot({ path: path.join(out, 'issue86-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #86 acceptance passed: focus-aware shortcut routing, native editor behavior, document undo/redo, Ctrl+S, and IME guard.');
