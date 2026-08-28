import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const fixture = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const base = structuredClone(controller.getSerializableDocument());
  base.document.id = 'command-to-paint-large.tcd';
  base.timeline.cycleCount = 100;
  base.timeline.end = 100;
  const issueSignals = Array.from({ length: 49 }, (_, index) => ({
    id: `ctp_sig_${index}`, name: `ctp_sig_${index}`, type: 'binary',
    role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
    source: { instancePath: [], signalName: `ctp_sig_${index}` },
    display: { name: `ctp_sig_${index}` },
    values: [{ start: 0, value: 0 }, { start: 40 + (index % 10), value: 1 }, { start: 80 + (index % 10), value: 0 }]
  }));
  const referenceClock = structuredClone(base.signals.find(signal => signal.type === 'clock'));
  referenceClock.id = 'ctp_clk'; referenceClock.name = 'ctp_clk'; referenceClock.display = { name: 'ctp_clk' };
  base.timeline.referenceClock = referenceClock.id;
  base.signals = [referenceClock, ...issueSignals];
  base.signalGroups = [{ id: 'ctp_group', name: 'Command-to-paint', rows: base.signals.map(signal => signal.id) }];
  base.annotations = [];
  base.transactions = [];
  return base;
});

const replace = await page.evaluate(async base => {
  const controller = window.TimingChartProductionController;
  const started = performance.now();
  const result = await controller.actions.openText(JSON.stringify(base), { fileName: 'command-to-paint-large.tcd', unsavedDecision: 'discard' });
  return { result, elapsedMs: performance.now() - started };
}, fixture);

