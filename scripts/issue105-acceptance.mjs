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

// --- Full reference layout at 1672x941 stays unchanged (no overflow triggers) ---
const fullPage = await openPage(1672, 941);
const fullState = await fullPage.evaluate(() => {
  const home = document.querySelector('#ribbonHome');
  return {
    band: window.TimingChartResponsiveRibbon.currentBand(),
    triggerCount: document.querySelectorAll('.ribbon-overflow-trigger').length,
    scrollNeeded: home.scrollWidth > home.clientWidth + 1,
  };
});
await fullPage.screenshot({ path: path.join(out, 'issue105-1672x941.png') });
await fullPage.close();

// --- Compact layout at 1280x720: core commands reachable without scrolling ---
const compactPage = await openPage(1280, 720);
const compactState = await compactPage.evaluate(() => {
  const home = document.querySelector('#ribbonHome');
  const homeRect = home.getBoundingClientRect();
  const coreLabels = ['Undo', 'Redo', 'Zoom', '全体表示'];
  const coreTools = coreLabels.map(text => [...home.querySelectorAll('.tool')].filter(t => t.textContent.includes(text))).flat();
  const coreReachable = coreTools.length > 0 && coreTools.every(t => {
    const rect = t.getBoundingClientRect();
    return rect.left >= homeRect.left - 1 && rect.right <= homeRect.right + 1;
  });
  const scrollNeeded = home.scrollWidth > home.clientWidth + 1;
  const triggers = [...document.querySelectorAll('.ribbon-overflow-trigger')].map(t => t.dataset.ribbonOverflowTrigger);
  const visibleGroupTitles = [...home.querySelectorAll(':scope > .rgroup')]
    .filter(g => !g.classList.contains('hidden'))
    .map(g => g.querySelector('.rgroup-title')?.textContent.trim());
  return { band: window.TimingChartResponsiveRibbon.currentBand(), coreReachable, scrollNeeded, triggers, visibleGroupTitles, coreToolCount: coreTools.length };
});

// Open one overflow menu (mouse), verify viewport-safe placement + moved (not cloned) controls, then keyboard-close it.
const overflowResult = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const trigger = document.querySelector('.ribbon-overflow-trigger[data-ribbon-overflow-trigger="レイアウト"]') || [...document.querySelectorAll('.ribbon-overflow-trigger')].find(t => t.dataset.ribbonOverflowTrigger === 'レイアウト');
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
await compactPage.screenshot({ path: path.join(out, 'issue105-1280x720.png') });

// --- Resize round-trip 1672 -> 1280 -> 1672 must not lose state or duplicate handlers ---
await compactPage.setViewportSize({ width: 1672, height: 941 });
await compactPage.waitForTimeout(150);
const restoredState = await compactPage.evaluate(() => {
  const home = document.querySelector('#ribbonHome');
  return {
    band: window.TimingChartResponsiveRibbon.currentBand(),
    triggerCount: document.querySelectorAll('.ribbon-overflow-trigger').length,
    scrollNeeded: home.scrollWidth > home.clientWidth + 1,
  };
});
await compactPage.setViewportSize({ width: 1280, height: 720 });
await compactPage.waitForTimeout(150);
const zoomClickResult = await compactPage.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  let calls = 0;
  const original = controller.actions.setZoom;
  controller.actions.setZoom = function (...args) { calls++; return original.apply(this, args); };
  const before = Math.round(controller.model.view.zoom * 100);
  const zoomPlus = [...document.querySelectorAll('#ribbonHome .tool')].find(t => t.textContent.includes('Zoom') && t.textContent.includes('＋'));
  zoomPlus.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  const after = Math.round(controller.model.view.zoom * 100);
  controller.actions.setZoom = original;
  return { calls, before, after };
});

// --- Tab switching resets ribbon scroll to a predictable position ---
const tabSwitchState = await compactPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const home = document.querySelector('#ribbonHome');
  home.scrollLeft = 999;
  const insertTab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === '挿入');
  insertTab?.click();
  await wait(30);
  const insertRibbon = document.querySelector('#ribbonInsert');
  const insertScrollAfterShow = insertRibbon ? insertRibbon.scrollLeft : null;
  const homeTab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === 'ホーム');
  homeTab?.click();
  await wait(30);
  return { homeScrollAfterReturn: home.scrollLeft, insertScrollAfterShow };
});

await browser.close();

const pass = fullState.band === 'full'
  && fullState.triggerCount === 0
  && compactState.band === 'compact'
  && compactState.coreReachable === true
  && compactState.scrollNeeded === false
  && compactState.coreToolCount > 0
  && compactState.visibleGroupTitles.includes('ファイル')
  && compactState.visibleGroupTitles.includes('編集')
  && compactState.visibleGroupTitles.includes('ズーム')
  && compactState.triggers.length > 0
  && overflowResult.opened === true
  && overflowResult.withinViewport === true
  && overflowResult.tools.length > 0
  && overflowResult.tools.every(t => t.hasTitle)
  && overflowResult.ariaExpanded === 'true'
  && afterEscape.openCount === 0
  && afterEscape.focusedIsTrigger === true
  && restoredState.band === 'full'
  && restoredState.triggerCount === 0
  && zoomClickResult.calls === 1
  && zoomClickResult.after === zoomClickResult.before + 10
  && tabSwitchState.homeScrollAfterReturn === 0
  && errors.length === 0;

const report = {
  issue: 105,
  fullState,
  compactState,
  overflowResult,
  afterEscape,
  restoredState,
  zoomClickResult,
  tabSwitchState,
  errors,
  pass,
  artifacts: ['issue105-1672x941.png', 'issue105-1280x720.png'],
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #105 acceptance passed: responsive Ribbon overflow keeps core Home commands reachable at 1280px without horizontal scrolling, preserves the 1672px reference layout, and survives resize round-trips without duplicating handlers.');
