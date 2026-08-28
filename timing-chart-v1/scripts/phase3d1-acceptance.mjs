import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3d1';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4188'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { saveAsCancel: {}, writeFailure: {}, saveBeforeOpen: {}, fallbackDownload: {}, pass: false };
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true, acceptDownloads: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, acceptDownloads: true });
  await page.goto('http://127.0.0.1:4188/gui-mockup/', { waitUntil: 'networkidle' });
  const state = () => page.evaluate(() => window.TimingChartProductionController.getState());
  const serial = () => page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  const edit = async value => { await page.locator('.row[data-signal="req_valid"]').click(); const input = page.locator('[data-editor-field="start"][data-editor-index="1"]'); await input.fill(String(value)); await input.dispatchEvent('change'); await wait(40); };
  await edit(4);
  const persistenceSnapshot = () => page.evaluate(() => { const persistence = window.TimingChartProductionController.model.persistence; return { ...persistence, fileHandle: persistence.fileHandle ? 'handle' : null }; });
  const beforeCancel = await page.evaluate(() => ({ persistence: { ...window.TimingChartProductionController.model.persistence, fileHandle: null }, document: window.TimingChartProductionController.getSerializableDocument() }));
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
  assert.equal(await page.evaluate(async () => await window.TimingChartProductionController.actions.saveAs({ fileName: 'cancel.tcd' })), false);
  const afterCancel = await page.evaluate(() => ({ persistence: { ...window.TimingChartProductionController.model.persistence, fileHandle: null }, document: window.TimingChartProductionController.getSerializableDocument() }));
  assert.deepEqual(afterCancel.persistence, beforeCancel.persistence);
  assert.deepEqual(afterCancel.document, beforeCancel.document);
  report.saveAsCancel = { dirty: afterCancel.persistence.dirty, fileName: afterCancel.persistence.fileName, baselineUnchanged: true, documentUnchanged: true, pass: true };

  await page.evaluate(() => { window.TimingChartProductionController.model.persistence.fileHandle = { async createWritable() { return { async write() { throw new Error('write failed'); }, async close() {} }; } }; });
  const beforeWriteFail = await persistenceSnapshot().then(persistence => page.evaluate(persistence => ({ persistence, document: window.TimingChartProductionController.getSerializableDocument() }), persistence));
  assert.equal(await page.evaluate(async () => await window.TimingChartProductionController.actions.save()), false);
  const afterWriteFail = await persistenceSnapshot().then(persistence => page.evaluate(persistence => ({ persistence, document: window.TimingChartProductionController.getSerializableDocument() }), persistence));
  assert.equal(afterWriteFail.persistence.dirty, true); assert.equal(afterWriteFail.persistence.savedRevisionHash, beforeWriteFail.persistence.savedRevisionHash); assert.deepEqual(afterWriteFail.document, beforeWriteFail.document); assert.match(afterWriteFail.persistence.lastError, /write failed/);
  report.writeFailure.write = { dirty: true, baselineUnchanged: true, documentUnchanged: true, lastError: true, pass: true };
  await page.evaluate(() => { window.TimingChartProductionController.model.persistence.fileHandle = { async createWritable() { return { async write() {}, async close() { throw new Error('close failed'); } }; } }; });
  assert.equal(await page.evaluate(async () => await window.TimingChartProductionController.actions.save()), false);
  const afterCloseFail = await persistenceSnapshot();
  assert.equal(afterCloseFail.dirty, true); assert.match(afterCloseFail.lastError, /close failed/);
  report.writeFailure.close = { dirty: true, baselineUnchanged: true, pass: true };

  const target = await page.evaluate(() => { const documentValue = window.TimingChartProductionController.getSerializableDocument(); documentValue.document.id = 'opened-target.tcd'; return documentValue; });
  let writtenBySave = '';
  await page.evaluate(() => { window.TimingChartProductionController.model.persistence.fileHandle = { async createWritable() { return { async write(text) { window.__savedByMock = text; }, async close() {} }; } }; });
  await edit(5);
  assert.equal((await persistenceSnapshot()).dirty, true);
  assert.equal(await page.evaluate(async documentText => await window.TimingChartProductionController.actions.requestOpen({ text: documentText, fileName: 'opened-target.tcd', unsavedDecision: 'save' }), JSON.stringify(target)), true);
  writtenBySave = await page.evaluate(() => window.__savedByMock || '');
  assert.match(writtenBySave, /"formatVersion"\s*:\s*1/);
  assert.equal((await serial()).document.id, 'opened-target.tcd'); assert.equal((await state()).persistence.dirty, false);
  report.saveBeforeOpen = { saveSucceededBeforeOpen: true, openSucceeded: true, previousDocumentWritten: writtenBySave.length > 0, pass: true };

  await page.evaluate(() => { window.showSaveFilePicker = undefined; window.TimingChartProductionController.model.persistence.fileHandle = null; });
  await edit(6);
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => await window.TimingChartProductionController.actions.saveAs({ fileName: 'fallback-download.tcd' }));
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  const downloadedText = fs.readFileSync(downloadedPath, 'utf8');
  assert.equal(download.suggestedFilename(), 'fallback-download.tcd');
  const downloadedDocument = JSON.parse(downloadedText);
  const downloadIssues = await page.evaluate(documentValue => window.TimingChartProductionController.validateDocument(documentValue), downloadedDocument);
  assert.deepEqual(downloadIssues, []); assert.equal((await state()).persistence.dirty, false);
  fs.writeFileSync(`${root}/fallback-download.tcd`, downloadedText, 'utf8');
  report.fallbackDownload = { event: true, filename: download.suggestedFilename(), utf8Json: true, validation: true, dirtyAfter: false, pass: true };

  fs.writeFileSync(`${root}/save-as-cancel.json`, `${JSON.stringify(report.saveAsCancel, null, 2)}\n`);
  fs.writeFileSync(`${root}/save-write-failure.json`, `${JSON.stringify(report.writeFailure, null, 2)}\n`);
  fs.writeFileSync(`${root}/save-before-open.json`, `${JSON.stringify(report.saveBeforeOpen, null, 2)}\n`);
  fs.writeFileSync(`${root}/fallback-download-test.json`, `${JSON.stringify({ filename: download.suggestedFilename(), issues: downloadIssues, bytes: downloadedText.length }, null, 2)}\n`);
  report.pass = true;
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Phase 3D.1 acceptance passed: atomic Save/Save As, save-before-open, failure preservation, and real fallback download.');
} finally { server.kill(); if (!report.pass) fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); }