const state = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  return { signalCount: controller.model.document.signals.length, rows: document.querySelectorAll('#cycleCanvas .wave-row').length };
});
await page.evaluate(async () => {
  const idle = window.TimingChartProductionController?.waveformIdle;
  if (idle) await idle;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

const actions = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const findTool = label => [...document.querySelectorAll('button.tool')].find(button => button.querySelector('.tool-label')?.textContent.replace(/\s/g, '').includes(label));
  const row = id => document.querySelector(`#groups .row[data-signal="${id}"]`);
  const run = async (name, fn) => {
    const metricsBefore = { ...controller.renderMetrics };
    window.__lastReorderClickDispatchMs = null;
    const cycleBefore = controller.model.document.timeline.cycleCount;
    const revisionBefore = controller.model.documentRevision;
    const start = performance.now();
    const rawResult = fn();
    const resultValue = rawResult && typeof rawResult.then === 'function' ? await rawResult : rawResult;
    const result = resultValue === undefined ? true : resultValue;
    const commandEnd = performance.now();
    const waveformIdle = controller.waveformIdle;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const paint = performance.now();
    if (waveformIdle) await waveformIdle;
    const settledPaint = performance.now();
    return { name, result, commandMs: commandEnd - start, clickDispatchMs: window.__lastReorderClickDispatchMs || null, paintMs: paint - start, settledPaintMs: settledPaint - start, cycleBefore, cycleAfter: controller.model.document.timeline.cycleCount, revisionBefore, revisionAfter: controller.model.documentRevision, trace: controller.lastIncrementalTrace || null, traceParts: controller.lastIncrementalTraceParts || null, timelineTrace: controller.lastTimelineInvalidation || null, metricsBefore, metricsAfter: { ...controller.renderMetrics } };
  };
  return (async () => {
    controller.actions.selectObject(row('ctp_sig_10'));
    await new Promise(resolve => requestAnimationFrame(resolve));
    for (const key of Object.keys(controller.renderMetrics)) controller.renderMetrics[key] = 0;
    const prepareReorder = async command => {
      row('ctp_sig_10')?.querySelector('.more')?.click();
      await new Promise(resolve => requestAnimationFrame(resolve));
      return Boolean(document.querySelector(`#issue6ContextMenu [data-command="${command}"]`));
    };
    const clickPreparedReorder = command => { const button = document.querySelector(`#issue6ContextMenu [data-command="${command}"]`); if (!button) return false; const started = performance.now(); button.click(); window.__lastReorderClickDispatchMs = performance.now() - started; return true; };
    const signalUpReady = await prepareReorder('up');
    const signalUp = await run('signal-up', () => signalUpReady && clickPreparedReorder('up'));
    const signalDownReady = await prepareReorder('down');
    const signalDown = await run('signal-down', () => signalDownReady && clickPreparedReorder('down'));
    const results = [
    signalUp,
    signalDown,
    await run('eye-off', () => document.querySelector('#groups .row[data-signal="ctp_sig_10"] .eye')?.click()),
    await run('eye-on', () => document.querySelector('#groups .row[data-signal="ctp_sig_10"] .eye')?.click()),
    await run('cycle-insert', () => {
      const tab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(node => node.textContent.replace(/\s/g, '') === '挿入');
      window.TimingChartInsertRibbon?.setRibbon(tab);
      document.querySelector('[data-insert-command="insert-cycle"]')?.click();
    }),
    await run('cycle-delete', () => findTool('Cycle削除')?.click())
    ];
    return results;
  })();
});
const finalState = await page.evaluate(() => ({ cycleCount: window.TimingChartProductionController.model.document.timeline.cycleCount, documentRevision: window.TimingChartProductionController.model.documentRevision }));
await fs.mkdir(path.join(root, 'artifacts', 'command-to-paint'), { recursive: true });
const targets = actions.map(action => {
  const timeline = ['cycle-insert', 'cycle-delete'].includes(action.name);
  const thresholdMs = timeline ? 1500 : 50;
  const measuredMs = timeline ? action.settledPaintMs : action.paintMs;
  return { name: action.name, metric: timeline ? 'settledPaintMs' : 'paintMs', measuredMs, thresholdMs, pass: measuredMs < thresholdMs };
});
const result = { fixture: { signals: 50, cycles: 100 }, replace, state, actions, finalState, pageErrors, targets, pass: targets.every(target => target.pass) };
await fs.writeFile(path.join(root, 'artifacts', 'command-to-paint', 'acceptance.json'), `${JSON.stringify(result, null, 2)}\n`);
if (!replace.result || state.signalCount !== 50 || state.rows !== 50 || pageErrors.length) throw new Error(JSON.stringify(result));
for (const action of actions) {
  if (!action.result) throw new Error(JSON.stringify(action));
  if (['cycle-insert', 'cycle-delete'].includes(action.name) && !(action.settledPaintMs >= action.paintMs)) throw new Error(`Timeline paint ordering failed: ${JSON.stringify(action)}`);
  const waveDelta = action.metricsAfter.waveDromRenders - action.metricsBefore.waveDromRenders;
  const geometryDelta = action.metricsAfter.geometryBuilds - action.metricsBefore.geometryBuilds;
  const fullRenderDelta = action.metricsAfter.appFullRenders - action.metricsBefore.appFullRenders;
  const prohibited = ['wavePayloadBuilds', 'waveCacheLookups', 'rulerRebuilds', 'gridRebuilds', 'bottomRenders', 'inspectorRenders', 'transactionRenders'];
  const prohibitedDelta = prohibited.reduce((sum,key)=>sum+Math.max(0,(action.metricsAfter[key]||0)-(action.metricsBefore[key]||0)),0);
  if (!['cycle-insert', 'cycle-delete'].includes(action.name) && (waveDelta !== 0 || geometryDelta !== 0 || fullRenderDelta !== 0 || prohibitedDelta !== 0)) throw new Error(JSON.stringify(action));
  if (action.name === 'signal-up' || action.name === 'signal-down') {
    const rowMoveDelta = action.metricsAfter.rowMoves - action.metricsBefore.rowMoves;
    if (rowMoveDelta < 2) throw new Error(JSON.stringify(action));
  }
}
if (finalState.cycleCount !== 100) throw new Error(JSON.stringify(result));
if (actions.find(action => action.name === 'cycle-insert')?.cycleAfter !== 101) throw new Error(JSON.stringify(result));
if (actions.find(action => action.name === 'cycle-delete')?.cycleAfter !== 100) throw new Error(JSON.stringify(result));
console.log(`Command-to-Paint diagnostic completed; final gate ${result.pass ? 'PASS' : 'FAIL'}:`, JSON.stringify(targets));
await browser.close();
if (!result.pass) process.exitCode = 1;
