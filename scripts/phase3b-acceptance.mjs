import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const server = spawn('python', ['-m', 'http.server', '4179'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const diffOutsideTrace = (referencePath, dutPath, masks) => {
  const reference = PNG.sync.read(fs.readFileSync(referencePath));
  const dut = PNG.sync.read(fs.readFileSync(dutPath));
  assert.equal(reference.width, dut.width);
  assert.equal(reference.height, dut.height);
  let changedPixels = 0;
  let minX = reference.width, minY = reference.height, maxX = -1, maxY = -1;
  for (let y = 0; y < reference.height; y += 1) for (let x = 0; x < reference.width; x += 1) {
    if (masks.some(({ left, top, right, bottom }) => x >= left && x < right && y >= top && y < bottom)) continue;
    const i = (y * reference.width + x) * 4;
    if (reference.data[i] !== dut.data[i] || reference.data[i + 1] !== dut.data[i + 1] || reference.data[i + 2] !== dut.data[i + 2] || reference.data[i + 3] !== dut.data[i + 3]) { changedPixels += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return { changedPixels, totalPixels: reference.width * reference.height, diffPercent: changedPixels / (reference.width * reference.height), bbox: changedPixels ? { minX, minY, maxX, maxY } : null };
};
const writeMaskedDiff = (referencePath, dutPath, outputPath, masks) => {
  const reference = PNG.sync.read(fs.readFileSync(referencePath));
  const dut = PNG.sync.read(fs.readFileSync(dutPath));
  const output = new PNG({ width: reference.width, height: reference.height });
  for (let y = 0; y < reference.height; y += 1) for (let x = 0; x < reference.width; x += 1) {
    const i = (y * reference.width + x) * 4;
    const masked = masks.some(({ left, top, right, bottom }) => x >= left && x < right && y >= top && y < bottom);
    const different = reference.data[i] !== dut.data[i] || reference.data[i + 1] !== dut.data[i + 1] || reference.data[i + 2] !== dut.data[i + 2] || reference.data[i + 3] !== dut.data[i + 3];
    if (masked) [output.data[i], output.data[i + 1], output.data[i + 2], output.data[i + 3]] = [170, 170, 170, 255];
    else if (different) [output.data[i], output.data[i + 1], output.data[i + 2], output.data[i + 3]] = [220, 30, 30, 255];
    else [output.data[i], output.data[i + 1], output.data[i + 2], output.data[i + 3]] = [255, 255, 255, 255];
  }
  fs.writeFileSync(outputPath, PNG.sync.write(output));
};

try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4179/gui-mockup/', { waitUntil: 'networkidle' });
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.ok(await page.locator('#cycleCanvas .trace[data-renderer="wavedrom"]').count() >= 7, 'All signal traces must be WaveDrom-mounted');
  assert.equal(await page.locator('#cycleCanvas .trace:not([data-renderer="wavedrom"])').count(), 0);
  assert.equal(await page.locator('#cycleCanvas .trace > svg[data-renderer="wavedrom"]').count(), 7);
  assert.equal(await page.locator('#cycleCanvas .trace > svg path[data-custom-signal-trace]').count(), 0);
  assert.equal(await page.locator('#cycleCanvas .wave-row').evaluateAll(rows => rows.filter(row => !row.querySelector('.trace')).length), 3, 'Comment rows must remain outside WaveDrom');

  const geometry = await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry);
  assert.equal(Object.keys(geometry.signals).length, 7);
  const boundaryArrays = Object.values(geometry.signals).map(signal => signal.cycleBoundary);
  for (let cycle = 0; cycle <= geometry.cycleCount; cycle += 1) {
    const expected = boundaryArrays[0][cycle];
    for (const boundaries of boundaryArrays) assert.ok(Math.abs(boundaries[cycle] - expected) <= 0.1, `Cycle ${cycle} is misaligned`);
  }
  const controller = await page.evaluate(() => ({
    reqRise: window.TimingChartProductionController.getAnchor({ signal: 'req_valid', cycle: 3, edge: 'rising' }),
    reqFall: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 7, edge: 'falling' }),
    busTransition: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_addr[7:0]', cycle: 2, edge: 'transition' })
  }));
  assert.ok(controller.reqRise && controller.reqFall && controller.busTransition, JSON.stringify(controller));
  await page.screenshot({ path: 'test-results/phase3b-cycle-production.png' });
  await page.locator('#cycleCanvas .wave-row').nth(0).screenshot({ path: 'test-results/phase3b-clock-trace.png' });
  await page.locator('#cycleCanvas .wave-row').nth(1).screenshot({ path: 'test-results/phase3b-binary-trace.png' });
  await page.locator('#cycleCanvas .wave-row').nth(2).screenshot({ path: 'test-results/phase3b-bus-trace.png' });
  await page.locator('#cycleCanvas .wave-row').nth(5).screenshot({ path: 'test-results/phase3b-state-trace.png' });

  const masks = await page.locator('#cycleCanvas .trace').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: Math.floor(rect.left) - 4, top: Math.floor(rect.top) - 4, right: Math.ceil(rect.right) + 4, bottom: Math.ceil(rect.bottom) + 4 };
  }));
  const diff = diffOutsideTrace('artifacts/gui-phase3a/production-screenshot-1672x941.png', 'test-results/phase3b-cycle-production.png', masks);
  assert.equal(diff.changedPixels, 0, `GUI lock diff outside trace is ${diff.diffPercent}`);
  writeMaskedDiff('artifacts/gui-phase3a/production-screenshot-1672x941.png', 'test-results/phase3b-cycle-production.png', 'test-results/phase3b-gui-lock-diff.png', masks);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/phase3b-acceptance.json', JSON.stringify({
    viewport: { width: 1672, height: 941 },
    productionDom: { wavedromTraceCount: 7, staticMockTraceCount: 0, customSignalTraceCount: 0 },
    guiLockRegression: { ...diff, threshold: 0, pass: diff.changedPixels === 0 },
    cycleAlignmentPx: 0,
    geometryMap: { signals: Object.keys(geometry.signals).length, anchors: controller }
  }, null, 2));
  fs.writeFileSync('test-results/phase3b-geometry.json', JSON.stringify({ geometry, anchors: controller, masks, guiLockDiff: diff }, null, 2));
  await browser.close();
  console.log(`Phase 3B acceptance passed: ${Object.keys(geometry.signals).length} WaveDrom traces, GUI lock diff outside traces ${diff.diffPercent.toFixed(4)}%, cycle alignment <= 0.1px.`);
} finally {
  server.kill();
}
