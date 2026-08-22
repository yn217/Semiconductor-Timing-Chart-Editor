import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue50');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const controller = window.TimingChartProductionController;
  const groupId = controller.model.document.signalGroups[0].id;
  const addClock = (id, period, phase) => controller.actions.addSignal({ id, name: id.toUpperCase(), type: 'clock', role: 'input', generator: { start: 0, period, duty: 0.5, phase, initial: 0, polarity: 'positive' }, edgeCounter: { show: true, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } }, groupId);
  addClock('pclk_custom', 2, 0.25);
  addClock('hclk_custom', 4, 0.5);
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  const select = async id => { document.querySelector(`#groups .row[data-signal="${id}"]`)?.click(); await pause(); };
  const change = async (field, value) => { const input = document.querySelector(`[data-clock-field="${field}"]`); if (!input) throw new Error(`missing clock field ${field}`); input.value = String(value); input.dispatchEvent(new Event('change', { bubbles: true })); await pause(); };
  await select('pclk_custom');
  await change('period', 3);
  await change('phase', 1.5);
  await change('edgeCounter.mode', 'Both');
  const afterPclk = structuredClone(controller.model.document.signals.find(signal => signal.id === 'pclk_custom'));
  const hclkBefore = structuredClone(controller.model.document.signals.find(signal => signal.id === 'hclk_custom'));
  const referenceBefore = controller.model.document.timeline.referenceClock;
  await select('hclk_custom');
  await change('phase', 2);
  const afterHclk = structuredClone(controller.model.document.signals.find(signal => signal.id === 'hclk_custom'));
  const pclkAfterHclk = structuredClone(controller.model.document.signals.find(signal => signal.id === 'pclk_custom'));
  const invalid = controller.actions.updateClock('missing_clock', 'phase', 9);
  const saved = controller.prepareSaveText();
  const opened = await controller.actions.openText(saved.text, { fileName: 'issue50-roundtrip.tcd', unsavedDecision: 'discard' });
  const roundTrip = structuredClone(controller.model.document.signals.filter(signal => ['pclk_custom', 'hclk_custom'].includes(signal.id)));
  await select('pclk_custom');
  const phaseBeforeUndo = controller.model.document.signals.find(signal => signal.id === 'pclk_custom').generator.phase;
  await change('phase', 2.5);
  const changedPhase = controller.model.document.signals.find(signal => signal.id === 'pclk_custom').generator.phase;
  const undo = controller.actions.undo();
  const phaseAfterUndo = controller.model.document.signals.find(signal => signal.id === 'pclk_custom').generator.phase;
  const hclkAfterUndo = controller.model.document.signals.find(signal => signal.id === 'hclk_custom').generator.phase;
  const redo = controller.actions.redo();
  const phaseAfterRedo = controller.model.document.signals.find(signal => signal.id === 'pclk_custom').generator.phase;
  return {
    checks: {
      selectedPclkOnly: afterPclk.generator.period === 3 && afterPclk.generator.phase === 1.5 && afterPclk.edgeCounter.mode === 'both' && hclkBefore.generator.period === 4 && hclkBefore.generator.phase === 0.5,
      selectedHclkOnly: afterHclk.generator.phase === 2 && afterHclk.generator.period === 4 && pclkAfterHclk.generator.period === 3 && pclkAfterHclk.generator.phase === 1.5,
      referenceClockIndependent: referenceBefore === 'clk' && controller.model.document.timeline.referenceClock === 'clk',
      invalidTargetRejected: invalid === false,
      saveOpenPreservesBoth: opened && roundTrip.find(signal => signal.id === 'pclk_custom')?.generator.phase === 1.5 && roundTrip.find(signal => signal.id === 'hclk_custom')?.generator.phase === 2,
      undoRestoresOnlyEdit: undo && phaseAfterUndo === phaseBeforeUndo && hclkAfterUndo === 2,
      redoRestoresOnlyEdit: redo && phaseAfterRedo === changedPhase
    },
    ids: roundTrip.map(signal => signal.id),
    roundTripClocks: roundTrip.map(signal => ({ id: signal.id, generator: signal.generator })),
    pclk: afterPclk.generator,
    hclk: afterHclk.generator,
    errors: controller.model.validation
  };
});
await page.screenshot({ path: path.join(out, 'issue50-1672x941.png') });
await browser.close();
const failures = Object.entries(result.checks).filter(([, value]) => !value).map(([key]) => key);
const acceptance = { issue: 50, checks: result.checks, failures, roundTripClocks: result.roundTripClocks, errors, pass: failures.length === 0 && errors.length === 0, artifacts: ['issue50-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log(`Issue #50 acceptance passed: ${Object.keys(result.checks).length} browser checks.`);
