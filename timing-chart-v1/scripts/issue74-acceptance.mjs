import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue74');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(450);

await page.locator('#groups .row[data-signal="req_valid"]').click();
await page.waitForTimeout(80);
assert.ok(await page.locator('#inspectorBody [data-inspector-field="display.name"]').count(), 'Signal Inspector is not an editable signal surface');
const initial = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const signal = c.selectors.getSignal('req_valid');
  return { id: signal.id, source: structuredClone(signal.source), document: JSON.stringify(c.getSerializableDocument()), history: c.model.history.undo.length };
});

await page.locator('#inspectorBody [data-inspector-field="display.name"]').fill('ADDR_ALIAS');
await page.locator('#inspectorBody [data-inspector-field="display.name"]').press('Tab');
await page.waitForTimeout(100);
const renamed = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const signal = c.selectors.getSignal('req_valid');
  return { id: signal.id, display: signal.display.name, source: structuredClone(signal.source), tree: document.querySelector('#groups .row[data-signal="req_valid"] .row-name')?.textContent, canvas: document.querySelector('#cycleCanvas .wave-row[data-signal="req_valid"] .signal-label')?.textContent, history: c.model.history.undo.length };
});
assert.equal(renamed.id, initial.id, 'Display Name edit changed stable signal ID');
assert.equal(renamed.display, 'ADDR_ALIAS');
assert.deepEqual(renamed.source, initial.source, 'Display Name edit changed source identity');
assert.equal(renamed.tree, 'ADDR_ALIAS');
assert.equal(renamed.canvas, 'ADDR_ALIAS');
assert.equal(renamed.history, initial.history + 1, 'Display Name edit did not create one shared history entry');

await page.locator('#inspectorBody [data-inspector-style="bold"]').check();
await page.locator('#inspectorBody [data-inspector-style="italic"]').check();
await page.locator('#inspectorBody [data-inspector-style="align"]').selectOption('center');
await page.locator('#inspectorBody [data-inspector-style="waveformColor"]').fill('#00aa00');
await page.locator('#inspectorBody [data-inspector-style="waveformColor"]').dispatchEvent('change');
await page.waitForTimeout(100);
const styled = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const signal = c.selectors.getSignal('req_valid');
  const label = document.querySelector('#cycleCanvas .wave-row[data-signal="req_valid"] .signal-label');
  const path = document.querySelector('#cycleCanvas .wave-row[data-signal="req_valid"] .trace svg path');
  return { style: structuredClone(signal.display.style), label: { weight: getComputedStyle(label).fontWeight, fontStyle: getComputedStyle(label).fontStyle, align: getComputedStyle(label).textAlign }, waveformColor: path?.style.stroke || path?.getAttribute('stroke') };
});
assert.equal(styled.style.bold, true); assert.equal(styled.style.italic, true); assert.equal(styled.style.align, 'center'); assert.equal(styled.style.waveformColor, '#00aa00');
assert.equal(styled.label.weight, '700'); assert.equal(styled.label.fontStyle, 'italic'); assert.equal(styled.label.align, 'center');
assert.ok(styled.waveformColor === 'rgb(0, 170, 0)' || styled.waveformColor === '#00aa00', `WaveDrom style layer missing: ${JSON.stringify(styled)}`);

await page.locator('#inspectorBody [data-inspector-field="visible"]').uncheck();
await page.waitForTimeout(60);
assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.view.hiddenSignals.includes('req_valid')), true, 'Inspector visibility did not use shared visibility action');
assert.equal(await page.locator('#groups .row[data-signal="req_valid"]').isHidden(), true, 'Left panel visibility did not synchronize');
await page.locator('#inspectorBody [data-inspector-field="visible"]').check();

await page.locator('#inspectorBody [data-inspector-field="type"]').selectOption('bus');
await page.waitForTimeout(100);
assert.equal(await page.evaluate(() => window.TimingChartProductionController.selectors.getSignal('req_valid').type), 'bus', 'type conversion did not reach canonical model');
await page.evaluate(() => window.TimingChartProductionController.actions.undo());
assert.equal(await page.evaluate(() => window.TimingChartProductionController.selectors.getSignal('req_valid').type), 'binary', 'type conversion Undo failed');
await page.evaluate(() => window.TimingChartProductionController.actions.redo());
assert.equal(await page.evaluate(() => window.TimingChartProductionController.selectors.getSignal('req_valid').type), 'bus', 'type conversion Redo failed');

const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
 assert.ok(saved.includes('ADDR_ALIAS') && saved.includes('waveformColor'), 'Inspector edits were not serialized');
await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue74-roundtrip.tcd', unsavedDecision: 'discard' }), saved);
const roundTrip = await page.evaluate(() => { const s = window.TimingChartProductionController.selectors.getSignal('req_valid'); return { display: s.display.name, style: structuredClone(s.display.style), type: s.type, id: s.id }; });
assert.equal(roundTrip.display, 'ADDR_ALIAS'); assert.equal(roundTrip.style.bold, true); assert.equal(roundTrip.style.waveformColor, '#00aa00'); assert.equal(roundTrip.type, 'bus'); assert.equal(roundTrip.id, 'req_valid');
assert.equal(errors.length, 0, errors.join('\n'));
const report = { issue: 74, selectedSignal: 'req_valid', basicEdit: true, stableSourceIdentity: true, visibilitySync: true, typeUndoRedo: true, styleObservable: true, saveOpen: true, errors, pass: true };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue74-1672x941.png') });
await browser.close();
console.log('Issue #74 acceptance passed: Signal Inspector edits use shared canonical actions with visible, undoable, and persistent results.');
