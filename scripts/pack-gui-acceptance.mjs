import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = process.cwd();
const server = spawn('python', ['-m', 'http.server', '4175'], { cwd: root, stdio: 'ignore' });
fs.mkdirSync('test-results', { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const referencePage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await referencePage.goto('http://127.0.0.1:4175/references/gui-replacement-pack/production/', { waitUntil: 'networkidle' });
  await referencePage.screenshot({ path: 'test-results/gui-pack-reference.png' });
  await page.goto('http://127.0.0.1:4175/gui-mockup/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-results/gui-pack-production.png' });
  for (const selector of ['.ribbon-tabs', '.ribbon', '.left-panel', '.center', '.bottom', '.inspector', '.view-mode']) assert.ok(await page.locator(selector).count() > 0, `Replacement Pack selector missing: ${selector}`);
  const lockedOrder = await page.evaluate(() => [...document.querySelector('.workspace').children].map(node => node.className));
  assert.deepEqual(lockedOrder, ['left-panel', 'center', 'inspector'], 'Workspace DOM order is not locked to Replacement Pack');
  assert.deepEqual(await page.locator('.bottom-tabs [data-tab]').evaluateAll(nodes => nodes.map(node => node.dataset.tab)), ['signal', 'transaction', 'annotation', 'problems', 'json'], 'Bottom tab DOM order differs from Replacement Pack');
  assert.equal(await page.locator('link[href*="production-overrides"]').count(), 0, 'Legacy production override stylesheet is forbidden');
  for (const selector of ['.tabs-top', '.rg.clip', '.rg.edit', '.rg.signals', '.rg.order', '.rg.layout', '.rg.view', '.rg.display', '.jsonbar']) assert.equal(await page.locator(selector).count(), 0, `Forbidden legacy selector remains: ${selector}`);
  const reference = PNG.sync.read(fs.readFileSync('test-results/gui-pack-reference.png'));
  const dut = PNG.sync.read(fs.readFileSync('test-results/gui-pack-production.png'));
  assert.equal(reference.width, dut.width); assert.equal(reference.height, dut.height);
  let changed = 0;
  for (let i = 0; i < reference.data.length; i += 4) { const delta = Math.abs(reference.data[i] - dut.data[i]) + Math.abs(reference.data[i + 1] - dut.data[i + 1]) + Math.abs(reference.data[i + 2] - dut.data[i + 2]); if (delta > 24) changed++; }
  const totalPixels = reference.width * reference.height; const diffPercent = changed / totalPixels;
  const report = { viewport: { width: 1672, height: 941 }, changedPixels: changed, totalPixels, diffPercent, threshold: 0.05, pass: diffPercent <= 0.05, screenshot: 'test-results/gui-pack-production.png', reference: 'test-results/gui-pack-reference.png', goldenImage: 'references/gui-replacement-pack/00_overall_cycle_view.png' };
  fs.writeFileSync('test-results/gui-pack-acceptance.json', JSON.stringify(report, null, 2));
  assert.ok(report.pass, `Replacement Pack visual diff ${(diffPercent * 100).toFixed(2)}% exceeds 5%`);
  await browser.close();
  console.log(`Replacement Pack GUI acceptance passed: ${(diffPercent * 100).toFixed(2)}% visual diff at 1672x941.`);
} finally { server.kill(); }
