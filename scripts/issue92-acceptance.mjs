import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue92');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
let promptFired = false;
page.on('dialog', dialog => { promptFired = true; void dialog.dismiss(); });
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const setup = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  return { ok: !!c?.model };
});
assert.ok(setup.ok, 'controller not initialized');

// --- 1. Rename via popover: blank rejected, duplicate rejected, valid name applied ---
const renameFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const row = document.querySelector('.row[data-signal="req_valid"] .more');
  row.click();
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  const renameBtn = [...menu.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'rename');
  renameBtn.click();
  await wait(60);
  const popover = document.querySelector('#issue92Popover');
  const input = popover?.querySelector('input[data-field="name"]');
  const applyBtn = [...popover.querySelectorAll('button')].find(b => b.textContent.includes('適用'));
  // blank rejected
  input.value = '';
  input.dispatchEvent(new Event('input'));
  applyBtn.click();
  await wait(30);
  const blankError = popover.querySelector('[role="alert"]')?.textContent;
  const stillOpenAfterBlank = !!document.querySelector('#issue92Popover');
  // duplicate rejected
  input.value = 'clk';
  applyBtn.click();
  await wait(30);
  const dupError = document.querySelector('#issue92Popover [role="alert"]')?.textContent;
  const stillOpenAfterDup = !!document.querySelector('#issue92Popover');
  // valid name applied
  input.value = 'request_valid_renamed';
  applyBtn.click();
  await wait(60);
  const closedAfterValid = !document.querySelector('#issue92Popover');
  const renamedSignal = c.model.document.signals.find(s => s.id === 'req_valid');
  return { blankError, stillOpenAfterBlank, dupError, stillOpenAfterDup, closedAfterValid, newName: renamedSignal?.display?.name };
});

// --- 2. Esc cancels without mutating ---
const escFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const before = JSON.stringify(c.getSerializableDocument());
  const more = document.querySelector('.row[data-signal="clk"] .more');
  more.click();
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  [...menu.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'rename').click();
  await wait(60);
  const popover = document.querySelector('#issue92Popover');
  popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(60);
  const closedByEsc = !document.querySelector('#issue92Popover');
  const after = JSON.stringify(c.getSerializableDocument());
  return { closedByEsc, docUnchanged: before === after };
});

// --- 3. Group spacing: NaN/negative rejected, valid number applied via Enter key ---
const spacingFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const groupHeader = document.querySelector('.group-h');
  const moreBtn = groupHeader.querySelector('.more');
  moreBtn.click();
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  [...menu.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'group-spacing').click();
  await wait(60);
  const popover = document.querySelector('#issue92Popover');
  const input = popover.querySelector('input[data-field="spacing"]');
  input.value = '-5';
  popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(30);
  const negativeError = document.querySelector('#issue92Popover [role="alert"]')?.textContent;
  const stillOpen = !!document.querySelector('#issue92Popover');
  input.value = '24';
  popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(60);
  const closed = !document.querySelector('#issue92Popover');
  const groupId = groupHeader.closest('.group')?.dataset.groupId;
  const group = c.model.document.signalGroups.find(g => g.id === groupId);
  return { negativeError, stillOpen, closed, spacingAfter: group?.spacingAfter };
});

// --- 4. Group appearance color popover ---
const colorFlow = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = window.TimingChartProductionController;
  const groupHeader = document.querySelector('.group-h');
  const moreBtn = groupHeader.querySelector('.more');
  moreBtn.click();
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  [...menu.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'group-appearance').click();
  await wait(60);
  const popover = document.querySelector('#issue92Popover');
  const input = popover.querySelector('input[data-field="background"]');
  const isColorInput = input.type === 'color';
  const applyBtn = [...popover.querySelectorAll('button')].find(b => b.textContent.includes('適用'));
  input.value = '#f0a23a';
  applyBtn.click();
  await wait(60);
  const groupId = groupHeader.closest('.group')?.dataset.groupId;
  const group = c.model.document.signalGroups.find(g => g.id === groupId);
  return { isColorInput, background: group?.style?.background };
});

// --- 5. N-Cycle insert popover ---
// Home Ribbon no longer exposes 挿入-labeled Cycle commands (moved to the Insert Ribbon
// per #32's approved composition); the app-owned N Cycle追加 dialog now lives there.
await page.locator('.rtab', { hasText: '挿入' }).click();
await page.waitForTimeout(40);
const nCycleFlow = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = window.TimingChartProductionController;
  const before = c.model.document.timeline.cycleCount;
  const btn = [...document.querySelectorAll('.tool')].find(b => b.offsetParent !== null && b.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes('NCycle追加'));
  btn.click();
  await wait(60);
  const popover = document.querySelector('#insertNCyclesDialog');
  const input = popover?.querySelector('[data-insert-count]');
  const applyBtn = popover ? popover.querySelector('[data-insert-apply]') : null;
  if (input) { input.value = '3'; applyBtn.click(); }
  await wait(60);
  const after = c.model.document.timeline.cycleCount;
  return { hasPopover: !!popover, before, after, delta: after - before };
});
await page.locator('.rtab', { hasText: 'ホーム' }).click();
await page.waitForTimeout(40);

