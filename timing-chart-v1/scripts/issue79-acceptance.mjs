import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue79');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const base = structuredClone(c.getSerializableDocument());
  base.document.id = 'issue79-hierarchy.tcd';
  base.signals.find(signal => signal.id === 'req_valid').source.instancePath = ['top', 'u_soc'];
  const bus = base.signals.find(signal => signal.id === 'rdata[15:0]');
  bus.source.instancePath = ['top', 'u_soc', 'u_dma'];
  const checks = {};
  checks.openHierarchy = await c.actions.openText(JSON.stringify(base), { fileName: base.document.id, unsavedDecision: 'discard' });
  const command = id => document.querySelector(`#ribbonView [data-view-command="${id}"]`);
  const toggle = async id => { command(id)?.click(); await pause(20); };
  const rowText = () => document.querySelector('#groups .row[data-signal="rdata[15:0]"] .row-name')?.textContent.trim() || '';
  const rowParts = () => { const row = document.querySelector('#groups .row[data-signal="rdata[15:0]"] .row-name'); return { row, instance: row?.querySelector('.instance-path-part'), name: row?.querySelector('.signal-name-part'), bus: row?.querySelector('.bus-width-part') }; };
  const viewTab = [...document.querySelectorAll('.rtab')].find(node => node.textContent.trim() === '表示');
  viewTab.click(); await pause(20);
  const modes = {};
  for (const [id, mode] of [['signal-only', 'signalOnly'], ['relative', 'relative'], ['full-path', 'full'], ['split-columns', 'splitColumns']]) {
    command(id)?.click(); await pause(25);
    const parts = rowParts();
    modes[mode] = { text: rowText(), instance: Boolean(parts.instance), name: Boolean(parts.name), bus: Boolean(parts.bus) };
  }
  checks.modeParts = modes.signalOnly.instance === false && modes.relative.instance === true && modes.full.instance === true && modes.splitColumns.instance === true && Object.values(modes).every(value => value.name && value.bus);
  command('split-columns')?.click(); await pause(20);
  await toggle('signal-name'); const signalOff = rowParts();
  checks.signalNameIndependent = signalOff.instance?.style.display !== 'none' && signalOff.bus?.style.display !== 'none' && signalOff.name?.style.display === 'none';
  await toggle('signal-name'); await toggle('bus-width'); const busOff = rowParts();
  checks.busWidthIndependent = busOff.instance?.style.display !== 'none' && busOff.name?.style.display !== 'none' && busOff.bus?.style.display === 'none' && busOff.bus?.getClientRects().length === 0;
  await toggle('bus-width'); await toggle('instance-path'); const pathOff = rowParts();
  checks.instancePathIndependent = pathOff.name?.style.display !== 'none' && pathOff.bus?.style.display !== 'none' && pathOff.instance?.style.display === 'none' && !rowText().includes('top.u_soc.u_dma');
  await toggle('instance-path');
  const canonicalBefore = JSON.stringify(c.getSerializableDocument()); const historyBefore = c.model.history.undo.length;
  await toggle('bus-width'); await toggle('bus-width');
  checks.viewOnly = canonicalBefore === JSON.stringify(c.getSerializableDocument()) && historyBefore === c.model.history.undo.length;
  return { checks, modes, final: { text: rowText(), parts: Object.fromEntries(Object.entries(rowParts()).filter(([key]) => key !== 'row').map(([key, node]) => [key, node ? { display: node.style.display, text: node.textContent } : null])) } };
});

const report = { issue: 79, ...result, errors, pass: Object.values(result.checks).every(Boolean) && errors.length === 0, artifacts: ['issue79-1672x941.png'] };
await page.screenshot({ path: path.join(out, 'issue79-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #79 acceptance passed: ${Object.keys(result.checks).length} browser checks.`);
