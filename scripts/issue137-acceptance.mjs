import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(400);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const makeDoc = (prefix) => {
    const doc = structuredClone(c.getSerializableDocument());
    const ids = new Map(doc.signals.map(signal => [signal.id, `${prefix}_${signal.id.replace(/[^A-Za-z0-9_]/g, '_')}`]));
    for (const signal of doc.signals) {
      const old = signal.id;
      signal.id = ids.get(old);
      if (signal.type !== 'commentRow') {
        signal.name = `${prefix}_${signal.name || old}`;
        signal.source = { ...(signal.source || {}), signalName: signal.name };
        signal.display = { ...(signal.display || {}), name: signal.name };
      }
    }
    for (const group of doc.signalGroups) group.rows = group.rows.map(id => ids.get(id));
    doc.timeline.referenceClock = ids.get(doc.timeline.referenceClock);
    doc.annotations = [];
    doc.transactions = [];
    doc.document.id = `issue137-${prefix}`;
    return doc;
  };

  const a = makeDoc('A');
  const b = makeDoc('B');
  c.replaceDocument(a);
  await new Promise(resolve => requestAnimationFrame(resolve));

  const staleJob = window.TimingChartProductionWaveform.renderTimeline(c.model, { batchSize: 1 });
  c.replaceDocument(b);
  const bGeometryBeforeOldJob = Object.keys(c.model.waveGeometry?.signals || {});
  const staleResult = await staleJob;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canonicalIds = new Set(c.model.document.signals.filter(signal => signal.type !== 'commentRow' && signal.display?.visible !== false).map(signal => signal.id));
  const geometryIds = Object.keys(c.model.waveGeometry?.signals || {});
  const rowIds = [...document.querySelectorAll('#cycleCanvas .wave-row')].map(row => row.dataset.signalId || row.dataset.signal).filter(Boolean);
  const staleIds = [...new Set([...geometryIds, ...rowIds])].filter(id => id.startsWith('A_'));
  return {
    documentId: c.model.document.document.id,
    bGeometryBeforeOldJob,
    geometryIds,
    rowIds,
    staleIds,
    staleResult,
    allGeometryCurrent: geometryIds.every(id => canonicalIds.has(id)),
    allCurrentSignalsHaveGeometry: [...canonicalIds].every(id => geometryIds.includes(id)),
  };
});

await browser.close();
assert.equal(errors.length, 0, errors.join('\n'));
assert.equal(result.documentId, 'issue137-B');
assert.deepEqual(result.staleIds, [], JSON.stringify(result));
assert.equal(result.allGeometryCurrent, true, JSON.stringify(result));
assert.equal(result.allCurrentSignalsHaveGeometry, true, JSON.stringify(result));
assert.equal(result.staleResult, false, 'superseded progressive render must report cancellation instead of publishing');
console.log('Issue #137 acceptance passed:', JSON.stringify(result));
