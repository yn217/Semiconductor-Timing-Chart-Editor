import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

execFileSync('node', ['scripts/phase3a-golden-manifest.mjs'], { stdio: 'inherit' });
execFileSync('git', ['diff', '--quiet', '4eaa0b6', '--', 'references/gui-replacement-pack'], { stdio: 'inherit' });
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('gui-mockup/styles.css')).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync('references/gui-replacement-pack/production/styles.css')).digest('hex'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('gui-mockup/icons.svg')).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync('references/gui-replacement-pack/production/icons.svg')).digest('hex'));

const server = spawn('python', ['-m', 'http.server', '4182'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4182/gui-mockup/', { waitUntil: 'networkidle' });
  assert.deepEqual(errors, [], errors.join('\n'));
  const geometry = await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry);
  const signalGeometry = geometry.signals;
  assert.equal(signalGeometry.clk.risingEdge.length, 10);
  assert.equal(signalGeometry.clk.fallingEdge.length, 10);
  assert.ok(signalGeometry.req_valid.transitionStart.length >= 2);
  assert.ok(signalGeometry.req_valid.transitionCenter.length >= 2);
  assert.ok(signalGeometry.req_valid.transitionEnd.length >= 2);
  for (const signal of Object.values(signalGeometry)) {
    for (const collection of ['risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition']) {
      for (const item of signal[collection] ?? []) assert.equal(item.source, 'wavedrom-svg');
    }
  }

  const hitTest = await page.evaluate(() => {
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const pointsFor = (svg, use) => {
      const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const path = document.getElementById(href.slice(1))?.querySelector('path');
      if (!path) return [];
      const matrix = svg.getScreenCTM().inverse().multiply(use.getScreenCTM());
      const length = path.getTotalLength();
      return Array.from({ length: 161 }, (_, index) => new DOMPoint(path.getPointAtLength(length * index / 160).x, path.getPointAtLength(length * index / 160).y).matrixTransform(matrix));
    };
    const hit = (signal, anchors, hrefs) => {
      const row = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(item => item.querySelector('.signal-label')?.textContent.trim() === signal);
      const id = row.dataset.signalId || row.dataset.signal;
      const svg = document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${CSS.escape(id)}"] .trace svg`);
      const points = [...svg.querySelectorAll('[id^="wavelane_draw_"] use')].filter(use => hrefs.includes(use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href'))).flatMap(use => pointsFor(svg, use));
      return anchors.map(anchor => Math.min(...points.map(point => distance(anchor, point))));
    };
    const model = window.TimingChartProductionController.model.waveGeometry.signals;
    return {
      clockRising: hit('clk', model.clk.risingEdge, ['#pclk']),
      clockFalling: hit('clk', model.clk.fallingEdge, ['#nclk']),
      binaryStart: hit('req_valid', model.req_valid.transitionStart, ['#0m1', '#1m0']),
      binaryCenter: hit('req_valid', model.req_valid.transitionCenter, ['#0m1', '#1m0']),
      binaryEnd: hit('req_valid', model.req_valid.transitionEnd, ['#0m1', '#1m0'])
    };
  });
  for (const distances of Object.values(hitTest)) assert.ok(distances.every(distance => distance <= 0.5), JSON.stringify(hitTest));

  const anchors = await page.evaluate(() => ({
    local: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 3, edge: 'transition-center', coordinateSpace: 'local' }),
    canvas: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 3, edge: 'transition-center', coordinateSpace: 'canvas' })
  }));
  assert.equal(anchors.local.source, 'wavedrom-svg');
  assert.notEqual(anchors.local.localY, 0);
  const coordinateCheck = await page.evaluate(anchor => {
    const svg = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(row => row.querySelector('.signal-label')?.textContent.trim() === 'req_valid').querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    return { x: rect.left + (anchor.localX - viewBox.x) * rect.width / viewBox.width, y: rect.top + (anchor.localY - viewBox.y) * rect.height / viewBox.height, actualX: anchor.canvasX, actualY: anchor.canvasY };
  }, anchors.local);
  assert.ok(Math.abs(coordinateCheck.x - coordinateCheck.actualX) <= 0.1);
  assert.ok(Math.abs(coordinateCheck.y - coordinateCheck.actualY) <= 0.1);

  const periodTest = await page.evaluate(() => window.TimingChartProductionWaveform.renderTestDocument({
    cycleCount: 8, timeBase: 'cycle', referenceClock: 'clk_a', edge: 'rising',
    signals: [{ id: 'clk_a', name: 'clk_a', type: 'clock', role: 'input', polarity: 'positive', period: 2, phase: 0 }]
  }));
  assert.equal(periodTest.waveJson[0].period, 2);
  assert.equal(periodTest.waveJson[0].phase, 0);
  assert.ok(periodTest.geometry.signals.clk_a.risingEdge.length > 0);
  const multipleClockTest = await page.evaluate(() => window.TimingChartProductionWaveform.renderTestDocument({
    cycleCount: 8, timeBase: 'cycle', referenceClock: 'clk_a', edge: 'rising',
    signals: [
      { id: 'clk_a', name: 'clk_a', type: 'clock', role: 'input', polarity: 'positive', period: 1, phase: 0 },
      { id: 'clk_b', name: 'clk_b', type: 'clock', role: 'input', polarity: 'negative', period: 2, phase: 0.5 }
    ]
  }));
  assert.ok(multipleClockTest.geometry.signals.clk_a.risingEdge.length > 0);
  assert.ok(multipleClockTest.geometry.signals.clk_b.fallingEdge.length > 0);
  assert.notDeepEqual(multipleClockTest.geometry.signals.clk_a.risingEdge, multipleClockTest.geometry.signals.clk_b.risingEdge);

  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/phase3b1-cycle-production.png' });
  await page.locator('#cycleCanvas .wave-row').nth(0).screenshot({ path: 'test-results/phase3b1-clock-edge-geometry.png' });
  await page.locator('#cycleCanvas .wave-row').nth(1).screenshot({ path: 'test-results/phase3b1-binary-transition-geometry.png' });
  await page.screenshot({ path: 'test-results/phase3b1-multi-clock-geometry.png' });
  const acceptance = { clockEdges: { rising: signalGeometry.clk.risingEdge, falling: signalGeometry.clk.fallingEdge, hitTest: hitTest.clockRising.every(value => value <= 0.5) && hitTest.clockFalling.every(value => value <= 0.5) }, binaryTransitions: { start: signalGeometry.req_valid.transitionStart, center: signalGeometry.req_valid.transitionCenter, end: signalGeometry.req_valid.transitionEnd }, coordinateCheck, periodTest: { waveJson: periodTest.waveJson, risingEdges: periodTest.geometry.signals.clk_a.risingEdge.length }, multipleClocks: Object.fromEntries(Object.entries(multipleClockTest.geometry.signals).map(([id, value]) => [id, { rising: value.risingEdge.length, falling: value.fallingEdge.length }])), clockConstraints: { duty: 'unsupported', reason: 'WaveDrom 3.6.2 standard signal WaveJSON has no duty field; no custom clock path is used.' }, pass: true };
  fs.writeFileSync('test-results/phase3b1-geometry.json', JSON.stringify({ geometry, hitTest, anchors, periodTest, multipleClockTest }, null, 2));
  fs.writeFileSync('test-results/phase3b1-acceptance.json', JSON.stringify(acceptance, null, 2));
  await browser.close();
  console.log('Phase 3B.1 acceptance passed: actual SVG geometry anchors, clock edges, coordinate spaces, period/phase, and multiple clocks.');
} finally { server.kill(); }
