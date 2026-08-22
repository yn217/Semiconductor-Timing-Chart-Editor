import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue64');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const model = controller.model;
  const firstGroup = model.document.signalGroups[0];
  const groupId = firstGroup.id;
  const headerMenuButton = () => document.querySelector(`#groups .group[data-group-id="${CSS.escape(groupId)}"] .group-h`)?.lastElementChild;
  const openGroupMenu = async () => {
    headerMenuButton()?.click();
    await new Promise(resolve => setTimeout(resolve, 20));
    const menu = document.querySelector('#issue6ContextMenu');
    if (!menu) throw new Error('group context menu did not open');
    return menu;
  };
  return { groupId, initialRows: firstGroup.rows.length, openGroupMenu: null, helper: true };
});

const checks = {};
const clickCommand = async label => {
  const menu = page.locator('#issue6ContextMenu');
  await menu.getByRole('menuitem', { name: label, exact: true }).click();
  await page.waitForTimeout(40);
};
const openMenu = async () => {
  await page.locator(`#groups .group[data-group-id="${result.groupId}"] .group-h > :last-child`).click();
  await page.waitForTimeout(20);
  const menu = page.locator('#issue6ContextMenu');
  if (!(await menu.isVisible())) throw new Error('context menu is not visible');
  return menu;
};

let menu = await openMenu();
checks.menuItemHitTest = await menu.evaluate(element => {
  const button = element.querySelector('[data-command]');
  const rect = button.getBoundingClientRect();
  const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return Boolean(target?.closest('#issue6ContextMenu [data-command]')) && getComputedStyle(element).pointerEvents === 'auto';
});
await clickCommand('グループを折りたたむ / 展開');
checks.collapse = await page.evaluate(groupId => {
  const group = window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === groupId);
  const row = document.querySelector(`#groups .group[data-group-id="${CSS.escape(groupId)}"] .row`);
  return group?.collapsed === true && row?.hidden === true;
}, result.groupId);

await page.evaluate(groupId => {
  const group = window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === groupId);
  group.collapsed = false;
  window.TimingChartProductionController.render();
}, result.groupId);
menu = await openMenu();
await page.evaluate(() => {
  const menu = document.querySelector('#issue6ContextMenu');
  const center = document.querySelector('.center').getBoundingClientRect();
  menu.style.left = `${center.left + 10}px`;
  menu.style.top = `${center.top + 40}px`;
});
checks.overlapHitTest = await page.locator('#issue6ContextMenu').evaluate(element => {
  const button = element.querySelector('[data-command]');
  const rect = button.getBoundingClientRect();
  return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('#issue6ContextMenu') === element;
});
const rowsBefore = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(group => group.id === id).rows.length, result.groupId);
await clickCommand('Signalを追加');
checks.addSignalToExactGroup = await page.evaluate(({ id, before }) => {
  const group = window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === id);
  const added = group.rows.length === before + 1 && group.rows.at(-1) !== undefined;
  const signal = window.TimingChartProductionController.model.document.signals.find(item => item.id === group.rows.at(-1));
  return added && signal?.id === window.TimingChartProductionController.model.selection.id;
}, { id: result.groupId, before: rowsBefore });

menu = await openMenu();
page.once('dialog', dialog => dialog.accept('Renamed by E2E'));
await clickCommand('名前を変更');
checks.rename = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(group => group.id === id)?.name === 'Renamed by E2E', result.groupId);

menu = await openMenu();
page.once('dialog', dialog => dialog.accept('#abcdef'));
await clickCommand('Group Band / 背景設定');
checks.appearance = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(group => group.id === id)?.style?.background === '#abcdef', result.groupId);

menu = await openMenu();
page.once('dialog', dialog => dialog.accept('12'));
await clickCommand('グループ間隔設定');
checks.spacing = await page.evaluate(id => window.TimingChartProductionController.model.document.signalGroups.find(group => group.id === id)?.spacingAfter === 12, result.groupId);

menu = await openMenu();
await clickCommand('Comment Rowを追加');
checks.addComment = await page.evaluate(id => {
  const group = window.TimingChartProductionController.model.document.signalGroups.find(item => item.id === id);
  return group.rows.some(rowId => window.TimingChartProductionController.model.document.signals.find(signal => signal.id === rowId)?.type === 'commentRow');
}, result.groupId);
menu = await openMenu();
await clickCommand('Spacerを追加');
checks.addSpacer = await page.evaluate(id => (window.TimingChartProductionController.model.document.signalGroups.find(group => group.id === id)?.spacers?.length || 0) > 0, result.groupId);

menu = await openMenu();
await page.keyboard.press('Escape');
checks.escapeCloses = await page.locator('#issue6ContextMenu').count() === 0;
menu = await openMenu();
await page.locator('.center').click({ position: { x: 500, y: 120 } });
checks.outsideClickCloses = await page.locator('#issue6ContextMenu').count() === 0;

await page.screenshot({ path: path.join(out, 'issue64-1672x941.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await page.locator(`#groups .group[data-group-id="${result.groupId}"] .group-h > :last-child`).click();
await page.waitForTimeout(20);
checks.viewport1280Reachable = await page.locator('#issue6ContextMenu [data-command]').last().evaluate(button => { const rect = button.getBoundingClientRect(); return rect.right <= innerWidth && rect.bottom <= innerHeight; });
await page.screenshot({ path: path.join(out, 'issue64-1280x720.png') });
await browser.close();

const acceptance = { issue: 64, checks, errors, pass: Object.values(checks).every(Boolean) && errors.length === 0, artifacts: ['issue64-1672x941.png', 'issue64-1280x720.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log(`Issue #64 acceptance passed: ${Object.keys(checks).length} browser checks.`);
