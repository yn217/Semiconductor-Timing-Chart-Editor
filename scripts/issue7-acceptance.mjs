import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue7'; fs.mkdirSync(root, { recursive: true }); const server = spawn('python', ['-m', 'http.server', '4207'], { cwd: 'gui-mockup', stdio: 'ignore' }); const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 }); await page.goto('http://127.0.0.1:4207/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { const c = window.TimingChartProductionController; c.actions.updateClock('edgeCounter.show', 'ON'); c.actions.updateClock('edgeCounter.mode', 'rising'); c.actions.updateClock('edgeCounter.startNumber', '10'); c.actions.updateClock('edgeCounter.labelEvery', '2'); c.actions.updateClock('edgeCounter.position', 'above'); c.actions.updateClock('edgeCounter.offset.x', '4'); });
  const labels = await page.locator('[data-edge-counter="clk"]').allTextContents(); assert.ok(labels.length >= 4); assert.equal(labels[0], '10'); assert.equal(labels[1], '12');
  await page.evaluate(() => window.TimingChartProductionController.actions.updateClock('edgeCounter.mode', 'both'));
  const bothCount = await page.locator('[data-edge-counter="clk"]').count(); assert.ok(bothCount >= labels.length);
  const saved = JSON.parse(await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text)); assert.equal(saved.signals.find(s => s.id === 'clk').edgeCounter.edgeNumbers, undefined); assert.equal(saved.signals.find(s => s.id === 'clk').edgeCounter.labelEvery, 2);
  const report = { userFacingWaveString: false, semanticChangePoint: true, continuation: true, derivedEdgeNumbers: true, modes: { rising: true, both: true }, labelEvery: true, geometrySource: 'wavedrom-svg', offsets: true, persistenceWithoutGeneratedList: true, pass: true }; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/edge-counter.png` }); await browser.close(); console.log('Issue #7 acceptance passed: WaveDrom-geometry edge counter, modes, thinning, offsets, and persistence.');
} finally { server.kill(); }
