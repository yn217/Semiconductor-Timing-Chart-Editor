import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue54');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const base = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
const open = async documentValue => {
  const result = await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue54.tcd', unsavedDecision: 'discard' }), JSON.stringify(documentValue));
  assert.equal(result, true, 'test document could not be opened');
  await page.waitForTimeout(35);
};
const problems = () => page.evaluate(() => window.TimingChartProductionController.getProblems(window.TimingChartProductionController.getSerializableDocument()));
const makeBusDocument = (id, format, values, width = 8) => {
  const documentValue = JSON.parse(base);
  const clock = { id: `${id}_clock`, name: `${id}_clock`, type: 'clock', role: 'input', source: { instancePath: [], signalName: `${id}_clock` }, display: { name: `${id}_clock` }, generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: 0 } } };
  const bus = { id, name: id, type: 'bus', role: 'output', width, displayFormat: format, source: { instancePath: [], signalName: id }, display: { name: id }, values: values.map((value, start) => ({ start, value })) };
  documentValue.document.id = `${id}.tcd`;
  documentValue.document.title = id;
  documentValue.timeline = { start: 0, end: Math.max(4, values.length), timeBase: 'cycle', cycleCount: Math.max(4, values.length), referenceClock: clock.id, edge: 'rising' };
  documentValue.signalGroups = [{ id: `${id}_group`, name: 'Arbitrary signals', rows: [clock.id, id] }];
  documentValue.signals = [clock, bus];
  documentValue.annotations = [];
  documentValue.transactions = [];
  documentValue.constraints = [];
  return documentValue;
};

const report = { issue: 54, cases: {}, errors };
await open(JSON.parse(base));
let initialProblems = await problems();
assert.equal(initialProblems.some(issue => issue.code === 'bus-width-overflow'), false, '8-bit 9A was reported as overflow');
report.cases.startup9A = { overflow: false, fixtureIndependent: true, pass: true };

await open(makeBusDocument('payload_bus', 'hex', ['9A']));
let current = await problems();
assert.equal(current.some(issue => issue.code === 'bus-width-overflow'), false, 'arbitrary 8-bit 9A was reported as overflow');
report.cases.arbitraryHexValid = { overflow: false, pass: true };

await open(makeBusDocument('payload_bus', 'hex', ['00']));
await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.document.signals.find(signal => signal.id === 'payload_bus').values[0].value = '1FF'; c.render(); });
current = await problems();
const overflow = current.find(issue => issue.code === 'bus-width-overflow');
assert.ok(overflow, 'arbitrary 8-bit 1FF was not reported as overflow');
assert.equal(overflow.id, 'payload_bus');
assert.equal(overflow.severity, 'error');
assert.equal('auto' in overflow, false, 'auto-fix was advertised without an implementation');
report.cases.arbitraryHexOverflow = { code: overflow.code, id: overflow.id, severity: overflow.severity, noAutoFix: true, pass: true };

await open(makeBusDocument('binary_payload', 'binary', ['11111111', '00000000', 'X', 'Z']));
await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.document.signals.find(signal => signal.id === 'binary_payload').values[1].value = '100000000'; c.render(); });
current = await problems();
assert.equal(current.filter(issue => issue.code === 'bus-width-overflow').length, 1, 'binary/X/Z width policy is incorrect');
assert.equal(current.find(issue => issue.code === 'bus-width-overflow').range, '1');
report.cases.binaryXZ = { valid8Bit: true, overflow9Bit: true, xzAccepted: true, pass: true };

await open(makeBusDocument('symbolic_payload', 'state', ['READY', 'WAIT', 'DONE']));
current = await problems();
assert.equal(current.some(issue => issue.code === 'bus-width-overflow'), false, 'symbolic bus values were interpreted as hexadecimal');
report.cases.symbolic = { noNumericOverflow: true, pass: true };

const malformed = makeBusDocument('malformed_payload', 'hex', ['00']);
await open(malformed);
await page.evaluate(() => { const c = window.TimingChartProductionController; c.model.document.timeline.referenceClock = 'missing_clock'; c.model.document.signals.find(signal => signal.id === 'malformed_payload').values.push({ start: 0, value: '01' }); c.render(); });
current = await problems();
assert.equal(current.some(issue => issue.code === 'invalid-reference-clock'), true, 'reference clock validation was lost');
assert.equal(current.some(issue => issue.code === 'invalid-start-order'), true, 'duplicate/start ordering validation was lost');
report.cases.genericSemanticValidation = { referenceClock: true, duplicateStart: true, pass: true };

const sampleRoot = path.join(root, 'samples', 'golden-protocol', 'timing_chart_sample_pack', 'samples');
const sampleFiles = (await fs.readdir(sampleRoot)).filter(file => file.endsWith('.json')).sort();
assert.ok(sampleFiles.length >= 10, 'Golden Sample fixtures are unavailable');
const sampleResults = [];
for (const file of sampleFiles) {
  const text = await fs.readFile(path.join(sampleRoot, file), 'utf8');
  const opened = await page.evaluate(async payload => window.TimingChartProductionController.actions.openText(payload.text, { fileName: payload.file, unsavedDecision: 'discard' }), { text, file });
  assert.equal(opened, true, `Golden Sample ${file} failed to open`);
  const issues = await problems();
  assert.ok(issues.every(issue => !/req_valid|rdata|Read latency/.test(`${issue.id || ''} ${issue.path || ''} ${issue.message || ''}`)), `fixture-specific problem leaked for ${file}`);
  sampleResults.push({ file, issueCount: issues.length });
}
report.cases.goldenSamples = { count: sampleResults.length, results: sampleResults, noFixtureAssumptions: true, pass: true };

const source = await fs.readFile(path.join(root, 'gui-mockup', 'production-controller.js'), 'utf8');
assert.equal(source.includes("const reqAddr = signals.find"), false, 'startup req_addr branch remains');
assert.equal(source.includes("const rdata = signals.find"), false, 'startup rdata branch remains');
assert.equal(source.includes("const reqValid = signals.find"), false, 'startup req_valid branch remains');
assert.equal(source.includes("signal.title === 'Read latency'"), false, 'startup comment-title branch remains');
report.cases.staticFixtureAudit = { noStartupBranches: true, pass: true };

report.errors = errors;
report.pass = errors.length === 0 && Object.values(report.cases).every(item => item.pass);
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await page.screenshot({ path: path.join(out, 'issue54-1672x941.png') });
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #54 acceptance passed: generic Problems validation, bus representations, arbitrary IDs, semantic checks, and ${sampleResults.length} Golden Samples.`);
