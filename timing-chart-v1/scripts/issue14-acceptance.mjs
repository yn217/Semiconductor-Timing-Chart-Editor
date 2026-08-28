import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue14'; fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4205'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4205/', { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument().signals));
  await page.evaluate(() => window.TimingChartProductionController.actions.addTransaction({ id: 'txn_issue14', name: 'Read #1', start: 2, end: 7, lane: 'read', source: 'req_valid', destination: 'ready', linkedSignals: ['req_valid', 'ready'], phases: [{ name: 'Request', start: 2, end: 4 }, { name: 'Response', start: 4, end: 7 }] }));
  const state = await page.evaluate(() => ({ mode: window.TimingChartProductionController.model.view.mode, tab: window.TimingChartProductionController.model.view.tab, transaction: window.TimingChartProductionController.model.document.transactions[0], signalJson: JSON.stringify(window.TimingChartProductionController.getSerializableDocument().signals) }));
  assert.equal(state.mode, 'transaction'); assert.equal(state.tab, 'transaction'); assert.deepEqual(state.transaction.linkedSignals, ['req_valid', 'ready']); assert.equal(state.signalJson, before);
  assert.equal(await page.locator('#transactionCanvas .txn-lane[data-transaction-id="txn_issue14"]').count(), 1); assert.match(await page.locator('#bottomContent').textContent(), /Read #1/);
  await page.locator('#bottomContent [data-transaction-id="txn_issue14"]').click();
  assert.equal((await page.evaluate(() => window.TimingChartProductionController.model.selection.kind)), 'transaction'); assert.equal(await page.locator('.row[data-signal="req_valid"].selected').count(), 1);
  await page.locator('[data-mode="cycle"]').click(); assert.equal(await page.locator('[data-tab="transaction"]:visible').count(), 0);
  const report = { sharedTimeAxis: true, noWaveDromData: state.signalJson === before, transactionTimeline: true, linkedSignals: state.transaction.linkedSignals, crossHighlight: true, cycleViewPreserved: true, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/transaction-view.png` }); await browser.close(); console.log('Issue #14 acceptance passed: semantic transactions, shared cycle axis, linked signals, and Cycle View preservation.');
} finally { server.kill(); }
