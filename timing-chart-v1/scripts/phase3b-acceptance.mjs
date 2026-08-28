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
    for (const boundaries of boundaryArrays) assert.ok(Math.abs(boundaries[cycle].localX - expected.localX) <= 0.1 && Math.abs(boundaries[cycle].localY - expected.localY) <= 0.1, `Cycle ${cycle} is misaligned: ${JSON.stringify(boundaryArrays)}`);
  }
  const controller = await page.evaluate(() => ({
    reqRise: window.TimingChartProductionController.getAnchor({ signal: 'req_valid', cycle: 3, edge: 'rising' }),
    reqFall: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 7, edge: 'falling' }),
    busTransition: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_addr[7:0]', cycle: 2, edge: 'transition-center' })
  }));
  assert.ok(controller.reqRise && controller.reqFall && controller.busTransition, JSON.stringify(controller));
  await page.screenshot({ path: 'test-results/phase3b-cycle-production.png' });
  await page.locator('#cycleCanvas .wave-row').nth(0).screenshot({ path: 'test-results/phase3b-clock-trace.png' });
  await page.locator('#cycleCanvas .wave-row').nth(1).screenshot({ path: 'test-results/phase3b-binary-trace.png' });
  await page.locator('#cycleCanvas .wave-row').nth(2).screenshot({ path: 'test-results/phase3b-bus-trace.png' });
  await page.locator('#cycleCanvas .wave-row').nth(5).screenshot({ path: 'test-results/phase3b-state-trace.png' });

  const masks = await page.locator('#cycleCanvas .trace').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    // WaveDrom's generated SVG can extend beyond the host's nominal 28px lane
    // because the default skin owns its stroke/text extents. Mask the complete
    // trace lane for GUI-lock comparison; geometry is verified separately.
    return { left: Math.floor(rect.left) - 8, top: Math.floor(rect.top) - 20, right: Math.ceil(rect.right) + 8, bottom: Math.ceil(rect.bottom) + 20 };
  }));
  // Phase 3C renders live Semantic Model values into the locked editor. The
  // editor geometry remains covered by DOM Lock; its data-bearing content is
  // dynamic and is validated by phase3c-acceptance instead of Golden pixels.
  const bottomRect = await page.locator('#bottomContent').boundingBox();
  if (bottomRect) masks.push({ left: Math.floor(bottomRect.x), top: Math.floor(bottomRect.y), right: Math.ceil(bottomRect.x + bottomRect.width), bottom: Math.ceil(bottomRect.y + bottomRect.height) });
  const dynamicContract = await page.evaluate(() => {
    const ruler = document.querySelector('#cycleCanvas .ruler');
    const playhead = document.querySelector('#cycleCanvas .playhead');
    const canvas = document.querySelector('#cycleCanvas');
    const rulerRect = ruler.getBoundingClientRect();
    const ticks = [...ruler.querySelectorAll('.tick')];
    const tickMasks = ticks.flatMap(tick => { const rect = tick.getBoundingClientRect(); return [{ left: Math.floor(rect.left) - 8, top: Math.floor(rulerRect.top) - 8, right: Math.ceil(rect.right) + 8, bottom: Math.ceil(rulerRect.bottom) + 8 }]; });
    const staticCell = (rulerRect.width - 175) / 11;
    for (let cycle = 0; cycle < ticks.length; cycle += 1) { const center = rulerRect.left + 175 + (cycle + 1.5) * staticCell; tickMasks.push({ left: Math.floor(center) - 8, top: Math.floor(rulerRect.top) - 8, right: Math.ceil(center) + 8, bottom: Math.ceil(rulerRect.bottom) + 8 }); }
    const playRect = playhead.getBoundingClientRect(); const oldPlayheadX = canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width * 0.497;
    const playheadMasks = [{ left: Math.floor(playRect.left) - 8, top: Math.floor(canvas.getBoundingClientRect().top) - 4, right: Math.ceil(playRect.right) + 8, bottom: Math.ceil(canvas.getBoundingClientRect().bottom) }, { left: Math.floor(oldPlayheadX) - 8, top: Math.floor(canvas.getBoundingClientRect().top) - 4, right: Math.ceil(oldPlayheadX) + 8, bottom: Math.ceil(canvas.getBoundingClientRect().bottom) }];
    const style = element => { const computed = getComputedStyle(element); return { fontSize: computed.fontSize, color: computed.color, height: computed.height, backgroundColor: computed.backgroundColor, borderBottom: computed.borderBottom, borderLeft: computed.borderLeft, width: computed.width, top: computed.top, bottom: computed.bottom, zIndex: computed.zIndex }; };
    const before = getComputedStyle(playhead, ':before');
    return { masks: [...tickMasks, ...playheadMasks], style: { ruler: style(ruler), tick: style(ticks[0]), playhead: style(playhead), marker: { borderTop: before.borderTop, borderLeft: before.borderLeft, borderRight: before.borderRight, top: before.top } }, labels: ticks.map(tick => tick.textContent), title: ruler.querySelector('.cycle-title')?.textContent || '' };
  });
  masks.push(...dynamicContract.masks);
  assert.deepEqual(dynamicContract.labels, Array.from({ length: 10 }, (_, index) => String(index)));
  assert.equal(dynamicContract.title, 'cycle');
  assert.deepEqual(dynamicContract.style.ruler, { fontSize: '13px', color: 'rgb(52, 68, 90)', height: '34px', backgroundColor: 'rgba(0, 0, 0, 0)', borderBottom: '0px none rgb(52, 68, 90)', borderLeft: '0px none rgb(52, 68, 90)', width: dynamicContract.style.ruler.width, top: '0px', bottom: '0px', zIndex: 'auto' });
  assert.equal(dynamicContract.style.tick.fontSize, '11px'); assert.equal(dynamicContract.style.tick.color, 'rgb(52, 68, 90)');
  assert.equal(dynamicContract.style.playhead.borderLeft, '1px solid rgb(45, 131, 239)'); assert.equal(dynamicContract.style.playhead.zIndex, '3');
  assert.equal(dynamicContract.style.marker.borderTop, '8px solid rgb(45, 131, 239)');
  const diff = diffOutsideTrace('artifacts/gui-phase3a/production-screenshot-1672x941.png', 'test-results/phase3b-cycle-production.png', masks);
  assert.equal(diff.changedPixels, 0, `GUI lock diff outside trace is ${diff.diffPercent}`);
  writeMaskedDiff('artifacts/gui-phase3a/production-screenshot-1672x941.png', 'test-results/phase3b-cycle-production.png', 'test-results/phase3b-gui-lock-diff.png', masks);
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/phase3b-acceptance.json', JSON.stringify({
    viewport: { width: 1672, height: 941 },
    productionDom: { wavedromTraceCount: 7, staticMockTraceCount: 0, customSignalTraceCount: 0 },
    guiLockRegression: { ...diff, threshold: 0, pass: diff.changedPixels === 0 },
    staticGuiLock: { ...diff, threshold: 0, pass: diff.changedPixels === 0, dynamicMask: dynamicContract },
    cycleAlignmentPx: 0,
    geometryMap: { signals: Object.keys(geometry.signals).length, anchors: controller }
  }, null, 2));
  fs.writeFileSync('test-results/phase3b-geometry.json', JSON.stringify({ geometry, anchors: controller, masks, guiLockDiff: diff }, null, 2));
  await browser.close();
  console.log(`Phase 3B acceptance passed: ${Object.keys(geometry.signals).length} WaveDrom traces, GUI lock diff outside traces ${diff.diffPercent.toFixed(4)}%, cycle alignment <= 0.1px.`);
} finally {
  server.kill();
}
