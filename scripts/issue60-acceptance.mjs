import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue60');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const checks = {};
const observations = [];
const invoke = async (selector, expectedChange = true, action = 'click') => {
  const observation = await page.evaluate(async ({ selector, expectedChange, action }) => {
    const controller = window.TimingChartProductionController;
    const audit = controller.controlBehaviorAudit;
    const element = document.querySelector(selector);
    if (!element) return { result: 'FAIL', label: selector, reason: 'control not found' };
    if (element.disabled || element.readOnly) return { result: 'FAIL', label: element.textContent || selector, reason: 'control disabled/read-only' };
    const before = audit.snapshot();
    if (action === 'change') element.dispatchEvent(new Event('change', { bubbles: true })); else element.click();
    await new Promise(resolve => setTimeout(resolve, 45));
    const after = audit.snapshot();
    return audit.observe(element, before, after, { action, expectedChange });
  }, { selector, expectedChange, action });
  observations.push(observation);
  return observation;
};
const invokeLabel = async (label, expectedChange = true) => page.evaluate(async ({ label, expectedChange }) => {
  const controller = window.TimingChartProductionController;
  const audit = controller.controlBehaviorAudit;
  const element = [...document.querySelectorAll('#ribbonHome .tool')].find(node => (node.querySelector('.tool-label')?.textContent || node.textContent || '').replace(/\s+/g, '').includes(label.replace(/\s+/g, '')));
  if (!element) return { result: 'FAIL', label, reason: 'home control not found' };
  const before = audit.snapshot(); element.click(); await new Promise(resolve => setTimeout(resolve, 45)); const after = audit.snapshot();
  return audit.observe(element, before, after, { expectedChange });
}, { label, expectedChange });
const invokeRibbonTab = async label => page.evaluate(async label => {
  const controller = window.TimingChartProductionController; const audit = controller.controlBehaviorAudit;
  const element = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(node => node.textContent.trim() === label);
  if (!element) return { result: 'FAIL', label, reason: 'ribbon tab not found' };
  const before = audit.snapshot(); element.click(); await new Promise(resolve => setTimeout(resolve, 45)); const after = audit.snapshot();
  return audit.observe(element, before, after, { expectedChange: true });
}, label);
const passed = result => result?.result === 'PASS';

const initialAudit = await page.evaluate(() => window.TimingChartProductionController.controlBehaviorAudit.scan());
checks.noMetadataOnlyUnknownControls = initialAudit.unknown.length === 0;
checks.contractInventoryHasObservableOwners = initialAudit.entries.length > 0 && initialAudit.entries.every(entry => entry.owner && entry.expected);

let ribbonPass = true;
for (const label of ['ファイル', 'ホーム', '挿入', '注釈', '表示', 'チェック', 'AI']) ribbonPass = passed(await invokeRibbonTab(label)) && ribbonPass;
checks.ribbonTabs = ribbonPass;

let modePass = true;
for (const mode of ['transaction', 'cycle', 'split']) modePass = passed(await invoke(`.view-mode .seg[data-mode="${mode}"]`)) && modePass;
checks.viewModes = modePass;

let tabPass = true;
for (const tab of ['annotation', 'problems', 'json', 'signal']) tabPass = passed(await invoke(`#bottomTabs [data-tab="${tab}"]`)) && tabPass;
checks.bottomTabs = tabPass;

await page.evaluate(() => window.TimingChartProductionController.actions.setViewMode('cycle'));
await page.waitForTimeout(40);
await page.evaluate(() => window.TimingChartProductionController.actions.setZoom(170));
const homeResults = {};
for (const label of ['Zoom−', 'Zoom＋', '全体表示', '選択に合わせる']) homeResults[label] = passed(await invokeLabel(label));
checks.homeViewCommands = Object.values(homeResults).every(Boolean);

await page.locator('#ribbonViewTab').count().catch(() => 0);
await page.locator('.ribbon-tabs .rtab').filter({ hasText: '表示' }).click();
await page.waitForTimeout(40);
await page.evaluate(() => window.TimingChartProductionController.actions.setPathDisplayMode('relative'));
await page.waitForTimeout(40);
const viewCommands = ['grid', 'snap', 'ruler', 'minimap', 'signal-name', 'role', 'bus-width', 'instance-path', 'comment-overlay', 'annotation-overlay', 'edge-counter', 'signal-only', 'relative', 'full-path', 'split-columns', 'inspector', 'left-panel', 'bottom-panel', 'waveform-only', 'zoom-minus', 'zoom-reset', 'zoom-plus', 'fit-all', 'fit-selection'];
const viewResults = {};
for (const command of viewCommands) {
  const node = page.locator(`#ribbonView [data-view-command="${command}"]`);
  if (await node.count() && await node.isVisible() && !(await node.isDisabled())) viewResults[command] = passed(await invoke(`#ribbonView [data-view-command="${command}"]`));
}
checks.viewCommands = Object.keys(viewResults).length >= 20 && Object.values(viewResults).every(Boolean);
await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.view.panels = { ...c.model.view.panels, left: true, inspector: true, bottom: true, waveformOnly: false }; c.render(); });
await page.waitForTimeout(50);

