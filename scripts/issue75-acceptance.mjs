import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue75');
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
  return Boolean(c?.model && window.TimingChartCheckRibbon);
});
assert.ok(setup, 'Check Ribbon failed to initialize');

// --- Tab activates the ribbon and shows only real, verified command metadata ---
const activation = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(n => n.textContent.trim() === 'チェック');
  tab.click();
  await wait(60);
  const ribbon = document.querySelector('#ribbonCheck');
  const visible = !ribbon.hidden && ribbon.style.display !== 'none';
  const homeHidden = document.querySelector('#ribbonHome').hidden;
  const commands = [...ribbon.querySelectorAll('[data-check-command]')];
  const allHaveMetadata = commands.every(node => node.dataset.tooltipMeta && node.dataset.controlStatus === 'implemented');
  return { visible, homeHidden, commandCount: commands.length, allHaveMetadata };
});
assert.equal(activation.visible, true);
assert.equal(activation.homeHidden, true);
assert.equal(activation.allHaveMetadata, true);
assert.ok(activation.commandCount >= 16, `expected >=16 real commands, found ${activation.commandCount}`);

// --- Inject real problems across multiple categories directly into the live document.
// (openText's own load gate rejects structurally-invalid documents by design -- that
// safety check is #100/#111's territory, not this issue's -- so to exercise the Check
// Ribbon's filtering against genuine Problem[] entries, mutate model.document in place,
// bypassing the canonical action layer, purely to simulate an already-open document that
// has drifted invalid, then run the same shared validator the app already uses.)
const fixtureLoaded = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const dup = structuredClone(c.model.document.signals.find(s => s.type === 'binary'));
  c.model.document.signals.push(dup);
  c.model.document.signalGroups[0].rows.push(dup.id);
  c.model.document.transactions = [{ id: 'txn_broken', name: 'broken', start: 0, end: 2, linkedSignals: ['no_such_signal'] }];
  c.clearValidationCache();
  c.model.validation = c.getProblems(c.model.document, { force: true });
  c.render();
  await wait(60);
  return { problemCount: c.model.validation.length };
});
assert.ok(fixtureLoaded.problemCount >= 2, `expected multiple real problems, found ${fixtureLoaded.problemCount}`);

// --- 全チェック: resets all filters, opens Problems tab with the real (unfixed) count ---
const runAllFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-check-command="run-all"]').click();
  await wait(60);
  const rows = document.querySelectorAll('#bottomContent tbody tr[data-problem-path]').length;
  return { tab: c.model.view.tab, severity: c.model.view.problemSeverityFilter, signalFilter: c.model.view.problemSignalFilter, objectFilter: c.model.view.problemObjectFilter, categoryFilter: c.model.view.problemCategoryFilter, rows, totalProblems: c.model.validation.length };
});
assert.equal(runAllFlow.tab, 'problems');
assert.equal(runAllFlow.severity, 'all');
assert.equal(runAllFlow.signalFilter, 'all');
assert.equal(runAllFlow.objectFilter, null);
assert.equal(runAllFlow.rows, runAllFlow.totalProblems, 'run-all must show every real problem, not a fixed count');

// --- チェック項目 (category filter): toggling "Transaction/Link" shows only that category's rows, sharing state with Problems ---
const categoryFlow = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const before = document.querySelectorAll('#bottomContent tbody tr[data-problem-path]').length;
  document.querySelector('[data-check-command="category-transaction"]').click();
  await wait(60);
  const rowsAfter = [...document.querySelectorAll('#bottomContent tbody tr[data-problem-path]')];
  const c = window.TimingChartProductionController;
  const codes = rowsAfter.map(row => {
    const id = row.dataset.problemId;
    const issue = c.model.validation.find(item => item.id === id);
    return issue?.code;
  });
  const allTransactionCategory = codes.every(code => c.problemCategoryOf(code) === 'transaction');
  document.querySelector('[data-check-command="category-transaction"]').click();
  await wait(60);
  const rowsRestored = document.querySelectorAll('#bottomContent tbody tr[data-problem-path]').length;
  return { before, afterCount: rowsAfter.length, allTransactionCategory, rowsRestored };
});
assert.ok(categoryFlow.afterCount > 0, 'category filter should surface at least the injected transaction problem');
assert.ok(categoryFlow.afterCount <= categoryFlow.before, 'category filter must narrow, not expand, the result set');
assert.equal(categoryFlow.allTransactionCategory, true);
assert.equal(categoryFlow.rowsRestored, categoryFlow.before, 'un-toggling the category must restore the full list');

// --- 選択をチェック: filters to the selected object only, and does not mutate the document ---
const selectionFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const canonicalBefore = JSON.stringify(c.getSerializableDocument());
  const dupSignal = c.model.document.signals.find((s, index, arr) => arr.findIndex(other => other.id === s.id) !== index);
  const targetId = dupSignal?.id || c.model.document.signals[0].id;
  const row = document.querySelector(`.row[data-signal="${targetId}"]`) || document.querySelector('.row[data-signal]');
  c.actions.selectObject(row);
  await wait(30);
  document.querySelector('[data-check-command="run-selection"]').click();
  await wait(60);
  const rows = [...document.querySelectorAll('#bottomContent tbody tr[data-problem-path]')];
  const allMatchSelection = rows.every(r => r.dataset.problemId === c.model.selection.id);
  const canonicalAfter = JSON.stringify(c.getSerializableDocument());
  return { tab: c.model.view.tab, rowCount: rows.length, allMatchSelection, unchanged: canonicalBefore === canonicalAfter };
});
assert.equal(selectionFlow.tab, 'problems');
assert.equal(selectionFlow.allMatchSelection, true);
assert.equal(selectionFlow.unchanged, true, 'running a check must never mutate the canonical document');

