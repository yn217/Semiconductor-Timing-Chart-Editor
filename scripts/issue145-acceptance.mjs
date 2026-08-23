import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'artifacts', 'issue145');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${root.replaceAll('\\', '/')}/gui-mockup/index.html`);
await page.waitForTimeout(350);

const report = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (controller.waveformIdle) await controller.waveformIdle;
  await nextPaint();
  const canonical = () => controller.model.document.signalGroups.flatMap(group => group.rows || []);
  const ownerOrders = () => ({
    canonical: canonical(),
    left: [...document.querySelectorAll('#groups > .group')].flatMap(group => [...group.querySelectorAll(':scope > .row[data-signal]')].map(row => row.dataset.signal)),
    frozen: [...document.querySelectorAll('#cycleCanvas .frozen-label-wave > .frozen-label-row')].map(row => row.dataset.signal),
    timing: [...document.querySelectorAll('#cycleCanvas .timing-scroll-pane > .wave > .wave-row')].map(row => row.dataset.signalId || row.dataset.signal)
  });
  const surface = document.querySelector('#cycleCanvas .waveform-render-surface');
  const svgById = new Map([...surface.querySelectorAll(':scope > .waveform-surface-row')].map(lane => [lane.dataset.signal, lane.querySelector('.trace svg')]));
  const surfaceLaneOrder = [...surface.querySelectorAll(':scope > .waveform-surface-row')].map(lane => lane.dataset.signal);
  let movedSvgNodes = 0;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node.nodeType === Node.ELEMENT_NODE && (node.matches?.('svg[data-renderer="wavedrom"]') || node.querySelector?.('svg[data-renderer="wavedrom"]'))) movedSvgNodes += 1;
      }
    }
  });
  observer.observe(surface, { childList: true, subtree: true });
  const metricsBefore = { waveDrom: controller.renderMetrics.waveDromRenders, geometry: controller.renderMetrics.geometryBuilds };
  const checks = [];
  const reorderMetricDeltas = [];
  const assertInvariant = label => {
    const orders = ownerOrders();
    const orderPass = ['left', 'frozen', 'timing'].every(key => JSON.stringify(orders[key]) === JSON.stringify(orders.canonical));
    const identityPass = [...svgById].every(([id, svg]) => document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${CSS.escape(id)}"] .trace svg`) === svg);
    const currentSurfaceOrder = [...surface.querySelectorAll(':scope > .waveform-surface-row')].map(lane => lane.dataset.signal);
    const surfaceOrderStable = JSON.stringify(currentSurfaceOrder) === JSON.stringify(surfaceLaneOrder);
    const yErrors = [...svgById.keys()].map(id => {
      const slot = document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(id)}"] > .trace`);
      const host = document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${CSS.escape(id)}"] > .trace`);
      return slot && host && !slot.closest('.wave-row').hidden ? Math.abs(slot.getBoundingClientRect().top - host.getBoundingClientRect().top) : 0;
    });
    const maxYError = Math.max(0, ...yErrors);
    checks.push({ label, orderPass, identityPass, surfaceOrderStable, maxYError });
    if (!orderPass || !identityPass || !surfaceOrderStable || maxYError > 0.1) throw new Error(JSON.stringify({ label, orders, identityPass, surfaceOrderStable, maxYError }));
  };
  const tool = label => [...document.querySelectorAll('#ribbonHome .tool')].find(node => (node.querySelector('.tool-label')?.textContent || node.textContent).replace(/\s/g, '').includes(label));
  const clickReorder = async (button, label) => {
    const selectedId = controller.model.selection?.id;
    const selectedGroupBefore = controller.model.document.signalGroups.find(group => (group.rows || []).includes(selectedId));
    const indexBefore = selectedGroupBefore?.rows.indexOf(selectedId) ?? -1;
    const before = {
      waveDrom: controller.renderMetrics.waveDromRenders,
      geometry: controller.renderMetrics.geometryBuilds,
      fullRenders: controller.renderMetrics.appFullRenders,
      screenRefreshes: controller.renderMetrics.geometryScreenRefreshes,
      timelineActive: Boolean(controller.timelineRenderActive)
    };
    button.click(); await nextPaint();
    const after = {
      waveDrom: controller.renderMetrics.waveDromRenders,
      geometry: controller.renderMetrics.geometryBuilds,
      fullRenders: controller.renderMetrics.appFullRenders,
      screenRefreshes: controller.renderMetrics.geometryScreenRefreshes,
      timelineActive: Boolean(controller.timelineRenderActive)
    };
    const selectedGroupAfter = controller.model.document.signalGroups.find(group => (group.rows || []).includes(selectedId));
    const indexAfter = selectedGroupAfter?.rows.indexOf(selectedId) ?? -1;
    reorderMetricDeltas.push({
      label,
      waveDrom: after.waveDrom - before.waveDrom,
      geometry: after.geometry - before.geometry,
      fullRenders: after.fullRenders - before.fullRenders,
      screenRefreshes: after.screenRefreshes - before.screenRefreshes,
      timelineActiveBefore: before.timelineActive,
      timelineActiveAfter: after.timelineActive,
      indexBefore,
      indexAfter,
      validation: structuredClone(controller.model.validation || [])
    });
    const expectedIndex = label.includes('up') ? indexBefore - 1 : indexBefore + 1;
    if (indexAfter !== expectedIndex) throw new Error(JSON.stringify({ label, selectedId, indexBefore, indexAfter, expectedIndex, validation: controller.model.validation }));
    assertInvariant(label);
  };
  const select = id => document.querySelector(`#groups .row[data-signal="${CSS.escape(id)}"]`)?.click();
  const firstGroup = controller.model.document.signalGroups.find(group => (group.rows || []).length >= 2);
  const target = firstGroup.rows[1];
  select(target);
  assertInvariant('initial');
  for (let index = 0; index < 20; index += 1) {
    await clickReorder(tool('上へ'), `up-${index + 1}`);
    await clickReorder(tool('下へ'), `down-${index + 1}`);
  }
  const comment = controller.model.document.signals.find(signal => signal.type === 'commentRow');
  select(comment.id); await clickReorder(tool('上へ'), 'comment-up');
  await clickReorder(tool('下へ'), 'comment-down');
  const unrelated = controller.model.document.signals.find(signal => signal.type !== 'commentRow' && signal.id !== target);
  document.querySelector(`#groups .row[data-signal="${CSS.escape(unrelated.id)}"] .eye`)?.click(); await nextPaint();
  select(target); await clickReorder(tool('上へ'), 'hidden-interleave-up');
  await clickReorder(tool('下へ'), 'hidden-interleave-down');
  document.querySelector(`#groups .row[data-signal="${CSS.escape(unrelated.id)}"] .eye`)?.click(); await nextPaint();
  const unrelatedGroup = controller.model.document.signalGroups.find(group => group.id !== firstGroup.id);
  document.querySelector(`#groups .group[data-group-id="${CSS.escape(unrelatedGroup.id)}"] .chev`)?.click(); await nextPaint();
  select(target); await clickReorder(tool('上へ'), 'collapsed-interleave-up');
  controller.actions.undo(); await nextPaint(); assertInvariant('undo');
  controller.actions.redo(); await nextPaint(); assertInvariant('redo');
  controller.actions.setLeftPanelMode('hierarchy'); await nextPaint();
  controller.actions.setLeftPanelMode('group'); await nextPaint(); assertInvariant('hierarchy-round-trip');
  observer.disconnect();
  const metricsAfter = { waveDrom: controller.renderMetrics.waveDromRenders, geometry: controller.renderMetrics.geometryBuilds };
  return {
    checks,
    operations: checks.length - 1,
    movedSvgNodes,
    svgIdentityStable: checks.every(check => check.identityPass),
    maxYError: Math.max(...checks.map(check => check.maxYError)),
    waveDromDelta: metricsAfter.waveDrom - metricsBefore.waveDrom,
    geometryDelta: metricsAfter.geometry - metricsBefore.geometry,
    reorderMetricDeltas,
    reorderWaveDromDelta: reorderMetricDeltas.reduce((sum, item) => sum + item.waveDrom, 0),
    reorderGeometryDelta: reorderMetricDeltas.reduce((sum, item) => sum + item.geometry, 0),
    canonicalOrderExact: checks.every(check => check.orderPass),
    surfaceLaneOrderStable: checks.every(check => check.surfaceOrderStable),
    renderer: [...document.querySelectorAll('#cycleCanvas .waveform-surface-row .trace svg')].every(svg => svg.dataset.renderer === 'wavedrom')
  };
});

assert.equal(report.canonicalOrderExact, true, JSON.stringify(report));
assert.equal(report.svgIdentityStable, true, JSON.stringify(report));
assert.equal(report.surfaceLaneOrderStable, true, JSON.stringify(report));
assert.equal(report.movedSvgNodes, 0, JSON.stringify(report));
assert.equal(report.waveDromDelta, 0, JSON.stringify(report));
assert.equal(report.reorderWaveDromDelta, 0, JSON.stringify(report));
assert.equal(report.reorderGeometryDelta, 0, JSON.stringify(report));
assert.ok(report.maxYError <= 0.1, JSON.stringify(report));
assert.equal(report.renderer, true, JSON.stringify(report));
assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue145-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 145, ...report, pageErrors, pass: true }, null, 2)}\n`);
await browser.close();
console.log(`Issue #145 acceptance passed: ${report.operations} real reorder states, physical owner order exact, stable WaveDrom surface identity, max Y error ${report.maxYError}px.`);
