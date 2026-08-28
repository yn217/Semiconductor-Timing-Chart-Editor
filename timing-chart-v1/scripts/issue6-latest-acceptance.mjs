import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'artifacts', 'issue6');
await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const m = c.model;
  const groupId = 'group_issue6';
  c.actions.addGroup('Address / Data', { id: groupId, style: { background: '#eef5ff', opacity: 0.25, extend: 'both', showHeader: true } });
  c.actions.addSignal({ id: 'issue6_addr', name: 'addr[7:0]', type: 'bus', role: 'input', width: 8, values: [{ start: 0, value: '00' }] }, groupId);
  c.actions.addSignal({ id: 'issue6_data', name: 'long_data[31:0]', type: 'bus', role: 'output', width: 32, values: [{ start: 0, value: '0' }] }, groupId);
  const sourceBefore = structuredClone(m.document.signals.find(signal => signal.id === 'issue6_addr').source);
  const roleBefore = m.document.signals.find(signal => signal.id === 'issue6_addr').role;
  c.actions.setBusWidthMode('alignedColumn');
  c.actions.setBusWidthAlignment('right');
  c.actions.setSignalNameAlignment('center');
  c.actions.setSignalSpacing('issue6_addr', 'spacingBefore', 4);
  c.actions.setSignalSpacing('issue6_addr', 'spacingAfter', 5);
  c.actions.setGroupSpacing(groupId, 'spacingBefore', 7);
  c.actions.setGroupSpacing(groupId, 'spacingAfter', 9);
  c.actions.setGroupAppearance(groupId, { background: '#e8f2ff', opacity: 0.22, extend: 'both', showHeader: true });
  c.actions.addSpacer(groupId, 23);
  const moved = c.actions.moveSignal('issue6_addr', 'group_internal');
  const movedSignal = m.document.signals.find(signal => signal.id === 'issue6_addr');
  c.actions.moveSignal('issue6_addr', groupId);
  c.actions.setGroupCollapsed(groupId, true);
  const collapsed = document.querySelector(`#groups [data-group-id="${groupId}"] .row[data-signal="issue6_addr"]`)?.hidden === true;
  c.actions.setGroupCollapsed(groupId, false);
  c.actions.setLegendVisible(true);
  c.actions.setLegendOrientation('vertical');
  c.actions.moveLegend(13, -6);
  const serialized = c.getSerializableDocument();
  const menuTexts = [...document.querySelectorAll('#addMenu .menuitem')].map(item => item.textContent.trim());
  const rowMore = document.querySelector('#groups .row[data-signal="issue6_addr"] .more');
  rowMore?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 120 }));
  const rowMenu = [...document.querySelectorAll('#issue6ContextMenu button')].map(button => button.textContent);
  document.querySelector('#issue6ContextMenu')?.remove();
  const groupHeader = document.querySelector(`#groups [data-group-id="${groupId}"] .group-h`);
  groupHeader?.lastElementChild.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 120 }));
  const groupMenu = [...document.querySelectorAll('#issue6ContextMenu button')].map(button => button.textContent);
  document.querySelector('#issue6ContextMenu')?.remove();
  const saved = JSON.stringify(serialized);
  const reopened = await c.actions.openText(saved, { fileName: 'issue6.tcd', unsavedDecision: 'discard' });
  const reopenedLayout = m.document.layout;
  const reopenedGroup = m.document.signalGroups.find(group => group.id === groupId);
  return {
    checks: {
      bottomGroupAddRemoved: document.querySelector('.left-bottom .group-add') === null,
      canonicalGroupAddMenu: menuTexts.some(text => text.includes('信号')) && menuTexts.some(text => text.includes('コメント')) && menuTexts.some(text => text.includes('Spacer')) && menuTexts.some(text => text.includes('グループ')),
      rolePreservedOnMove: moved && movedSignal.role === roleBefore && JSON.stringify(movedSignal.source) === JSON.stringify(sourceBefore),
      busAlignedColumns: document.querySelectorAll('#groups .row[data-signal="issue6_addr"] .bus-width-column').length === 1 && document.querySelectorAll('#groups .row[data-signal="issue6_data"] .bus-width-column').length === 1,
      independentAlignment: m.document.layout.signalNameAlign === 'center' && m.document.layout.busWidthAlign === 'right',
      spacingAndSpacerPersisted: serialized.signals.find(signal => signal.id === 'issue6_addr').spacingBefore === 4 && serialized.signals.find(signal => signal.id === 'issue6_addr').spacingAfter === 5 && serialized.signalGroups.find(group => group.id === groupId).spacers.length === 1,
      groupBandPersisted: serialized.signalGroups.find(group => group.id === groupId).style.background === '#e8f2ff',
      collapsedRowsHide: collapsed,
      legendFreePosition: document.querySelector('#issue6Legend')?.style.left === '31px' && document.querySelector('#issue6Legend')?.style.top === '12px' && document.querySelector('#issue6Legend')?.style.display === 'grid',
      rowMenuCommands: rowMenu.includes('Role: Input') && rowMenu.includes('Inspectorを開く') && !rowMenu.some(text => text.includes('別グループ')),
      groupMenuCommands: groupMenu.includes('Group Band / 背景設定') && groupMenu.includes('Spacerを追加') && !groupMenu.some(text => text.includes('別グループ')),
      saveOpenLayout: reopened && reopenedLayout.busWidthMode === 'alignedColumn' && reopenedLayout.busWidthAlign === 'right' && reopenedGroup.spacers.length === 1
    },
    menuTexts,
    rowMenu,
    groupMenu,
    serialized
  };
});

await page.screenshot({ path: path.join(artifactDir, 'issue6-latest-1672x941.png'), fullPage: false });
await page.setViewportSize({ width: 1280, height: 720 });
await page.screenshot({ path: path.join(artifactDir, 'issue6-latest-1280x720.png'), fullPage: false });
await browser.close();
const failures = Object.entries(result.checks).filter(([, value]) => !value).map(([key]) => key);
const acceptance = { checks: result.checks, errors, pass: failures.length === 0 && errors.length === 0, artifacts: ['issue6-latest-1672x941.png', 'issue6-latest-1280x720.png'] };
await fs.writeFile(path.join(artifactDir, 'issue6-latest-acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log(`Issue #6 latest acceptance passed: ${Object.keys(result.checks).length} checks.`);
