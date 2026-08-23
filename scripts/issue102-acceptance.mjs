import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue102');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const clock = c.model.document.signals.find(signal => signal.type === 'clock');
  const id = clock.id;
  const serial = () => JSON.stringify(c.getSerializableDocument());
  const before = serial();
  const historyBefore = c.model.history?.undo?.length ?? 0;
  const dirtyBefore = Boolean(c.model.persistence?.dirty);
  const invalid = {};
  for (const [name, value] of [['labelEveryZero', '0'], ['labelEveryDecimal', '1.5'], ['labelEveryNaN', 'foo'], ['offsetNaN', 'Infinity'], ['mode', 'sideways'], ['position', 'middle'], ['countFrom', 'unknown'], ['initial', '2'], ['startNumber', '-1']]) {
    const field = name === 'offsetNaN' ? 'edgeCounter.offset.x' : name === 'mode' || name === 'position' || name === 'countFrom' || name === 'startNumber' ? `edgeCounter.${name}` : name === 'initial' ? 'initialLevel' : `edgeCounter.labelEvery`;
    const result = c.actions.updateClock(id, field, value);
    invalid[name] = { result, unchanged: serial() === before, historyUnchanged: (c.model.history?.undo?.length ?? 0) === historyBefore, dirtyUnchanged: Boolean(c.model.persistence?.dirty) === dirtyBefore };
  }
  const valid = {};
  valid.duty25 = c.actions.updateClock(id, 'duty', '25');
  valid.initial1 = c.actions.updateClock(id, 'initialLevel', '1');
  valid.startNumber0 = c.actions.updateClock(id, 'edgeCounter.startNumber', '0');
  valid.labelEvery2 = c.actions.updateClock(id, 'edgeCounter.labelEvery', '2');
  valid.modeBoth = c.actions.updateClock(id, 'edgeCounter.mode', 'Both');
  valid.positionBelow = c.actions.updateClock(id, 'edgeCounter.position', 'Below');
  valid.offset = c.actions.updateClock(id, 'edgeCounter.offset.x', '4.5');
  const config = c.getClockConfig(id);
  config.generator.suppressedPeriods = [3, 4, 9];
  const imported = c.actions.importClockConfig(id, config);
  const after = c.getSerializableDocument().signals.find(signal => signal.id === id);
  const saved = c.prepareSaveText();
  const reopened = await c.actions.openText(saved.text, { fileName: 'issue102-roundtrip.tcd', unsavedDecision: 'discard' });
  const roundTrip = c.getSerializableDocument().signals.find(signal => signal.id === id);
  return { id, invalid, valid, imported, after, reopened, roundTrip, validation: c.model.validation, historyBefore, source: serial() };
});

assert.ok(Object.values(result.invalid).every(item => item.result === false && item.unchanged), JSON.stringify(result.invalid));
assert.ok(Object.values(result.valid).every(Boolean), JSON.stringify(result.valid));
assert.equal(result.imported, true);
assert.equal(result.after.generator.duty, 0.25);
assert.equal(result.after.generator.initial, 1);
assert.equal(result.after.edgeCounter.startNumber, 0);
assert.equal(result.after.edgeCounter.labelEvery, 2);
assert.deepEqual(result.after.generator.suppressedPeriods, [3, 4, 9]);
assert.equal(result.reopened, true);
assert.equal(result.roundTrip.generator.duty, 0.25);
assert.deepEqual(result.roundTrip.generator.suppressedPeriods, [3, 4, 9]);
assert.equal(result.validation.length, 0);
assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue102-1672x941.png') });
await browser.close();
const acceptance = { issue: 102, invalidAtomic: result.invalid, validClock: { duty: result.after.generator.duty, initial: result.after.generator.initial, counter: result.after.edgeCounter }, gaps: result.after.generator.suppressedPeriods, saveOpen: result.reopened, noGeneratedEdgeList: result.roundTrip.edgeCounter.edgeNumbers === undefined, errors, pass: true, artifacts: ['issue102-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
console.log(`Issue #102 acceptance passed: validation atomicity, duty, edge counter, gap metadata, and Save/Open.`);
