import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await page.goto(`file://${process.cwd().replaceAll('\\', '/')}/gui-mockup/index.html`);
await page.waitForTimeout(250);
const result = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const model = controller.model;
  const group = model.document.signalGroups.find(item => (item.rows || []).length > 2);
  const targetId = group.rows[1];
  const neighborId = group.rows[0];
  const timingWave = document.querySelector('#cycleCanvas .timing-scroll-pane > .wave');
  const timingBefore = [...timingWave.querySelectorAll(':scope > .wave-row')].map(row => row.dataset.signalId);
  const rulerRect = timingWave.querySelector(':scope > .ruler')?.getBoundingClientRect();
  const timingWaveRect = timingWave.getBoundingClientRect();
  const frozenWaveRect = window.TimingChartFrozenLabels.frozenWave.getBoundingClientRect();
  const frozenBefore = new Map([...window.TimingChartFrozenLabels.frozenWave.querySelectorAll(':scope > .frozen-label-row')].map(row => [row.dataset.signalId, row.getBoundingClientRect().top]));
  const initialTiming = new Map([...timingWave.querySelectorAll(':scope > .wave-row')].map(row => [row.dataset.signalId, row.getBoundingClientRect().top]));
  const geometryBefore = model.waveGeometry;
  const before = { waveDrom: controller.renderMetrics.waveDromRenders, geometry: controller.renderMetrics.geometryBuilds };
  if (!controller.actions.moveSignalBy(targetId, -1)) throw new Error('reorder command failed');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const timingRows = [...timingWave.querySelectorAll(':scope > .wave-row')];
  const frozenRows = [...window.TimingChartFrozenLabels.frozenWave.querySelectorAll(':scope > .frozen-label-row')];
  const timingById = new Map(timingRows.map(row => [row.dataset.signalId, row]));
  const frozenById = new Map(frozenRows.map(row => [row.dataset.signalId, row]));
  const visible = timingRows.filter(row => !row.hidden && row.style.display !== 'none');
  const yErrors = visible.map(row => ({ id: row.dataset.signalId, error: Math.abs(row.getBoundingClientRect().top - (frozenById.get(row.dataset.signalId)?.getBoundingClientRect().top ?? NaN)) }));
  const maxYDelta = Math.max(...visible.map(row => Math.abs((row.getBoundingClientRect().top - (frozenById.get(row.dataset.signalId)?.getBoundingClientRect().top ?? NaN)) - (initialTiming.get(row.dataset.signalId) - frozenBefore.get(row.dataset.signalId)))));
  const visualOrder = [...visible].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(row => row.dataset.signalId);
  const after = { waveDrom: controller.renderMetrics.waveDromRenders, geometry: controller.renderMetrics.geometryBuilds };
  const svgNodes = timingRows.filter(row => row.querySelector('.trace')).map(row => row.querySelector('.trace svg'));
  return {
    modelOrder: group.rows.slice(0, 3),
    targetId,
    neighborId,
    timingBefore,
    initialYError: Math.max(...[...initialTiming].filter(([id]) => frozenBefore.has(id)).map(([id, top]) => Math.abs(top - frozenBefore.get(id)))),
    ruler: rulerRect ? { top: rulerRect.top, height: rulerRect.height } : null,
    timingWaveTop: timingWaveRect.top,
    frozenWaveTop: frozenWaveRect.top,
    waveChildren: [...timingWave.children].slice(0, 4).map(node => ({ tag: node.tagName, className: node.className, top: node.getBoundingClientRect().top })),
    timingAfter: timingRows.map(row => row.dataset.signalId),
    visualOrder: visualOrder.slice(0, 3),
    targetVisual: timingById.get(targetId)?.dataset.reorderVisual,
    geometrySame: geometryBefore === model.waveGeometry,
    yErrors,
    maxYError: Math.max(...yErrors.map(item => item.error)),
    maxYDelta,
    waveDromDelta: after.waveDrom - before.waveDrom,
    geometryDelta: after.geometry - before.geometry,
    wavedromSvgCount: svgNodes.filter(svg => svg?.dataset.renderer === 'wavedrom').length,
    traceCount: svgNodes.length
  };
});
assert.deepEqual(result.modelOrder.slice(0, 2), [result.targetId, result.neighborId]);
assert.deepEqual(result.visualOrder.slice(0, 2), [result.targetId, result.neighborId], JSON.stringify(result));
assert.equal(result.timingBefore.indexOf(result.targetId), result.timingAfter.indexOf(result.targetId));
assert.equal(result.targetVisual, 'transform');
assert.equal(result.geometrySame, true);
assert.ok(result.maxYDelta <= 0.1, JSON.stringify(result));
assert.equal(result.waveDromDelta, 0, JSON.stringify(result));
assert.equal(result.geometryDelta, 0, JSON.stringify(result));
assert.equal(result.wavedromSvgCount, result.traceCount, JSON.stringify(result));
console.log('Issue #126 reorder visual acceptance passed:', JSON.stringify(result));
await browser.close();
