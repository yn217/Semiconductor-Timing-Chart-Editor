import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue104');
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
  const model = c.model;
  const doc = structuredClone(c.getSerializableDocument());
  const seed = doc.signals.find(s => s.type !== 'commentRow' && s.type !== 'clock') || doc.signals[0];
  const group = doc.signalGroups[0];
  for (let i = 0; i < 55; i += 1) {
    const id = `kb_sig_${i}`;
    doc.signals.push({ ...structuredClone(seed), id, name: id, source: { instancePath: ['top'], signalName: id }, display: { name: id }, values: [{ start: 0, value: i % 2 }] });
    group.rows.push(id);
  }
  const opened = await c.actions.openText(JSON.stringify(doc), { fileName: 'issue104-fixture.tcd', unsavedDecision: 'discard' });
  await wait(150);
  return { opened, totalSignals: doc.signals.filter(s => s.type !== 'commentRow').length };
});
assert.ok(setup.opened, 'fixture failed to open');

// --- 1+9. Keyboard-only navigation from first to last visible row; focus in a text field must NOT trigger tree nav ---
const navFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const firstRow = document.querySelector('#groups .row[data-signal]');
  firstRow.focus();
  await wait(30);
  const startedOnFirst = document.activeElement === firstRow;

  // Typing an ArrowDown-equivalent inside the search input must not move tree focus.
  const search = document.querySelector('.search');
  search.focus();
  const beforeSearchFocus = document.activeElement;
  search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await wait(30);
  const focusUnchangedByEditableArrow = document.activeElement === beforeSearchFocus;
  search.blur();

  firstRow.focus();
  await wait(30);
  let steps = 0;
  const maxSteps = 400;
  while (steps < maxSteps) {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await wait(4);
    steps += 1;
    const rows = [...document.querySelectorAll('#groups .row[data-signal]:not([hidden])')];
    if (document.activeElement === rows[rows.length - 1]) break;
  }
  const rows = [...document.querySelectorAll('#groups .row[data-signal]:not([hidden])')];
  const reachedLast = document.activeElement === rows[rows.length - 1];
  const undoLenAfterNav = c.model.history?.undo?.length ?? 0;
  const docBefore = JSON.stringify(c.getSerializableDocument());

  // Home/End
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await wait(30);
  const groups = [...document.querySelectorAll('#groups .group-h, #groups .row[data-signal]:not([hidden])')];
  const atHome = document.activeElement === groups[0];
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  await wait(30);
  const visibleItems = [...document.querySelectorAll('#groups .group-h, #groups .row[data-signal]:not([hidden])')];
  const atEnd = document.activeElement === visibleItems[visibleItems.length - 1];
  const docAfter = JSON.stringify(c.getSerializableDocument());

  return { startedOnFirst, focusUnchangedByEditableArrow, reachedLast, steps, undoLenAfterNav, atHome, atEnd, docUnchangedByPureNav: docBefore === docAfter };
});

// --- 2. Up/Down skips hidden (display.visible=false, filtered by visibility='shown') rows ---
const filterSkip = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const model = c.model;
  const targetSignal = model.document.signals.find(s => s.id === 'kb_sig_16');
  targetSignal.display = { ...(targetSignal.display || {}), visible: false };
  model.view.leftFilter = { roles: [], types: [], visibility: 'shown' };
  c.render?.();
  await wait(100);
  const hiddenRowFilteredOut = document.querySelector('#groups .row[data-signal="kb_sig_16"]')?.hidden === true;
  const row15 = document.querySelector('#groups .row[data-signal="kb_sig_15"]');
  row15?.focus();
  await wait(30);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await wait(30);
  const skippedToNextVisible = document.activeElement?.dataset?.signal === 'kb_sig_17' && !document.activeElement.hidden;
  model.view.leftFilter = { roles: [], types: [], visibility: 'all' };
  targetSignal.display.visible = true;
  c.render?.();
  await wait(100);
  return { hiddenRowFilteredOut, skippedToNextVisible };
});

// --- 3. Left/Right collapse/expand groups without pointer ---
const collapseFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const header = document.querySelector('#groups .group-h');
  header.focus();
  await wait(30);
  header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await wait(60);
  const groupId = header.closest('.group')?.dataset.groupId;
  const collapsedAfterLeft = c.model.document.signalGroups.find(g => g.id === groupId)?.collapsed === true;
  const ariaExpandedFalse = document.querySelector(`.group[data-group-id="${groupId}"] .group-h`)?.getAttribute('aria-expanded') === 'false';
  document.querySelector(`.group[data-group-id="${groupId}"] .group-h`)?.focus();
  await wait(30);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(60);
  const expandedAfterRight = c.model.document.signalGroups.find(g => g.id === groupId)?.collapsed === false;
  return { collapsedAfterLeft, ariaExpandedFalse, expandedAfterRight };
});

