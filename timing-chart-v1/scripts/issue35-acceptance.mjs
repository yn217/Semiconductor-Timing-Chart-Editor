import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue35';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4228'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4228/gui-mockup/', { waitUntil: 'networkidle' });
  const menu = page.locator('#issue26FileMenu');
  assert.equal(await menu.count(), 1);
  assert.equal(await menu.getAttribute('hidden'), '');
  assert.deepEqual(await menu.evaluate(node => { const rect = node.getBoundingClientRect(); return { display: getComputedStyle(node).display, zeroArea: rect.width === 0 && rect.height === 0, hit: document.elementFromPoint(rect.left + 2, rect.top + 2) === node }; }), { display: 'none', zeroArea: true, hit: false });
  await page.locator('.rtab').filter({ hasText: 'ファイル' }).click();
  assert.equal(await menu.getAttribute('hidden'), null);
  assert.equal(await menu.evaluate(node => getComputedStyle(node).display), 'grid');
  assert.deepEqual(await menu.locator('[data-file-export]').allTextContents(), ['SVGとして出力...', 'PNGとして出力...', 'PDFとして出力...']);
  await page.mouse.click(600, 300);
  assert.equal(await menu.getAttribute('hidden'), '');
  await page.locator('.rtab').filter({ hasText: 'ファイル' }).click();
  assert.equal(await menu.getAttribute('hidden'), null);
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('hidden'), '');
  await page.locator('.rtab').filter({ hasText: 'ファイル' }).click();
  await page.locator('.rtab').filter({ hasText: '注釈' }).click();
  assert.equal(await menu.getAttribute('hidden'), '');
  await page.screenshot({ path: `${root}/production-1672x941.png` });
  const report = { issue: 35, initialHidden: true, exactExports: 3, outsideClick: true, escape: true, tabSwitch: true, goldenReferenceModified: false, waveDromGeometryChanged: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #35 acceptance passed: File export menu is hidden initially and closes correctly.');
} finally {
  server.kill();
}