await page.locator('.ribbon-tabs .rtab').filter({ hasText: '挿入' }).click();
await page.waitForTimeout(40);
const insertResults = {};
insertResults.addSignalMenu = passed(await invoke('#ribbonInsert [data-insert-command="add-signal"]'));
for (const kind of ['binary', 'bus', 'state', 'clock']) {
  insertResults[`add-${kind}`] = passed(await invoke(`#insertSignalMenu [data-insert-menu-command="${kind}"]`));
  await page.locator('#ribbonInsert [data-insert-command="add-signal"]').click();
  await page.waitForTimeout(15);
}
for (const command of ['add-comment', 'add-spacer', 'add-group', 'add-marker', 'add-range', 'add-text', 'add-callout', 'add-dependency', 'insert-cycle', 'full-path', 'bulk-add']) {
  const node = page.locator(`#ribbonInsert [data-insert-command="${command}"]`);
  if (await node.count() && await node.isVisible() && !(await node.isDisabled())) insertResults[command] = passed(await invoke(`#ribbonInsert [data-insert-command="${command}"]`));
}
if (await page.locator('[data-full-path-dialog] [data-path-close]').count()) await page.locator('[data-full-path-dialog] [data-path-close]').click();
await page.waitForTimeout(20);
insertResults.nCycleDialog = passed(await invoke('#ribbonInsert [data-insert-command="insert-n-cycles"]'));
if (await page.locator('#insertNCyclesDialog [data-insert-apply]').count()) { await page.locator('#insertNCyclesDialog [data-insert-apply]').click(); await page.waitForTimeout(40); }
checks.insertCommands = Object.keys(insertResults).length >= 12 && Object.values(insertResults).every(Boolean);

await page.locator('[data-tab="annotation"]').click();
await page.waitForTimeout(40);
await page.locator('.ribbon-tabs .rtab').filter({ hasText: '注釈' }).click();
await page.waitForTimeout(40);
await page.evaluate(() => { const c = window.TimingChartProductionController; const item = c.model.document.annotations.find(annotation => annotation.id === c.model.selection.id) || c.model.document.annotations[0]; if (item) { const anchor = item.anchor || item.start; if (anchor) anchor.offset = { x: 17, y: 0 }; item.color = '#aa0000'; c.model.selection = { kind: 'annotation', id: item.id }; c.render(); } });
const annotationResults = {};
for (const command of ['duplicate', 'snap', 'start-anchor', 'reset-offset', 'straight', 'orthogonal', 'curve', 'diagonal', 'arrow-none', 'arrow-end', 'arrow-both', 'color', 'visible', 'label-left', 'label-center', 'label-right', 'wrap', 'multiline', 'hide']) {
  const node = page.locator(`#ribbonAnnotation [data-annotation-command="${command}"]`);
  if (await node.count() && await node.isVisible() && !(await node.isDisabled())) annotationResults[command] = passed(await invoke(`#ribbonAnnotation [data-annotation-command="${command}"]`));
}
checks.annotationCommands = Object.keys(annotationResults).length >= 8 && Object.values(annotationResults).every(Boolean);

await page.locator('[data-tab="problems"]').click();
await page.waitForTimeout(30);
await page.evaluate(() => { const c = window.TimingChartProductionController; const a = c.model.document.annotations[0]; if (a) a.start.signal = 'missing_signal_for_issue60'; c.render(); });
await page.waitForTimeout(40);
const problemFilters = {};
for (const filter of ['err', 'warn', 'info', 'all']) {
  const node = page.locator(`#bottomContent [data-problem-filter="${filter}"]`);
  if (await node.count()) problemFilters[filter] = passed(await invoke(`#bottomContent [data-problem-filter="${filter}"]`));
}
problemFilters.refresh = passed(await invoke('#bottomContent [data-problem-action="refresh"]'));
checks.problemsFiltersAndRefresh = Object.keys(problemFilters).length === 5 && Object.values(problemFilters).every(Boolean);

