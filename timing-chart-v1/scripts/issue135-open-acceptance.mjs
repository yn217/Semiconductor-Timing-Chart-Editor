import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDir = path.join(root, 'artifacts', 'issue135');
await fs.mkdir(outputDir, { recursive: true });
const sampleRoot = path.join(root, 'samples', 'golden-protocol', 'timing_chart_sample_pack', 'samples');
const sampleFiles = [
  '01_apb_register_access.tcd.json',
  '02_ahb_lite_pipelined_transfer.tcd.json',
  '03_axi4_full_write_burst.tcd.json',
  '08_async_fifo_cdc.tcd.json'
];
const fixtures = [];
for (const fileName of sampleFiles) fixtures.push({ fileName, text: await fs.readFile(path.join(sampleRoot, fileName), 'utf8') });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(250);

const generated = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const create = (signals, cycles) => {
    const value = structuredClone(controller.getSerializableDocument());
    const clock = structuredClone(value.signals.find(signal => signal.type === 'clock'));
    clock.id = `open_clk_${signals}_${cycles}`;
    clock.name = clock.id;
    clock.display = { name: clock.id };
    const rows = Array.from({ length: signals - 1 }, (_, index) => ({
      id: `open_sig_${signals}_${cycles}_${index}`,
      name: `open_sig_${index}`,
      type: index % 7 === 0 ? 'bus' : 'binary',
      role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
      ...(index % 7 === 0 ? { width: 8 } : {}),
      source: { instancePath: [], signalName: `open_sig_${index}` },
      display: { name: `open_sig_${index}` },
      values: [
        { start: 0, value: index % 7 === 0 ? '00' : 0 },
        { start: Math.floor(cycles / 2), value: index % 7 === 0 ? 'A5' : 1 }
      ]
    }));
    value.document.id = `open-${signals}-${cycles}.tcd`;
    value.timeline.cycleCount = cycles;
    value.timeline.end = cycles;
    value.timeline.referenceClock = clock.id;
    value.signals = [clock, ...rows];
    value.signalGroups = [{ id: `open_group_${signals}`, name: 'Open profile', rows: value.signals.map(signal => signal.id) }];
    value.annotations = [];
    value.transactions = [];
    return JSON.stringify(value);
  };
  return [{ fileName: 'generated-50x100.tcd', text: create(50, 100) }, { fileName: 'generated-100x500.tcd', text: create(100, 500) }];
});
fixtures.push(...generated);

const runs = [];
for (const fixture of fixtures) {
  const result = await page.evaluate(async ({ text, fileName }) => {
    const controller = window.TimingChartProductionController;
    controller.profileEnabled = true;
    performance.clearMarks();
    performance.clearMeasures();
    const renderBefore = Number(controller.renderMetrics.appFullRenders || 0);
    const waveBefore = Number(controller.renderMetrics.waveDromRenders || 0);
    const geometryBefore = Number(controller.renderMetrics.geometryBuilds || 0);
    const accepted = await controller.actions.openText(text, { fileName, unsavedDecision: 'discard' });
    const profile = controller.openIdle ? await controller.openIdle : controller.lastOpenProfile;
    return {
      accepted,
      profile: structuredClone(profile),
      deltas: {
        appFullRenders: Number(controller.renderMetrics.appFullRenders || 0) - renderBefore,
        waveDromRenders: Number(controller.renderMetrics.waveDromRenders || 0) - waveBefore,
        geometryBuilds: Number(controller.renderMetrics.geometryBuilds || 0) - geometryBefore
      },
      marks: performance.getEntriesByType('mark').filter(entry => entry.name.startsWith('tc:open:')).map(entry => entry.name)
    };
  }, fixture);
  runs.push({ fileName: fixture.fileName, ...result });
}

const atomicFailure = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const before = JSON.stringify(controller.getSerializableDocument());
  const beforeId = controller.model.document.document.id;
  const result = await controller.actions.openText('{ invalid', { fileName: 'invalid.tcd', unsavedDecision: 'discard' });
  return { result, beforeId, afterId: controller.model.document.document.id, unchanged: before === JSON.stringify(controller.getSerializableDocument()) };
});

for (const run of runs) {
  assert.equal(run.accepted, true, JSON.stringify(run));
  assert.equal(run.profile.pass, true, JSON.stringify(run));
  assert.equal(run.profile.firstConsistentPaint, true, JSON.stringify(run));
  assert.equal(run.deltas.appFullRenders, 1, JSON.stringify(run));
  assert.equal(run.profile.consistency.canonicalLeftExact, true, JSON.stringify(run));
  assert.equal(run.profile.consistency.canonicalTimingExact, true, JSON.stringify(run));
  assert.equal(run.profile.consistency.visibleGeometryComplete, true, JSON.stringify(run));
  assert.deepEqual(run.profile.consistency.staleGeometryIds, [], JSON.stringify(run));
  for (const field of ['parseMs', 'normalizeMs', 'validateMs', 'replaceDocumentMs', 'serializeHashMs', 'domReadyMs', 'paintReadyMs']) assert.ok(Number.isFinite(run.profile[field]), `${run.fileName}: missing ${field}`);
  for (const mark of ['tc:open:start', 'tc:open:parse:start', 'tc:open:parse:end', 'tc:open:normalize:start', 'tc:open:normalize:end', 'tc:open:validate:start', 'tc:open:validate:end', 'tc:open:replaceDocument:start', 'tc:open:replaceDocument:end', 'tc:open:dom-ready', 'tc:open:paint-ready']) assert.ok(run.marks.includes(mark), `${run.fileName}: missing ${mark}`);
}
assert.equal(atomicFailure.result, false);
assert.equal(atomicFailure.unchanged, true);
assert.equal(atomicFailure.beforeId, atomicFailure.afterId);
assert.equal(pageErrors.length, 0, pageErrors.join('\n'));

const report = { issue: 135, browser: await browser.version(), viewport: { width: 1672, height: 941 }, runs, atomicFailure, pageErrors, pass: true };
await page.screenshot({ path: path.join(outputDir, 'opened-large-1672x941.png') });
await fs.writeFile(path.join(outputDir, 'open-profile.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
