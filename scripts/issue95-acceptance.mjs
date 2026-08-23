import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue95');
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
  base.document.id = 'issue95-large.tcd';
  base.timeline.cycleCount = 100;
  base.timeline.end = 100;
  const issueSignals = Array.from({ length: 49 }, (_, index) => ({
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
  const snapshot = () => ({ ...controller.renderMetrics });
  const before = snapshot();

  const rows = [...document.querySelectorAll('#groups .row[data-signal]')];
  for (let index = 0; index < 20; index += 1) rows[index % rows.length].click();
  const afterSignalSelection = snapshot();

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
  const trace = document.querySelector('#cycleCanvas .wave-row[data-signal="issue95_sig_1"] .trace svg');
  return {
    before,
    afterSignalSelection,
    afterAnnotationSelection,
    afterAnnotationEdit,
    afterDisplayName,
    afterReorder,
    afterSignalEdit,
    traceRetainedAfterReorder: Boolean(trace),
    signalCount: document.querySelectorAll('#cycleCanvas .wave-row .trace').length,
    documentSignalCount: controller.model.document.signals.length,
    rowIds: [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal-id]')].map(row => row.dataset.signalId),
    signalEditResult,
    editedValue: controller.model.document.signals.find(signal => signal.id === 'issue95_sig_0')?.values?.[1]?.value,
    errors: []
  };
});

assert.equal(result.errors.length, 0);
assert.equal(result.afterSignalSelection.waveDromRenders, 0, JSON.stringify(result));
assert.equal(result.afterSignalSelection.geometryBuilds, 0, JSON.stringify(result));
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
assert.equal(result.signalCount, 50);
assert.equal(errors.length, 0, errors.join('\n'));
await page.screenshot({ path: path.join(out, 'issue95-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify({ issue: 95, fixture: { signals: 50, cycles: 100 }, result, pass: true }, null, 2)}\n`);
await browser.close();
console.log('Issue #95 acceptance passed: keyed rows, WaveDrom SVG cache, geometry cache, and minimal signal invalidation.');