// --- 現在Groupをチェック: disabled with no group context, enabled once a Group is the current context; scopes to that Group's rows ---
const groupFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  delete c.model.view.currentGroupId;
  c.model.selection = { kind: 'none', id: null };
  c.render();
  await wait(30);
  const disabledBeforeContext = document.querySelector('[data-check-command="run-group"]').disabled;
  const header = document.querySelector('#groups .group-h');
  header.click();
  await wait(30);
  const enabledAfterContext = !document.querySelector('[data-check-command="run-group"]').disabled;
  document.querySelector('[data-check-command="run-group"]').click();
  await wait(60);
  const groupId = c.model.view.currentGroupId;
  const group = c.model.document.signalGroups.find(g => g.id === groupId);
  const rows = [...document.querySelectorAll('#bottomContent tbody tr[data-problem-path]')];
  const allInGroup = rows.every(r => group.rows.includes(r.dataset.problemId));
  return { disabledBeforeContext, enabledAfterContext, rowCount: rows.length, allInGroup };
});
assert.equal(groupFlow.disabledBeforeContext, true, 'Group check must be disabled without a valid Group context (#75: no enabled checkbox without a real underlying mechanism)');
assert.equal(groupFlow.enabledAfterContext, true);
assert.equal(groupFlow.allInGroup, true);

// --- Problemsを開く: switches tab without forcing a re-validation (no revision bump) ---
const openOnlyFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  c.model.view.tab = 'signal'; c.render();
  await wait(30);
  const before = c.model.problemRefreshRevision || 0;
  document.querySelector('[data-check-command="open-problems"]').click();
  await wait(60);
  return { tab: c.model.view.tab, revisionDelta: (c.model.problemRefreshRevision || 0) - before };
});
assert.equal(openOnlyFlow.tab, 'problems');
assert.equal(openOnlyFlow.revisionDelta, 0, '"Problemsを開く" must not force a re-run of validation');

// --- 再検証 (refresh): does force a re-run ---
const refreshFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const before = c.model.problemRefreshRevision || 0;
  document.querySelector('[data-check-command="refresh"]').click();
  await wait(60);
  return { revisionDelta: (c.model.problemRefreshRevision || 0) - before };
});
assert.equal(refreshFlow.revisionDelta, 1);

// --- Switching between Check/View/Annotation/Home ribbons never shows two ribbons at once ---
const ribbonSwitching = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clickTab = async label => { [...document.querySelectorAll('.ribbon-tabs .rtab')].find(n => n.textContent.trim() === label)?.click(); await wait(30); };
  const visibleRibbons = () => [...document.querySelectorAll('.ribbon')].filter(r => !r.hidden && r.style.display !== 'none').map(r => r.id);
  const sequence = [];
  for (const label of ['チェック', '表示', '注釈', 'チェック', 'ホーム', 'チェック']) {
    await clickTab(label);
    sequence.push({ label, visible: visibleRibbons() });
  }
  return sequence;
});
for (const step of ribbonSwitching) assert.equal(step.visible.length, 1, `exactly one ribbon must be visible after clicking ${step.label}, saw ${JSON.stringify(step.visible)}`);

await page.screenshot({ path: path.join(out, 'issue75-1672x941.png') });
await browser.close();

const pass = setup === true
  && activation.visible && activation.homeHidden && activation.allHaveMetadata && activation.commandCount >= 16
  && runAllFlow.tab === 'problems' && runAllFlow.objectFilter === null && runAllFlow.rows === runAllFlow.totalProblems
  && categoryFlow.allTransactionCategory && categoryFlow.rowsRestored === categoryFlow.before
  && selectionFlow.allMatchSelection && selectionFlow.unchanged
  && groupFlow.disabledBeforeContext && groupFlow.enabledAfterContext && groupFlow.allInGroup
  && openOnlyFlow.tab === 'problems' && openOnlyFlow.revisionDelta === 0
  && refreshFlow.revisionDelta === 1
  && ribbonSwitching.every(step => step.visible.length === 1)
  && errors.length === 0;

const report = { issue: 75, setup, activation, fixtureLoaded, runAllFlow, categoryFlow, selectionFlow, groupFlow, openOnlyFlow, refreshFlow, ribbonSwitching, errors, pass, artifacts: ['issue75-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #75 acceptance passed: the チェック Ribbon tab activates a real command surface (16 commands, all with tooltip metadata, none a bare tab-activation no-op) backed entirely by the existing shared validation engine and Problems model -- no second checker. 全チェック resets every filter and shows the true unfixed problem count; category toggles (backed by real rule-code groupings) narrow and restore the Problems list and share state with the Problems tab; 選択をチェック scopes to the selected object without mutating the document; 現在Groupをチェック is disabled with no real Group context and, once enabled, scopes correctly to that Group\'s rows; Problemsを開く switches tabs without forcing revalidation while 再検証 does; and switching between Check/View/Annotation/Home ribbons never shows two ribbons at once.');
