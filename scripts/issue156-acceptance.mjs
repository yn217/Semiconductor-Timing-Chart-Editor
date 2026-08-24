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

const result = await page.evaluate(async () => {
  const adapter = window.TimingWaveDromAdapter;
  const waveform = window.TimingChartProductionWaveform;
  const make = (id, start, extra = {}) => ({
    id, name: id, type: 'clock',
    generator: { start, period: 1, phase: 0, duty: 0.5, initial: 0, polarity: 'positive', ...extra }
  });
  const cases = [
    ['A-start-0-duty-50', make('case_a', 0)],
    ['B-start-3-duty-50', make('case_b', 3)],
    ['C-start-3-duty-40', make('case_c', 3, { duty: 0.4 })],
    ['D-start-3-initial-1', make('case_d', 3, { initial: 1 })],
    ['E-start-3-negative', make('case_e', 3, { polarity: 'negative' })]
  ];
  const renderedCases = cases.map(([name, signal]) => {
    const adapted = adapter.waveFor(signal, 8);
    const rendered = waveform.renderTestDocument({ timeline: { start: 0, cycleCount: 8 }, signals: [signal] });
    const geometry = rendered.geometry.signals[signal.id];
    const edges = [...(geometry.risingEdge || []), ...(geometry.fallingEdge || [])].sort((a, b) => a.localX - b.localX);
    return { name, start: signal.generator.start, initial: signal.generator.initial, polarity: signal.generator.polarity, duty: signal.generator.duty, adapted, wave: rendered.waveJson[0].wave, firstEdgeCycle: edges[0]?.cycle ?? null };
  });
  const native = renderedCases[0].adapted;
  const delayed = renderedCases[1].adapted;
  const delayedRendered = renderedCases[1];
  const firstRising = { cycle: delayedRendered.firstEdgeCycle };
  const multiClock = [1, 4, 7].map((start, index) => adapter.waveFor(make(`multi_${index}`, start), 8));
  const controller = window.TimingChartProductionController;
  const clock = controller.model.document.signals.find(signal => signal.type === 'clock');
  const before = JSON.stringify(controller.getSerializableDocument());
  const historyBefore = controller.model.history?.undo?.length ?? 0;
  const changed = controller.actions.updateClock(clock.id, 'start', 3);
  const saved = controller.prepareSaveText();
  const reopened = saved.text ? await controller.actions.openText(saved.text, { fileName: 'issue156-roundtrip.tcd', unsavedDecision: 'discard' }) : false;
  const roundTripStart = controller.model.document.signals.find(signal => signal.id === clock.id)?.generator?.start;
  const changedAfterOpen = controller.actions.updateClock(clock.id, 'start', 4);
  const undone = controller.actions.undo();
  const undoStart = controller.model.document.signals.find(signal => signal.id === clock.id)?.generator?.start;
  const redone = controller.actions.redo();
  const redoStart = controller.model.document.signals.find(signal => signal.id === clock.id)?.generator?.start;
  return {
    cases: renderedCases,
    native: { binaryClock: Boolean(native.binaryClock), wave: native.wave, period: native.period },
    delayed: { binaryClock: Boolean(delayed.binaryClock), factor: delayed.subcycleFactor, wave: delayed.wave },
    delayedGeometry: { firstRisingCycle: firstRising?.cycle ?? null, wave: delayedRendered.wave },
    startHonored: renderedCases.slice(1).every(item => item.adapted.binaryClock === true && item.firstEdgeCycle >= 3),
    nativeStillNative: native.binaryClock !== true && native.wave.startsWith('p'),
    initialAndPolarityPreserved: renderedCases[3].wave.startsWith('1') && renderedCases[4].wave.startsWith('0'),
    multiClockIndependent: multiClock.every((item, index) => item.binaryClock === true && item.wave.indexOf('1') >= (index + 1) * 2),
    persistence: { changed, reopened, roundTripStart, changedAfterOpen, undone, undoStart, redone, redoStart, historyBefore, unchangedBefore: before.length > 0 }
  };
});

const acceptance = { issue: 156, ...result, errors, pass: !errors.length && result.startHonored && result.nativeStillNative && result.initialAndPolarityPreserved && result.multiClockIndependent && result.persistence.changed && result.persistence.reopened && result.persistence.roundTripStart === 3 && result.persistence.changedAfterOpen && result.persistence.undone && result.persistence.undoStart === 3 && result.persistence.redone && result.persistence.redoStart === 4 };
await fs.mkdir(out, { recursive: true });
await page.screenshot({ path: path.join(out, 'issue156-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(acceptance, null, 2));
assert.equal(acceptance.pass, true, JSON.stringify(acceptance));