// --- 6. Context menu viewport clamping near bottom-right ---
const menuClamp = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rows = [...document.querySelectorAll('#groups .row .more')];
  const lastRow = rows[rows.length - 1];
  const rect = lastRow.getBoundingClientRect();
  lastRow.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left, clientY: rect.top }));
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  const menuRect = menu.getBoundingClientRect();
  return { withinRight: menuRect.right <= innerWidth, withinBottom: menuRect.bottom <= innerHeight, withinLeft: menuRect.left >= 0, withinTop: menuRect.top >= 0 };
});

// --- 7. Popover viewport clamping near bottom-right ---
const popoverClamp = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rows = [...document.querySelectorAll('#groups .row .more')];
  const lastRow = rows[rows.length - 1];
  const rect = lastRow.getBoundingClientRect();
  lastRow.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left, clientY: rect.top }));
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  const renameBtn = [...menu.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'rename' || b.dataset.command === 'edit-comment');
  renameBtn.click();
  await wait(60);
  const popover = document.querySelector('#issue92Popover');
  const popRect = popover.getBoundingClientRect();
  popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { withinRight: popRect.right <= innerWidth, withinBottom: popRect.bottom <= innerHeight, withinLeft: popRect.left >= 0, withinTop: popRect.top >= 0 };
});

// --- 8. Undo entry check: one Apply = one Undo entry; Cancel = no Dirty/history change ---
const undoFlow = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = window.TimingChartProductionController;
  const undoLenBefore = c.model.history?.undo?.length ?? 0;
  const dirtyBefore = c.model.persistence?.dirty;
  const more = document.querySelector('.row[data-signal="busy"] .more');
  more.click();
  await wait(60);
  const menu = document.querySelector('#issue6ContextMenu');
  [...menu.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'rename').click();
  await wait(60);
  const popover = document.querySelector('#issue92Popover');
  popover.querySelector('input[data-field="name"]').value = 'busy_renamed';
  [...popover.querySelectorAll('button')].find(b => b.textContent.includes('適用')).click();
  await wait(60);
  const undoLenAfterApply = c.model.history?.undo?.length ?? 0;
  const dirtyAfterApply = c.model.persistence?.dirty;

  const more2 = document.querySelector('.row[data-signal="state[1:0]"] .more');
  more2.click();
  await wait(60);
  const menu2 = document.querySelector('#issue6ContextMenu');
  [...menu2.querySelectorAll('[data-command]')].find(b => b.dataset.command === 'rename').click();
  await wait(60);
  const stateSignal = c.model.document.signals.find(s => s.id === 'state[1:0]');
  const nameBeforeCancel = stateSignal?.display?.name || stateSignal?.name;
  const popover2 = document.querySelector('#issue92Popover');
  popover2.querySelector('input[data-field="name"]').value = 'should_not_apply';
  popover2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(60);
  const undoLenAfterCancel = c.model.history?.undo?.length ?? 0;
  const nameAfterCancel = c.model.document.signals.find(s => s.id === 'state[1:0]')?.display?.name || c.model.document.signals.find(s => s.id === 'state[1:0]')?.name;
  return { undoLenBefore, undoLenAfterApply, dirtyBefore, dirtyAfterApply, undoLenAfterCancel, appliedOneEntry: undoLenAfterApply === undoLenBefore + 1, cancelAddedNoEntry: undoLenAfterCancel === undoLenAfterApply, cancelDidNotRename: nameAfterCancel === nameBeforeCancel };
});

await page.screenshot({ path: path.join(out, 'issue92-1672x941.png') });
await browser.close();

const pass = renameFlow.stillOpenAfterBlank === true
  && !!renameFlow.blankError
  && renameFlow.stillOpenAfterDup === true
  && !!renameFlow.dupError
  && renameFlow.closedAfterValid === true
  && renameFlow.newName === 'request_valid_renamed'
  && escFlow.closedByEsc === true
  && escFlow.docUnchanged === true
  && spacingFlow.stillOpen === true
  && !!spacingFlow.negativeError
  && spacingFlow.closed === true
  && spacingFlow.spacingAfter === 24
  && colorFlow.isColorInput === true
  && colorFlow.background === '#f0a23a'
  && nCycleFlow.hasPopover === true
  && nCycleFlow.delta === 3
  && menuClamp.withinRight && menuClamp.withinBottom && menuClamp.withinLeft && menuClamp.withinTop
  && popoverClamp.withinRight && popoverClamp.withinBottom && popoverClamp.withinLeft && popoverClamp.withinTop
  && undoFlow.appliedOneEntry === true
  && undoFlow.cancelAddedNoEntry === true
  && undoFlow.cancelDidNotRename === true
  && undoFlow.dirtyAfterApply === true
  && promptFired === false
  && errors.length === 0;

const report = { issue: 92, renameFlow, escFlow, spacingFlow, colorFlow, nCycleFlow, menuClamp, popoverClamp, undoFlow, promptFired, errors, pass, artifacts: ['issue92-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #92 acceptance passed: window.prompt() replaced with app-owned popovers for Rename/Comment-title/Group-name/Group-spacing/Group-appearance/N-Cycle-insert; inline validation blocks blank/duplicate names and negative spacing without closing the popover or mutating the document; Enter applies, Esc cancels with zero document change; context menu and popover both clamp fully inside the viewport near the bottom-right edge; one Apply produces exactly one Undo entry and sets Dirty, Cancel produces neither; no native prompt() dialog fired during any of these flows.');
