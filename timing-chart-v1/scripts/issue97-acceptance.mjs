import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue97');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const result = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const base = structuredClone(controller.getSerializableDocument());
  const cycles = 200;
  const clock = structuredClone(base.signals.find(signal => signal.type === 'clock'));
  clock.id = 'issue97_clock'; clock.name = clock.display.name = 'issue97_clock';
  const signals = Array.from({ length: 99 }, (_, index) => ({
    id: `issue97_signal_${index}`,
    name: `issue97_signal_${index}`,
    type: index % 4 === 0 ? 'bus' : index % 4 === 1 ? 'state' : 'binary',
    role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
    source: { instancePath: [], signalName: `issue97_signal_${index}` },
    display: { name: `issue97_signal_${index}` },
    values: [
      { start: 0, value: index % 4 === 0 ? 'D0' : index % 4 === 1 ? 'S0' : 0 },
      { start: 80 + (index % 3), value: index % 4 === 0 ? 'D1' : index % 4 === 1 ? 'S1' : 1 },
      { start: 160 + (index % 3), value: index % 4 === 0 ? 'D2' : index % 4 === 1 ? 'S2' : 0 }
    ]
  }));
  const testDocument = { timeline: { cycleCount: cycles }, signals: [clock, ...signals] };
  // Render representative binary/bus/state/clock traces with the same
  // Production WaveDrom geometry builder. The large benchmark then expands
  // those actual WaveDrom anchor records into 100 layout rows, which keeps the
  // browser fixture bounded while exercising the production index at the
  // required candidate volume.
  const geometry = { cycleCount: cycles, signals: {}, cycleBoundary: [] };
  for (const signal of testDocument.signals.slice(0, 4)) {
    const rendered = window.TimingChartProductionWaveform.renderTestDocument({ timeline: { cycleCount: cycles }, signals: [signal] }).geometry;
    Object.assign(geometry.signals, rendered.signals);
    if (!geometry.cycleBoundary.length) geometry.cycleBoundary = rendered.cycleBoundary;
  }
  const actualEntries = Object.values(geometry.signals);
  for (let index = 4; index < testDocument.signals.length; index += 1) {
    const source = actualEntries[index % actualEntries.length];
    const signalId = testDocument.signals[index].id;
    const rowOffset = index * 20;
    const copy = structuredClone(source);
    for (const key of ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition']) {
      copy[key] = (copy[key] || []).map(item => ({ ...item, signal: signalId, canvasY: item.canvasY + rowOffset, y: item.y + rowOffset }));
    }
    geometry.signals[signalId] = copy;
  }
  controller.model.waveGeometry = geometry;
  const pointFor = anchorType => anchorType === 'rising-edge' || anchorType === 'rising-transition-center' ? 'rising' : anchorType === 'falling-edge' || anchorType === 'falling-transition-center' ? 'falling' : ['cycle-boundary', 'transition-start', 'transition-center', 'transition-end'].includes(anchorType) ? anchorType : 'transition-center';
  const candidates = Object.values(geometry.signals).flatMap(entry => ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd'].flatMap(key => (entry[key] || []).map(item => ({ item, point: pointFor(item.anchorType) }))));
  if (candidates.length <= 1000) throw new Error(`expected thousands of candidates, got ${candidates.length}`);
  const brute = (x, y) => {
    let best = null; let bestD2 = Infinity;
    for (const candidate of candidates) {
      const dx = candidate.item.canvasX - x; const dy = candidate.item.canvasY - y; const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { best = candidate; bestD2 = d2; }
    }
    return best && Math.sqrt(bestD2) <= 28 ? { signal: best.item.signal, cycle: Number(best.item.cycle), point: best.point } : null;
  };
  controller.annotationSnapMetrics.indexBuilds = 0;
  controller.annotationSnapMetrics.queries = 0;
  controller.annotationSnapMetrics.candidateScans = 0;
  controller.annotationSnapMetrics.yCandidates = 0;
  controller.annotationSnapMetrics.sortCount = 0;
  controller.annotationSnapMetrics.screenMatrixCalls = 0;
  const queries = Array.from({ length: 200 }, (_, index) => { const candidate = candidates[(index * 37) % candidates.length].item; return { x: candidate.canvasX + (index % 3) - 1, y: candidate.canvasY + ((index + 1) % 3) - 1 }; });
  const mismatches = [];
  for (const query of queries) {
    const expected = brute(query.x, query.y);
    const actual = controller.resolveAnnotationAnchorPointer(query);
    if (JSON.stringify(expected) !== JSON.stringify(actual && { signal: actual.signal, cycle: actual.cycle, point: actual.point })) mismatches.push({ query, expected, actual });
  }
  const metrics = { ...controller.annotationSnapMetrics };
  return { signalCount: testDocument.signals.length, cycleCount: cycles, candidateCount: candidates.length, queryCount: queries.length, metrics, mismatches, geometryBuilds: controller.renderMetrics.geometryBuilds, errors: [] };
});

assert.equal(result.errors.length, 0);
assert.equal(errors.length, 0, errors.join('\n'));
assert.ok(result.signalCount >= 100);
assert.equal(result.cycleCount, 200);
assert.ok(result.candidateCount > 1000, JSON.stringify(result));
assert.equal(result.queryCount, 200);
assert.equal(result.metrics.indexBuilds, 1, JSON.stringify(result));
assert.equal(result.metrics.sortCount, 1, JSON.stringify(result));
assert.equal(result.metrics.screenMatrixCalls, 0, JSON.stringify(result));
assert.equal(result.mismatches.length, 0, JSON.stringify(result.mismatches.slice(0, 3)));
assert.ok(result.metrics.candidateScans < result.candidateCount * result.queryCount, JSON.stringify(result));
await page.screenshot({ path: path.join(out, 'issue97-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 97, fixture: { signals: result.signalCount, cycles: result.cycleCount, candidates: result.candidateCount, queries: result.queryCount }, result, pass: true }, null, 2)}\n`);
await browser.close();
console.log('Issue #97 acceptance passed: cached WaveDrom anchor index, Y narrowing, no per-query sort/CTM, brute-force equivalence.');
