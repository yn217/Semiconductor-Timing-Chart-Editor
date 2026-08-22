import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3e1';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4194'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { cases: {}, pass: false };

try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const open = async () => { await page.goto('http://127.0.0.1:4194/gui-mockup/', { waitUntil: 'networkidle' }); await wait(50); };
  const addSecondClock = async () => page.evaluate(() => {
    const controller = window.TimingChartProductionController;
    const doc = controller.model.document;
    doc.signals.push({ id: 'clk_b', name: 'clk_b', type: 'clock', role: 'input', generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: true, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } });
    doc.signalGroups[0].rows.push('clk_b'); doc.timeline.referenceClock = 'clk_b';
    const source = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(row => row.querySelector('.signal-label')?.textContent?.trim() === 'clk');
    const row = source.cloneNode(true); row.querySelector('.signal-label').textContent = 'clk_b'; document.querySelector('#cycleCanvas .ruler').parentElement.appendChild(row);
    controller.render();
  });
  const independentBoundaries = () => page.evaluate(() => {
    const controller = window.TimingChartProductionController;
    const reference = controller.selectors.getReferenceClock();
    const row = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(item => item.querySelector('.signal-label')?.textContent?.trim() === reference.id);
    const svg = row?.querySelector('svg');
    const lines = [...(svg?.querySelectorAll('[id^="gmarks_"] line[id^="gmark_"]') || [])];
    return { signal: reference.id, points: lines.map(line => new DOMPoint(Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))).matrixTransform(line.getScreenCTM())).map(point => ({ x: point.x, y: point.y })) };
  });
  const tickCenters = () => page.evaluate(() => [...document.querySelectorAll('#cycleCanvas .ruler .tick')].map(tick => ({ cycle: Number(tick.dataset.cycle), x: tick.getBoundingClientRect().left + tick.getBoundingClientRect().width / 2 })));
  const playhead = () => page.evaluate(() => { const r = document.querySelector('#cycleCanvas .playhead').getBoundingClientRect(); return r.left; });

  await open();
  const api = await page.evaluate(() => window.TimingChartProductionController.getCycleBoundary({ signal: 'clk', cycle: 4, coordinateSpace: 'canvas' }));
  assert.equal(api.source, 'wavedrom-svg'); assert.equal(api.signal, 'clk'); assert.equal(api.cycle, 4);
  assert.ok(Number.isFinite(api.localX) && Number.isFinite(api.canvasX)); assert.equal(api.x, api.canvasX); assert.equal(api.y, api.canvasY);
  report.cases.geometryCoordinate = { source: api.source, local: { x: api.localX, y: api.localY }, canvas: { x: api.canvasX, y: api.canvasY }, pass: true };
  fs.writeFileSync(`${root}/geometry-coordinate-test.json`, `${JSON.stringify(report.cases.geometryCoordinate, null, 2)}\n`);

  await addSecondClock();
  await page.evaluate(() => window.TimingChartProductionController.actions.insertCycles(4, 3));
  const independent = await independentBoundaries();
  const ticks = await tickCenters();
  assert.equal(independent.signal, 'clk_b');
  assert.equal(ticks.length, 13);
  const errors = ticks.map((tick, index) => Math.abs(tick.x - independent.points[index].x));
  assert.ok(errors.every(error => error <= 0.1), JSON.stringify({ errors, independent, ticks }));
  const clkA = await page.evaluate(() => window.TimingChartProductionController.model.waveGeometry.signals.clk.cycleBoundary[4].canvasX);
  const clkB = independent.points[4].x;
  const apiB = await page.evaluate(() => window.TimingChartProductionController.getCycleBoundary({ signal: 'clk_b', cycle: 4, coordinateSpace: 'canvas' }));
  assert.equal(apiB.signal, 'clk_b'); assert.ok(Math.abs(apiB.canvasX - clkB) <= 0.1); assert.notEqual(apiB.signal, 'clk');
  const multiple = { referenceClock: 'clk_b', geometrySource: 'wavedrom-svg', rulerErrors: errors, clkA: { x: clkA, signal: 'clk' }, clkB: { x: clkB, signal: apiB.signal }, pass: true };
  report.cases.multipleClockReference = multiple;
  fs.writeFileSync(`${root}/multiple-clock-reference.json`, `${JSON.stringify(multiple, null, 2)}\n`);
  await page.screenshot({ path: `${root}/ruler-playhead-1672.png` });

  await page.evaluate(() => { window.innerWidth; document.querySelector('#cycleCanvas').scrollLeft = 0; });
  const selected = 6;
  await page.evaluate(cycle => { const model = window.TimingChartProductionController.model; model.timeSelection.cycle = cycle; window.TimingChartProductionController.renderTransient(model); }, selected);
  const expectedSelected = independent.points[selected].x;
  assert.ok(Math.abs(await playhead() - expectedSelected) <= 0.1);
  report.cases.viewport1672 = { rulerMaxError: Math.max(...errors), playheadError: Math.abs(await playhead() - expectedSelected), scrollLeft: 0, pass: true };

  await page.setViewportSize({ width: 1280, height: 720 }); await wait(50); await page.evaluate(() => window.TimingChartProductionController.renderTransient(window.TimingChartProductionController.model));
  const independent1280 = await independentBoundaries(); const ticks1280 = await tickCenters();
  const errors1280 = ticks1280.map((tick, index) => Math.abs(tick.x - independent1280.points[index].x));
  assert.ok(errors1280.every(error => error <= 0.1), JSON.stringify({ errors1280 }));
  await page.screenshot({ path: `${root}/ruler-playhead-1280.png` });
  report.cases.viewport1280 = { rulerMaxError: Math.max(...errors1280), pass: true };

  const scrollResult = await page.evaluate(() => {
    const canvas = document.querySelector('#cycleCanvas'); canvas.scrollLeft = 120;
    const model = window.TimingChartProductionController.model; model.timeSelection.cycle = 5; window.TimingChartProductionController.renderTransient(model);
    const reference = model.document.timeline.referenceClock;
    const row = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(item => item.querySelector('.signal-label')?.textContent?.trim() === reference);
    const svg = row.querySelector('svg'); const lines = [...svg.querySelectorAll('[id^="gmarks_"] line[id^="gmark_"]')];
    const points = lines.map(line => new DOMPoint(Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))).matrixTransform(line.getScreenCTM()));
    const ticks = [...document.querySelectorAll('#cycleCanvas .ruler .tick')].map(tick => tick.getBoundingClientRect().left + tick.getBoundingClientRect().width / 2);
    const play = document.querySelector('#cycleCanvas .playhead').getBoundingClientRect().left;
    return { scrollLeft: canvas.scrollLeft, rulerErrors: ticks.map((x, index) => Math.abs(x - points[index].x)), playheadError: Math.abs(play - points[5].x) };
  });
  assert.ok(scrollResult.scrollLeft > 0); assert.ok(scrollResult.rulerErrors.every(error => error <= 0.1), JSON.stringify(scrollResult)); assert.ok(scrollResult.playheadError <= 0.1, JSON.stringify(scrollResult));
  report.cases.scrolled = { ...scrollResult, pass: true };
  await page.screenshot({ path: `${root}/scrolled-ruler-playhead.png` });

  report.viewport = { primary: { width: 1672, height: 941 }, secondary: { width: 1280, height: 720 } };
  report.pass = true;
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Phase 3E.1 acceptance passed: reference-clock geometry API, multiple clocks, resize, scroll, ruler and playhead alignment.');
} catch (error) {
  report.error = { name: error.name, message: error.message, stack: error.stack };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally { server.kill(); }
