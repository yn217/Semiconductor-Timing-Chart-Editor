import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue72');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const makeFixture = await page.evaluate(() => {
  const source = window.TimingChartProductionController.getSerializableDocument();
  const groups = source.signalGroups.map(group => ({ ...group, rows: [...group.rows], spacingBefore: 0, spacingAfter: 0 }));
  const signals = [...source.signals];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) for (let rowIndex = 0; rowIndex < 8; rowIndex += 1) { const id = `issue72_g${groupIndex}_${rowIndex}`; signals.push({ id, name: id, type: 'binary', role: groupIndex === 0 ? 'input' : groupIndex === 2 ? 'output' : 'internal', source: { instancePath: [], signalName: id }, display: { name: id }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }, { start: 7, value: 0 }] }); groups[groupIndex].rows.push(id); }
  return { ...source, signalGroups: groups, signals, layout: { ...source.layout, signalSpacing: 6, rowHeight: 28, signalNameWidth: 168, roleColumnWidth: 32, instancePathWidth: 180 }, document: { ...source.document, id: 'issue72.tcd' } };
});
assert.equal(await page.evaluate(async fixture => window.TimingChartProductionController.actions.openText(JSON.stringify(fixture), { fileName: 'issue72.tcd', unsavedDecision: 'discard' }), makeFixture), true);
await page.waitForTimeout(80);

const tool = label => page.locator('#ribbonHome .tool').filter({ hasText: label }).first();
const rowMetrics = () => page.evaluate(() => {
  const left = [...document.querySelectorAll('#groups .group:first-child .row')].filter(row => !row.hidden).slice(0, 2).map(row => row.getBoundingClientRect().top);
  const wave = [...document.querySelectorAll('#cycleCanvas .wave-row[data-group-id="group_input"]')].filter(row => !row.hidden).slice(0, 2).map(row => row.getBoundingClientRect().top);
  return { leftGap: left[1] - left[0], waveGap: wave[1] - wave[0] };
});
const beforeRow = await rowMetrics();
await tool('行間隔').click();
await page.locator('[data-layout-popup="row"] [data-layout-field="signalSpacing"]').fill('14');
await page.locator('[data-layout-popup="row"] [data-layout-action="apply"]').click();
await page.waitForTimeout(80);
const afterRow = await rowMetrics();
const rowState = await page.evaluate(() => ({ spacing: window.TimingChartProductionController.model.document.layout.signalSpacing, history: window.TimingChartProductionController.model.history.undo.length, dirty: window.TimingChartProductionController.model.persistence.dirty }));

const groupBefore = await page.evaluate(() => { const internal = document.querySelectorAll('#groups .group')[1]; const output = document.querySelectorAll('#groups .group')[2]; return { order: [...document.querySelectorAll('#groups .group')].map(group => group.dataset.groupId), boundary: output.getBoundingClientRect().top - internal.querySelector('.row:last-of-type').getBoundingClientRect().bottom }; });
await page.locator('#groups .group:nth-child(2) .group-h').click();
await page.waitForTimeout(20);
await tool('Group間隔').click();
await page.locator('[data-layout-popup="group"] [data-layout-field="spacingAfter"]').fill('12');
await page.locator('[data-layout-popup="group"] [data-layout-action="apply"]').click();
await page.waitForTimeout(80);
const groupAfter = await page.evaluate(() => { const c = window.TimingChartProductionController; const internal = document.querySelectorAll('#groups .group')[1]; const output = document.querySelectorAll('#groups .group')[2]; return { order: [...document.querySelectorAll('#groups .group')].map(group => group.dataset.groupId), boundary: output.getBoundingClientRect().top - internal.querySelector('.row:last-of-type').getBoundingClientRect().bottom, spacing: c.model.document.signalGroups.find(group => group.id === 'group_internal').spacingAfter, rows: c.model.document.signalGroups.map(group => [...group.rows]) }; });
const internalDisclosure = page.locator('#groups .group:nth-child(2) .chev');
await internalDisclosure.click(); await page.waitForTimeout(40);
const collapsedSpacing = await page.evaluate(() => { const c = window.TimingChartProductionController; return { collapsed: c.model.document.signalGroups.find(group => group.id === 'group_internal').collapsed, spacing: c.model.document.signalGroups.find(group => group.id === 'group_internal').spacingAfter, hidden: [...document.querySelectorAll('#groups .group:nth-child(2) .row')].every(row => row.hidden) }; });
await internalDisclosure.click(); await page.waitForTimeout(40);

