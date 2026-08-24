import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'artifacts', 'issue158');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${root.replaceAll('\\', '/')}/gui-mockup/index.html`);
await page.waitForTimeout(400);

const report = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const waveform = window.TimingChartProductionWaveform;
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (controller.waveformIdle) await controller.waveformIdle;
  await nextPaint();
  const surface = () => document.querySelector('#cycleCanvas .waveform-render-surface');
  const traceIds = () => [...surface().querySelectorAll(':scope > .waveform-surface-row .trace')].map(host => ({
    signalId: host.closest('.waveform-surface-row')?.dataset.signal,
    id: host.id,
    mountKey: host.dataset.waveDromMountKey,
    svg: Boolean(host.querySelector('svg[data-renderer="wavedrom"]'))
  }));
  const invariant = label => {
    const entries = traceIds();
    const ids = entries.map(entry => entry.id);
    const keys = entries.map(entry => entry.mountKey);
    return {
      label,
      entries,
      uniqueIds: new Set(ids).size === ids.length,
      uniqueKeys: new Set(keys).size === keys.length,
      allWaveDrom: entries.every(entry => entry.svg),
      noDuplicateDomIds: document.querySelectorAll('[id^="waveDromTrace_"]').length === new Set([...document.querySelectorAll('[id^="waveDromTrace_"]')].map(node => node.id)).size
    };
  };
  const before = invariant('initial');
  const originalIds = controller.model.document.signals.map(signal => signal.id);
  const duplicateResult = controller.actions.duplicateSignal('clk');
  await nextPaint();
  const afterDuplicate = invariant('after-duplicate');
  const duplicateId = controller.model.selection?.id;
  const duplicateHasTrace = Boolean(duplicateId && document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${CSS.escape(duplicateId)}"] .trace svg[data-renderer="wavedrom"]`));
  const duplicateUndo = controller.actions.undo();
  await nextPaint();
  const afterUndo = invariant('after-duplicate-undo');
  const duplicateRedo = controller.actions.redo();
  await nextPaint();
  const afterRedo = invariant('after-duplicate-redo');
  const addResult = controller.actions.addSignal({ id: 'issue158_added', name: 'Issue 158 Added', type: 'binary', values: [{ start: 0, value: 0 }] });
  await nextPaint();
  const afterAdd = invariant('after-add');
  const addedHasTrace = Boolean(document.querySelector('#cycleCanvas .waveform-surface-row[data-signal="issue158_added"] .trace svg[data-renderer="wavedrom"]'));
  const addUndo = controller.actions.undo();
  await nextPaint();
  const afterAddUndo = invariant('after-add-undo');
  const addRedo = controller.actions.redo();
  await nextPaint();
  const afterAddRedo = invariant('after-add-redo');
  const finalIds = controller.model.document.signals.map(signal => signal.id);
  const stableIdentity = [...surface().querySelectorAll(':scope > .waveform-surface-row .trace svg[data-renderer="wavedrom"]')].every(svg => svg.dataset.renderer === 'wavedrom');
  return {
    originalIds,
    duplicateResult,
    duplicateId,
    duplicateHasTrace,
    duplicateUndo,
    duplicateRedo,
    addResult,
    addedHasTrace,
    addUndo,
    addRedo,
    finalIds,
    stableIdentity,
    checks: [before, afterDuplicate, afterUndo, afterRedo, afterAdd, afterAddUndo, afterAddRedo]
  };
});

const allChecksPass = report.checks.every(check => check.uniqueIds && check.uniqueKeys && check.allWaveDrom && check.noDuplicateDomIds);
const acceptance = {
  issue: 158,
  viewport: { width: 1672, height: 941, deviceScaleFactor: 1 },
  ...report,
  pageErrors,
  pass: pageErrors.length === 0 && allChecksPass && report.duplicateResult && report.duplicateHasTrace && report.duplicateUndo && report.duplicateRedo && report.addResult && report.addedHasTrace && report.addUndo && report.addRedo
};
await fs.mkdir(out, { recursive: true });
await page.screenshot({ path: path.join(out, 'issue158-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(acceptance, null, 2));
assert.equal(acceptance.pass, true, JSON.stringify(acceptance));
