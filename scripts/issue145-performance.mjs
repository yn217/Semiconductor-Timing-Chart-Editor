import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts', 'issue145', 'lazy-performance.json');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(250);

const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
const summary = values => ({
  samples: values.length,
  medianMs: Number(percentile(values, 0.5).toFixed(1)),
  p95Ms: Number(percentile(values, 0.95).toFixed(1)),
  maxMs: Number(Math.max(...values).toFixed(1))
});

const installFixture = async ({ signals, cycles }) => {
  const started = Date.now();
  await page.evaluate(async ({ signals, cycles }) => {
    const controller = window.TimingChartProductionController;
    const documentValue = structuredClone(controller.getSerializableDocument());
    documentValue.document.id = `issue145-${signals}-${cycles}.tcd`;
    documentValue.timeline.cycleCount = cycles;
    documentValue.timeline.end = cycles;
    const generated = Array.from({ length: signals - 1 }, (_, index) => ({
      id: `issue145_sig_${index}`, name: `issue145_sig_${index}`,
      type: index % 7 === 0 ? 'bus' : 'binary',
      role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
      width: index % 7 === 0 ? 8 : undefined,
      source: { instancePath: [], signalName: `issue145_sig_${index}` },
      display: { name: `issue145_sig_${index}` },
      values: [
        { start: 0, value: index % 7 === 0 ? '00' : 0 },
        { start: Math.floor(cycles / 3), value: index % 7 === 0 ? '12' : 1 },
        { start: Math.floor(cycles * 2 / 3), value: index % 7 === 0 ? '34' : 0 }
      ]
    }));
    const clock = structuredClone(documentValue.signals.find(signal => signal.type === 'clock'));
    clock.id = 'issue145_clk'; clock.name = 'issue145_clk'; clock.display = { name: 'issue145_clk' };
    documentValue.timeline.referenceClock = clock.id;
    documentValue.signals = [clock, ...generated];
    documentValue.signalGroups = [{ id: 'issue145_group', name: 'Issue 145', rows: documentValue.signals.map(signal => signal.id) }];
    documentValue.annotations = [];
    documentValue.transactions = [];
    if (!await controller.actions.openText(JSON.stringify(documentValue), { fileName: documentValue.document.id, unsavedDecision: 'discard' })) throw new Error('fixture open failed');
    if (controller.waveformIdle) await controller.waveformIdle;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__issue145SvgIdentity = new Map([...document.querySelectorAll('#cycleCanvas .waveform-surface-row .trace svg')].map(svg => [svg.closest('.waveform-surface-row').dataset.signal, svg]));
  }, { signals, cycles });
  return Date.now() - started;
};

const clickReorder = async direction => {
  const row = page.locator('#groups .row[data-signal="issue145_sig_8"]');
  await row.locator('.more').click();
  const command = page.locator(`#issue6ContextMenu [data-command="${direction}"]`);
  const started = await page.evaluate(() => performance.now());
  await command.click();
  const finished = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now();
  });
  return finished - started;
};

const runs = [];
for (const fixture of [{ signals: 50, cycles: 100 }, { signals: 100, cycles: 500 }]) {
  const initialVisibleReadyMs = await installFixture(fixture);
  for (let index = 0; index < 3; index += 1) { await clickReorder('up'); await clickReorder('down'); }
  const up = [];
  const down = [];
  const beforeMetrics = await page.evaluate(() => structuredClone(window.TimingChartProductionController.renderMetrics));
  for (let index = 0; index < 20; index += 1) {
    up.push(await clickReorder('up'));
    down.push(await clickReorder('down'));
  }
  const state = await page.evaluate(() => {
    const controller = window.TimingChartProductionController;
    const canonical = controller.model.document.signalGroups.flatMap(group => group.rows || []).filter(id => controller.selectors.getSignal(id)?.type !== 'commentRow');
    const timing = [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal-id]')].map(row => row.dataset.signalId).filter(id => controller.selectors.getSignal(id)?.type !== 'commentRow');
    const surface = document.querySelector('#cycleCanvas .waveform-render-surface');
    const rendered = [...surface.querySelectorAll(':scope > .waveform-surface-row .trace svg')];
    const identityStable = [...window.__issue145SvgIdentity].every(([id, svg]) => surface.querySelector(`:scope > .waveform-surface-row[data-signal="${CSS.escape(id)}"] .trace svg`) === svg);
    const yErrors = rendered.filter(svg => {
      const lane = svg.closest('.waveform-surface-row');
      return lane.style.display !== 'none' && !lane.hidden;
    }).map(svg => {
      const id = svg.closest('.waveform-surface-row').dataset.signal;
      const shell = document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(id)}"] .trace`);
      return Math.abs(svg.getBoundingClientRect().top - shell.getBoundingClientRect().top);
    });
    return {
      canonicalOrder: JSON.stringify(canonical) === JSON.stringify(timing),
      identityStable,
      renderedSvgCount: rendered.length,
      totalSignalCount: controller.model.document.signals.filter(signal => signal.type !== 'commentRow').length,
      maxYErrorPx: Math.max(0, ...yErrors),
      metrics: structuredClone(controller.renderMetrics)
    };
  });
  runs.push({
    fixture,
    initialVisibleReadyMs,
    signalUp: summary(up),
    signalDown: summary(down),
    renderedSvgCount: state.renderedSvgCount,
    totalSignalCount: state.totalSignalCount,
    canonicalOrder: state.canonicalOrder,
    identityStable: state.identityStable,
    maxYErrorPx: state.maxYErrorPx,
    deltas: {
      waveDromRenders: state.metrics.waveDromRenders - beforeMetrics.waveDromRenders,
      geometryBuilds: state.metrics.geometryBuilds - beforeMetrics.geometryBuilds,
      appFullRenders: state.metrics.appFullRenders - beforeMetrics.appFullRenders
    }
  });
}

for (const run of runs) {
  assert.equal(run.canonicalOrder, true, JSON.stringify(run));
  assert.equal(run.identityStable, true, JSON.stringify(run));
  assert.ok(run.maxYErrorPx <= 0.1, JSON.stringify(run));
  assert.ok(run.renderedSvgCount < run.totalSignalCount, JSON.stringify(run));
  assert.equal(run.deltas.waveDromRenders, 0, JSON.stringify(run));
  assert.equal(run.deltas.geometryBuilds, 0, JSON.stringify(run));
  assert.equal(run.deltas.appFullRenders, 0, JSON.stringify(run));
}
assert.equal(errors.length, 0, errors.join('\n'));
const report = { issue: 145, browser: await browser.version(), viewport: { width: 1672, height: 941 }, measuredAt: new Date().toISOString(), runs, pass: true };
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