// --- 4. Enter selects correct canonical ID ---
const enterFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const targetRow = document.querySelector('#groups .row[data-signal="kb_sig_10"]');
  targetRow.focus();
  await wait(30);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(80);
  return { selectedId: c.model.selection?.id, selectedKind: c.model.selection?.kind };
});

// --- 6. Collapsing a Group containing the focused child repairs focus ---
const collapseWithFocusedChild = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const childRow = document.querySelector('#groups .row[data-signal="kb_sig_15"]');
  childRow.focus();
  await wait(30);
  const groupId = childRow.closest('.group')?.dataset.groupId;
  c.actions.setGroupCollapsed(groupId, true);
  await wait(80);
  const focusRepaired = document.activeElement !== childRow && document.activeElement?.tabIndex === 0;
  const activeIsVisible = document.activeElement && !document.activeElement.hidden;
  c.actions.setGroupCollapsed(groupId, false);
  await wait(80);
  return { focusRepaired, activeIsVisible };
});

// --- 8. Shift+F10 opens context menu; focus returns to invoker on close ---
const contextMenuFlow = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const row = document.querySelector('#groups .row[data-signal="kb_sig_1"]');
  row.focus();
  await wait(30);
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
  await wait(80);
  const menu = document.querySelector('#issue6ContextMenu');
  const menuOpened = !!menu;
  menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(80);
  const menuClosed = !document.querySelector('#issue6ContextMenu');
  const focusReturned = document.activeElement === row;
  return { menuOpened, menuClosed, focusReturned };
});

// --- F2 rename opens popover on focused row ---
const f2Flow = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const row = document.querySelector('#groups .row[data-signal="kb_sig_3"]');
  row.focus();
  await wait(30);
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
  await wait(120);
  const popoverOpened = !!document.querySelector('#issue92Popover');
  document.querySelector('#issue92Popover')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return { popoverOpened };
});

// --- ARIA roles present ---
const ariaCheck = await page.evaluate(() => {
  const host = document.querySelector('#groups');
  const hasTreeRole = host?.getAttribute('role') === 'tree';
  const rowHasTreeitem = document.querySelector('#groups .row[data-signal]')?.getAttribute('role') === 'treeitem';
  const headerHasAriaExpanded = document.querySelector('#groups .group-h')?.hasAttribute('aria-expanded');
  const singleTabStop = document.querySelectorAll('#groups [tabindex="0"]').length === 1;
  return { hasTreeRole, rowHasTreeitem, headerHasAriaExpanded, singleTabStop };
});

await page.screenshot({ path: path.join(out, 'issue104-1672x941.png') });
await browser.close();

const pass = setup.opened === true
  && navFlow.startedOnFirst === true
  && navFlow.focusUnchangedByEditableArrow === true
  && navFlow.reachedLast === true
  && navFlow.undoLenAfterNav === 0
  && navFlow.atHome === true
  && navFlow.atEnd === true
  && navFlow.docUnchangedByPureNav === true
  && filterSkip.hiddenRowFilteredOut === true
  && filterSkip.skippedToNextVisible === true
  && collapseFlow.collapsedAfterLeft === true
  && collapseFlow.ariaExpandedFalse === true
  && collapseFlow.expandedAfterRight === true
  && enterFlow.selectedId === 'kb_sig_10'
  && enterFlow.selectedKind === 'signal'
  && collapseWithFocusedChild.focusRepaired === true
  && collapseWithFocusedChild.activeIsVisible === true
  && contextMenuFlow.menuOpened === true
  && contextMenuFlow.menuClosed === true
  && contextMenuFlow.focusReturned === true
  && f2Flow.popoverOpened === true
  && ariaCheck.hasTreeRole === true
  && ariaCheck.rowHasTreeitem === true
  && ariaCheck.headerHasAriaExpanded === true
  && ariaCheck.singleTabStop === true
  && errors.length === 0;

const report = { issue: 104, setup, navFlow, filterSkip, collapseFlow, enterFlow, collapseWithFocusedChild, contextMenuFlow, f2Flow, ariaCheck, errors, pass, artifacts: ['issue104-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #104 acceptance passed: keyboard-only roving-tabindex tree navigation across a 55-signal fixture (first-to-last via ArrowDown, Home/End), text-field focus does not trigger tree shortcuts, filtered rows are skipped, Left/Right collapse/expand Groups and flip aria-expanded, Enter selects the correct canonical ID, collapsing a Group containing the focused row repairs focus to a visible item, Shift+F10 opens the same context menu and returns focus to the invoking row on close, F2 opens the existing rename popover, and role=tree/treeitem/aria-expanded plus a single roving tabindex=0 are present -- with zero canonical mutation or Undo entries from pure navigation.');
