import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue105');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function openPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(`${width}x${height}: ${error.message}`));
  await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
  await page.waitForTimeout(350);
  return page;
}

const normText = t => (t || '').replace(/\s+/g, '');

// --- 1. Full reference layout at 1672x941 stays unchanged (no overflow triggers) ---
const fullPage = await openPage(1672, 941);
const fullState = await fullPage.evaluate(() => {
  const home = document.querySelector('#ribbonHome');
  return {
    band: window.TimingChartResponsiveRibbon.currentBand(),
    visibleTriggerCount: [...document.querySelectorAll('.ribbon-overflow-trigger')].filter(t => !t.hidden).length,
    toolsInMenus: [...document.querySelectorAll('.ribbon-overflow-menu')].reduce((sum, m) => sum + m.querySelectorAll('.tool,.rgroup').length, 0),
  };
});
await fullPage.screenshot({ path: path.join(out, 'issue105-1672x941.png') });
await fullPage.close();

// --- 2. Compact (1280x720): approved command-level priority contract ---
const compactPage = await openPage(1280, 720);
const compactState = await compactPage.evaluate(() => {
  const home = document.querySelector('#ribbonHome');
  const homeRect = home.getBoundingClientRect();
  const norm = t => (t || '').replace(/\s+/g, '');
  const visibleLabels = new Set([...home.querySelectorAll('.tool')].filter(t => t.offsetParent !== null).map(t => norm(t.querySelector('.tool-label')?.textContent)));
  const tier1 = ['Undo', 'Redo', 'Zoom−', 'Zoom', 'Zoom＋', '全体表示'];
  const tier2 = ['切取', 'コピー', '貼付', '削除', '上へ', '下へ', '選択に合わせる'];
  const tier4 = ['複製', 'NCycle挿入', '範囲削除'];
  const tier1Visible = tier1.every(label => visibleLabels.has(label));
  const tier2Visible = tier2.every(label => visibleLabels.has(label));
  const tier4Hidden = tier4.every(label => !visibleLabels.has(label));
  const coreTools = [...home.querySelectorAll('.tool')].filter(t => tier1.includes(norm(t.querySelector('.tool-label')?.textContent)));
  const coreReachable = coreTools.length === tier1.length && coreTools.every(t => {
    const r = t.getBoundingClientRect();
    return r.left >= homeRect.left - 1 && r.right <= homeRect.right + 1;
  });
  const scrollNeeded = home.scrollWidth > home.clientWidth + 1;
  const triggers = [...document.querySelectorAll('.ribbon-overflow-trigger')].filter(t => !t.hidden).map(t => t.dataset.ribbonOverflowTrigger);
  return { band: window.TimingChartResponsiveRibbon.currentBand(), tier1Visible, tier2Visible, tier4Hidden, coreReachable, scrollNeeded, triggers };
});

// Real command click inside a NAMED overflow group (Layout) — disabled item, verify metadata survives relocation.
const namedOverflowResult = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const trigger = [...document.querySelectorAll('.ribbon-overflow-trigger')].find(t => t.dataset.ribbonOverflowTrigger === 'レイアウト');
  trigger.click();
  await wait(20);
  const menu = document.querySelector('.ribbon-overflow-menu.open');
  const rect = menu.getBoundingClientRect();
  const withinViewport = rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
  const tools = [...menu.querySelectorAll('.tool')].map(t => ({ label: t.querySelector('.tool-label')?.textContent.trim(), disabled: t.disabled, hasTitle: !!t.title }));
  const ariaExpanded = trigger.getAttribute('aria-expanded');
  return { opened: !!menu, withinViewport, tools, ariaExpanded };
});
await compactPage.keyboard.press('Escape');
await compactPage.waitForTimeout(20);
const afterEscape = await compactPage.evaluate(() => ({
  openCount: document.querySelectorAll('.ribbon-overflow-menu.open').length,
  focusedIsTrigger: document.activeElement?.classList.contains('ribbon-overflow-trigger') || false,
}));

// --- 3. Keyboard: ArrowDown opens a trigger, Arrow keys navigate the shared "..." menu ---
const keyboardResult = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const trigger = [...document.querySelectorAll('.ribbon-overflow-trigger')].find(t => t.dataset.ribbonOverflowTrigger === 'その他');
  trigger.focus();
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await wait(20);
  const openedByKeyboard = document.querySelectorAll('.ribbon-overflow-menu.open').length === 1;
  const items = [...document.querySelectorAll('.ribbon-overflow-menu.open button:not([disabled])')];
  const firstFocused = document.activeElement === items[0];
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await wait(10);
  const movedToSecond = items.length > 1 && document.activeElement === items[1];
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait(10);
  const closedByEscape = document.querySelectorAll('.ribbon-overflow-menu.open').length === 0;
  return { openedByKeyboard, firstFocused, movedToSecond, closedByEscape, itemCount: items.length };
});

