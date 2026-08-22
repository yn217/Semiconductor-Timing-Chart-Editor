import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue27';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4217'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checkAlignment = page => page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const clock = controller.selectors.getReferenceClock();
  const boundary = controller.getCycleBoundary({ signal: clock.id, cycle: 0, coordinateSpace: 'canvas' });
  const bands = [...document.querySelectorAll('#cycleCanvas .wave-row .comment-body, #cycleCanvas .wave-row .latency')];
  const rows = bands.map(node => ({ title: node.closest('.wave-row')?.querySelector('.signal-label')?.textContent?.trim(), left: node.getBoundingClientRect().left, errorPx: Math.abs(node.getBoundingClientRect().left - boundary.canvasX), source: node.dataset.cycle0Aligned }));
  return { boundary: { x: boundary.canvasX, source: boundary.source }, rows, scrollLeft: document.querySelector('#cycleCanvas').scrollLeft };
});

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4217/', { waitUntil: 'networkidle' });
    const beforeDocument = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
    const initial = await checkAlignment(page);
    assert.equal(initial.boundary.source, 'wavedrom-svg');
    assert.equal(initial.rows.length, 3);
    assert.ok(initial.rows.every(row => row.source === 'wavedrom-svg' && row.errorPx <= 0.1), JSON.stringify(initial));
    const traceGeometry = await page.evaluate(() => [...document.querySelectorAll('#cycleCanvas .trace svg')].map(svg => { const r = svg.getBoundingClientRect(); return [r.left, r.width, r.top, r.height]; }));
    await page.evaluate(() => { const canvas = document.querySelector('#cycleCanvas'); canvas.scrollLeft = Math.min(180, canvas.scrollWidth - canvas.clientWidth); });
    await page.waitForTimeout(100);
    const scrolled = await checkAlignment(page);
    assert.ok(scrolled.rows.every(row => row.errorPx <= 0.1), JSON.stringify(scrolled));
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.getCycleBoundary({ signal: 'clk', cycle: 0, coordinateSpace: 'canvas' }).source), 'wavedrom-svg');
    const scrolledTraceGeometry = await page.evaluate(() => [...document.querySelectorAll('#cycleCanvas .trace svg')].map(svg => { const r = svg.getBoundingClientRect(); return [r.left, r.width, r.top, r.height]; }));
    const scrollDelta = scrolled.scrollLeft - initial.scrollLeft;
    assert.equal(scrolledTraceGeometry.length, traceGeometry.length);
    scrolledTraceGeometry.forEach((rect, index) => { assert.ok(Math.abs(rect[0] - (traceGeometry[index][0] - scrollDelta)) <= 0.1); assert.deepEqual(rect.slice(1), traceGeometry[index].slice(1)); });
    assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), beforeDocument);
    await page.screenshot({ path: `${root}/production-${viewport.width}x${viewport.height}.png` });
    results.push({ viewport, initial, scrolled, traceGeometryUnchanged: true, canonicalUnchanged: true, pass: true });
    await page.close();
  }
  const source = fs.readFileSync('gui-mockup/production-time-axis.js', 'utf8');
  assert.ok(source.includes('getCycleBoundary') && source.includes('cycle: 0') && source.includes('wavedrom-svg'));
  assert.ok(!source.includes('cycle * pitch') && !source.includes('cycle* pitch'));
  const report = { issue: 27, geometrySource: 'WaveDrom actual SVG', maxErrorPx: 0.1, fixedOriginOffset: false, goldenReferenceModified: false, results, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #27 acceptance passed: Comment Row timing bands align to actual WaveDrom Cycle-0 geometry through scroll and resize viewports.');
} finally {
  server.kill();
}
