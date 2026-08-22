import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = process.cwd();
const server = spawn('python', ['-m', 'http.server', '4174'], { cwd: root, stdio: 'ignore' });
fs.mkdirSync('test-results', { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const viewport = { width: 1672, height: 941 };
const geometry = { ribbon: ['.ribbon', '.ribbon'], workspace: ['.workspace', '.workspace'], left: ['.left', '.signal-tree'], center: ['.center', '.center-column'], wave: ['.wave', '.canvas-pane'], bottom: ['.bottom', '.bottom'], right: ['.right', '.inspector'] };
const rects = async page => page.evaluate(selectors => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, document.querySelector(selector).getBoundingClientRect().toJSON()])), Object.fromEntries(Object.entries(geometry).map(([name, selectors]) => [name, selectors[0]])));
const diffs = (reference, dut) => Object.fromEntries(Object.entries(geometry).map(([name]) => [name, Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(Math.abs(reference[name][key] - dut[name][key]) * 100) / 100]))]));
try {
  await wait(800);
  const browser = await chromium.launch({ headless: true });
  const ref = await browser.newPage({ viewport });
  const dut = await browser.newPage({ viewport });
  await ref.goto('http://127.0.0.1:4174/ui-reference-v2/', { waitUntil: 'networkidle' });
  await dut.goto('http://127.0.0.1:4174/gui-mockup/', { waitUntil: 'networkidle' });
  await ref.screenshot({ path: 'test-results/ui-reference-v2.png' });
  await dut.screenshot({ path: 'test-results/gui-mockup-reference-dut.png' });
  assert.ok(await dut.locator('svg use[href^="icons.svg#"]').count() >= 20, 'Production icon sprite hooks missing');
  assert.ok(await dut.locator('svg use[href^="icons.svg#"]').first().evaluate(element => element.parentElement.getBoundingClientRect().width > 0), 'Production SVG icon is not rendered');
  const reference = await rects(ref);
  const production = await rects(dut);
  const layoutDiff = diffs(reference, production);
  for (const [name, values] of Object.entries(layoutDiff)) for (const [key, value] of Object.entries(values)) assert.ok(value <= 2, name + '.' + key + ' differs by ' + value + 'px');
  const refPng = PNG.sync.read(fs.readFileSync('test-results/ui-reference-v2.png'));
  const dutPng = PNG.sync.read(fs.readFileSync('test-results/gui-mockup-reference-dut.png'));
  assert.equal(refPng.width, dutPng.width);
  assert.equal(refPng.height, dutPng.height);
  const wave = reference.wave;
  const diffPng = new PNG({ width: refPng.width, height: refPng.height });
  let changed = 0;
  for (let y = 0; y < refPng.height; y++) for (let x = 0; x < refPng.width; x++) {
    const masked = x >= wave.x && x < wave.x + wave.width && y >= wave.y && y < wave.y + wave.height;
    const i = (y * refPng.width + x) * 4;
    const delta = Math.abs(refPng.data[i] - dutPng.data[i]) + Math.abs(refPng.data[i + 1] - dutPng.data[i + 1]) + Math.abs(refPng.data[i + 2] - dutPng.data[i + 2]);
    if (!masked && delta > 24) { changed++; diffPng.data[i] = 220; diffPng.data[i + 1] = 40; diffPng.data[i + 2] = 40; diffPng.data[i + 3] = 220; }
    else { diffPng.data[i] = 255; diffPng.data[i + 1] = 255; diffPng.data[i + 2] = 255; diffPng.data[i + 3] = 0; }
  }
  fs.writeFileSync('test-results/ui-reference-vs-dut-diff.png', PNG.sync.write(diffPng));
  const report = { viewport, layoutDiff, masked: 'waveform region', changedPixels: changed, screenshots: ['test-results/ui-reference-v2.png', 'test-results/gui-mockup-reference-dut.png', 'test-results/ui-reference-vs-dut-diff.png'] };
  fs.writeFileSync('test-results/ui-reference-vs-dut-report.json', JSON.stringify(report, null, 2));
  await browser.close();
  console.log('UI Reference vs DUT passed: all major geometry differences <=2px; visual diff generated (' + changed + ' changed pixels outside masked waveform).');
} finally {
  server.kill();
}
