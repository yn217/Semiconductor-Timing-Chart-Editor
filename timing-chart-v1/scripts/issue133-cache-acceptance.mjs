import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue133');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const client = await page.context().newCDPSession(page);
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(250);

const snapshots = [];
for (let documentIndex = 0; documentIndex < 20; documentIndex += 1) {
  const opened = await page.evaluate(async ({ documentIndex }) => {
    const controller = window.TimingChartProductionController;
    const value = structuredClone(controller.getSerializableDocument());
    const prefix = `issue133_doc_${documentIndex}`;
    value.document.id = `${prefix}.tcd`;
    value.timeline.cycleCount = 20;
    value.timeline.end = 20;
    const clock = structuredClone(value.signals.find(signal => signal.type === 'clock'));
    clock.id = `${prefix}_clk`; clock.name = clock.id; clock.display = { name: clock.id };
    const signals = Array.from({ length: 23 }, (_, signalIndex) => ({
      id: `${prefix}_sig_${signalIndex}`,
      name: `${prefix}_sig_${signalIndex}`,
      type: signalIndex % 6 === 0 ? 'bus' : 'binary',
      width: signalIndex % 6 === 0 ? 8 : undefined,
      role: signalIndex % 3 === 0 ? 'input' : signalIndex % 3 === 1 ? 'internal' : 'output',
      source: { instancePath: [], signalName: `${prefix}_sig_${signalIndex}` },
      display: { name: `${prefix}_sig_${signalIndex}` },
      values: [{ start: 0, value: signalIndex % 6 === 0 ? '00' : 0 }, { start: 8, value: signalIndex % 6 === 0 ? '12' : 1 }, { start: 16, value: signalIndex % 6 === 0 ? '34' : 0 }]
    }));
    value.timeline.referenceClock = clock.id;
    value.signals = [clock, ...signals];
    value.signalGroups = [{ id: `${prefix}_group`, name: prefix, rows: value.signals.map(signal => signal.id) }];
    value.annotations = [];
    value.transactions = [];
    const result = await controller.actions.openText(JSON.stringify(value), { fileName: value.document.id, unsavedDecision: 'discard' });
    if (controller.waveformIdle) await controller.waveformIdle;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Boolean(result);
  }, { documentIndex });
  assert.equal(opened, true, `Open ${documentIndex} failed`);
  await client.send('HeapProfiler.collectGarbage');
  const heap = await client.send('Runtime.getHeapUsage');
  const snapshot = await page.evaluate(documentIndex => {
    const controller = window.TimingChartProductionController;
    const stats = window.TimingChartProductionWaveform.getWaveCacheStats();
    const prefix = `issue133_doc_${documentIndex}`;
    return {
      documentIndex,
      canonicalSignalCount: controller.model.document.signals.filter(signal => signal.type !== 'commentRow').length,
      mountedSvgCount: document.querySelectorAll('#cycleCanvas .waveform-surface-row .trace svg').length,
      cacheSize: stats.size,
      retainedSvgNodes: stats.retainedSvgNodes,
      allCacheIdsBelongToCurrentDocument: stats.ids.every(id => id.startsWith(prefix)),
      cumulativePrunedEntries: controller.renderMetrics.waveCachePrunes || 0,
      cumulativePrunedSvgNodes: controller.renderMetrics.waveCachePrunedSvgNodes || 0
    };
  }, documentIndex);
  snapshots.push({ ...snapshot, heap: { usedSize: heap.usedSize, totalSize: heap.totalSize } });
}

for (const snapshot of snapshots) {
  assert.equal(snapshot.allCacheIdsBelongToCurrentDocument, true, JSON.stringify(snapshot));
  assert.ok(snapshot.cacheSize <= snapshot.canonicalSignalCount, JSON.stringify(snapshot));
  assert.ok(snapshot.mountedSvgCount <= snapshot.canonicalSignalCount, JSON.stringify(snapshot));
  assert.ok(snapshot.mountedSvgCount < snapshot.canonicalSignalCount, JSON.stringify(snapshot));
}
assert.ok(snapshots.at(-1).cumulativePrunedEntries >= 19, JSON.stringify(snapshots.at(-1)));
assert.ok(Math.max(...snapshots.map(snapshot => snapshot.cacheSize)) <= 24, JSON.stringify(snapshots));
assert.equal(errors.length, 0, errors.join('\n'));

await page.screenshot({ path: path.join(out, 'issue133-cache-1672x941.png') });
const report = {
  issue: 133,
  policy: 'prune cache entries whose signal IDs are absent from the current canonical document',
  browser: await browser.version(),
  viewport: { width: 1672, height: 941 },
  documentsOpened: snapshots.length,
  maxCacheSize: Math.max(...snapshots.map(snapshot => snapshot.cacheSize)),
  maxMountedSvgCount: Math.max(...snapshots.map(snapshot => snapshot.mountedSvgCount)),
  finalPrunedEntries: snapshots.at(-1).cumulativePrunedEntries,
  finalPrunedSvgNodes: snapshots.at(-1).cumulativePrunedSvgNodes,
  heapUsedMin: Math.min(...snapshots.map(snapshot => snapshot.heap.usedSize)),
  heapUsedMax: Math.max(...snapshots.map(snapshot => snapshot.heap.usedSize)),
  snapshots,
  pass: true
};
await fs.writeFile(path.join(out, 'cache-acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ issue: report.issue, documentsOpened: report.documentsOpened, maxCacheSize: report.maxCacheSize, maxMountedSvgCount: report.maxMountedSvgCount, finalPrunedEntries: report.finalPrunedEntries, heapUsedMin: report.heapUsedMin, heapUsedMax: report.heapUsedMax, pass: report.pass }));
