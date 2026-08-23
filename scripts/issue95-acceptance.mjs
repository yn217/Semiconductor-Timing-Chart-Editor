import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue95');
const fixtureSignalCount = 100;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const result = await page.evaluate(async fixtureSignalCount => {
  const controller = window.TimingChartProductionController;
  const base = structuredClone(controller.getSerializableDocument());
  base.document.id = 'issue95-large.tcd';
  base.timeline.cycleCount = 100;
  base.timeline.end = 100;
  const issueSignals = Array.from({ length: fixtureSignalCount - 1 }, (_, index) => ({
    id: `issue95_sig_${index}`,
    name: `issue95_sig_${index}`,
    type: 'binary',
    role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
    source: { instancePath: [], signalName: `issue95_sig_${index}` },
    display: { name: `issue95_sig_${index}` },
    values: [{ start: 0, value: 0 }, { start: 40 + (index % 10), value: 1 }, { start: 80 + (index % 10), value: 0 }]
  }));
  const referenceClock = structuredClone(base.signals.find(signal => signal.type === 'clock'));
  referenceClock.id = 'issue95_clk';
  referenceClock.name = 'issue95_clk';
  referenceClock.display = { name: 'issue95_clk' };
  base.timeline.referenceClock = referenceClock.id;
  base.signals = [referenceClock, ...issueSignals];
  base.signalGroups = [{ id: 'issue95_group', name: 'Issue 95', rows: base.signals.map(signal => signal.id) }];
  base.annotations = [{ id: 'issue95_annotation', type: 'marker', label: 'Issue 95 marker', color: '#1473e6', position: 'canvas', anchor: { signal: 'issue95_sig_0', cycle: 40, point: 'rising', offset: { x: 0, y: 0 } } }];
  base.transactions = [{ id: 'issue95_transaction', name: 'Issue 95 transaction', start: 10, end: 30, phases: [] }];
  if (!await controller.actions.openText(JSON.stringify(base), { fileName: 'issue95-large.tcd', unsavedDecision: 'discard' })) throw new Error('could not open issue95 fixture');
  await new Promise(resolve => setTimeout(resolve, 120));
  controller.renderMetrics.waveDromRenders = 0;
  controller.renderMetrics.geometryBuilds = 0;
  controller.renderMetrics.geometryCacheHits = 0;
  controller.renderMetrics.waveCacheHits = 0;
  const snapshot = () => structuredClone(controller.renderMetrics);

  const viewportSurface = document.querySelector('#cycleCanvas .waveform-render-surface');
  const viewportHost = window.TimingChartTimingViewport.getScrollHost();
  const viewportSvgById = new Map([...viewportSurface.querySelectorAll(':scope > .waveform-surface-row')].map(lane => [lane.dataset.signal, lane.querySelector('.trace svg')]).filter(([, svg]) => svg));
  const viewportState = () => ({
    active: [...viewportSurface.querySelectorAll(':scope > .waveform-surface-row[data-viewport-state="active"]')].map(lane => lane.dataset.signal),
    virtualized: [...viewportSurface.querySelectorAll(':scope > .waveform-surface-row[data-viewport-state="virtualized"]')].map(lane => lane.dataset.signal)
  });
  const viewportBefore = viewportState();
  viewportHost.scrollTop = viewportHost.scrollHeight;
  controller.actions.selectObject(document.querySelector('#groups .row[data-signal="issue95_sig_98"]'));
  window.TimingChartProductionWaveform.updateSurfaceViewport();
  const lazyDeadline = performance.now() + 30000;
  while ([...viewportSurface.querySelectorAll(':scope > .waveform-surface-row[data-viewport-state="active"]')].some(lane => !lane.querySelector('.trace svg'))) {
    if (performance.now() > lazyDeadline) throw new Error('visible WaveDrom lanes did not finish lazy rendering');
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  const viewportAfterScroll = viewportState();
  const viewportIdentityStable = [...viewportSvgById].every(([id, svg]) => viewportSurface.querySelector(`:scope > .waveform-surface-row[data-signal="${CSS.escape(id)}"] .trace svg`) === svg);
  const renderedAfterScroll = viewportSurface.querySelectorAll(':scope > .waveform-surface-row .trace svg').length;
  const viewportAlignmentErrors = viewportAfterScroll.active.map(id => {
    const svg = viewportSurface.querySelector(`:scope > .waveform-surface-row[data-signal="${CSS.escape(id)}"] .trace svg`);
    const shell = document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(id)}"] .trace`);
    return Math.abs((svg?.getBoundingClientRect().top || 0) - (shell?.getBoundingClientRect().top || 0));
  });
  viewportHost.scrollLeft = 0;
  const clockBoundaryAtBottom = controller.getCycleBoundary({ signal: 'issue95_clk', cycle: 10, coordinateSpace: 'canvas' });
  viewportHost.scrollLeft = Math.min(300, viewportHost.scrollWidth - viewportHost.clientWidth);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const horizontalScrollLeft = viewportHost.scrollLeft;
  const clockBoundaryAfterHorizontalScroll = controller.getCycleBoundary({ signal: 'issue95_clk', cycle: 10, coordinateSpace: 'canvas' });
  viewportHost.scrollLeft = 0;
  viewportHost.scrollTop = 0;
  window.TimingChartProductionWaveform.updateSurfaceViewport();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 80))));
  const clockBoundaryAtTop = controller.getCycleBoundary({ signal: 'issue95_clk', cycle: 10, coordinateSpace: 'canvas' });
  const onDemandBefore = viewportSurface.querySelectorAll(':scope > .waveform-surface-row .trace svg').length;
  const onDemandAnchor = controller.getAnchor({ signal: 'issue95_sig_50', cycle: 40, edge: 'rising', coordinateSpace: 'canvas' });
  const onDemandAfter = viewportSurface.querySelectorAll(':scope > .waveform-surface-row .trace svg').length;
  const viewportVirtualization = {
    before: viewportBefore,
    afterScroll: viewportAfterScroll,
    identityStable: viewportIdentityStable,
    renderedInitially: viewportSvgById.size,
    renderedAfterScroll,
    maxActiveAlignmentErrorPx: Math.max(0, ...viewportAlignmentErrors),
    offscreenReferenceGeometryFinite: Number.isFinite(clockBoundaryAtBottom?.canvasX),
    referenceBoundaryAtBottomX: clockBoundaryAtBottom?.canvasX,
    referenceBoundaryAtTopX: clockBoundaryAtTop?.canvasX,
    referenceBoundaryScrollDeltaPx: Math.abs((clockBoundaryAtBottom?.canvasX || 0) - (clockBoundaryAtTop?.canvasX || 0)),
    hiddenGeometryHorizontalScrollErrorPx: Math.abs(((clockBoundaryAtBottom?.canvasX || 0) - horizontalScrollLeft) - (clockBoundaryAfterHorizontalScroll?.canvasX || 0)),
    onDemandGeometry: { before: onDemandBefore, after: onDemandAfter, source: onDemandAnchor?.source, finite: Number.isFinite(onDemandAnchor?.canvasX) && Number.isFinite(onDemandAnchor?.canvasY) }
  };
  controller.renderMetrics.waveDromRenders = 0;
  controller.renderMetrics.geometryBuilds = 0;
  const before = snapshot();

  const rows = [...document.querySelectorAll('#groups .row[data-signal]')];
  for (let index = 0; index < 20; index += 1) rows[index % rows.length].click();
  const afterSignalSelection = snapshot();

  const visibilityBefore = snapshot();
  const visibilityNodesBefore = {
    row: document.querySelector('#cycleCanvas .wave-row[data-signal="issue95_sig_1"]'),
    lane: document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue95_sig_1"]'),
    svg: document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue95_sig_1"] .trace svg'),
    unrelatedSvg: document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue95_sig_2"] .trace svg')
  };
  const originalBoundingRect = Element.prototype.getBoundingClientRect;
  let visibilityBoundingRectReads = 0;
  Element.prototype.getBoundingClientRect = function (...args) { visibilityBoundingRectReads += 1; return originalBoundingRect.apply(this, args); };
  const visibilityStarted = performance.now();
  document.querySelector('#groups .row[data-signal="issue95_sig_1"] .eye')?.click();
  const visibilityCommandMs = performance.now() - visibilityStarted;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const visibilityClickToPaintMs = performance.now() - visibilityStarted;
  Element.prototype.getBoundingClientRect = originalBoundingRect;
  const visibilityAfter = snapshot();
  const visibilityState = (() => {
    const row = document.querySelector('#cycleCanvas .wave-row[data-signal="issue95_sig_1"]');
    const lane = document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue95_sig_1"]');
    const svg = lane?.querySelector('.trace svg');
    const unrelated = document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue95_sig_2"] .trace svg');
    const unrelatedShell = document.querySelector('#cycleCanvas .wave-row[data-signal="issue95_sig_2"] .trace');
    return {
      timingHidden: row?.hidden === true,
      sameRowNode: row === visibilityNodesBefore.row,
      sameLaneNode: lane === visibilityNodesBefore.lane,
      sameSvgNode: svg === visibilityNodesBefore.svg,
      unrelatedTraceRetained: unrelated === visibilityNodesBefore.unrelatedSvg,
      alignmentErrorPx: Math.abs((unrelated?.getBoundingClientRect().top || 0) - (unrelatedShell?.getBoundingClientRect().top || 0)),
      boundingRectReads: visibilityBoundingRectReads,
      commandMs: visibilityCommandMs,
      clickToPaintMs: visibilityClickToPaintMs
    };
  })();
  document.querySelector('#groups .row[data-signal="issue95_sig_1"] .eye')?.click();
  await new Promise(resolve => setTimeout(resolve, 40));

  document.querySelector('#bottomTabs [data-tab="annotation"]')?.click();
  await new Promise(resolve => setTimeout(resolve, 30));
  document.querySelector('#bottomContent [data-annotation-id="issue95_annotation"]')?.click();
  const afterAnnotationSelection = snapshot();
  controller.actions.updateAnnotation('issue95_annotation', 'label', 'updated label');
  const afterAnnotationEdit = snapshot();

  controller.actions.setDisplayName('issue95_sig_0', 'renamed signal');
  const afterDisplayName = snapshot();
  controller.actions.moveSignalBy('issue95_sig_0', 1);
  const afterReorder = snapshot();
  const signalEditResult = controller.actions.updateSignalValue('issue95_sig_0', 1, 'value', '0');
  const afterSignalEdit = snapshot();
  const trace = document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue95_sig_1"] .trace svg');
  return {
    before,
    viewportVirtualization,
    afterSignalSelection,
    visibility: { before: visibilityBefore, after: visibilityAfter, state: visibilityState },
    afterAnnotationSelection,
    afterAnnotationEdit,
    afterDisplayName,
    afterReorder,
    afterSignalEdit,
    traceRetainedAfterReorder: Boolean(trace),
    signalCount: document.querySelectorAll('#cycleCanvas .waveform-surface-row .trace svg').length,
    documentSignalCount: controller.model.document.signals.length,
    rowIds: [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal-id]')].map(row => row.dataset.signalId),
    signalEditResult,
    editedValue: controller.model.document.signals.find(signal => signal.id === 'issue95_sig_0')?.values?.[1]?.value,
    errors: []
  };
}, fixtureSignalCount);

