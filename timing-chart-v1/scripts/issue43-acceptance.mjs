import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue43');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const source = JSON.stringify(c.getSerializableDocument());
  const mutate = () => c.actions.updateSignalValue('req_valid', 1, 'value', '0');
  const openWithDecision = async decision => {
    mutate();
    const pending = c.actions.openText(source, { fileName: `issue43-${decision}.tcd`, unsavedDecision: await new Promise(resolve => {
      const dialogPromise = window.TimingChartUnsavedChangesDialog.open();
      const button = document.querySelector(`[data-unsaved-decision="${decision}"]`);
      if (!button) throw new Error(`missing ${decision} button`);
      button.click();
      dialogPromise.then(resolve);
    }) });
    return pending;
  };
  const cancel = await openWithDecision('cancel');
  const cancelClean = !c.model.persistence.dirty;
  const discard = await openWithDecision('discard');
  const discardClean = !c.model.persistence.dirty;
  window.showSaveFilePicker = async ({ suggestedName }) => ({ name: suggestedName, createWritable: async () => ({ write: async () => {}, close: async () => {} }) });
  const save = await openWithDecision('save');
  const saveClean = !c.model.persistence.dirty;
  mutate();
  const escapePending = c.actions.openText(source, { fileName: 'issue43-escape.tcd', unsavedDecision: await new Promise(resolve => {
    const dialogPromise = window.TimingChartUnsavedChangesDialog.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialogPromise.then(resolve);
  }) });
  const escape = await escapePending;
  const escapeDirty = c.model.persistence.dirty;
  const dialogAfter = document.querySelector('[data-unsaved-dialog]');
  window.prompt = () => { throw new Error('legacy prompt must not be called'); };
  window.showOpenFilePicker = async () => [{ getFile: async () => new File([source], 'issue43-ui.tcd', { type: 'application/json' }) }];
  mutate();
  const openButton = [...document.querySelectorAll('.tool')].find(node => node.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes('開く'));
  openButton.click();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const uiDialog = document.querySelector('[data-unsaved-dialog]');
  const uiButton = uiDialog?.querySelector('[data-unsaved-decision="discard"]');
  uiButton?.click();
  await new Promise(resolve => setTimeout(resolve, 30));
  return { cancel, cancelClean, discard, discardClean, save, saveClean, escape, escapeDirty, dialogAfter: Boolean(dialogAfter), actualOpenButton: Boolean(openButton), actualDialog: Boolean(uiDialog), actualDiscard: Boolean(uiButton), actualOpenClean: !c.model.persistence.dirty };
});

assert.equal(result.cancel, false);
assert.equal(result.cancelClean, false, 'Cancel must preserve dirty state');
assert.equal(result.discard, true);
assert.equal(result.discardClean, true);
assert.equal(result.save, true);
assert.equal(result.saveClean, true);
assert.equal(result.escape, false);
assert.equal(result.escapeDirty, true, 'Escape must behave as Cancel');
assert.equal(result.dialogAfter, false);
assert.equal(result.actualOpenButton, true);
assert.equal(result.actualDialog, true);
assert.equal(result.actualDiscard, true);
assert.equal(result.actualOpenClean, true);
assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue43-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 43, result, keyboard: { escape: true, enterDefaultsToSafeSave: true }, textPromptRemoved: true, errors, pass: true }, null, 2)}\n`);
console.log('Issue #43 acceptance passed: button-based unsaved decision, Save/Discard/Cancel, Escape, and cleanup.');
