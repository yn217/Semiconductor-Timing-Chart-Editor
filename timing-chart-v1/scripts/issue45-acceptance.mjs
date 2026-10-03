import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue45';
const sampleRoot = '../timing-chart-v2/samples/old/pre-reset-2026-10-02/golden-protocol/timing_chart_sample_pack/samples';
const files = fs.readdirSync(sampleRoot).filter(file => file.endsWith('.json')).sort();
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4245'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await pause(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4245/gui-mockup/', { waitUntil: 'networkidle' });
  const loaded = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(sampleRoot, file), 'utf8');
    const result = await page.evaluate(async ({ text, file }) => {
      const c = window.TimingChartProductionController;
      const opened = await c.actions.openText(text, { fileName: file, unsavedDecision: 'discard' });
      await new Promise(resolve => setTimeout(resolve, 120));
      const doc = c.getSerializableDocument();
      const expectedRows = doc.signalGroups.flatMap(group => group.rows);
      const centerRows = [...document.querySelectorAll('#cycleCanvas .wave-row')].map(row => row.dataset.signalId);
      const traces = [...document.querySelectorAll('#cycleCanvas .waveform-surface-row[data-signal-id] .trace svg')];
      const traceIds = traces.map(trace => trace.closest('.waveform-surface-row')?.dataset.signalId);
      const visibleSignals = doc.signals.filter(signal => signal.type !== 'commentRow').map(signal => signal.id);
      return { opened, doc, expectedRows, centerRows, traceIds, visibleSignals, geometrySignals: Object.keys(c.model.waveGeometry?.signals || {}) };
    }, { text, file });
    assert.equal(result.opened, true, file);
    assert.deepEqual(result.centerRows, result.expectedRows, `center row order mismatch: ${file}`);
    assert.deepEqual(result.traceIds.sort(), result.visibleSignals.sort(), `trace host mismatch: ${file}`);
    assert.deepEqual(result.geometrySignals.sort(), result.visibleSignals.sort(), `geometry map mismatch: ${file}`);
    loaded.push({ file, rows: result.centerRows.length, traces: result.traceIds.length });
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: `${root}/opened-last-sample-1672x941.png` });
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify({ files: loaded, rowsReconciled: true, staleRowsRemoved: true, goldenReferenceModified: false, pass: true }, null, 2)}\n`);
  await browser.close();
  console.log(`Issue #45 acceptance passed: ${loaded.length} protocol documents rebuilt left/center rows and WaveDrom geometry.`);
} finally { server.kill(); }
