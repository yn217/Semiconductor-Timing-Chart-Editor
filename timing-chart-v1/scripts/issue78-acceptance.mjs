import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue78');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function runViewport(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
  await page.waitForTimeout(300);
  const result = await page.evaluate(async () => {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const c = window.TimingChartProductionController;
    const viewTab = [...document.querySelectorAll('.rtab')].find(node => node.textContent.trim() === '表示');
    viewTab.click(); await pause(20);
    const command = id => document.querySelector(`#ribbonView [data-view-command="${id}"]`);
    const click = async id => { command(id).click(); await pause(25); };
    const box = selector => { const node = document.querySelector(selector); const rect = node?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height } : null; };
    const snapshot = () => ({ left: box('.left-panel'), center: box('.center'), canvas: box('#cycleCanvas'), inspector: box('.inspector'), bottom: box('.bottom'), panels: structuredClone(c.model.view.panels), bottomHeight: c.model.view.bottomHeight, tab: c.model.view.tab, follow: c.model.view.followSelection, pinned: c.model.view.pinned, grid: getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns, centerRows: getComputedStyle(document.querySelector('.center')).gridTemplateRows });
    const semanticBefore = JSON.stringify(c.getSerializableDocument());
    const historyBefore = c.model.history.undo.length;
    const initial = snapshot();
    await click('left-panel'); const leftOff = snapshot();
    await click('left-panel'); const leftRestored = snapshot();
    await click('inspector'); const inspectorOff = snapshot();
    await click('inspector'); const inspectorRestored = snapshot();
    const bottomBefore = snapshot();
    await click('bottom-panel'); const bottomOff = snapshot();
    await click('bottom-panel'); const bottomRestored = snapshot();
    c.actions.setBottomTab('annotation'); c.actions.setPinned(true); const geometryBefore = c.model.waveGeometry; const contextBefore = { tab: c.model.view.tab, follow: c.model.view.followSelection, pinned: c.model.view.pinned };
    await click('bottom-panel'); await click('bottom-panel');
    const contextAfter = { tab: c.model.view.tab, follow: c.model.view.followSelection, pinned: c.model.view.pinned };
    await click('waveform-only'); const waveformOnly = snapshot();
    await click('waveform-only'); const waveformRestored = snapshot();
    const semanticAfter = JSON.stringify(c.getSerializableDocument());
    const checks = {
      leftReclaimsWidth: leftOff.canvas.width > initial.canvas.width,
      leftRestoresWidth: Math.abs(leftRestored.canvas.width - initial.canvas.width) <= 1,
      inspectorReclaimsWidth: inspectorOff.canvas.width > initial.canvas.width,
      inspectorRestoresWidth: Math.abs(inspectorRestored.canvas.width - initial.canvas.width) <= 1,
      bottomReclaimsHeight: bottomOff.canvas.height > bottomBefore.canvas.height && bottomOff.bottom.height === 0,
      bottomRestoresHeight: Math.abs(bottomRestored.canvas.height - bottomBefore.canvas.height) <= 1 && bottomRestored.bottom.height > 0,
      contextPreserved: JSON.stringify(contextBefore) === JSON.stringify(contextAfter),
      waveformExpands: waveformOnly.canvas.width > initial.canvas.width && waveformOnly.canvas.height > initial.canvas.height && waveformOnly.left.width === 0 && waveformOnly.inspector.width === 0 && waveformOnly.bottom.height === 0,
      waveformRestoresCombination: waveformRestored.panels.left === true && waveformRestored.panels.inspector === true && waveformRestored.panels.bottom === true && waveformRestored.bottom.height > 0,
      semanticStateUnchanged: semanticBefore === semanticAfter && historyBefore === c.model.history.undo.length,
      geometryReused: geometryBefore === c.model.waveGeometry,
      explicitWorkspaceLayout: document.querySelector('.workspace')?.dataset.panelLayout === 'explicit' && document.querySelector('.center')?.dataset.panelLayout,
      noAutoPlacement: !getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns.includes('330px 650px 300px') || leftOff.grid !== initial.grid
    };
    return { checks, geometry: { initial, leftOff, leftRestored, inspectorOff, inspectorRestored, bottomBefore, bottomOff, bottomRestored, waveformOnly, waveformRestored }, contextBefore, contextAfter };
  });
  await page.screenshot({ path: path.join(out, `issue78-${viewport.width}x${viewport.height}.png`) });
  await page.close();
  return result;
}

const results = { '1672x941': await runViewport({ width: 1672, height: 941 }), '1280x720': await runViewport({ width: 1280, height: 720 }) };
await browser.close();
const checks = Object.fromEntries(Object.entries(results['1672x941'].checks).map(([key, value]) => [key, value && results['1280x720'].checks[key]]));
const report = { issue: 78, checks, viewports: results, errors, pass: Object.values(checks).every(Boolean) && errors.length === 0, artifacts: ['issue78-1672x941.png', 'issue78-1280x720.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #78 acceptance passed: ${Object.keys(checks).length} geometry/state checks across 2 viewports.`);
