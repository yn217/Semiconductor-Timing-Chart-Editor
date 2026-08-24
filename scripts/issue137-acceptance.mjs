import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'artifacts', 'issue137');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(250);

const report = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const base = structuredClone(controller.getSerializableDocument());
  const makeDocument = (name, signalCount, cycles) => {
    const value = structuredClone(base);
    const clock = structuredClone(value.signals.find(signal => signal.type === 'clock'));
    clock.id = `${name}_clk`; clock.name = clock.id; clock.display = { name: clock.id };
    const signals = Array.from({ length: signalCount - 1 }, (_, index) => ({
      id: `${name}_sig_${index}`, name: `${name}_sig_${index}`, type: 'binary', role: 'internal',
      source: { instancePath: [], signalName: `${name}_sig_${index}` }, display: { name: `${name}_sig_${index}` },
      values: [{ start: 0, value: 0 }, { start: Math.floor(cycles / 2), value: 1 }]
    }));
    value.document.id = `${name}.tcd`; value.timeline.cycleCount = cycles; value.timeline.end = cycles; value.timeline.referenceClock = clock.id;
    value.signals = [clock, ...signals]; value.signalGroups = [{ id: `${name}_group`, name, rows: value.signals.map(signal => signal.id) }];
    value.annotations = []; value.transactions = [];
    return value;
  };
  const docs = { A: makeDocument('epoch_A', 40, 80), B: makeDocument('epoch_B', 12, 20), C: makeDocument('epoch_C', 14, 24) };
  const open = async name => {
    const accepted = await controller.actions.openText(JSON.stringify(docs[name]), { fileName: `${name}.tcd`, unsavedDecision: 'discard' });
    if (controller.openIdle) await controller.openIdle;
    if (!accepted) throw new Error(`Open ${name} failed`);
  };
  const consistent = expected => {
    const canonical = controller.model.document.signalGroups.flatMap(group => group.rows || []);
    const timing = [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal]')].map(row => row.dataset.signalId || row.dataset.signal);
    const frozen = [...document.querySelectorAll('#cycleCanvas .frozen-label-row[data-signal]')].map(row => row.dataset.signal);
    const currentIds = new Set(controller.model.document.signals.map(signal => signal.id));
    const geometryIds = Object.keys(controller.model.waveGeometry?.signals || {});
    const visible = [...document.querySelectorAll('#cycleCanvas .waveform-surface-row[data-signal]')].filter(lane => !lane.hidden && lane.style.display !== 'none').map(lane => lane.dataset.signal);
    const reference = controller.model.document.timeline.referenceClock;
    return {
      documentId: controller.model.document.document.id,
      expected: `${expected}.tcd`,
      canonicalTiming: JSON.stringify(canonical) === JSON.stringify(timing),
      canonicalFrozen: JSON.stringify(canonical) === JSON.stringify(frozen),
      geometryCurrent: geometryIds.every(id => currentIds.has(id)),
      visibleGeometry: visible.every(id => geometryIds.includes(id)),
      referenceGeometry: (controller.model.waveGeometry?.cycleBoundary || []).every(point => point.signal === reference),
      timingUpdating: controller.timelineRenderActive || document.querySelector('#cycleCanvas')?.getAttribute('aria-busy') === 'true'
    };
  };
  const requireConsistent = (state, label) => {
    if (state.documentId !== state.expected || !state.canonicalTiming || !state.canonicalFrozen || !state.geometryCurrent || !state.visibleGeometry || !state.referenceGeometry || state.timingUpdating) throw new Error(`${label}: ${JSON.stringify(state)}`);
  };

  await open('A');
  const beforeOpenRace = structuredClone(controller.asyncRenderMetrics);
  controller.actions.insertCycles(10, 1);
  const staleOpenJob = controller.waveformIdle;
  const busyDuringOpenRace = controller.timelineRenderActive && document.querySelector('#cycleCanvas').getAttribute('aria-busy') === 'true'
    && controller.getCycleBoundary({ signal: controller.model.document.timeline.referenceClock, cycle: 1 }) === undefined;
  await open('B');
  const staleOpenResult = await staleOpenJob;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterOpenRace = consistent('epoch_B'); requireConsistent(afterOpenRace, 'cycle-edit-open');

  await open('A');
  controller.actions.insertCycles(8, 1);
  const staleNewJob = controller.waveformIdle;
  await controller.actions.requestNew({ unsavedDecision: 'discard' });
  const staleNewResult = await staleNewJob;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const newState = { documentId: controller.model.document.document.id, staleNewResult, geometryIds: Object.keys(controller.model.waveGeometry?.signals || {}), active: controller.timelineRenderActive };

  await open('A');
  controller.actions.insertCycles(6, 1);
  const firstTimelineJob = controller.waveformIdle;
  controller.actions.insertCycles(7, 1);
  const secondTimelineJob = controller.waveformIdle;
  const firstTimelineResult = await firstTimelineJob;
  const secondTimelineResult = await secondTimelineJob;
  const afterSequential = consistent('epoch_A'); requireConsistent(afterSequential, 'sequential-timeline');

  controller.actions.insertCycles(5, 1);
  const staleUndoJob = controller.waveformIdle;
  controller.actions.undo();
  const staleUndoResult = await staleUndoJob;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterUndo = consistent('epoch_A'); requireConsistent(afterUndo, 'timeline-undo');

  controller.actions.insertCycles(4, 1);
  const rapidStaleJob = controller.waveformIdle;
  await open('B'); await open('C');
  const rapidStaleResult = await rapidStaleJob;
  const afterRapid = consistent('epoch_C'); requireConsistent(afterRapid, 'rapid-open');

  await open('A');
  const originalRender = window.WaveDrom.RenderWaveForm;
  const exceptionsBefore = controller.asyncRenderMetrics.asyncRenderExceptions;
  window.WaveDrom.RenderWaveForm = () => { throw new Error('issue137-forced-wave-error'); };
  controller.actions.insertCycles(3, 1);
  const failedJob = controller.waveformIdle;
  const failedResult = await failedJob;
  window.WaveDrom.RenderWaveForm = originalRender;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterException = consistent('epoch_A'); requireConsistent(afterException, 'exception-recovery');
  const exceptionSettled = failedResult === false && !controller.timelineRenderActive && !controller.timingInteractionBlocked && document.querySelector('#cycleCanvas').getAttribute('aria-busy') !== 'true' && controller.asyncRenderMetrics.asyncRenderExceptions === exceptionsBefore + 1 && !controller.lastAsyncRenderRecoveryError;
  controller.actions.undo();

  const metrics = structuredClone(controller.asyncRenderMetrics);
  return {
    busyDuringOpenRace, staleOpenResult, staleNewResult, newState,
    firstTimelineResult, secondTimelineResult, staleUndoResult, rapidStaleResult, failedResult, exceptionSettled,
    afterOpenRace, afterSequential, afterUndo, afterRapid, afterException,
    cancellationDelta: metrics.asyncRenderCanceled - beforeOpenRace.asyncRenderCanceled,
    staleRejectDelta: metrics.stalePublishRejected - beforeOpenRace.stalePublishRejected,
    metrics
  };
});

assert.equal(report.busyDuringOpenRace, true, JSON.stringify(report));
for (const value of [report.staleOpenResult, report.staleNewResult, report.firstTimelineResult, report.staleUndoResult, report.rapidStaleResult, report.failedResult]) assert.equal(value, false, JSON.stringify(report));
assert.ok(report.secondTimelineResult && Number.isFinite(report.secondTimelineResult.totalMs), JSON.stringify(report));
assert.equal(report.newState.documentId, 'untitled.tcd');
assert.deepEqual(report.newState.geometryIds.filter(id => id.startsWith('epoch_A')), []);
assert.equal(report.newState.active, false);
assert.equal(report.exceptionSettled, true, JSON.stringify(report));
assert.ok(report.cancellationDelta >= 5, JSON.stringify(report));
assert.ok(report.staleRejectDelta >= 5, JSON.stringify(report));
assert.equal(pageErrors.length, 0, pageErrors.join('\n'));

const result = { issue: 137, ...report, pageErrors, pass: true };
await page.screenshot({ path: path.join(out, 'epoch-acceptance-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(result, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(result, null, 2));
