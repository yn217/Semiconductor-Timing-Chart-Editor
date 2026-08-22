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
  await page.screenshot({ path: 'test-results/gui-signal-tab.png', fullPage: true });
  await page.locator('[data-tab="annotation"]').click();
  await page.screenshot({ path: 'test-results/gui-annotation-tab.png', fullPage: true });
  await page.locator('[data-tab="json"]').click();
  await page.screenshot({ path: 'test-results/gui-json-tab.png', fullPage: true });
  const boxes = await page.evaluate(() => Object.fromEntries(['.ribbon','.signal-tree','.center-column','.bottom','.inspector'].map(sel => [sel, document.querySelector(sel).getBoundingClientRect().toJSON()])));
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(boxes['.ribbon'].height >= 108 && boxes['.ribbon'].height <= 112);
  assert.ok(boxes['.signal-tree'].width >= 266 && boxes['.signal-tree'].width <= 270);
  assert.ok(boxes['.inspector'].width >= 334 && boxes['.inspector'].width <= 338);
  assert.ok(boxes['.bottom'].height >= 400 && boxes['.bottom'].height <= 440);
  assert.ok(boxes['.bottom'].x > boxes['.signal-tree'].right - 1 && boxes['.bottom'].right < boxes['.inspector'].x + 1);
  const wdState = await page.evaluate(() => ({ adapter: Boolean(window.TimingWaveDromAdapter), wavedrom: Boolean(window.WaveDrom?.RenderWaveForm), skin: Boolean(window.WaveSkin), body: document.body.innerHTML.includes('waveDromGeometry_0'), host: document.querySelector('#waveDromGeometry_0')?.innerHTML.slice(0, 120) ?? '', status: document.querySelector('#statusText')?.textContent ?? '' }));
  assert.ok(await page.locator('#waveDromGeometry_0 svg').count() > 0, `WaveDrom SVG subtree missing: ${JSON.stringify(wdState)}`);
  assert.ok(await page.locator('#waveDromGeometry_0 [id^="gmark_"]').count() >= 11, 'WaveDrom cycle geometry map missing');
  assert.ok(fs.existsSync('test-results/gui-signal-tab.png'));
  await browser.close();
  console.log('Browser GUI contract passed at 1672x941; Signal/Annotation/JSON screenshots captured.');
} finally {
  server.kill();
}
