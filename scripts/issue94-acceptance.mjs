import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue94');
await fs.mkdir(out, { recursive: true });
const controlSource = await fs.readFile(path.join(root, 'gui-mockup', 'control-completeness.js'), 'utf8');
const tooltipSource = await fs.readFile(path.join(root, 'gui-mockup', 'tooltip-contract.js'), 'utf8');
assert.equal(/new MutationObserver/.test(controlSource), false, 'control completeness still uses a MutationObserver');
assert.equal(/\.observe\(document\.body/.test(controlSource), false, 'control completeness still observes document.body');
assert.equal(/new MutationObserver/.test(tooltipSource), false, 'tooltip contract still uses a MutationObserver');
assert.equal(/\.observe\(document\.body/.test(tooltipSource), false, 'tooltip contract still observes document.body');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);
const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const base = structuredClone(c.getSerializableDocument());
  const perf = structuredClone(base);
  perf.document.id = 'issue94-large.tcd';
  const group = perf.signalGroups.find(item => item.id === 'group_internal') || perf.signalGroups[0];
  const seed = perf.signals.find(item => item.id === 'req_valid');
  for (let index = 0; index < 60; index++) {
    const id = `perf_sig_${index}`;
    perf.signals.push({ ...structuredClone(seed), id, name: id, source: { instancePath: ['top', 'u_perf'], signalName: id }, display: { name: id }, values: [{ start: 0, value: index % 2 }] });
    group.rows.push(id);
  }
  const opened = await c.actions.openText(JSON.stringify(perf), { fileName: perf.document.id, unsavedDecision: 'discard' });
  await wait(80);
  const before = { controlAuditRuns: c.controlAudit.metrics.controlAuditRuns, tooltipMetadataPasses: c.tooltipContractMetrics.tooltipMetadataPasses, observedMutationBatches: c.controlAudit.metrics.observedMutationBatches, tooltipObservedMutationBatches: c.tooltipContractMetrics.observedMutationBatches, waveRenders: c.model.diagnostics?.waveDromRenders ?? null };
  const rows = [...document.querySelectorAll('#groups .row[data-signal]')].slice(0, 20);
  for (const row of rows) { row.click(); await wait(4); }
  for (const tab of [...document.querySelectorAll('#bottomTabs .btab')].slice(0, 4)) { if (!tab.hidden) { tab.click(); await wait(4); } }
  const viewTab = [...document.querySelectorAll('.rtab')].find(node => node.textContent.trim() === '表示'); viewTab?.click(); await wait(10);
  document.querySelector('#ribbonView [data-view-command="zoom-plus"]')?.click(); await wait(25);
  const canvas = document.querySelector('#cycleCanvas'); if (canvas) canvas.scrollLeft = 120; await wait(10);
  const after = { controlAuditRuns: c.controlAudit.metrics.controlAuditRuns, tooltipMetadataPasses: c.tooltipContractMetrics.tooltipMetadataPasses, observedMutationBatches: c.controlAudit.metrics.observedMutationBatches, tooltipObservedMutationBatches: c.tooltipContractMetrics.observedMutationBatches, scopedControlRegistrations: c.controlAudit.metrics.registrationCalls, scopedTooltipPasses: c.tooltipContractMetrics.scopedMetadataPasses, waveRenders: c.model.diagnostics?.waveDromRenders ?? null };
  const home = [...document.querySelectorAll('#ribbonHome .tool')].filter(node => !node.hidden);
  const auditBefore = c.controlAudit.metrics.controlAuditRuns; c.controlAudit.run(); const auditAfter = c.controlAudit.metrics.controlAuditRuns;
  return { opened, rows: rows.length, before, after, explicitAudit: auditAfter === auditBefore + 1, inventory: c.controlAudit.controls.length, tooltips: home.every(node => node.dataset.tooltipContract === 'true') };
});
const pass = result.opened && result.rows === 20 && result.before.controlAuditRuns === result.after.controlAuditRuns && result.before.tooltipMetadataPasses === result.after.tooltipMetadataPasses && result.after.observedMutationBatches === 0 && result.after.tooltipObservedMutationBatches === 0 && result.explicitAudit && result.inventory > 0 && result.tooltips && errors.length === 0;
const report = { issue: 94, result, errors, sourceGuards: { controlObserverRemoved: true, tooltipObserverRemoved: true }, pass, artifacts: ['issue94-1672x941.png'] };
await page.screenshot({ path: path.join(out, 'issue94-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #94 acceptance passed: observer-free audit/tooltip hot path with explicit diagnostics.');