await page.locator('[data-tab="json"]').click();
await page.waitForTimeout(35);
const jsonResults = {};
for (const action of ['format', 'validate', 'copy']) jsonResults[action] = passed(await invoke(`#bottomContent [data-json-action="${action}"]`));
const jsonUnsupported = await page.evaluate(() => [...document.querySelectorAll('#bottomContent [data-json-action="import"], #bottomContent [data-json-action="export"]')].map(node => ({ disabled: node.disabled, label: node.textContent.trim() })));
checks.jsonActions = Object.values(jsonResults).every(Boolean) && jsonUnsupported.length === 2 && jsonUnsupported.every(item => item.disabled);

await page.locator('.ribbon-tabs .rtab').filter({ hasText: 'ホーム' }).click();
await page.waitForTimeout(30);
await page.evaluate(() => window.TimingChartProductionController.model.persistence.dirty = false);
const newResult = await invokeLabel('新規');
checks.newThroughUserEvent = passed(newResult) && (await page.evaluate(() => window.TimingChartProductionController.model.document.document.id)) === 'untitled.tcd';

const docForOpen = await page.evaluate(() => { const doc = structuredClone(window.TimingChartProductionController.getSerializableDocument()); doc.document.id = 'issue60-opened.tcd'; return doc; });
const openBefore = await page.evaluate(() => window.TimingChartProductionController.controlBehaviorAudit.snapshot());
await page.evaluate(doc => { window.showOpenFilePicker = async () => [{ name: 'issue60-opened.tcd', getFile: async () => new File([JSON.stringify(doc)], 'issue60-opened.tcd', { type: 'application/json' }) }]; }, docForOpen);
await page.locator('#ribbonHome .tool').filter({ hasText: '開く' }).click();
await page.waitForTimeout(100);
const openAfter = await page.evaluate(() => window.TimingChartProductionController.controlBehaviorAudit.snapshot());
checks.openThroughUserEvent = (await page.evaluate(() => window.TimingChartProductionController.model.document.document.id)) === 'issue60-opened.tcd' && JSON.stringify(openBefore) !== JSON.stringify(openAfter);

await page.evaluate(() => { window.showSaveFilePicker = async ({ suggestedName }) => ({ name: suggestedName, createWritable: async () => ({ write: async () => {}, close: async () => {} }) }); });
const downloads = {};
for (const [key, text] of [['saveAs', '名前を付けて保存'], ['save', '保存']]) {
  await page.evaluate(key => { const c = window.TimingChartProductionController; c.model.document.document.title = `Issue60 ${key}`; c.model.persistence.dirty = true; }, key);
  const before = await page.evaluate(() => window.TimingChartProductionController.controlBehaviorAudit.snapshot());
  const saveObservation = await invokeLabel(text);
  await page.waitForTimeout(30);
  const after = await page.evaluate(() => window.TimingChartProductionController.controlBehaviorAudit.snapshot());
  downloads[key] = passed(saveObservation);
  downloads[`${key}Changed`] = JSON.stringify(before) !== JSON.stringify(after) || (await page.evaluate(() => window.TimingChartProductionController.model.persistence.dirty)) === false;
}
checks.saveThroughUserEvent = downloads.saveAs && downloads.save && downloads.saveAsChanged && downloads.saveChanged;

const report = await page.evaluate(({ initialAudit, checks, observations, viewResults, insertResults, annotationResults, problemFilters, jsonResults, jsonUnsupported, downloads }) => ({
  issue: 60,
  checks,
  inventory: { totalEnabled: initialAudit.entries.length, unknown: initialAudit.unknown, contracts: initialAudit.entries },
  observations,
  audit: { metrics: window.TimingChartProductionController.controlBehaviorAudit.metrics, failures: window.TimingChartProductionController.controlBehaviorAudit.failures },
  viewResults, insertResults, annotationResults, problemFilters, jsonResults, jsonUnsupported, downloads,
  errors: [],
  pass: Object.values(checks).every(Boolean)
}), { initialAudit, checks, observations, viewResults, insertResults, annotationResults, problemFilters, jsonResults, jsonUnsupported, downloads });
report.errors = errors;
report.pass = report.pass && errors.length === 0 && report.inventory.unknown.length === 0;
await page.screenshot({ path: path.join(out, 'issue60-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #60 acceptance passed: ${report.observations.filter(item => item.result === 'PASS').length} observable browser actions; ${report.inventory.totalEnabled} enabled controls inventoried.`);
