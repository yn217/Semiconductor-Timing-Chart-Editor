import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifacts', 'issue142');
await fs.mkdir(out, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4292'], { cwd: root, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  await page.goto('http://127.0.0.1:4292/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.model?.waveGeometry));
  await page.evaluate(() => window.TimingChartProductionController.waveformIdle);

  const result = await page.evaluate(async () => {
    const controller = window.TimingChartProductionController;
    const waveform = window.TimingChartProductionWaveform;
    const transitionPattern = /^#(?:0m1|1m0|vmv|dmv|umv|zmv)/;
    const hrefOf = use => use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
    const point = (value, matrix) => {
      const transformed = new DOMPoint(value.x, value.y).matrixTransform(matrix);
      return { x: transformed.x, y: transformed.y };
    };
    const independentSegment = (path, matrix) => {
      const length = path.getTotalLength();
      const samples = 10001;
      const tolerance = 1e-4;
      const first = path.getPointAtLength(0);
      const last = path.getPointAtLength(length);
      const values = Array.from({ length: samples }, (_, index) => ({
        distance: length * index / (samples - 1),
        point: path.getPointAtLength(length * index / (samples - 1))
      }));
      const firstChanged = values.findIndex(item => Math.abs(item.point.y - first.y) > tolerance);
      const lastChanged = values.findLastIndex(item => Math.abs(item.point.y - last.y) > tolerance);
      const refine = (low, high, predicate) => {
        for (let index = 0; index < 36; index += 1) {
          const middle = (low + high) / 2;
          if (predicate(path.getPointAtLength(middle))) high = middle;
          else low = middle;
        }
        return (low + high) / 2;
      };
      const startDistance = firstChanged > 0
        ? refine(values[firstChanged - 1].distance, values[firstChanged].distance, value => Math.abs(value.y - first.y) > tolerance)
        : 0;
      const endDistance = lastChanged >= 0 && lastChanged < values.length - 1
        ? refine(values[lastChanged].distance, values[lastChanged + 1].distance, value => Math.abs(value.y - last.y) <= tolerance)
        : length;
      return {
        start: point(path.getPointAtLength(startDistance), matrix),
        center: point(path.getPointAtLength((startDistance + endDistance) / 2), matrix),
        end: point(path.getPointAtLength(endDistance), matrix)
      };
    };
    const referenceGeometry = svg => {
      const root = svg.getCTM();
      const transitions = [];
      const clocks = { pclk: [], nclk: [] };
      const allHrefs = [];
      for (const use of svg.querySelectorAll('[id^="wavelane_draw_"] > use')) {
        const href = hrefOf(use);
        allHrefs.push(href);
        const isClock = href === '#pclk' || href === '#nclk';
        if (!isClock && !transitionPattern.test(href)) continue;
        const definition = document.getElementById(href.slice(1));
        const path = definition?.querySelector('path.s1') || definition?.querySelector('path');
        if (!path || !root || !use.getCTM()) continue;
        const segment = independentSegment(path, root.inverse().multiply(use.getCTM()));
        if (isClock) clocks[href.slice(1)].push({ href, point: { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 } });
        else transitions.push({ href, ...segment });
      }
      return { transitions, clocks, allHrefs };
    };
    const fixtures = [
      { id: 'binary', type: 'binary', values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 4, value: 0 }] },
      { id: 'vmv', type: 'bus', values: [{ start: 0, value: 'A' }, { start: 2, value: 'B' }] },
      { id: 'dmv', type: 'bus', values: [{ start: 0, value: 'd' }, { start: 2, value: 'A' }] },
      { id: 'umv', type: 'bus', values: [{ start: 0, value: 'u' }, { start: 2, value: 'A' }] },
      { id: 'zmv', type: 'bus', values: [], rawWave: 'z.=...', rawData: ['A'] },
      { id: 'clock', type: 'clock', generator: { polarity: 'positive', period: 1, phase: 0 } }
    ].map(signal => ({ ...signal, name: signal.id, role: 'internal' }));
    const compareFixture = (signal, index) => {
      const documentModel = { timeline: { cycleCount: 6 }, signals: [signal] };
      const originalWaveFor = window.TimingWaveDromAdapter.waveFor;
      const adapted = signal.rawWave ? { wave: signal.rawWave, data: signal.rawData, subcycleFactor: 1 } : originalWaveFor(signal, 6);
      if (signal.rawWave) window.TimingWaveDromAdapter.waveFor = () => adapted;
      let production;
      try { production = waveform.renderTestDocument(documentModel).geometry.signals[signal.id]; }
      finally { window.TimingWaveDromAdapter.waveFor = originalWaveFor; }
      const host = document.createElement('div');
      host.id = `issue142_reference_${index}`;
      host.style.cssText = 'position:absolute;left:-20000px;top:0';
      document.body.appendChild(host);
      const waveJson = { signal: [{ name: '', wave: adapted.wave, ...(adapted.data ? { data: adapted.data } : {}) }], config: { hscale: 3.7 } };
      if (signal.type === 'clock') {
        waveJson.signal[0].period = adapted.period;
        waveJson.signal[0].phase = adapted.phase;
      }
      window.WaveDrom.RenderWaveForm(index, waveJson, 'issue142_reference_', false);
      const svg = host.querySelector('svg');
      const reference = referenceGeometry(svg);
      host.remove();
      return { id: signal.id, wave: adapted.wave, production, reference };
    };
    const metricsBefore = { ...controller.renderMetrics };
    const fixtureResults = fixtures.map((signal, index) => compareFixture(signal, 900 + index));
    const metricsAfterFirst = { ...controller.renderMetrics };
    fixtures.forEach((signal, index) => compareFixture(signal, 950 + index));
    const metricsAfterSecond = { ...controller.renderMetrics };

    const waitFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const liveCheck = label => {
      const geometry = controller.model.waveGeometry.signals.req_valid;
      const actual = geometry.transitionStart[0];
      const lane = document.querySelector('.waveform-surface-row[data-signal="req_valid"]');
      const svg = lane.querySelector('svg');
      const use = [...svg.querySelectorAll('[id^="wavelane_draw_"] > use')].find(item => transitionPattern.test(hrefOf(item)));
      const definition = document.getElementById(hrefOf(use).slice(1));
      const path = definition.querySelector('path.s1') || definition.querySelector('path');
      const local = independentSegment(path, svg.getCTM().inverse().multiply(use.getCTM())).start;
      const screen = point(local, svg.getScreenCTM());
      const anchor = waveform.getAnchor({ signal: 'req_valid', cycle: actual.cycle, edge: 'transition-start', coordinateSpace: 'canvas' });
      return { label, localExpected: local, localActual: { x: actual.localX, y: actual.localY }, screenExpected: screen, screenActual: { x: anchor.canvasX, y: anchor.canvasY } };
    };
    const live = [liveCheck('zoom-100')];
    for (const zoom of [50, 150, 200]) {
      controller.actions.setZoom(zoom);
      await controller.waveformIdle;
      await waitFrames();
      live.push(liveCheck(`zoom-${zoom}`));
    }
    const scrollHost = window.TimingChartTimingViewport.getScrollHost();
    scrollHost.scrollLeft = Math.min(500, scrollHost.scrollWidth - scrollHost.clientWidth);
    scrollHost.dispatchEvent(new Event('scroll'));
    await waitFrames();
    live.push(liveCheck('horizontal-scroll'));
    controller.actions.moveSignalBy('req_valid', 1);
    await controller.waveformIdle;
    await waitFrames();
    live.push(liveCheck('reorder'));

    return { fixtures: fixtureResults, live, metrics: { before: metricsBefore, first: metricsAfterFirst, second: metricsAfterSecond } };
  });

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const comparisons = [];
  const supported = new Set();
  for (const fixture of result.fixtures) {
    const expected = fixture.reference.transitions;
    const actual = fixture.production;
    assert.equal(actual.transitionStart.length, expected.length, fixture.id);
    assert.equal(actual.transitionCenter.length, expected.length, fixture.id);
    assert.equal(actual.transitionEnd.length, expected.length, fixture.id);
    expected.forEach((reference, index) => {
      const shape = reference.href.match(/^#(0m1|1m0|vmv|dmv|umv|zmv)/)?.[1];
      if (shape) supported.add(shape);
      for (const [kind, collection] of [['start', 'transitionStart'], ['center', 'transitionCenter'], ['end', 'transitionEnd']]) {
        const error = distance(reference[kind], { x: actual[collection][index].localX, y: actual[collection][index].localY });
        comparisons.push({ fixture: fixture.id, href: reference.href, kind, errorPx: error });
        assert.ok(error <= 0.1, `${fixture.id} ${reference.href} ${kind}: ${error}px`);
      }
    });
    if (fixture.id === 'clock') {
      for (const [kind, collection] of [['pclk', 'risingEdge'], ['nclk', 'fallingEdge']]) {
        assert.equal(actual[collection].length, fixture.reference.clocks[kind].length);
        fixture.reference.clocks[kind].forEach((reference, index) => {
          const error = distance(reference.point, { x: actual[collection][index].localX, y: actual[collection][index].localY });
          comparisons.push({ fixture: fixture.id, href: `#${kind}`, kind: 'edge-center', errorPx: error });
          assert.ok(error <= 0.1, `${kind} edge: ${error}px`);
        });
      }
    }
  }
  assert.deepEqual([...supported].sort(), ['0m1', '1m0', 'dmv', 'umv', 'vmv', 'zmv'], JSON.stringify(result.fixtures.map(item => ({ id: item.id, wave: item.wave, hrefs: [...new Set(item.reference.allHrefs)] }))));
  for (const item of result.live) {
    assert.ok(distance(item.localExpected, item.localActual) <= 0.1, `${item.label} local`);
    assert.ok(distance(item.screenExpected, item.screenActual) <= 0.1, `${item.label} screen`);
  }
  const samplesAfterFirst = result.metrics.first.transitionPathSamples || 0;
  const samplesAfterSecond = result.metrics.second.transitionPathSamples || 0;
  const resolvesAfterFirst = result.metrics.first.transitionDefinitionResolves || 0;
  const resolvesAfterSecond = result.metrics.second.transitionDefinitionResolves || 0;
  assert.equal(samplesAfterSecond - samplesAfterFirst, 0, 'second geometry build must use cached definition boundaries');
  assert.equal(resolvesAfterSecond - resolvesAfterFirst, 0, 'second geometry build must not resolve definitions again');
  assert.deepEqual(pageErrors, []);

  const acceptance = {
    issue: 142,
    tolerancePx: 0.1,
    supportedShapes: [...supported].sort(),
    maxErrorPx: Math.max(...comparisons.map(item => item.errorPx)),
    comparisons,
    live: result.live,
    cache: {
      firstDefinitionResolves: resolvesAfterFirst - (result.metrics.before.transitionDefinitionResolves || 0),
      firstPathSamples: samplesAfterFirst - (result.metrics.before.transitionPathSamples || 0),
      secondDefinitionResolves: resolvesAfterSecond - resolvesAfterFirst,
      secondPathSamples: samplesAfterSecond - samplesAfterFirst
    },
    pageErrors,
    pass: true
  };
  await page.screenshot({ path: path.join(out, 'production-1672x941.png') });
  await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
  await browser.close();
  console.log(`Issue #142 acceptance passed: ${acceptance.supportedShapes.join(', ')}, max error ${acceptance.maxErrorPx.toFixed(6)}px, cached second pass 0 samples.`);
} finally {
  server.kill();
}
