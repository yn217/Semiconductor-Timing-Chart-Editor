import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue44');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const source = c.getSerializableDocument();
  const groups = source.signalGroups.map((group, groupIndex) => ({ ...group, rows: [...group.rows] }));
  const signals = [...source.signals];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    for (let rowIndex = 0; rowIndex < 24; rowIndex += 1) {
      const id = `issue44_g${groupIndex}_${rowIndex}`;
      signals.push({ id, name: id, type: rowIndex % 3 === 0 ? 'bus' : 'binary', role: groupIndex === 0 ? 'input' : groupIndex === 2 ? 'output' : 'internal', source: { instancePath: [], signalName: id }, display: { name: id }, ...(rowIndex % 3 === 0 ? { width: 8, displayFormat: 'hex', values: [{ start: 0, value: '00' }, { start: 4, value: 'FF' }] } : { values: [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }] }) });
      groups[groupIndex].rows.push(id);
    }
  }
  const fixture = { ...source, signalGroups: groups, signals, document: { ...source.document, id: 'issue44-large.tcd', title: 'Issue 44 large tree' } };
  if (!await c.actions.openText(JSON.stringify(fixture), { fileName: 'issue44-large.tcd', unsavedDecision: 'discard' })) throw new Error('fixture open failed');
  await new Promise(resolve => setTimeout(resolve, 50));
  const host = document.querySelector('#groups');
  const treeBefore = { clientHeight: host.clientHeight, scrollHeight: host.scrollHeight, scrollTop: host.scrollTop, bodyScrollTop: document.documentElement.scrollTop };
  const canvasBefore = document.querySelector('#cycleCanvas').scrollTop;
  const inspectorBefore = document.querySelector('.inspector-body').scrollTop;
  const headers = [...document.querySelectorAll('#groups .group')].map(group => group.querySelector('.group-h'));
  const disclosure = headers[0].querySelector('.group-disclosure');
  const firstRowsBefore = headers[0].parentElement.querySelectorAll('.row').length;
  const firstHeightBefore = headers[0].parentElement.getBoundingClientRect().height;
  disclosure.click();
  await new Promise(resolve => setTimeout(resolve, 30));
  const collapsed = { model: c.model.document.signalGroups[0].collapsed, aria: disclosure.getAttribute('aria-expanded'), icon: disclosure.querySelector('use')?.getAttribute('href'), rowsHidden: [...headers[0].parentElement.querySelectorAll('.row')].every(row => row.hidden), height: headers[0].parentElement.getBoundingClientRect().height, followingTop: headers[1].parentElement.getBoundingClientRect().top };
  disclosure.click();
  await new Promise(resolve => setTimeout(resolve, 30));
  const expanded = { model: Boolean(c.model.document.signalGroups[0].collapsed), aria: disclosure.getAttribute('aria-expanded'), icon: disclosure.querySelector('use')?.getAttribute('href'), rowsVisible: [...headers[0].parentElement.querySelectorAll('.row')].every(row => !row.hidden), height: headers[0].parentElement.getBoundingClientRect().height };
  const otherGroups = [];
  for (const index of [1, 2]) {
    const button = headers[index].querySelector('.group-disclosure');
    button.click(); await new Promise(resolve => setTimeout(resolve, 20));
    otherGroups.push({ index, collapsed: Boolean(c.model.document.signalGroups[index].collapsed), rowsHidden: [...headers[index].parentElement.querySelectorAll('.row')].every(row => row.hidden), aria: button.getAttribute('aria-expanded'), icon: button.querySelector('use')?.getAttribute('href') });
    button.click(); await new Promise(resolve => setTimeout(resolve, 20));
  }
  const finalGroup = headers[2].parentElement;
  headers[2].scrollIntoView({ block: 'start', inline: 'nearest' });
  await new Promise(resolve => setTimeout(resolve, 20));
  const groupReach = (() => { const rect = headers[2].getBoundingClientRect(); const hostRect = host.getBoundingClientRect(); return rect.top >= hostRect.top - 1 && rect.bottom <= hostRect.bottom + 1; })();
  host.scrollTop = host.scrollHeight;
  await new Promise(resolve => setTimeout(resolve, 20));
  const treeAfter = { scrollTop: host.scrollTop, finalGroupVisible: groupReach, finalSignalVisible: (() => { const row = headers[2].parentElement.querySelector('.row:last-child'); const rect = row.getBoundingClientRect(); const hostRect = host.getBoundingClientRect(); return rect.bottom <= hostRect.bottom + 1 && rect.top >= hostRect.top - 1; })() };
  host.dispatchEvent(new WheelEvent('wheel', { deltaY: 260, bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 20));
  const wheelMoved = host.scrollTop > 0;
  const roundTrip = JSON.parse(c.prepareSaveText().text);
  return { treeBefore, treeAfter, wheelMoved, firstRowsBefore, firstHeightBefore, collapsed, expanded, otherGroups, canvasBefore, canvasAfter: document.querySelector('#cycleCanvas').scrollTop, inspectorBefore, inspectorAfter: document.querySelector('.inspector-body').scrollTop, persistedCollapsed: roundTrip.signalGroups[0].collapsed === undefined, iconCount: document.querySelectorAll('#groups .group-disclosure use').length };
});

assert.ok(result.treeBefore.scrollHeight > result.treeBefore.clientHeight, 'left tree must have an independent scroll range');
assert.ok(result.treeAfter.scrollTop > 0);
assert.equal(result.treeAfter.finalGroupVisible, true);
assert.equal(result.treeAfter.finalSignalVisible, true);
assert.equal(result.wheelMoved, true);
assert.equal(result.collapsed.model, true);
assert.equal(result.collapsed.aria, 'false');
assert.equal(result.collapsed.icon, 'icons.svg#i-chevron-right');
assert.equal(result.collapsed.rowsHidden, true);
assert.ok(result.collapsed.height < result.firstHeightBefore);
assert.equal(result.expanded.model, false);
assert.equal(result.expanded.aria, 'true');
assert.equal(result.expanded.icon, 'icons.svg#i-chevron-down');
assert.equal(result.expanded.rowsVisible, true);
assert.deepEqual(result.otherGroups.map(group => group.collapsed), [true, true]);
assert.deepEqual(result.otherGroups.map(group => group.rowsHidden), [true, true]);
assert.deepEqual(result.otherGroups.map(group => group.aria), ['false', 'false']);
assert.deepEqual(result.otherGroups.map(group => group.icon), ['icons.svg#i-chevron-right', 'icons.svg#i-chevron-right']);
assert.ok(Math.abs(result.canvasAfter - result.canvasBefore) <= 0);
assert.ok(Math.abs(result.inspectorAfter - result.inspectorBefore) <= 0);
assert.equal(result.persistedCollapsed, true);
assert.equal(result.iconCount, 3);
assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue44-large-tree-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 44, result, independentTreeScroll: true, svgDisclosure: true, errors, pass: true }, null, 2)}\n`);
console.log('Issue #44 acceptance passed: SVG group disclosure, collapse/expand, independent tree scroll, wheel reachability, and persistence.');
