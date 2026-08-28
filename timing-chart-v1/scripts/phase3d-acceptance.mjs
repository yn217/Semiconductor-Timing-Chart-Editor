import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3d';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4187'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { cases: {}, fileAdapter: 'File System Access API when available; UTF-8 Blob/text fallback in test/headless mode', pass: false };
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4187/gui-mockup/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
  const state = () => page.evaluate(() => window.TimingChartProductionController.getState());
  const serial = () => page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  const action = (name, ...args) => page.evaluate(({ name, args }) => window.TimingChartProductionController.actions[name](...args), { name, args });
  const captureDownload = async operation => { const downloadPromise = page.waitForEvent('download'); const result = await operation(); const download = await downloadPromise; const filePath = await download.path(); return { result, text: fs.readFileSync(filePath, 'utf8'), filename: download.suggestedFilename() }; };
  const editStart = async (value, index = 1) => { await page.locator(`.row[data-signal="req_valid"]`).click(); const input = page.locator(`[data-editor-field="start"][data-editor-index="${index}"]`); await input.fill(String(value)); await input.dispatchEvent('change'); await wait(50); };
  const initial = await serial();
  await page.screenshot({ path: `${root}/production-screenshot.png` });
  await captureDownload(() => page.evaluate(async () => await window.TimingChartProductionController.actions.save()));
  await editStart(4);
  let current = await state();
  assert.equal(current.persistence.dirty, true);
  const saved = await captureDownload(() => page.evaluate(async () => await window.TimingChartProductionController.actions.save()));
  const savedText = saved.text;
  assert.match(saved.filename, /\.tcd$/);
  assert.equal((await state()).persistence.dirty, false);
  assert.deepEqual(JSON.parse(savedText), await serial());
  fs.writeFileSync(`${root}/saved-example.tcd`, savedText, 'utf8');
  report.cases.case1 = 'PASS';

  await editStart(5);
  const geometryBeforeUndo = await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry.signals.req_valid.transitionCenter);
  await action('undo'); await wait(50);
  current = await state();
  assert.equal(current.document.signals.find(signal => signal.id === 'req_valid').values[1].start, 4);
  assert.notDeepEqual(await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry.signals.req_valid.transitionCenter), geometryBeforeUndo);
  report.cases.case2 = 'PASS';
  await action('redo'); await wait(50);
  assert.equal((await state()).document.signals.find(signal => signal.id === 'req_valid').values[1].start, 5);
  assert.equal((await state()).persistence.dirty, true);
  report.cases.case3 = 'PASS';

  await action('undo'); await wait(50);
  assert.equal((await state()).document.signals.find(signal => signal.id === 'req_valid').values[1].start, 4);
  assert.equal((await state()).persistence.dirty, false);
  await action('redo'); await wait(50);
  assert.equal((await state()).persistence.dirty, true);
  report.cases.case4 = 'PASS';

  const historyBeforeView = await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length);
  await page.locator('[data-mode="split"]').click(); await page.locator('[data-tab="annotation"]').click();
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length), historyBeforeView);
  report.cases.case5 = 'PASS';

  const originalId = (await serial()).document.id;
  const saveAs = await captureDownload(() => page.evaluate(async () => await window.TimingChartProductionController.actions.saveAs({ fileName: 'test2.tcd' })));
  assert.equal(saveAs.result, true);
  assert.equal((await state()).persistence.fileName, 'test2.tcd');
  assert.equal((await serial()).document.id, originalId);
  report.cases.case6 = 'PASS';

  const validFile = fs.readFileSync(`${root}/saved-example.tcd`, 'utf8');
  assert.equal(await action('openText', validFile, { fileName: 'saved-example.tcd', unsavedDecision: 'discard' }), true);
  await wait(60);
  assert.deepEqual(await serial(), JSON.parse(validFile));
  assert.equal((await state()).persistence.dirty, false);
  assert.equal((await state()).history.undo.length, 0);
  report.cases.case7 = 'PASS';

  const beforeInvalidJson = await state();
  assert.equal(await action('openText', '{invalid', { fileName: 'bad.tcd', unsavedDecision: 'discard' }), false);
  const afterInvalidJson = await state();
  assert.deepEqual(afterInvalidJson.document, beforeInvalidJson.document);
  assert.equal(afterInvalidJson.history.undo.length, beforeInvalidJson.history.undo.length);
  report.cases.case8 = 'PASS';

  const invalidSchema = JSON.stringify({ formatVersion: 1, document: {}, timeline: { cycleCount: 10, referenceClock: 'missing', edge: 'rising' }, signalGroups: [], signals: [], annotations: [], legend: {}, layout: {}, transactions: [], constraints: [] });
  assert.equal(await action('openText', invalidSchema, { fileName: 'invalid-schema.tcd', unsavedDecision: 'discard' }), false);
  assert.deepEqual((await state()).document, beforeInvalidJson.document);
  report.cases.case9 = 'PASS';

  const transientText = await serial();
  const transientString = JSON.stringify(transientText);
  for (const forbidden of ['selection', 'editor', 'validation', 'view', 'waveGeometry', 'history', 'dirty', 'draft', 'WaveJSON']) assert.equal(transientString.includes(forbidden), false);
  report.cases.case10 = 'PASS';

  await page.locator('[data-mode="cycle"]').click(); await page.locator('[data-tab="signal"]').click(); await page.locator('.row[data-kind="comment"]').first().click();
  const bodyBefore = (await serial()).signals.find(signal => signal.id === 'comment_01').body;
  const bodyInput = page.locator('[data-comment-field="body"]'); await bodyInput.fill('Changed body'); await bodyInput.dispatchEvent('change'); await wait(40);
  assert.equal((await serial()).signals.find(signal => signal.id === 'comment_01').body, 'Changed body');
  await action('undo'); await wait(40);
  assert.equal((await serial()).signals.find(signal => signal.id === 'comment_01').body, bodyBefore);
  report.cases.case12 = 'PASS';

  await page.locator('.row[data-signal="clk"]').click();
  await page.locator('[data-clock-field="period"]').fill('2'); await page.locator('[data-clock-field="period"]').dispatchEvent('change'); await wait(40);
  assert.equal((await serial()).signals.find(signal => signal.id === 'clk').generator.period, 2);
  await action('undo'); await wait(40);
  assert.equal((await serial()).signals.find(signal => signal.id === 'clk').generator.period, 1);
  report.cases.case13 = 'PASS';

  const historyBeforeInvalid = await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length);
  await page.locator('.row[data-signal="req_valid"]').click(); const invalidInput = page.locator('[data-editor-field="start"][data-editor-index="1"]'); await invalidInput.fill('0'); await invalidInput.dispatchEvent('change'); await wait(30);
  assert.equal((await state()).validation[0].code, 'duplicate-start');
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length), historyBeforeInvalid);
  report.cases.case14 = 'PASS';

  await editStart(5); assert.equal((await state()).persistence.dirty, true);
  const beforeCancel = (await serial()).signals.find(signal => signal.id === 'req_valid').values;
  assert.equal(await action('openText', validFile, { fileName: 'cancel.tcd', unsavedDecision: 'cancel' }), false);
  assert.deepEqual((await serial()).signals.find(signal => signal.id === 'req_valid').values, beforeCancel);
  report.cases.case15 = 'PASS';

  report.pass = true;
  fs.writeFileSync(`${root}/save-open-roundtrip.json`, `${JSON.stringify({ savedText: JSON.parse(savedText), reopened: JSON.parse(validFile), equal: JSON.stringify(JSON.parse(savedText)) === JSON.stringify(JSON.parse(validFile)) }, null, 2)}\n`);
  fs.writeFileSync(`${root}/undo-redo.json`, `${JSON.stringify({ cases: { undo: report.cases.case2, redo: report.cases.case3 }, finalStart: (await serial()).signals.find(signal => signal.id === 'req_valid').values[1].start }, null, 2)}\n`);
  fs.writeFileSync(`${root}/dirty-state.json`, `${JSON.stringify({ edit: true, undo: true, redo: true }, null, 2)}\n`);
  fs.writeFileSync(`${root}/invalid-open.json`, `${JSON.stringify({ invalidJson: report.cases.case8, invalidSchema: report.cases.case9, cancelProtection: report.cases.case15 }, null, 2)}\n`);
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Phase 3D acceptance passed: .tcd save/open, dirty tracking, undo/redo, atomic invalid-open handling, and command history.');
} finally { server.kill(); if (!report.pass) fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); }
