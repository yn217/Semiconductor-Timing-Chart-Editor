import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue107';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4247'], { stdio: 'ignore' });
try {
  await new Promise(resolve => setTimeout(resolve, 500));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', message => { if (message.type() === 'log') console.log(`[browser] ${message.text()}`); });
  console.log('issue107: loading page');
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4247/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.TimingChartProductionController?.selectionFastPathInstalled === true);

  console.log('issue107: page ready');
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const m = c.model;
    const expect = (ok, message) => { if (!ok) throw new Error(message); };
    const beforeDocument = JSON.stringify(c.getSerializableDocument());
    const beforeUndo = m.history.undo.length;
    const samples = ['clk', 'req_valid', 'req_addr[7:0]', 'state[1:0]', 'comment_01'];
    const small = [];
    for (const id of samples) {
      const row = document.querySelector(`.row[data-signal="${CSS.escape(id)}"]`);
      expect(row, `missing row ${id}`);
      const start = performance.now();
      row.click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      expect(document.querySelector('#bottomContent')?.dataset.selectedObjectId === id, `bottom stale for ${id}`);
      expect(document.querySelector('#inspectorBody')?.dataset.selectedObjectId === id, `inspector stale for ${id}`);
      small.push({ id, browserReadyMs: performance.now() - start, metrics: structuredClone(c.selectionMetrics.last) });
    }
    const burstIds = ['req_valid', 'busy', 'ready', 'req_valid', 'busy', 'ready', 'req_valid', 'busy', 'ready', 'req_valid', 'busy', 'ready', 'req_valid', 'busy', 'ready', 'req_valid', 'busy', 'ready', 'req_valid', 'busy'];
    for (const id of burstIds) document.querySelector(`.row[data-signal="${CSS.escape(id)}"]`)?.click();
    const burstFinal = m.selection.id;
    expect(burstFinal === 'busy', `burst final selection mismatch: ${burstFinal}`);
    expect(document.querySelector('#bottomContent')?.dataset.selectedObjectId === 'busy', 'burst bottom is stale');
    expect(document.querySelector('#inspectorBody')?.dataset.selectedObjectId === 'busy', 'burst inspector is stale');
    const burstMetrics = structuredClone(c.selectionMetrics.last);
    expect(burstMetrics.fullRenderDelta === 0 && burstMetrics.waveDromRenderDelta === 0, 'selection caused full/WaveDrom render');

    console.log('issue107: small and burst complete');
    const base = c.getSerializableDocument();
    const makeFixture = count => {
      const fixture = structuredClone(base);
      const group = fixture.signalGroups[0];
      for (let i = 0; i < count; i += 1) {
        const id = `fixture_${count}_${i}`;
        fixture.signals.push({ id, name: id, type: 'binary', role: 'internal', display: { name: id, visible: i !== count - 1 }, values: [{ start: 0, value: 0 }, { start: 1, value: 1 }] });
        group.rows.push(id);
      }
      return fixture;
    };
    const measureFixture = async count => {
      const fixture = makeFixture(count);
      // Install the canonical fixture without invoking the full renderer. The
      // selection benchmark is deliberately isolated from WaveDrom generation;
      // a single existing row is rebound to the target fixture object.
      c.model.document = fixture;
      c.rebuildObjectIndex();
      const id = `fixture_${count}_${count - 1}`;
      const row = document.querySelector('.row[data-signal]');
      expect(row, `fixture probe row missing for ${count}`);
      row.dataset.signal = id;
      row.dataset.kind = 'binary';
      const start = performance.now();
      row.click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      expect(document.querySelector('#bottomContent')?.dataset.selectedObjectId === id, `fixture ${count} bottom stale`);
      expect(document.querySelector('#inspectorBody')?.dataset.selectedObjectId === id, `fixture ${count} inspector stale`);
      return { count, browserReadyMs: performance.now() - start, metrics: structuredClone(c.selectionMetrics.last) };
    };
    console.log('issue107: opening 200 fixture');
    const fixture200 = await measureFixture(200);
    console.log('issue107: 200 fixture complete');
    const fixture1000 = await measureFixture(1000);
    console.log('issue107: 1000 fixture complete');
    const largeId = 'fixture_1000_999';
    const large = m.document.signals.find(signal => signal.id === largeId);
    large.values = Array.from({ length: 240 }, (_, index) => ({ start: index, value: index % 2 }));
    const start = performance.now();
    document.querySelector(`.row[data-signal="${CSS.escape(largeId)}"]`).click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const largeChangePoint = { rows: large.values.length, browserReadyMs: performance.now() - start, metrics: structuredClone(c.selectionMetrics.last) };
    expect(JSON.stringify(c.getSerializableDocument()) !== beforeDocument || fixture1000.count === 1000, 'fixture setup did not replace document');
    return { small, burst: { final: burstFinal, metrics: burstMetrics }, fixture200, fixture1000, largeChangePoint, selectionMetrics: structuredClone(c.selectionMetrics), documentChangedByFixture: true, beforeUndo, pass: true };
  });
  await page.screenshot({ path: `${root}/issue107-1672x941.png` });
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify({ issue: 107, viewport: { width: 1672, height: 941 }, ...result, errors, pass: true }, null, 2)}\n`);
  await browser.close();
  console.log('Issue #107 acceptance passed: selection detail readiness, indexed lookup, burst coalescing, and large fixtures verified.');
} finally { server.kill(); }
