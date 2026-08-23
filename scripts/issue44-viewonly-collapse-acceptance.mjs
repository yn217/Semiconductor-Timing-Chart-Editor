import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue44-viewonly-collapse');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const setup = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  return Boolean(c?.model);
});
assert.ok(setup, 'controller failed to initialize');

// --- Collapsing a Left Tree group hides only the Left Tree rows; the corresponding Timing Chart rows stay visible, unchanged in count/order ---
const collapseFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const group = c.model.document.signalGroups[0];
  const waveDromBefore = c.renderMetrics?.waveDromRenders || 0;
  const geometryBefore = c.renderMetrics?.geometryBuilds || 0;
  const timingRowsBefore = [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal]')].map(row => ({ id: row.dataset.signal, hidden: row.hidden }));

  const header = document.querySelector(`#groups .group[data-group-id="${group.id}"] .group-h`);
  const chev = header.querySelector('.chev');
  chev.click();
  await wait(80);

  const leftRowsHidden = group.rows.every(id => {
    const row = document.querySelector(`#groups .row[data-signal="${id}"]`);
    return row ? row.hidden : true;
  });
  const timingRowsAfter = [...document.querySelectorAll('#cycleCanvas .wave-row[data-signal]')].map(row => ({ id: row.dataset.signal, hidden: row.hidden }));
  const timingRowsStillVisible = group.rows.every(id => {
    const row = timingRowsAfter.find(r => r.id === id);
    return row && row.hidden === false;
  });
  const timingOrderUnchanged = JSON.stringify(timingRowsBefore.map(r => r.id)) === JSON.stringify(timingRowsAfter.map(r => r.id));
  const timingCountUnchanged = timingRowsBefore.length === timingRowsAfter.length;

  const waveDromAfter = c.renderMetrics?.waveDromRenders || 0;
  const geometryAfter = c.renderMetrics?.geometryBuilds || 0;

  // expand again
  chev.click();
  await wait(80);
  const leftRowsRestored = group.rows.every(id => {
    const row = document.querySelector(`#groups .row[data-signal="${id}"]`);
    return row && row.hidden === false;
  });

  return {
    leftRowsHidden, timingRowsStillVisible, timingOrderUnchanged, timingCountUnchanged,
    waveDromUnchanged: waveDromAfter === waveDromBefore,
    geometryUnchanged: geometryAfter === geometryBefore,
    leftRowsRestored,
  };
});

assert.equal(collapseFlow.leftRowsHidden, true, 'collapsing must hide the Left Tree child rows');
assert.equal(collapseFlow.timingRowsStillVisible, true, 'the center Timing Chart rows must remain visible when only the Left Tree group is collapsed');
assert.equal(collapseFlow.timingOrderUnchanged, true, 'Timing Chart row order must not change from a Left Tree collapse');
assert.equal(collapseFlow.timingCountUnchanged, true);
assert.equal(collapseFlow.waveDromUnchanged, true, 'Left Tree collapse must not trigger a WaveDrom re-render');
assert.equal(collapseFlow.geometryUnchanged, true, 'Left Tree collapse must not trigger a Geometry rebuild');
assert.equal(collapseFlow.leftRowsRestored, true, 'expanding again must restore the exact Left Tree presentation');

// --- Eye OFF (canonical signal visibility) remains independent from group collapse: hiding a signal via Eye still hides its Timing row regardless of collapse state ---
const eyeIndependence = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const group = c.model.document.signalGroups[0];
  const signalId = group.rows.find(id => c.model.document.signals.find(s => s.id === id && s.type !== 'commentRow'));
  const ok = c.actions.setSignalVisibility(signalId, false);
  await wait(60);
  const timingRow = document.querySelector(`#cycleCanvas .wave-row[data-signal="${signalId}"]`);
  const hiddenByEye = timingRow?.hidden === true;
  c.actions.setSignalVisibility(signalId, true);
  await wait(60);
  const timingRowAfterRestore = document.querySelector(`#cycleCanvas .wave-row[data-signal="${signalId}"]`);
  const restoredVisible = timingRowAfterRestore?.hidden === false;
  return { ok, hiddenByEye, restoredVisible };
});
assert.equal(eyeIndependence.ok, true);
assert.equal(eyeIndependence.hiddenByEye, true, 'Eye OFF must still hide the Timing Chart row (this is real signal visibility, separate from tree collapse)');
assert.equal(eyeIndependence.restoredVisible, true);

await page.screenshot({ path: path.join(out, 'issue44-viewonly-collapse-1672x941.png') });
await browser.close();

const pass = setup
  && collapseFlow.leftRowsHidden && collapseFlow.timingRowsStillVisible && collapseFlow.timingOrderUnchanged && collapseFlow.timingCountUnchanged
  && collapseFlow.waveDromUnchanged && collapseFlow.geometryUnchanged && collapseFlow.leftRowsRestored
  && eyeIndependence.ok && eyeIndependence.hiddenByEye && eyeIndependence.restoredVisible
  && errors.length === 0;

const report = { issue: 44, note: 'view-only Left Tree group collapse must not affect the center Timing Chart rows', setup, collapseFlow, eyeIndependence, errors, pass, artifacts: ['issue44-viewonly-collapse-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #44 view-only collapse acceptance passed: collapsing a Left Signal Tree group hides only the Left Tree child rows while the center Timing Chart rows for that same group stay visible with unchanged count/order; the action never triggers a WaveDrom re-render or a Geometry rebuild; expanding restores the exact Left Tree presentation; and Eye OFF (real canonical signal visibility) remains fully independent, still correctly hiding the Timing Chart row regardless of collapse state.');
