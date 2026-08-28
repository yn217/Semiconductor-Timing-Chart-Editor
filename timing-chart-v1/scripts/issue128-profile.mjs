import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts', 'issue128');
const sizes = process.argv.includes('--normal-only') ? [{ signals: 50, cycles: 100 }] : [{ signals: 50, cycles: 100 }, { signals: 100, cycles: 500 }];
const tryRowContainment = process.argv.includes('--try-row-containment');
const reorderOnly = process.argv.includes('--reorder-only');
const skipTimeline = process.argv.includes('--skip-timeline');
const deepProfile = process.argv.includes('--deep');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const client = await page.context().newCDPSession(page);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(250);

const fixture = async (signalsCount, cycles) => page.evaluate(async ({ signalsCount, cycles }) => {
  const controller = window.TimingChartProductionController;
  const base = structuredClone(controller.getSerializableDocument());
  base.document.id = `issue128-${signalsCount}-${cycles}.tcd`;
  base.timeline.cycleCount = cycles;
  base.timeline.end = cycles;
  const signals = Array.from({ length: Math.max(0, signalsCount - 1) }, (_, index) => ({
    id: `issue128_sig_${index}`, name: `issue128_sig_${index}`, type: index % 7 === 0 ? 'bus' : 'binary',
    role: index % 3 === 0 ? 'input' : index % 3 === 1 ? 'internal' : 'output',
    width: index % 7 === 0 ? 8 : undefined,
    source: { instancePath: [], signalName: `issue128_sig_${index}` },
    display: { name: `issue128_sig_${index}` },
    values: [{ start: 0, value: index % 7 === 0 ? '00' : 0 }, { start: Math.floor(cycles / 3), value: index % 7 === 0 ? '12' : 1 }, { start: Math.floor(cycles * 2 / 3), value: index % 7 === 0 ? '34' : 0 }]
  }));
  const clock = structuredClone(base.signals.find(signal => signal.type === 'clock'));
  clock.id = 'issue128_clk'; clock.name = 'issue128_clk'; clock.display = { name: 'issue128_clk' };
  base.timeline.referenceClock = clock.id;
  base.signals = [clock, ...signals];
  base.signalGroups = [{ id: 'issue128_group', name: 'Issue 128 fixture', rows: base.signals.map(signal => signal.id) }];
  base.annotations = [];
  base.transactions = [];
  return controller.actions.openText(JSON.stringify(base), { fileName: base.document.id, unsavedDecision: 'discard' });
}, { signalsCount, cycles });

const waitIdle = () => page.evaluate(async () => {
  const idle = window.TimingChartProductionController?.waveformIdle;
  if (idle) await idle;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

const traceOnce = async (name, action) => {
  await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    c.enableProfiling?.(true);
    performance.clearMarks(); performance.clearMeasures();
    for (const key of Object.keys(c.renderMetrics)) c.renderMetrics[key] = 0;
  });
  const chunks = [];
  const onData = event => chunks.push(...(event.value || []));
  if (deepProfile) {
    await client.send('Profiler.enable');
    await client.send('Profiler.start', { callCount: 10 });
  }
  client.on('Tracing.dataCollected', onData);
  await client.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline', options: 'record-as-much-as-needed' });
  const started = await page.evaluate(() => performance.now());
  await action();
  const browserReady = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const idle = window.TimingChartProductionController?.waveformIdle;
    if (idle) await idle;
    return performance.now();
  });
  const trace = await new Promise(async resolve => {
    client.once('Tracing.tracingComplete', () => resolve(chunks));
    await client.send('Tracing.end');
  });
  client.off('Tracing.dataCollected', onData);
  const cpuProfile = deepProfile ? (await client.send('Profiler.stop')).profile : null;
  if (deepProfile) await client.send('Profiler.disable');
  const userTiming = await page.evaluate(() => performance.getEntriesByType('mark').filter(entry => entry.name.startsWith('tc:')).map(entry => ({ name: entry.name, startTime: entry.startTime }))); 
  const metrics = await page.evaluate(() => ({ ...window.TimingChartProductionController.renderMetrics }));
  const incrementalTrace = await page.evaluate(() => ({ trace: window.TimingChartProductionController.lastIncrementalTrace || null, parts: window.TimingChartProductionController.lastIncrementalTraceParts || null }));
  const traceBounds = {
    commandStartTs: traceMarkTimestamp(trace, 'tc:command:start'),
    commandRaf1Ts: traceMarkTimestamp(trace, 'tc:command:raf-1')
  };
  const totals = summarizeTrace(trace);
  const commandInterval = traceBounds.commandStartTs !== null && traceBounds.commandRaf1Ts !== null
    ? summarizeTrace(trace, { startTs: traceBounds.commandStartTs, endTs: traceBounds.commandRaf1Ts })
    : null;
  return { name, browserReadyMs: browserReady - started, userTiming, traceBounds, totals, commandInterval, metrics, incrementalTrace, cpuProfile: deepProfile ? summarizeCpuProfile(cpuProfile) : null, traceEvents: trace.length };
};

const traceMarkTimestamp = (events, markName) => {
  const event = events.find(item => {
    const args = item.args || {};
    const data = args.data || args.beginData || args;
    return item.name === markName || data.name === markName || data.markName === markName;
  });
  return Number.isFinite(Number(event?.ts)) ? Number(event.ts) : null;
};

