import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue84');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const follow = () => document.querySelector('#bottomTabs input[type="checkbox"]');
  const pin = () => document.querySelector('#bottomTabs .follow button');
  const state = () => ({ model: { follow: c.model.view.followSelection, pinned: c.model.view.pinned }, dom: { checked: follow()?.checked, ariaChecked: follow()?.getAttribute('aria-checked'), pressed: pin()?.getAttribute('aria-pressed'), state: pin()?.dataset.state } });
  const checks = {};
  const documentBefore = JSON.stringify(c.getSerializableDocument());
  const historyBefore = c.model.history.undo.length;
  checks.initialSync = follow()?.checked === c.model.view.followSelection && pin()?.getAttribute('aria-pressed') === String(c.model.view.pinned);
  pin().click(); await pause(25);
  const pinOn = state();
  checks.pinSynchronizes = pinOn.model.pinned === true && pinOn.model.follow === false && pinOn.dom.checked === false && pinOn.dom.pressed === 'true' && pinOn.dom.state === 'on';
  follow().click(); await pause(25);
  const followOn = state();
  checks.followSynchronizes = followOn.model.follow === true && followOn.model.pinned === false && followOn.dom.checked === true && followOn.dom.pressed === 'false' && followOn.dom.state === 'off';
  c.actions.setBottomTab('annotation'); c.actions.setPinned(true); await pause(20);
  const contextBefore = state();
  document.querySelector('#groups .row[data-signal="busy"]')?.click(); await pause(25);
  const contextAfter = state();
  checks.pinPreventsContextSwitch = c.model.selection.id === 'busy' && c.model.view.tab === 'annotation' && contextAfter.dom.checked === false && contextAfter.dom.pressed === 'true';
  const viewTab = [...document.querySelectorAll('.rtab')].find(node => node.textContent.trim() === '表示'); viewTab.click(); await pause(10);
  document.querySelector('#ribbonView [data-view-command="bottom-panel"]').click(); await pause(20);
  document.querySelector('#ribbonView [data-view-command="bottom-panel"]').click(); await pause(20);
  checks.hideShowPreservesControls = JSON.stringify(contextBefore) === JSON.stringify(state());
  c.actions.setFollowSelection(true); c.actions.setBottomTab('signal'); await pause(20);
  document.querySelector('#groups .row[data-signal="ready"]')?.click(); await pause(25);
  checks.followActuallyFollows = c.model.selection.id === 'ready' && c.model.view.tab === 'signal';
  c.actions.setPinned(true); await pause(15);
  const openSource = structuredClone(c.getSerializableDocument());
  const opened = await c.actions.openText(JSON.stringify(openSource), { fileName: 'issue84-open.tcd', unsavedDecision: 'discard' });
  checks.openClearsStalePin = opened && c.model.view.pinned === false && c.model.view.followSelection === true && pin().getAttribute('aria-pressed') === 'false' && follow().checked === true;
  checks.viewStateNoSemanticHistory = documentBefore === JSON.stringify(c.getSerializableDocument()) || c.model.history.undo.length === historyBefore;
  return { checks, states: { pinOn, followOn, contextBefore, contextAfter, final: state() } };
});

const report = { issue: 84, ...result, errors, pass: Object.values(result.checks).every(Boolean) && errors.length === 0, artifacts: ['issue84-1672x941.png'] };
await page.screenshot({ path: path.join(out, 'issue84-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #84 acceptance passed: ${Object.keys(result.checks).length} browser checks.`);
