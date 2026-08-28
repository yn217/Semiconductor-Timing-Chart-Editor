import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue87');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(400);

const snapshot = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const status = document.querySelector('.status > span');
  return { document: JSON.stringify(c.getSerializableDocument()), history: c.model.history.undo.length, redo: c.model.history.redo.length, dirty: c.model.persistence.dirty, fileName: c.model.persistence.fileName, operation: { ...c.model.persistence.operation }, status: { text: status?.textContent || '', result: status?.dataset.operationResult || '', action: status?.dataset.operationAction || '' } };
});
const report = { issue: 87, cases: {}, errors: [] };

const beforeOpen = await snapshot();
await page.evaluate(() => window.TimingChartProductionController.actions.requestOpen({ text: '{ invalid json', fileName: 'broken.tcd', unsavedDecision: 'discard' }));
const invalidOpen = await snapshot();
report.cases.invalidJsonOpen = { documentUnchanged: invalidOpen.document === beforeOpen.document, historyUnchanged: invalidOpen.history === beforeOpen.history, visibleError: invalidOpen.status.result === 'error' && /Could not open|Invalid JSON/.test(invalidOpen.status.text + invalidOpen.operation.detail), pass: invalidOpen.document === beforeOpen.document && invalidOpen.history === beforeOpen.history && invalidOpen.status.result === 'error' };

await page.evaluate(() => window.TimingChartProductionController.actions.requestOpen({ text: JSON.stringify({ formatVersion: 1, timeline: { cycleCount: 2 }, signals: [] }), fileName: 'unsupported.tcd', unsavedDecision: 'discard' }));
const invalidCanonical = await snapshot();
report.cases.invalidCanonicalOpen = { visibleReason: invalidCanonical.status.result === 'error' && invalidCanonical.operation.detail.includes('Invalid .tcd document'), documentUnchanged: invalidCanonical.document === beforeOpen.document, pass: invalidCanonical.status.result === 'error' && invalidCanonical.document === beforeOpen.document };

await page.evaluate(() => { const c = window.TimingChartProductionController; const annotation = c.model.document.annotations[0]; annotation.start.signal = 'missing_for_save'; c.render(); });
const beforeBlockedSave = await snapshot();
await page.evaluate(() => window.TimingChartProductionController.actions.save());
const blockedSave = await snapshot();
report.cases.validationBlockedSave = { pickerNotNeeded: await page.evaluate(() => !window.__issue87SavePickerCalled), visibleFailure: blockedSave.status.result === 'error', problemsAction: blockedSave.status.action === 'problems', documentUnchanged: blockedSave.document === beforeBlockedSave.document, pass: blockedSave.status.result === 'error' && blockedSave.status.action === 'problems' && blockedSave.document === beforeBlockedSave.document };
await page.locator('.status > span').first().click();
await page.waitForTimeout(30);
report.cases.problemsNavigation = { tab: await page.evaluate(() => window.TimingChartProductionController.model.view.tab), pass: await page.evaluate(() => window.TimingChartProductionController.model.view.tab) === 'problems' };

await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.document.annotations[0].start.signal = 'req_valid'; c.render(); });
await page.evaluate(() => { window.showSaveFilePicker = async ({ suggestedName }) => { window.__issue87SavePickerCalled = true; return { name: suggestedName, createWritable: async () => ({ write: async () => {}, close: async () => {} }) }; }; });
await page.evaluate(() => window.TimingChartProductionController.actions.saveAs({ fileName: 'saved-87.tcd' }));
const saved = await snapshot();
report.cases.successfulSave = { pickerCalled: await page.evaluate(() => Boolean(window.__issue87SavePickerCalled)), confirmation: saved.status.result === 'success' && saved.status.text.includes('saved-87.tcd'), clean: saved.dirty === false, pass: saved.status.result === 'success' && saved.status.text.includes('saved-87.tcd') && saved.dirty === false };

await page.evaluate(() => { window.showOpenFilePicker = async () => { throw new DOMException('The user aborted a request.', 'AbortError'); }; });
await page.evaluate(() => window.TimingChartProductionController.actions.requestOpen());
const canceledOpen = await snapshot();
report.cases.cancelOpen = { neutral: canceledOpen.status.result === 'neutral', noError: !canceledOpen.operation.detail, pass: canceledOpen.status.result === 'neutral' && !canceledOpen.operation.detail };
await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('The user aborted a request.', 'AbortError'); }; });
await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.persistence.dirty = true; c.render(); });
await page.evaluate(() => window.TimingChartProductionController.actions.saveAs());
const canceledSave = await snapshot();
report.cases.cancelSave = { neutral: canceledSave.status.result === 'neutral', dirtyRetained: canceledSave.dirty === true, pass: canceledSave.status.result === 'neutral' && canceledSave.dirty === true };

await page.evaluate(() => { window.showSaveFilePicker = async ({ suggestedName }) => ({ name: suggestedName, createWritable: async () => ({ write: async () => {}, close: async () => {} }) }); });
await page.evaluate(() => window.TimingChartProductionController.actions.saveAs({ fileName: 'clean-87.tcd' }));
const clean = await snapshot();
const unload = await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); const dispatched = window.dispatchEvent(event); return { defaultPrevented: event.defaultPrevented, dispatched }; });
report.cases.cleanAfterSave = { dirty: clean.dirty, guardRemoved: unload.defaultPrevented === false, pass: clean.dirty === false && unload.defaultPrevented === false };

await page.evaluate(() => { const c = window.TimingChartProductionController; c.actions.addSignalValue('req_valid'); });
const dirty = await snapshot();
const dirtyUnload = await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
report.cases.dirtyBeforeUnload = { dirty: dirty.dirty, guardActive: dirtyUnload, pass: dirty.dirty === true && dirtyUnload === true };

report.errors = errors;
report.pass = Object.values(report.cases).every(item => item.pass === true) && errors.length === 0;
await page.screenshot({ path: path.join(out, 'issue87-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #87 acceptance passed: visible file-operation feedback, failed-operation atomicity, picker cancellation, and dirty beforeunload protection.');
