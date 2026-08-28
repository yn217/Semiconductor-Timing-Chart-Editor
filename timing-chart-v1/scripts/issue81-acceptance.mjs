import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue81');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const setup = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const first = c.model.document.signalGroups[0];
  const second = c.model.document.signalGroups[1] || (c.actions.addGroup('Issue81 Second', { id: 'issue81_second' }), c.model.document.signalGroups.at(-1));
  const groupA = first.id;
  const groupB = second.id;
  c.actions.moveSignal('req_valid', groupB);
  c.actions.moveSignal('ready', groupA);
  c.actions.moveGroupBy(groupB, -1);
  return { groupA, groupB };
});

const openInsert = async () => {
  await page.locator('.rtab').filter({ hasText: '挿入' }).click();
  await page.waitForTimeout(20);
};
const clickInsertSignal = async menuCommand => {
  await page.locator('[data-insert-command="add-signal"]').click();
  await page.locator(`#insertSignalMenu [data-insert-menu-command="${menuCommand}"]`).click();
  await page.waitForTimeout(50);
};
await openInsert();

const beforeBinary = await page.evaluate(id => {
  const group = window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === id);
  return { rows: group.rows.length, history: window.TimingChartProductionController.model.history.undo.length };
}, setup.groupB);
await page.locator('#groups .row[data-signal="req_valid"]').click();
await clickInsertSignal('binary');
const binaryCheck = await page.evaluate(({ id, before }) => {
  const c = window.TimingChartProductionController;
  const group = c.model.document.signalGroups.find(item => item.id === id);
  const added = group.rows.at(-1);
  return { exactGroup: group.rows.length === before.rows + 1, selected: c.model.selection.id === added, history: c.model.history.undo.length === before.history + 1 };
}, { id: setup.groupB, before: beforeBinary });

await page.locator('#groups .row[data-signal="ready"]').click();
const beforeComment = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === id).rows.length, setup.groupA);
await page.locator('[data-insert-command="add-comment"]').click();
await page.waitForTimeout(50);
const commentCheck = await page.evaluate(({ id, before }) => {
  const c = window.TimingChartProductionController;
  const group = c.model.document.signalGroups.find(item => item.id === id);
  const last = c.model.document.signals.find(signal => signal.id === group.rows.at(-1));
  return group.rows.length === before + 1 && last?.type === 'commentRow' && c.model.selection.id === last.id;
}, { id: setup.groupA, before: beforeComment });

await page.locator(`#groups .group[data-group-id="${setup.groupB}"] .group-h > :last-child`).click();
await page.keyboard.press('Escape');
const currentGroupBeforeSpacer = await page.evaluate(() => window.TimingChartProductionController.model.view.currentGroupId);
const beforeSpacer = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === id).spacers?.length || 0, setup.groupB);
await page.locator('[data-insert-command="add-spacer"]').click();
await page.waitForTimeout(50);
const spacerState = await page.evaluate(({ id, before }) => { const c = window.TimingChartProductionController; const group = c.model.document.signalGroups.find(item => item.id === id); return { pass: (group.spacers?.length || 0) === before + 1, current: c.model.view.currentGroupId, groupSpacers: c.model.document.signalGroups.map(item => ({ id: item.id, count: item.spacers?.length || 0 })) }; }, { id: setup.groupB, before: beforeSpacer });
const spacerCheck = spacerState.pass;

await page.locator('#groups .row[data-signal="req_valid"]').click();
const beforeBus = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === id).rows.length, setup.groupB);
await clickInsertSignal('bus');
const reorderCheck = await page.evaluate(({ id, before }) => {
  const c = window.TimingChartProductionController;
  const group = c.model.document.signalGroups.find(item => item.id === id);
  const signal = c.model.document.signals.find(item => item.id === group.rows.at(-1));
  return group.rows.length === before + 1 && signal?.type === 'bus';
}, { id: setup.groupB, before: beforeBus });

const replacement = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const source = structuredClone(c.getSerializableDocument());
  source.signalGroups = [{ id: 'fresh_group', name: 'Fresh', rows: ['fresh_clk'], spacers: [], style: { background: '#eef5ff', opacity: 0.2, extend: 'both', showHeader: true }, spacingBefore: 0, spacingAfter: 0 }];
  source.signals = [{ id: 'fresh_clk', name: 'fresh_clk', type: 'clock', role: 'input', generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } }];
  source.annotations = [];
  source.transactions = [];
  source.timeline.referenceClock = 'fresh_clk';
  source.document.id = 'issue81-fresh.tcd';
  const opened = await c.actions.openText(JSON.stringify(source), { fileName: 'issue81-fresh.tcd', unsavedDecision: 'discard' });
  return { opened, lastError: c.model.persistence.lastError, staleCurrentGroup: c.model.view.currentGroupId, groupIds: c.model.document.signalGroups.map(group => group.id) };
});
await openInsert();
const beforeFresh = await page.evaluate(() => window.TimingChartProductionController.model.document.signalGroups[0].rows.length);
await clickInsertSignal('state');
const openCheck = await page.evaluate(before => {
  const c = window.TimingChartProductionController;
  const group = c.model.document.signalGroups[0];
  const signal = c.model.document.signals.find(item => item.id === group.rows.at(-1));
  return group.id === 'fresh_group' && group.rows.length === before + 1 && signal?.type === 'state';
}, beforeFresh);

const result = { checks: { binaryExactGroup: binaryCheck.exactGroup, binarySelection: binaryCheck.selected, oneHistoryEntry: binaryCheck.history, commentExactGroup: commentCheck, spacerExactGroup: spacerCheck, reorderStillTargetsOwner: reorderCheck, openRepairsStaleGroup: replacement.opened && openCheck }, details: { setup, binaryCheck, currentGroupBeforeSpacer, spacerState, replacement }, errors };
result.pass = Object.values(result.checks).every(Boolean) && errors.length === 0;
await page.screenshot({ path: path.join(out, 'issue81-1672x941.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await page.screenshot({ path: path.join(out, 'issue81-1280x720.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 81, ...result, artifacts: ['issue81-1672x941.png', 'issue81-1280x720.png'] }, null, 2)}\n`);
if (!result.pass) { console.error(JSON.stringify(result, null, 2)); process.exit(1); }
console.log(`Issue #81 acceptance passed: ${Object.keys(result.checks).length} browser checks.`);
