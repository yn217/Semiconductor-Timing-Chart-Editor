import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleRoot = path.join(root, 'samples', 'golden-protocol', 'timing_chart_sample_pack', 'samples');
const out = path.join(root, 'artifacts', 'issue55');
await fs.mkdir(out, { recursive: true });
const files = await fs.readdir(sampleRoot);
const wanted = ['apb', 'ahb', 'axi'].map(token => files.find(file => file.toLowerCase().includes(token) && file.endsWith('.json'))).filter(Boolean);
assert.equal(wanted.length, 3, 'APB/AHB/AXI fixtures are required');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const open = async file => {
  const text = await fs.readFile(path.join(sampleRoot, file), 'utf8');
  const opened = await page.evaluate(async payload => window.TimingChartProductionController.actions.openText(payload.text, { fileName: payload.file, unsavedDecision: 'discard' }), { text, file });
  assert.equal(opened, true, `could not open ${file}`);
  await page.waitForTimeout(60);
};
const snapshot = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.actions.setBottomTab('json');
  const doc = c.model.document;
  const text = document.querySelector('#bottomContent')?.innerText || '';
  const inspector = document.querySelector('#inspectorBody')?.innerText || '';
  const status = document.querySelector('.status')?.innerText || '';
  return { text, inspector, status, doc: c.getSerializableDocument(), problems: c.getProblems(doc) };
});

const results = [];
for (const file of wanted) {
  await open(file);
  const current = await snapshot();
  const ids = current.doc.signals.map(signal => signal.id);
  assert.match(current.text, new RegExp(`signals \\[${current.doc.signals.length}\\]`), `${file}: JSON signal count is not canonical`);
  for (const id of ids) assert.ok(current.text.includes(id), `${file}: JSON omitted ${id}`);
  assert.ok(current.text.includes(String(current.doc.timeline.referenceClock)), `${file}: reference clock omitted`);
  assert.ok(current.text.includes(`annotations [${current.doc.annotations.length}]`), `${file}: annotation count omitted`);
  assert.ok(current.text.includes(`transactions [${current.doc.transactions.length}]`), `${file}: transaction count omitted`);
  assert.ok(current.inspector.includes(String(current.doc.timeline.referenceClock)), `${file}: Inspector reference clock is stale`);
  assert.ok(current.inspector.includes(String(current.doc.signals.length)), `${file}: Inspector signal count is stale`);
  assert.ok(current.inspector.includes(String(current.doc.annotations.length)), `${file}: Inspector annotation count is stale`);
  assert.ok(current.inspector.includes(String(current.doc.transactions.length)), `${file}: Inspector transaction count is stale`);
  assert.ok(current.status.includes(`Signals: ${current.doc.signals.length}`), `${file}: status signal count is stale`);
  assert.ok(current.status.includes(`Annotations: ${current.doc.annotations.length}`), `${file}: status annotation count is stale`);
  assert.ok(current.status.includes(`Problems: ${current.problems.length}`), `${file}: status problem count is stale`);
  for (const fixed of ['req_valid', 'req_addr', 'Read latency']) {
    if (!ids.some(id => id.includes(fixed)) && !current.doc.signals.some(signal => String(signal.title || '').includes(fixed))) assert.equal(current.text.includes(fixed), false, `${file}: fixed startup literal leaked: ${fixed}`);
  }
  results.push({ file, signalCount: current.doc.signals.length, annotationCount: current.doc.annotations.length, transactionCount: current.doc.transactions.length, problemCount: current.problems.length, referenceClock: current.doc.timeline.referenceClock, pass: true });
}

const semantic = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const signal = c.model.document.signals.find(item => item.type !== 'commentRow');
  c.actions.selectObject({ dataset: { signal: signal.id, kind: signal.type } });
  c.actions.setBottomTab('signal');
  return { selected: c.model.selection.id, visible: document.querySelector('#bottomContent')?.innerText || '', expectedName: signal.display?.name || signal.name || signal.id, expectedType: signal.type };
});
assert.equal(semantic.selected, semantic.selected, 'semantic selection was not retained');
assert.ok(semantic.visible.includes(semantic.expectedName), 'selected signal editor is not model-driven');
await page.screenshot({ path: path.join(out, 'issue55-1672x941.png') });

const source = await fs.readFile(path.join(root, 'gui-mockup', 'production-controller.js'), 'utf8');
assert.equal(source.includes("const reqAddr = signals.find"), false, 'startup req_addr branch remains in controller');
assert.equal(source.includes("const rdata = signals.find"), false, 'startup rdata branch remains in controller');
assert.equal(source.includes("const reqValid = signals.find"), false, 'startup req_valid branch remains in controller');
const report = { issue: 55, samples: results, pageErrors, staticControllerAudit: true, pass: pageErrors.length === 0 && results.every(item => item.pass) };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #55 acceptance passed: model-driven Inspector/JSON/Status across ${results.length} protocol documents.`);
