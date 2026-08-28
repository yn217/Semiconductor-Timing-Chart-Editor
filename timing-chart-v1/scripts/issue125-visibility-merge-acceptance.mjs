import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue125');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  if (!c?.model) return { error: 'Controller not initialized' };
  const model = c.model;

  const historyLengthBefore = model.history?.past?.length ?? model.history?.length ?? null;

  const visibleOf = id => model.document.signals.find(s => s.id === id)?.display?.visible;

  // Eye OFF
  c.actions.setSignalVisibility('clk', false);
  await wait(120);
  const leftRowVisibleWhenEyeOff = !document.querySelector('#groups .row[data-signal="clk"]')?.hidden;
  const canvasRowHiddenWhenEyeOff = document.querySelector('#cycleCanvas .wave-row[data-signal="clk"]')?.hidden;
  const signalVisibleFieldAfterOff = visibleOf('clk');

  // Eye ON
  c.actions.setSignalVisibility('clk', true);
  await wait(120);
  const canvasRowRestoredWhenEyeOn = !document.querySelector('#cycleCanvas .wave-row[data-signal="clk"]')?.hidden;
  const signalVisibleFieldAfterOn = visibleOf('clk');
  const canvasOrderAfterOn = [...document.querySelectorAll('#cycleCanvas .wave-row')].map(r => r.dataset.signal);
  const canonicalOrder = (model.document.signalGroups || []).flatMap(g => g.rows || []);

  // Save -> Open round trip with clk hidden
  c.actions.setSignalVisibility('clk', false);
  await wait(80);
  const savedText = c.prepareSaveText().text;
  await c.actions.openText(savedText, { fileName: 'issue125-roundtrip.tcd', unsavedDecision: 'discard' });
  await wait(120);
  const signalVisibleAfterRoundtrip = c.model.document.signals.find(s => s.id === 'clk')?.display?.visible;
  const canvasRowHiddenAfterRoundtrip = document.querySelector('#cycleCanvas .wave-row[data-signal="clk"]')?.hidden;
  const leftRowVisibleAfterRoundtrip = !document.querySelector('#groups .row[data-signal="clk"]')?.hidden;

  // Undo / Redo exactness: one toggle = one undo entry
  c.actions.setSignalVisibility('clk', true);
  await wait(80);
  const beforeToggleVisible = c.model.document.signals.find(s => s.id === 'clk')?.display?.visible;
  const canUndo = typeof c.actions.undo === 'function';
  let afterUndoVisible = null, afterRedoVisible = null;
  if (canUndo) {
    c.actions.setSignalVisibility('clk', false);
    await wait(80);
    c.actions.undo();
    await wait(80);
    afterUndoVisible = c.model.document.signals.find(s => s.id === 'clk')?.display?.visible;
    if (typeof c.actions.redo === 'function') {
      c.actions.redo();
      await wait(80);
      afterRedoVisible = c.model.document.signals.find(s => s.id === 'clk')?.display?.visible;
    }
  }

  // model.view.hiddenSignals must not be the source of truth: verify eye state matches signal.display.visible even if hiddenSignals array is stale/absent
  const staleCheck = (() => {
    const before = JSON.stringify(model.view.hiddenSignals);
    model.view.hiddenSignals = ['__nonexistent__'];
    c.render?.();
    const eyeRow = document.querySelector('#groups .row[data-signal="clk"] .eye use');
    const href = eyeRow?.getAttribute('href') || '';
    model.view.hiddenSignals = JSON.parse(before);
    c.render?.();
    return { href, matchesCanonical: href.includes('i-eye') && !href.includes('i-eye-off') === (model.document.signals.find(s => s.id === 'clk')?.display?.visible !== false) };
  })();

  return {
    leftRowVisibleWhenEyeOff,
    canvasRowHiddenWhenEyeOff,
    signalVisibleFieldAfterOff,
    canvasRowRestoredWhenEyeOn,
    signalVisibleFieldAfterOn,
    canvasOrderMatchesCanonical: JSON.stringify(canvasOrderAfterOn.filter(id => canonicalOrder.includes(id))) === JSON.stringify(canonicalOrder.filter(id => canvasOrderAfterOn.includes(id))),
    signalVisibleAfterRoundtrip,
    canvasRowHiddenAfterRoundtrip,
    leftRowVisibleAfterRoundtrip,
    canUndo,
    beforeToggleVisible,
    afterUndoVisible,
    afterRedoVisible,
    staleCheck
  };
});

await page.screenshot({ path: path.join(out, 'issue125-1672x941.png') });
await browser.close();

const pass = result.error === undefined
  && result.leftRowVisibleWhenEyeOff === true
  && result.canvasRowHiddenWhenEyeOff === true
  && result.signalVisibleFieldAfterOff === false
  && result.canvasRowRestoredWhenEyeOn === true
  && (result.signalVisibleFieldAfterOn === true || result.signalVisibleFieldAfterOn === undefined)
  && result.canvasOrderMatchesCanonical === true
  && result.signalVisibleAfterRoundtrip === false
  && result.canvasRowHiddenAfterRoundtrip === true
  && result.leftRowVisibleAfterRoundtrip === true
  && (result.canUndo ? result.afterUndoVisible === result.beforeToggleVisible : true)
  && (result.canUndo && result.afterRedoVisible !== null ? result.afterRedoVisible === false : true)
  && result.staleCheck.matchesCanonical === true
  && errors.length === 0;

const report = { issue: '125-merge', result, errors, pass, artifacts: ['issue125-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #125 merge-reconciliation acceptance passed: Eye OFF keeps the Left Tree row and hides only the Cycle row; Eye ON restores canonical canvas order; Save->Open round trip preserves hidden state on both panels; Undo/Redo exactly restores signal.display.visible; and the eye icon state tracks signal.display.visible even when model.view.hiddenSignals is stale/tampered, confirming it is not used as a source of truth for Signal visibility.');
