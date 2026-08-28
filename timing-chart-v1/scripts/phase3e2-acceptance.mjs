import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3e2';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4197'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { cases: {}, pass: false };
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const open = async () => { await page.goto('http://127.0.0.1:4197/gui-mockup/', { waitUntil: 'networkidle' }); await wait(50); };
  const independent = () => page.evaluate(() => {
    const c = window.TimingChartProductionController; const id = c.selectors.getReferenceClock().id;
    const row = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(item => item.querySelector('.signal-label')?.textContent?.trim() === id);
    const svg = row.querySelector('svg');
    const lines = [...svg.querySelectorAll('[id^="gmarks_"] line[id^="gmark_"]')];
    return { signal: id, points: lines.map(line => new DOMPoint(Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))).matrixTransform(line.getScreenCTM())).map(point => ({ x: point.x, y: point.y })) };
  });
  const ticks = () => page.evaluate(() => [...document.querySelectorAll('#cycleCanvas .ruler .tick')].map(item => ({ cycle: Number(item.dataset.cycle), x: item.getBoundingClientRect().left + item.getBoundingClientRect().width / 2 })));
  const playhead = () => page.evaluate(() => document.querySelector('#cycleCanvas .playhead').getBoundingClientRect().left);
  const render = () => page.evaluate(() => window.TimingChartProductionController.renderTransient(window.TimingChartProductionController.model));

  await open();
  const initial = await independent(); const initialTicks = await ticks();
  const initialErrors = initialTicks.map((tick, index) => Math.abs(tick.x - initial.points[index].x));
  assert.equal(initial.signal, 'clk'); assert.equal(initialTicks.length, 10); assert.ok(initialErrors.every(error => error <= 0.1), JSON.stringify(initialErrors));
  fs.writeFileSync(`${root}/initial-10cycle-geometry.json`, `${JSON.stringify({ cycleCount: 10, source: 'wavedrom-svg', referenceClock: initial.signal, errors: initialErrors, pass: true }, null, 2)}\n`);
  await page.screenshot({ path: `${root}/initial-10cycle.png` });
  report.cases.initialGeometry = { referenceClock: initial.signal, maxRulerError: Math.max(...initialErrors), source: 'wavedrom-svg', pass: true };

  const clickResults = [];
  for (const cycle of [2, 7]) {
    await page.locator(`#cycleCanvas .ruler .tick[data-cycle="${cycle}"]`).click(); await render();
    const expected = (await independent()).points[cycle].x; const actual = await playhead();
    assert.equal((await page.evaluate(() => window.TimingChartProductionController.model.timeSelection.cycle)), cycle);
    assert.ok(Math.abs(actual - expected) <= 0.1, JSON.stringify({ cycle, actual, expected }));
    clickResults.push({ cycle, playheadX: actual, boundaryX: expected, error: Math.abs(actual - expected) });
  }
  report.cases.clickPlayhead = { clicks: clickResults, pass: true };
  fs.writeFileSync(`${root}/10cycle-click-playhead.json`, `${JSON.stringify(report.cases.clickPlayhead, null, 2)}\n`);

  const addClock = () => page.evaluate(() => {
    const c = window.TimingChartProductionController; const doc = c.model.document;
    doc.signals.push({ id: 'clk_b', name: 'clk_b', type: 'clock', role: 'input', generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: true, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } });
    doc.signalGroups[0].rows.push('clk_b');
    const source = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(row => row.querySelector('.signal-label')?.textContent?.trim() === 'clk');
    const row = source.cloneNode(true); row.querySelector('.signal-label').textContent = 'clk_b'; document.querySelector('#cycleCanvas .ruler').parentElement.appendChild(row);
    doc.timeline.referenceClock = 'clk_b'; c.render();
  });
  await addClock(); await render();
  const multiB = await independent(); const multiTicks = await ticks(); const multiErrors = multiTicks.map((tick, index) => Math.abs(tick.x - multiB.points[index].x));
  assert.equal(multiB.signal, 'clk_b'); assert.ok(multiErrors.every(error => error <= 0.1), JSON.stringify(multiErrors));
  const apiB = await page.evaluate(() => window.TimingChartProductionController.getCycleBoundary({ signal: 'clk_b', cycle: 2, coordinateSpace: 'canvas' }));
  assert.equal(apiB.signal, 'clk_b'); assert.equal(apiB.source, 'wavedrom-svg');
  await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.document.timeline.referenceClock = 'clk'; c.render(); }); await render();
  const multiA = await independent(); assert.equal(multiA.signal, 'clk');
  report.cases.multipleClock = { initialReference: 'clk_b', switchedReference: multiA.signal, source: apiB.source, clkBMaxRulerError: Math.max(...multiErrors), pass: true };
  fs.writeFileSync(`${root}/10cycle-multiple-clock.json`, `${JSON.stringify(report.cases.multipleClock, null, 2)}\n`);

  await open(); await page.setViewportSize({ width: 1280, height: 720 }); await wait(80); await render();
  const resized = await independent(); const resizedTicks = await ticks(); const resizeErrors = resizedTicks.map((tick, index) => Math.abs(tick.x - resized.points[index].x));
  assert.ok(resizeErrors.every(error => error <= 0.1), JSON.stringify(resizeErrors));
  const resizePlayhead = await playhead(); const resizeExpected = resized.points[0].x; assert.ok(Math.abs(resizePlayhead - resizeExpected) <= 0.1);
  const canvasScroll = await page.evaluate(() => { const canvas = document.querySelector('#cycleCanvas'); canvas.scrollLeft = 120; return canvas.scrollLeft; }); await render();
  const scrolled = await independent(); const scrolledTicks = await ticks(); const scrollErrors = scrolledTicks.map((tick, index) => Math.abs(tick.x - scrolled.points[index].x));
  const scrollPlayhead = await playhead(); assert.ok(scrollErrors.every(error => error <= 0.1), JSON.stringify(scrollErrors)); assert.ok(Math.abs(scrollPlayhead - scrolled.points[0].x) <= 0.1);
  report.cases.resizeScroll = { viewport: { width: 1280, height: 720 }, resizeMaxRulerError: Math.max(...resizeErrors), resizePlayheadError: Math.abs(resizePlayhead - resizeExpected), scrollLeft: canvasScroll, scrollMaxRulerError: Math.max(...scrollErrors), scrollPlayheadError: Math.abs(scrollPlayhead - scrolled.points[0].x), pass: true };
  await page.screenshot({ path: `${root}/10cycle-resize-scroll.png` });
  report.pass = true; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await browser.close();
  console.log('Phase 3E.2 acceptance passed: all 10-cycle ruler and playhead paths use reference-clock WaveDrom geometry.');
} catch (error) { report.error = { name: error.name, message: error.message, stack: error.stack }; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); throw error; } finally { server.kill(); }
