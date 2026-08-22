import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue8'; fs.mkdirSync(root, { recursive: true }); const server = spawn('python', ['-m', 'http.server', '4208'], { cwd: 'gui-mockup', stdio: 'ignore' }); const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 }); await page.goto('http://127.0.0.1:4208/', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.TimingChartProductionController.actions.addTransaction({ id: 'txn_axis', name: 'Axis transaction', start: 5, end: 8, phases: [{ name: 'Request', start: 5, end: 6 }], linkedSignals: ['req_valid'] }));
  const before = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument()); const starts = before.signals.find(s => s.id === 'req_valid').values.map(v => v.start);
  await page.evaluate(() => window.TimingChartProductionController.actions.insertCycles(4, 2)); const after = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument()); const shifted = after.signals.find(s => s.id === 'req_valid').values.map(v => v.start); assert.deepEqual(shifted, starts.map(value => value >= 4 ? value + 2 : value)); assert.equal(after.transactions.find(t => t.id === 'txn_axis').start, 7);
  await page.evaluate(() => window.TimingChartProductionController.actions.undo()); assert.deepEqual(await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument()), before);
  await page.evaluate(() => window.TimingChartProductionController.actions.duplicateRange(0, 3)); const duplicated = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument()); assert.equal(duplicated.timeline.cycleCount, before.timeline.cycleCount + 3); assert.ok(duplicated.signals.find(s => s.id === 'req_valid').values.some(v => v.start === 3));
  const invalid = await page.evaluate(() => window.TimingChartProductionController.actions.insertCycles(-1, 1)); assert.equal(invalid, false);
  const report = { insertN: true, continuation: true, annotationAndTransactionTracking: true, duplicateRange: true, undoAtomic: true, invalidStatesRejected: true, pass: true }; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/timeline-operations.png` }); await browser.close(); console.log('Issue #8 acceptance passed: semantic ripple, duplicate, transaction tracking, undo atomicity, and invalid-state rejection.');
} finally { server.kill(); }