console.log(JSON.stringify({
  viewport: {
    activeBefore: result.viewportVirtualization.before.active.length,
    activeAfterScroll: result.viewportVirtualization.afterScroll.active.length,
    renderedInitially: result.viewportVirtualization.renderedInitially,
    renderedAfterScroll: result.viewportVirtualization.renderedAfterScroll,
    identityStable: result.viewportVirtualization.identityStable,
    maxActiveAlignmentErrorPx: result.viewportVirtualization.maxActiveAlignmentErrorPx,
    referenceBoundaryScrollDeltaPx: result.viewportVirtualization.referenceBoundaryScrollDeltaPx
  },
  visibilityDelta: {
    waveDromRenders: result.visibility.after.waveDromRenders - result.visibility.before.waveDromRenders,
    geometryBuilds: result.visibility.after.geometryBuilds - result.visibility.before.geometryBuilds,
    lazyVisibleRenders: (result.visibility.after.lazyVisibleRenders || 0) - (result.visibility.before.lazyVisibleRenders || 0),
    lazySignalIds: (result.visibility.after.lazyVisibleSignalIds || []).slice((result.visibility.before.lazyVisibleSignalIds || []).length)
  }
}));
assert.equal(result.errors.length, 0);
assert.ok(result.viewportVirtualization.before.active.length > 0 && result.viewportVirtualization.before.virtualized.length > 0, JSON.stringify(result.viewportVirtualization));
assert.ok(result.viewportVirtualization.afterScroll.active.length > 0 && result.viewportVirtualization.afterScroll.virtualized.length > 0, JSON.stringify(result.viewportVirtualization));
assert.notDeepEqual(result.viewportVirtualization.afterScroll.active, result.viewportVirtualization.before.active, JSON.stringify(result.viewportVirtualization));
assert.equal(result.viewportVirtualization.identityStable, true, JSON.stringify(result.viewportVirtualization));
assert.ok(result.viewportVirtualization.renderedInitially < fixtureSignalCount, JSON.stringify(result.viewportVirtualization));
assert.ok(result.viewportVirtualization.renderedAfterScroll > result.viewportVirtualization.renderedInitially, JSON.stringify(result.viewportVirtualization));
assert.ok(result.viewportVirtualization.maxActiveAlignmentErrorPx <= 0.1, JSON.stringify(result.viewportVirtualization));
assert.equal(result.viewportVirtualization.offscreenReferenceGeometryFinite, true, JSON.stringify(result.viewportVirtualization));
assert.ok(result.viewportVirtualization.referenceBoundaryScrollDeltaPx <= 0.1, JSON.stringify(result.viewportVirtualization));
assert.ok(result.viewportVirtualization.hiddenGeometryHorizontalScrollErrorPx <= 0.1, JSON.stringify(result.viewportVirtualization));
assert.equal(result.viewportVirtualization.onDemandGeometry.after - result.viewportVirtualization.onDemandGeometry.before, 1, JSON.stringify(result.viewportVirtualization));
assert.equal(result.viewportVirtualization.onDemandGeometry.source, 'wavedrom-svg', JSON.stringify(result.viewportVirtualization));
assert.equal(result.viewportVirtualization.onDemandGeometry.finite, true, JSON.stringify(result.viewportVirtualization));
assert.equal(result.afterSignalSelection.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.afterSignalSelection.geometryBuilds, 0, JSON.stringify(result));
assert.equal(result.visibility.after.waveDromRenders - result.visibility.before.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.visibility.after.geometryBuilds - result.visibility.before.geometryBuilds, 0, JSON.stringify(result));
assert.equal(result.visibility.state.timingHidden, true, JSON.stringify(result));
assert.equal(result.visibility.state.sameRowNode, true, JSON.stringify(result));
assert.equal(result.visibility.state.sameLaneNode, true, JSON.stringify(result));
assert.equal(result.visibility.state.sameSvgNode, true, JSON.stringify(result));
assert.equal(result.visibility.state.unrelatedTraceRetained, true, JSON.stringify(result));
assert.ok(result.visibility.state.alignmentErrorPx <= 0.1, JSON.stringify(result.visibility.state));
assert.ok(result.visibility.state.commandMs < 50, JSON.stringify(result.visibility.state));
assert.equal(result.afterAnnotationSelection.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.afterAnnotationSelection.geometryBuilds, 0, JSON.stringify(result));
assert.equal(result.afterAnnotationEdit.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.afterAnnotationEdit.geometryBuilds, 0, JSON.stringify(result));
assert.equal(result.afterDisplayName.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.afterDisplayName.geometryBuilds, 0, JSON.stringify(result));
assert.equal(result.afterReorder.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.traceRetainedAfterReorder, true);
assert.equal(result.signalEditResult, true, JSON.stringify(result));
assert.equal(result.editedValue, 0, JSON.stringify(result));
assert.equal(result.afterSignalEdit.waveDromRenders, 1, JSON.stringify(result));
assert.equal(result.afterSignalEdit.geometryBuilds - result.afterReorder.geometryBuilds, 1, JSON.stringify(result));
assert.ok(result.signalCount < fixtureSignalCount, JSON.stringify({ signalCount: result.signalCount, fixtureSignalCount }));
assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue95-1672x941.png') });
const finalPaintTarget = { thresholdMs: 50, measuredMs: result.visibility.state.clickToPaintMs, pass: result.visibility.state.clickToPaintMs < 50 };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 95, fixture: { signals: fixtureSignalCount, cycles: 100 }, result, incrementalAcceptancePass: true, finalPaintTarget, pass: finalPaintTarget.pass }, null, 2)}\n`);
await browser.close();
console.log(`Issue #95 incremental acceptance passed; final click-to-paint target ${finalPaintTarget.pass ? 'passed' : 'remains open'} (${finalPaintTarget.measuredMs.toFixed(1)}ms / ${finalPaintTarget.thresholdMs}ms).`);