const summarizeTrace = (events, bounds = null) => {
  const sums = { scriptingMs: 0, styleMs: 0, layoutMs: 0, prePaintMs: 0, layerizeMs: 0, paintMs: 0, rasterMs: 0, compositeMs: 0, commitMs: 0, longTasks: 0 };
  const top = new Map();
  for (const event of events) {
    if (bounds && (!Number.isFinite(Number(event.ts)) || Number(event.ts) < bounds.startTs || Number(event.ts) > bounds.endTs)) continue;
    const duration = Number(event.dur || 0) / 1000;
    if (duration <= 0) continue;
    const name = String(event.name || '');
    const lower = name.toLowerCase();
    if (lower.includes('recalculatestyle') || lower.includes('updatelayouttree')) sums.styleMs += duration;
    else if (lower === 'layout' || lower.includes('layout')) sums.layoutMs += duration;
    else if (lower === 'prepaint' || lower.includes('prepaint')) sums.prePaintMs += duration;
    else if (lower === 'layerize' || lower.includes('layerize')) sums.layerizeMs += duration;
    else if (lower === 'paint' || lower.includes('paint')) sums.paintMs += duration;
    else if (lower.includes('raster')) sums.rasterMs += duration;
    else if (lower.includes('composite')) sums.compositeMs += duration;
    else if (lower === 'commit' || lower.includes('commit')) sums.commitMs += duration;
    else if (event.cat?.includes('devtools.timeline')) sums.scriptingMs += duration;
    if (duration >= 50) sums.longTasks += 1;
    top.set(name, (top.get(name) || 0) + duration);
  }
  return { ...Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, Number(value.toFixed(3))])), topHotspots: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => ({ name, ms: Number(ms.toFixed(3)) })) };
};

const summarizeCpuProfile = profile => {
  if (!profile?.nodes?.length) return { available: false, totalSamples: 0, topFunctions: [] };
  const byFunction = new Map();
  for (const node of profile.nodes) {
    const callFrame = node.callFrame || {};
    const name = callFrame.functionName || '(anonymous)';
    const url = callFrame.url || '';
    const key = `${name}\u0000${url}`;
    byFunction.set(key, {
      functionName: name,
      url,
      lineNumber: Number(callFrame.lineNumber ?? -1) + 1,
      selfSamples: Number(node.hitCount || 0),
      totalSamples: 0
    });
  }
  const totalFor = id => {
    const node = profile.nodes.find(item => item.id === id);
    if (!node) return 0;
    let total = Number(node.hitCount || 0);
    for (const child of node.children || []) total += totalFor(child);
    return total;
  };
  for (const node of profile.nodes) {
    const callFrame = node.callFrame || {};
    const key = `${callFrame.functionName || '(anonymous)'}\u0000${callFrame.url || ''}`;
    const entry = byFunction.get(key);
    if (entry) entry.totalSamples += totalFor(node.id);
  }
  return {
    available: true,
    totalSamples: Number(profile.samples?.length || 0),
    topFunctions: [...byFunction.values()].sort((a, b) => b.totalSamples - a.totalSamples || b.selfSamples - a.selfSamples).slice(0, 20)
  };
};

const reorder = async direction => {
  await page.evaluate(async direction => {
    const row = document.querySelector('#groups .row[data-signal="issue128_sig_40"]');
    row?.querySelector('.more')?.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const button = document.querySelector(`#issue6ContextMenu [data-command="${direction}"]`);
    if (!button) throw new Error(`Missing reorder command: ${direction}`);
    button.click();
  }, direction);
};

const eye = async visible => page.locator('#groups .row[data-signal="issue128_sig_40"] .eye').click({ force: true }).then(() => visible);
const cycleInsert = async () => page.evaluate(() => {
  const tab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(node => node.textContent.replace(/\s/g, '') === '挿入');
  window.TimingChartInsertRibbon?.setRibbon(tab);
  document.querySelector('[data-insert-command="insert-cycle"]')?.click();
});

const runs = [];
for (const size of sizes) {
  await fixture(size.signals, size.cycles);
  if (tryRowContainment) await page.evaluate(() => document.querySelectorAll('#cycleCanvas .wave-row').forEach(row => { row.style.contain = 'layout'; }));
  await waitIdle();
  const scenarios = [
    await traceOnce('signal-up', () => reorder('up')),
    await traceOnce('signal-down', () => reorder('down'))
  ];
  if (!reorderOnly) scenarios.push(await traceOnce('eye-off', () => eye(false)), await traceOnce('eye-on', () => eye(true)));
  if (!reorderOnly && !skipTimeline && size.signals === 50) scenarios.push(await traceOnce('cycle-insert', cycleInsert));
  runs.push({ fixture: size, scenarios });
}

await fs.mkdir(outputDir, { recursive: true });
const report = { browser: await browser.version(), viewport: { width: 1672, height: 941, deviceScaleFactor: 1 }, runs, pageErrors };
await fs.writeFile(path.join(outputDir, 'profile-summary.json'), `${JSON.stringify(report, null, 2)}\n`);
if (pageErrors.length) throw new Error(JSON.stringify(pageErrors));
console.log(JSON.stringify(report, null, 2));
await browser.close();
