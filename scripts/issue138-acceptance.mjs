import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
const url = `file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`;

// A. A committed edit must recover if the localized render fast path misses.
await page.goto(url); await page.waitForTimeout(400);
const renderMiss = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  document.querySelector('#groups .row[data-signal="req_valid"]')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const svg = () => document.querySelector('#cycleCanvas .wave-row[data-signal="req_valid"] .trace svg');
  const before = {
    key: svg()?.dataset.waveKey || '',
    revision: c.model.documentRevision,
    undo: c.model.history.undo.length,
    value: c.model.document.signals.find(signal => signal.id === 'req_valid').values[1].value,
  };
  const wave = window.TimingChartProductionWaveform;
  const original = wave.renderSignal;
  wave.renderSignal = () => false;
  const input = document.querySelector('#bottomContent [data-editor-field="value"][data-editor-index="1"]');
  input.value = String(before.value) === '1' ? '0' : '1';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 80));
  wave.renderSignal = original;
  return {
    before,
    after: {
      key: svg()?.dataset.waveKey || '',
      revision: c.model.documentRevision,
      undo: c.model.history.undo.length,
      value: c.model.document.signals.find(signal => signal.id === 'req_valid').values[1].value,
    },
  };
});
const renderMissPass = renderMiss.after.value !== renderMiss.before.value
  && renderMiss.after.revision === renderMiss.before.revision + 1
  && renderMiss.after.undo === renderMiss.before.undo + 1
  && renderMiss.after.key
  && renderMiss.after.key !== renderMiss.before.key;

// B. A later real container resize at the same document revision must not be consumed by stale suppression state.
await page.goto(url); await page.waitForTimeout(400);
const resize = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const signal = c.model.document.signals.find(item => item.id === 'req_valid');
  c.actions.updateSignalValue('req_valid', 1, 'value', String(signal.values[1].value) === '1' ? '0' : '1');
  await wait(350);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = {
    revision: c.model.documentRevision,
    frames: c.timeAxisMetrics.transientFrames,
    width: document.querySelector('#cycleCanvas').getBoundingClientRect().width,
  };
  const canvas = document.querySelector('#cycleCanvas');
  canvas.style.width = `${Math.max(500, before.width - 37)}px`;
  await wait(80);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    before,
    after: {
      revision: c.model.documentRevision,
      frames: c.timeAxisMetrics.transientFrames,
      width: canvas.getBoundingClientRect().width,
    },
    flags: {
      revision: c.skipTimeAxisResizeRevision ?? null,
      until: c.skipTimeAxisResizeUntil ?? null,
    },
  };
});
const resizePass = resize.after.revision === resize.before.revision
  && resize.after.width !== resize.before.width
  && resize.after.frames > resize.before.frames;

await browser.close();
assert.equal(errors.length, 0, errors.join('\n'));
assert.equal(renderMissPass, true, `localized render miss left stale waveform: ${JSON.stringify(renderMiss)}`);
assert.equal(resizePass, true, `later real resize was not processed: ${JSON.stringify(resize)}`);
console.log('Issue #138 acceptance passed:', JSON.stringify({ renderMiss, resize }));
