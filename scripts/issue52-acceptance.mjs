import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue52');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const state = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const signal = c.model.document.signals.find(item => item.id === c.model.selection.id);
  return {
    document: c.getSerializableDocument(),
    starts: signal?.values?.map(value => Number(value.start)),
    values: signal?.values?.map(value => value.value),
    rowIndex: c.model.editor.rowIndex,
    history: c.model.history.undo.length,
    redo: c.model.history.redo.length,
    dirty: c.model.persistence.dirty,
    validation: structuredClone(c.model.validation),
    addDisabled: document.querySelector('[data-editor-action="add"]')?.disabled ?? null,
    addTitle: document.querySelector('[data-editor-action="add"]')?.title ?? ''
  };
});

const report = { issue: 52, cases: {}, errors };
const initial = await state();
const initialReq = initial.starts;
assert.ok(initialReq?.length >= 2, 'fixture must contain multiple change points');

await page.locator('#leftPanel .row[data-signal="req_valid"]').click();
await page.waitForTimeout(40);
const rows = page.locator('#bottomContent tbody tr[data-editor-index]');
const selectedRow = Math.max(0, Math.min(1, (await rows.count()) - 1));
await rows.nth(selectedRow).click();
await page.waitForTimeout(40);
const beforeAdd = await state();
const selectedStart = beforeAdd.starts[selectedRow];
const expected = [...Array(10).keys()].find(cycle => cycle > selectedStart && !beforeAdd.starts.includes(cycle));
assert.notEqual(expected, undefined, 'fixture must have an available cycle after selected row');
await page.locator('[data-editor-action="add"]').click();
await page.waitForTimeout(50);
const afterAdd = await state();
assert.equal(afterAdd.starts.includes(expected), true, 'Add must insert at the next available cycle after selected row');
assert.equal(afterAdd.starts.filter(start => start === expected).length, 1, 'duplicate start cycle was created');
assert.equal(afterAdd.rowIndex, afterAdd.starts.indexOf(expected), 'new row must be selected');
assert.equal(afterAdd.history, beforeAdd.history + 1, 'one Add must create exactly one undo entry');
assert.equal(afterAdd.dirty, true, 'Add must mark document dirty');
report.cases.selectedRowInsertion = { selectedStart, insertedStart: expected, rowIndex: afterAdd.rowIndex, oneUndo: true, dirty: true, pass: true };

const beforeUndo = JSON.stringify(await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument()));
assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.undo()), true);
const afterUndo = await state();
assert.notEqual(beforeUndo, JSON.stringify(afterUndo.document), 'Undo must revert the inserted value');
assert.deepEqual(afterUndo.document, beforeAdd.document, 'Undo must restore the exact pre-Add document');
report.cases.undo = { actionReturned: true, history: afterUndo.history, redo: afterUndo.redo, exactDocument: true, pass: afterUndo.redo >= 1 };

await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const signal = c.model.document.signals.find(item => item.id === 'req_valid');
  signal.values = Array.from({ length: c.model.document.timeline.cycleCount }, (_, start) => ({ start, value: start % 2, comment: '' }));
  c.model.selection = { kind: 'signal', id: 'req_valid' };
  c.model.editor.rowIndex = signal.values.length - 1;
  c.model.validation = [];
  c.render();
});
await page.waitForTimeout(40);
const full = await state();
assert.equal(full.addDisabled, true, 'Add must be disabled when no valid cycle remains');
assert.match(full.addTitle, /空きcycle/);
assert.equal(await page.locator('[data-editor-action="add"]').isDisabled(), true);
report.cases.fullTimeline = { disabled: full.addDisabled, reason: full.addTitle, pass: true };

await page.screenshot({ path: path.join(out, 'issue52-1672x941.png') });
report.errors = errors;
report.pass = errors.length === 0 && Object.values(report.cases).every(item => item.pass);
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #52 acceptance passed: selected-row insertion, one-step Undo/dirty behavior, and full-timeline disabled state.');
