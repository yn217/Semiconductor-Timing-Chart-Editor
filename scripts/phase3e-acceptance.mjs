import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3e';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4190'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { cases: {}, screenshots: {}, pass: false };
const keys = value => JSON.stringify(value);
const signalValues = (documentValue, id) => documentValue.signals.find(signal => signal.id === id)?.values || [];
const valueStarts = (documentValue, id) => signalValues(documentValue, id).map(value => Number(value.start));

try {
  await wait(700);
  const browser = await chromium.launch({ headless: true, acceptDownloads: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, acceptDownloads: true });
  const open = async () => { await page.goto('http://127.0.0.1:4190/gui-mockup/', { waitUntil: 'networkidle' }); await wait(50); };
  const documentValue = () => page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  const state = () => page.evaluate(() => window.TimingChartProductionController.getState());
  const setCycle = cycle => page.evaluate(cycleValue => { window.TimingChartProductionController.model.timeSelection.cycle = cycleValue; window.TimingChartProductionController.renderTransient(window.TimingChartProductionController.model); }, cycle);
  const insert = (start, count = 1) => page.evaluate(([s, c]) => window.TimingChartProductionController.actions.insertCycles(s, c), [start, count]);
  const remove = (start, end) => page.evaluate(([s, e]) => window.TimingChartProductionController.actions.deleteRange(s, e), [start, end]);
  const historyLengths = () => page.evaluate(() => ({ undo: window.TimingChartProductionController.model.history.undo.length, redo: window.TimingChartProductionController.model.history.redo.length }));
  const common = async (name, fn) => { await open(); const result = await fn(); report.cases[name] = { ...result, pass: true }; };

  await open();
  await page.screenshot({ path: `${root}/before.png` });
  const baseline = await documentValue();

  await common('cycle-insert', async () => {
    await setCycle(4); assert.equal(await insert(4), true);
    const doc = await documentValue();
    assert.deepEqual(valueStarts(doc, 'req_valid'), [0, 3, 8]);
    assert.equal(doc.timeline.cycleCount, 11); assert.equal(doc.timeline.end, 11);
    assert.equal((await historyLengths()).undo, 1);
    return { reqValidStarts: valueStarts(doc, 'req_valid'), cycleCount: doc.timeline.cycleCount, history: await historyLengths() };
  });
  await page.screenshot({ path: `${root}/after-insert.png` });

  await common('cycle-delete', async () => {
    assert.equal(await remove(4, 5), true); const doc = await documentValue();
    assert.equal(doc.timeline.cycleCount, 9); assert.deepEqual(valueStarts(doc, 'req_valid'), [0, 3, 6]);
    return { reqValidStarts: valueStarts(doc, 'req_valid'), cycleCount: doc.timeline.cycleCount };
  });
  await common('n-cycle-insert', async () => {
    assert.equal(await insert(4, 3), true); const doc = await documentValue();
    assert.equal(doc.timeline.cycleCount, 13); assert.deepEqual(valueStarts(doc, 'req_valid'), [0, 3, 10]);
    return { reqValidStarts: valueStarts(doc, 'req_valid'), cycleCount: doc.timeline.cycleCount };
  });
  await common('range-delete', async () => {
    assert.equal(await remove(4, 7), true); const doc = await documentValue();
    assert.equal(doc.timeline.cycleCount, 7); assert.deepEqual(valueStarts(doc, 'req_valid'), [0, 3, 4]);
    for (const signal of doc.signals.filter(item => ['binary', 'bus', 'state'].includes(item.type))) {
      assert.deepEqual(signal.values.map(value => Number(value.start)), [...new Set(signal.values.map(value => Number(value.start)))].sort((a, b) => a - b));
    }
    return { reqValidStarts: valueStarts(doc, 'req_valid'), cycleCount: doc.timeline.cycleCount, canonical: true };
  });

  await common('transition-geometry', async () => {
    await setCycle(3); await insert(3); const doc = await documentValue();
    const geometry = await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry);
    const anchor = geometry.signals.req_valid.transitionStart.find(item => item.cycle === 4);
    assert.ok(anchor, JSON.stringify(geometry.signals.req_valid));
    assert.deepEqual(valueStarts(doc, 'req_valid'), [0, 4, 8]);
    return { transitionCycle: anchor.cycle, transitionX: anchor.x };
  });
  await common('comment-row-unchanged', async () => {
    const before = (await documentValue()).signals.filter(signal => signal.type === 'commentRow');
    await insert(4, 2); await remove(4, 6);
    const after = (await documentValue()).signals.filter(signal => signal.type === 'commentRow');
    assert.deepEqual(after, before); return { unchanged: true, count: after.length };
  });
  await common('clock-generator', async () => {
    const before = (await documentValue()).signals.find(signal => signal.id === 'clk').generator;
    await insert(4, 2); await remove(4, 6);
    const after = (await documentValue()).signals.find(signal => signal.id === 'clk').generator;
    assert.deepEqual(after, before); return { unchanged: true, generator: after };
  });
  await common('playhead-geometry', async () => {
    await insert(4, 3); await setCycle(6);
    const result = await page.evaluate(() => {
      const model = window.TimingChartProductionController.model;
      const canvas = document.querySelector('#cycleCanvas'); const playhead = document.querySelector('#cycleCanvas .playhead');
      const boundary = model.waveGeometry.signals.clk.cycleBoundary[6];
      return { error: Math.abs(playhead.getBoundingClientRect().left - boundary.x), cycle: model.timeSelection.cycle };
    });
    assert.ok(result.error <= 0.1, JSON.stringify(result)); return result;
  });
  await common('ruler-alignment', async () => {
    await insert(4, 3);
    const result = await page.evaluate(() => {
      const model = window.TimingChartProductionController.model;
      const ticks = [...document.querySelectorAll('#cycleCanvas .ruler .tick')];
      const trace = document.querySelectorAll('#cycleCanvas .trace svg')[1];
      const rect = trace.getBoundingClientRect();
      const boundaries = model.waveGeometry.signals.req_valid.cycleBoundary;
      return { labels: ticks.map(tick => tick.textContent), errors: ticks.map((tick, index) => Math.abs((tick.getBoundingClientRect().x + tick.getBoundingClientRect().width / 2) - (rect.x + boundaries[index].x))) };
    });
    assert.deepEqual(result.labels, Array.from({ length: 13 }, (_, i) => String(i)));
    assert.ok(result.errors.every(error => error <= 0.1), JSON.stringify(result));
    return result;
  });
  await common('undo-redo-time-axis', async () => {
    const before = await documentValue(); await insert(4, 2); const inserted = await documentValue();
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.undo()), true);
    assert.deepEqual(await documentValue(), before);
    const undoneGeometry = await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry.cycleCount);
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.actions.redo()), true);
    assert.deepEqual(await documentValue(), inserted);
    return { undoRestored: true, redoRestored: true, geometryCycleCount: undoneGeometry };
  });
  await common('invalid-range', async () => {
    const before = await documentValue(); const history = await historyLengths();
    assert.equal(await remove(5, 5), false); assert.deepEqual(await documentValue(), before); assert.deepEqual(await historyLengths(), history);
    return { rejected: true, historyUnchanged: true };
  });
  await common('delete-all', async () => {
    const before = await documentValue(); const history = await historyLengths();
    assert.equal(await remove(0, before.timeline.cycleCount), false); assert.deepEqual(await documentValue(), before); assert.deepEqual(await historyLengths(), history);
    return { rejected: true, historyUnchanged: true };
  });
  await common('ns-mode', async () => {
    const before = await documentValue(); const history = await historyLengths();
    await page.evaluate(() => { window.TimingChartProductionController.model.document.timeline.timeBase = 'ns'; });
    assert.equal(await insert(2), false); assert.deepEqual(await documentValue(), { ...before, timeline: { ...before.timeline, timeBase: 'ns' } }); assert.deepEqual(await historyLengths(), history);
    return { rejected: true, reason: (await state()).validation.at(-1)?.code, historyUnchanged: true };
  });
  await common('save-open-time-axis', async () => {
    const removed = await remove(4, 7); assert.equal(removed, true, JSON.stringify(await state())); const expected = await documentValue();
    const prepared = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText());
    assert.equal(typeof prepared.text, 'string'); fs.writeFileSync(`${root}/save-open-time-axis.tcd`, prepared.text, 'utf8');
    assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'save-open-time-axis.tcd', unsavedDecision: 'discard' }), prepared.text), true);
    assert.deepEqual(await documentValue(), expected); return { roundTrip: true, cycleCount: expected.timeline.cycleCount };
  });
  await common('transient-selection', async () => {
    await page.evaluate(() => { window.TimingChartProductionController.model.timeSelection = { cycle: 4, rangeStart: 2, rangeEnd: 6 }; });
    const prepared = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText());
    assert.equal(prepared.text.includes('timeSelection'), false); assert.equal(JSON.parse(prepared.text).timeSelection, undefined);
    return { excluded: true };
  });
  await common('keyboard-dirty-decision-path', async () => {
    const source = fs.readFileSync('gui-mockup/production-document.js', 'utf8');
    assert.match(source, /key === 'o'.*uiDecision\(\)/s); assert.match(source, /key === 'n'.*uiDecision\(\)/s);
    return { ctrlN: 'uiDecision', ctrlO: 'uiDecision' };
  });

  await open();
  assert.equal(await remove(4, 7), true);
  await page.screenshot({ path: `${root}/after-range-delete.png` });
  await open();
  report.screenshots = { viewport: { width: 1672, height: 941 }, before: 'before.png', afterInsert: 'after-insert.png', afterRangeDelete: 'after-range-delete.png' };
  assert.deepEqual(await documentValue(), baseline);
  report.baselineRestored = true;
  report.pass = true;
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Phase 3E acceptance passed: canonical cycle insert/delete, range transforms, history, persistence, ruler, and keyboard decision path.');
} catch (error) {
  report.error = { name: error.name, message: error.message, stack: error.stack };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally { server.kill(); }
