import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'artifacts', 'issue152');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${root.replaceAll('\\', '/')}/gui-mockup/index.html`);
await page.waitForTimeout(300);

await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const base = structuredClone(c.getSerializableDocument());
  const cycles = 100;
  const extra = Array.from({ length: 19 }, (_, index) => ({
    id: `issue152_sig_${index}`, name: `issue152_sig_${index}`, type: 'binary', role: index % 2 ? 'internal' : 'input',
    source: { instancePath: [], signalName: `issue152_sig_${index}` }, display: { name: `issue152_sig_${index}` },
    values: [{ start: 0, value: 0 }, { start: 33, value: 1 }, { start: 66, value: 0 }, { start: 99, value: 1 }]
  }));
  const clock = structuredClone(base.signals.find(signal => signal.type === 'clock'));
  clock.id = 'issue152_clk'; clock.name = 'issue152_clk'; clock.display = { name: clock.name };
  base.document.id = 'issue152-100-cycle.tcd';
  base.timeline.cycleCount = cycles; base.timeline.end = cycles; base.timeline.referenceClock = clock.id;
  base.signals = [clock, ...extra];
  base.signalGroups = [{ id: 'issue152_group', name: 'Issue 152', rows: base.signals.map(signal => signal.id) }];
  base.annotations = []; base.transactions = [];
  return c.actions.openText(JSON.stringify(base), { fileName: base.document.id, unsavedDecision: 'discard' });
});

const idle = () => page.evaluate(async () => {
  if (window.TimingChartProductionController?.waveformIdle) await window.TimingChartProductionController.waveformIdle;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
await idle();

const states = [];
for (const zoom of [50, 100, 150, 200, 400]) {
  await page.evaluate(value => window.TimingChartProductionController.actions.setZoom(value), zoom);
  await idle();
  states.push(await page.evaluate(zoom => {
    const wave = document.querySelector('#cycleCanvas .wave');
    const surface = document.querySelector('#cycleCanvas .waveform-render-surface');
    const host = window.TimingChartTimingViewport?.getScrollHost?.();
    const rows = [...document.querySelectorAll('#cycleCanvas .waveform-surface-row')].map(lane => {
      const svg = lane.querySelector(':scope > .trace svg');
      if (!svg) return null;
      const svgRect = svg.getBoundingClientRect();
      const laneRect = lane.getBoundingClientRect();
      const surfaceRect = surface?.getBoundingClientRect();
      return {
        id: lane.dataset.signal,
        svgRight: svgRect.right,
        laneRight: laneRect.right,
        surfaceRight: surfaceRect?.right ?? null,
        svgWidth: svgRect.width,
        laneWidth: laneRect.width,
        laneStyleWidth: lane.style.width,
        laneRectLeft: laneRect.left,
        surfaceWidth: surfaceRect?.width ?? null,
        rightOutsideLanePx: svgRect.right - laneRect.right,
        rightOutsideSurfacePx: surfaceRect ? svgRect.right - surfaceRect.right : null
      };
    }).filter(Boolean);
    return {
      zoom,
      waveScrollWidth: wave?.scrollWidth ?? 0,
      waveClientWidth: wave?.clientWidth ?? 0,
      waveRect: wave ? { left: wave.getBoundingClientRect().left, right: wave.getBoundingClientRect().right } : null,
      surfaceWidth: surface?.getBoundingClientRect().width ?? 0,
      surfaceStyleWidth: surface?.style.width || '',
      surfaceRect: surface ? { left: surface.getBoundingClientRect().left, right: surface.getBoundingClientRect().right } : null,
      hostScrollWidth: host?.scrollWidth ?? 0,
      maxRightOutsideLanePx: Math.max(0, ...rows.map(row => row.rightOutsideLanePx)),
      maxRightOutsideSurfacePx: Math.max(0, ...rows.map(row => row.rightOutsideSurfacePx ?? 0)),
      rows
    };
  }, zoom));
}

const result = { issue: 152, states, pageErrors, pass: !pageErrors.length && states.every(state => state.maxRightOutsideLanePx <= 0.1 && state.maxRightOutsideSurfacePx <= 0.1) };
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(result, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue152-1672x941.png') });
await browser.close();
console.log(JSON.stringify(result, null, 2));
assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
assert.equal(result.pass, true, JSON.stringify(result));