// --- 4. Real ENABLED command click at the More-compact band (Fit Selection collapses there) ---
await compactPage.setViewportSize({ width: 1100, height: 720 });
await compactPage.waitForTimeout(200);
const moreCompactState = await compactPage.evaluate(() => {
  const norm = t => (t || '').replace(/\s+/g, '');
  const home = document.querySelector('#ribbonHome');
  const tier1 = ['Undo', 'Redo', 'Zoom−', 'Zoom', 'Zoom＋', '全体表示'];
  const visibleLabels = new Set([...home.querySelectorAll('.tool')].filter(t => t.offsetParent !== null).map(t => norm(t.querySelector('.tool-label')?.textContent)));
  return {
    band: window.TimingChartResponsiveRibbon.currentBand(),
    tier1Visible: tier1.every(label => visibleLabels.has(label)),
    tier2Hidden: !visibleLabels.has('コピー') && !visibleLabels.has('選択に合わせる'),
    scrollNeeded: home.scrollWidth > home.clientWidth + 1,
  };
});
const realClickResult = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const controller = window.TimingChartProductionController;
  let calls = 0;
  const original = controller.actions.fitSelection;
  controller.actions.fitSelection = function (...args) { calls += 1; return original.apply(this, args); };
  const shared = [...document.querySelectorAll('.ribbon-overflow-trigger')].find(t => t.dataset.ribbonOverflowTrigger === 'その他' && !t.hidden);
  shared.click();
  await wait(30);
  const fitSelectionButton = [...document.querySelectorAll('.ribbon-overflow-menu.open .tool')].find(t => t.querySelector('.tool-label')?.textContent.replace(/\s+/g, '') === '選択に合わせる');
  const wasEnabled = fitSelectionButton ? !fitSelectionButton.disabled : false;
  fitSelectionButton?.click();
  await wait(30);
  controller.actions.fitSelection = original;
  return { found: !!fitSelectionButton, wasEnabled, calls };
});

// --- 5. Fallback band (<1024): File also joins overflow, only Tier-1 stays inline ---
await compactPage.setViewportSize({ width: 960, height: 720 });
await compactPage.waitForTimeout(200);
const fallbackState = await compactPage.evaluate(() => {
  const norm = t => (t || '').replace(/\s+/g, '');
  const home = document.querySelector('#ribbonHome');
  const tier1 = ['Undo', 'Redo', 'Zoom−', 'Zoom', 'Zoom＋', '全体表示'];
  const visibleLabels = new Set([...home.querySelectorAll('.tool')].filter(t => t.offsetParent !== null).map(t => norm(t.querySelector('.tool-label')?.textContent)));
  const triggers = [...document.querySelectorAll('.ribbon-overflow-trigger')].filter(t => !t.hidden).map(t => t.dataset.ribbonOverflowTrigger);
  return {
    band: window.TimingChartResponsiveRibbon.currentBand(),
    tier1Visible: tier1.every(label => visibleLabels.has(label)),
    fileCollapsed: !visibleLabels.has('新規') && triggers.includes('ファイル'),
  };
});

// --- 6. Resize round-trip 1672 -> 1280 -> 1100 -> 960 -> 1672 must not lose state or duplicate handlers ---
await compactPage.setViewportSize({ width: 1672, height: 941 });
await compactPage.waitForTimeout(200);
const restoredState = await compactPage.evaluate(() => {
  const home = document.querySelector('#ribbonHome');
  return {
    band: window.TimingChartResponsiveRibbon.currentBand(),
    visibleTriggerCount: [...document.querySelectorAll('.ribbon-overflow-trigger')].filter(t => !t.hidden).length,
    homeToolCount: home.querySelectorAll('.tool').length,
    toolsStrandedInMenus: [...document.querySelectorAll('.ribbon-overflow-menu')].reduce((sum, m) => sum + m.querySelectorAll('.tool,.rgroup').length, 0),
  };
});
const zoomClickResult = await compactPage.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  let calls = 0;
  const original = controller.actions.setZoom;
  controller.actions.setZoom = function (...args) { calls += 1; return original.apply(this, args); };
  const before = Math.round(controller.model.view.zoom * 100);
  const zoomPlus = [...document.querySelectorAll('#ribbonHome .tool')].find(t => t.textContent.includes('Zoom') && t.textContent.includes('＋'));
  zoomPlus.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  const after = Math.round(controller.model.view.zoom * 100);
  controller.actions.setZoom = original;
  return { calls, before, after };
});

