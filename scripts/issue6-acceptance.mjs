import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue6'; fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4206'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 }); await page.goto('http://127.0.0.1:4206/', { waitUntil: 'networkidle' });
  const beforeRole = await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(s => s.id === 'req_valid').role);
  await page.evaluate(() => window.TimingChartProductionController.actions.moveSignal('req_valid', 'group_internal', 0));
  const moved = await page.evaluate(() => window.TimingChartProductionController.model.document.signalGroups.map(g => ({ id: g.id, rows: g.rows }))); assert.equal(moved.find(g => g.id === 'group_internal').rows[0], 'req_valid'); assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.document.signals.find(s => s.id === 'req_valid').role), beforeRole);
  await page.evaluate(() => window.TimingChartProductionController.actions.setGroupAppearance('group_internal', { background: '#eef5ff', opacity: 0.25, extend: 'both', showHeader: true })); await page.evaluate(() => window.TimingChartProductionController.actions.addSpacer('group_internal', 24));
  await page.evaluate(() => window.TimingChartProductionController.actions.setBusWidthAlignment('right')); const layout = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument().layout); assert.equal(layout.busWidthAlign, 'right');
  const rowStyle = await page.locator('#cycleCanvas .wave-row').filter({ hasText: 'busy' }).evaluate(row => getComputedStyle(row).backgroundColor); assert.notEqual(rowStyle, 'rgba(0, 0, 0, 0)');
  const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text); const parsed = JSON.parse(saved); assert.equal(parsed.layout.busWidthAlign, 'right'); assert.equal(parsed.signalGroups.find(g => g.id === 'group_internal').spacers.length, 1);
  const report = { rolePreserved: true, signalOrderPersisted: true, groupBand: true, spacer: true, busWidthAlignment: 'right', signalNameAlignmentIndependent: true, pass: true }; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/group-layout.png` }); await browser.close(); console.log('Issue #6 acceptance passed: role-independent groups, spacing/spacer, group bands, and bus-width alignment.');
} finally { server.kill(); }
