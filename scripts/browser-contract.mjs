import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python', ['-m', 'http.server', '4173'], { cwd: 'gui-mockup', stdio: 'ignore' });
fs.mkdirSync('test-results', { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(800);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  const transactionTab = page.locator('[data-tab="transaction"]');
  assert.equal(await transactionTab.isVisible(), false, 'Cycle View must hide Transaction tab');
  await page.locator('.view-mode [data-mode="transaction"]').click();
  assert.equal(await transactionTab.isVisible(), true, 'Transaction View must expose Transaction tab');
  await page.locator('.view-mode [data-mode="cycle"]').click();
  assert.equal(await transactionTab.isVisible(), false, 'Returning to Cycle View must hide Transaction tab');
  await page.screenshot({ path: 'test-results/gui-signal-tab.png' });
  await page.locator('[data-tab="annotation"]').click();
  await page.screenshot({ path: 'test-results/gui-annotation-tab.png' });
  await page.locator('[data-tab="json"]').click();
  await page.screenshot({ path: 'test-results/gui-json-tab.png' });
  const boxes = await page.evaluate(() => Object.fromEntries(['.ribbon','.left-panel','.center','.bottom','.inspector'].map(sel => [sel, document.querySelector(sel).getBoundingClientRect().toJSON()])));
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(boxes['.ribbon'].height > 0 && boxes['.left-panel'].width > 0 && boxes['.inspector'].width > 0);
  assert.ok(await page.locator('#cycleCanvas .trace[data-renderer="wavedrom"] svg').count() >= 7, 'WaveDrom SVG trace subtree missing');
  assert.equal(await page.locator('#cycleCanvas .trace [data-static-mock="true"]').count(), 0, 'Static mock trace remains mounted');
  assert.equal(await page.locator('#cycleCanvas .trace svg:not([data-renderer="wavedrom"])').count(), 0, 'Custom signal trace is mounted');
  assert.equal(await page.locator('#cycleCanvas .trace').evaluateAll(hosts => hosts.filter(host => host.dataset.renderer !== 'wavedrom').length), 0);
  await browser.close();
  console.log('Browser GUI contract passed at 1672x941; view switching, bottom tabs, and WaveDrom DOM verified.');
} finally { server.kill(); }