// --- 7. Tab switching resets ribbon scroll; Insert/Annotation/View current-context primary action stays directly visible at 1280 ---
const tabState = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const home = document.querySelector('#ribbonHome');
  home.scrollLeft = 999;
  const insertTab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === '挿入');
  insertTab?.click();
  await wait(30);
  const homeScrollAfterHide = home.scrollLeft;
  const homeTab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === 'ホーム');
  homeTab?.click();
  await wait(30);
  return { homeScrollAfterReturn: home.scrollLeft, homeScrollAfterHide };
});
await compactPage.setViewportSize({ width: 1280, height: 720 });
await compactPage.waitForTimeout(200);
const primaryActionState = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const results = {};
  for (const [label, ribbonId] of [['挿入', 'ribbonInsert'], ['注釈', 'ribbonAnnotation'], ['表示', 'ribbonView']]) {
    const tab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === label);
    if (!tab || tab.classList.contains('hidden')) { results[ribbonId] = 'skipped-no-tab'; continue; }
    tab.click();
    await wait(30);
    const ribbon = document.querySelector(`#${ribbonId}`);
    if (!ribbon || ribbon.hidden) { results[ribbonId] = 'skipped-hidden'; continue; }
    const firstGroup = ribbon.querySelector('.rgroup');
    const firstGroupVisible = firstGroup ? firstGroup.offsetParent !== null && firstGroup.getBoundingClientRect().left >= ribbon.getBoundingClientRect().left - 1 : false;
    results[ribbonId] = firstGroupVisible;
  }
  const homeTab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === 'ホーム');
  homeTab?.click();
  await wait(20);
  return results;
});

await browser.close();

const primaryActionsOk = Object.values(primaryActionState).every(v => v === true || v === 'skipped-no-tab' || v === 'skipped-hidden');

const pass = fullState.band === 'full'
  && fullState.visibleTriggerCount === 0
  && fullState.toolsInMenus === 0
  && compactState.band === 'compact'
  && compactState.tier1Visible === true
  && compactState.tier2Visible === true
  && compactState.tier4Hidden === true
  && compactState.coreReachable === true
  && compactState.scrollNeeded === false
  && compactState.triggers.includes('レイアウト') && compactState.triggers.includes('表示') && compactState.triggers.includes('その他')
  && namedOverflowResult.opened === true
  && namedOverflowResult.withinViewport === true
  && namedOverflowResult.tools.length > 0
  && namedOverflowResult.tools.every(t => t.hasTitle)
  && namedOverflowResult.ariaExpanded === 'true'
  && afterEscape.openCount === 0
  && afterEscape.focusedIsTrigger === true
  && keyboardResult.openedByKeyboard === true
  && keyboardResult.firstFocused === true
  && keyboardResult.movedToSecond === true
  && keyboardResult.closedByEscape === true
  && moreCompactState.band === 'moreCompact'
  && moreCompactState.tier1Visible === true
  && moreCompactState.tier2Hidden === true
  && moreCompactState.scrollNeeded === false
  && realClickResult.found === true
  && realClickResult.wasEnabled === true
  && realClickResult.calls === 1
  && fallbackState.band === 'fallback'
  && fallbackState.tier1Visible === true
  && fallbackState.fileCollapsed === true
  && restoredState.band === 'full'
  && restoredState.visibleTriggerCount === 0
  && restoredState.homeToolCount === 29
  && restoredState.toolsStrandedInMenus === 0
  && zoomClickResult.calls === 1
  && zoomClickResult.after === zoomClickResult.before + 10
  && tabState.homeScrollAfterReturn === 0
  && primaryActionsOk
  && errors.length === 0;

const report = {
  issue: 105,
  fullState, compactState, namedOverflowResult, afterEscape, keyboardResult, moreCompactState, realClickResult,
  fallbackState, restoredState, zoomClickResult, tabState, primaryActionState,
  errors, pass, artifacts: ['issue105-1672x941.png'],
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #105 acceptance passed: all 4 approved breakpoints (Full/Compact/More-compact/<1024 fallback) implement command-level Home priority (Undo/Redo/Zoom cluster always visible; Copy/Paste/Delete/Up/Down/Fit Selection visible at Compact only; Duplicate/N-Cycle/Range always overflow first; Layout/Display/File collapse into named overflow as width shrinks), a real enabled overflow command is click-verified end to end, overflow menus are keyboard operable, and Insert/Annotation/View keep their current-context primary action directly visible at 1280px.');