const semanticBeforeAuto = await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.document.layout.signalSpacing = 99; c.model.document.layout.rowHeight = 100; c.model.document.layout.signalNameWidth = 500; c.model.document.layout.roleColumnWidth = 100; c.model.document.layout.instancePathWidth = 500; c.render(); return { timeline: c.model.document.timeline, signals: c.model.document.signals, groups: c.model.document.signalGroups.map(group => ({ id: group.id, rows: group.rows })), annotations: c.model.document.annotations, history: c.model.history.undo.length }; });
const autoHistoryBefore = await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length);
await tool('自動レイアウト').click(); await page.waitForTimeout(80);
const auto = await page.evaluate(before => { const c = window.TimingChartProductionController; return { layout: c.model.document.layout, timeline: c.model.document.timeline, signals: c.model.document.signals, groups: c.model.document.signalGroups.map(group => ({ id: group.id, rows: group.rows })), annotations: c.model.document.annotations, historyDelta: c.model.history.undo.length - before }; }, autoHistoryBefore);
const semanticAfterAuto = { timeline: auto.timeline, signals: auto.signals, groups: auto.groups, annotations: auto.annotations };
const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
const roundTrip = await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue72-roundtrip.tcd', unsavedDecision: 'discard' }), saved);
const roundTripLayout = await page.evaluate(() => window.TimingChartProductionController.model.document.layout);
await page.screenshot({ path: path.join(out, 'issue72-1672x941.png') });
await browser.close();

assert.ok(afterRow.leftGap > beforeRow.leftGap + 5);
assert.ok(afterRow.waveGap > beforeRow.waveGap + 5);
assert.ok(Math.abs((afterRow.leftGap - beforeRow.leftGap) - (afterRow.waveGap - beforeRow.waveGap)) <= 0.1);
assert.equal(rowState.spacing, 14); assert.equal(rowState.history, 1); assert.equal(rowState.dirty, true);
assert.deepEqual(groupAfter.order, groupBefore.order); assert.equal(groupAfter.spacing, 12); assert.ok(groupAfter.boundary > groupBefore.boundary + 10);
assert.deepEqual(groupAfter.rows, makeFixture.signalGroups.map(group => group.rows));
assert.equal(collapsedSpacing.collapsed, true); assert.equal(collapsedSpacing.spacing, 12); assert.equal(collapsedSpacing.hidden, true);
assert.equal(auto.layout.signalSpacing, 6); assert.equal(auto.layout.rowHeight, 80); assert.equal(auto.layout.signalNameWidth, 360); assert.equal(auto.layout.roleColumnWidth, 64); assert.equal(auto.layout.instancePathWidth, 360);
assert.equal(auto.historyDelta, 1);
assert.deepEqual(semanticAfterAuto.timeline, semanticBeforeAuto.timeline); assert.deepEqual(semanticAfterAuto.signals, semanticBeforeAuto.signals); assert.deepEqual(semanticAfterAuto.groups, semanticBeforeAuto.groups); assert.deepEqual(semanticAfterAuto.annotations, semanticBeforeAuto.annotations);
assert.equal(roundTrip, true); assert.equal(roundTripLayout.signalSpacing, 6); assert.equal(roundTripLayout.rowHeight, 80);
assert.equal(errors.length, 0, errors.join('\n'));
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 72, row: { before: beforeRow, after: afterRow, state: rowState }, group: { before: groupBefore, after: groupAfter, collapsedSpacing }, auto: { before: semanticBeforeAuto, after: auto, roundTripLayout }, autoHistoryBefore, roundTrip, errors, pass: true }, null, 2)}\n`);
console.log('Issue #72 acceptance passed: row/group spacing popups, synchronized geometry, deterministic Auto Layout, history, and Save/Open.');
