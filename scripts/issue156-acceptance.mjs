import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'artifacts', 'issue156');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${root.replaceAll('\\', '/')}/gui-mockup/index.html`);
await page.waitForTimeout(300);

const result = await page.evaluate(() => {
  const adapter = window.TimingWaveDromAdapter;
  const waveform = window.TimingChartProductionWaveform;
  const make = (id, start, extra = {}) => ({
    id, name: id, type: 'clock',
    generator: { start, period: 1, phase: 0, duty: 0.5, initial: 0, polarity: 'positive', ...extra }
  });
  const native = adapter.waveFor(make('native', 0), 8);
  const delayed = adapter.waveFor(make('delayed', 3), 8);
  const delayedRendered = waveform.renderTestDocument({ timeline: { start: 0, cycleCount: 8 }, signals: [make('delayed_rendered', 3)] });
  const geometry = delayedRendered.geometry.signals.delayed_rendered;
  const firstRising = geometry.risingEdge.find(edge => edge.cycle >= 0);
  return {
    native: { binaryClock: Boolean(native.binaryClock), wave: native.wave, period: native.period },
    delayed: { binaryClock: Boolean(delayed.binaryClock), factor: delayed.subcycleFactor, wave: delayed.wave },
    delayedGeometry: { firstRisingCycle: firstRising?.cycle ?? null, wave: delayedRendered.waveJson[0].wave },
    startHonored: delayed.binaryClock === true && delayed.wave.startsWith('0.....1') && (firstRising?.cycle ?? -1) >= 3,
    nativeStillNative: native.binaryClock !== true && native.wave.startsWith('p')
  };
});

const acceptance = { issue: 156, ...result, errors, pass: !errors.length && result.startHonored && result.nativeStillNative };
await fs.mkdir(out, { recursive: true });
await page.screenshot({ path: path.join(out, 'issue156-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(acceptance, null, 2));
assert.equal(acceptance.pass, true, JSON.stringify(acceptance));
