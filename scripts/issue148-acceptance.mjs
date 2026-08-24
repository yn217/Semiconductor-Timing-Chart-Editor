import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue148');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(450);

const readState = () => page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const flatten = controller.model.document.signalGroups.flatMap(group => group.rows || []);
  const left = [...document.querySelectorAll('#groups .group')].flatMap(group => [...group.querySelectorAll(':scope > .row[data-signal]')].map(row => row.dataset.signal));
  const timing = [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal]')].map(row => row.dataset.signal);
  const frozen = [...document.querySelectorAll('#cycleCanvas .frozen-label-row[data-signal]')].map(row => row.dataset.signal);
  return { flatten, left, timing, frozen, selection: controller.model.selection, history: controller.model.history.undo.length, dirty: controller.model.persistence.dirty, wave: controller.renderMetrics.waveDromRenders, geometry: controller.renderMetrics.geometryBuilds, app: controller.renderMetrics.appFullRenders };
});

const before = await readState();
const stableBefore = await page.evaluate(() => Object.fromEntries(['clk', 'req_valid'].map(id => [id, document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${id}"] .trace svg`)])));
await page.locator('#groups .row[data-signal="clk"]').dragTo(page.locator('#groups .row[data-signal="req_valid"]'));
await page.waitForTimeout(100);
const after = await readState();
const stableAfter = await page.evaluate(() => Object.fromEntries(['clk', 'req_valid'].map(id => [id, document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${id}"] .trace svg`)])));

assert.deepEqual(after.flatten.slice(0, 4), ['req_valid', 'clk', 'req_addr[7:0]', 'comment_01']);
assert.deepEqual(after.left, after.flatten);
assert.deepEqual(after.timing, after.flatten);
assert.deepEqual(after.frozen, after.flatten);
assert.deepEqual(after.selection, { kind: 'signal', id: 'clk' });
assert.equal(after.history, before.history + 1);
assert.equal(after.wave - before.wave, 0);
assert.equal(after.geometry - before.geometry, 0);
assert.equal(after.app - before.app, 0);
assert.equal(stableBefore.clk, stableAfter.clk);
assert.equal(stableBefore.req_valid, stableAfter.req_valid);

await page.evaluate(() => window.TimingChartProductionController.actions.undo());
await page.waitForTimeout(80);
const undone = await readState();
assert.deepEqual(undone.flatten.slice(0, 4), before.flatten.slice(0, 4));
await page.evaluate(() => window.TimingChartProductionController.actions.redo());
await page.waitForTimeout(80);
const redone = await readState();
assert.deepEqual(redone.flatten.slice(0, 4), after.flatten.slice(0, 4));

const report = { issue: 148, realBrowserDragTo: true, midpointRule: 'after', before, after, undone, redone, stableSvgIdentity: true, errors, pass: true };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue148-1672x941.png') });
await browser.close();
console.log('Issue #148 acceptance passed: real drag/drop target positioning, canonical surface synchronization, stable WaveDrom identity, and Undo/Redo.');
