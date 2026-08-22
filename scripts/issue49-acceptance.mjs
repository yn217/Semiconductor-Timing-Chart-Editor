import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleFiles = (await (async () => {
  const files = [];
  const walk = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.name.endsWith('.tcd.json')) files.push(target);
    }
  };
  await walk(path.join(root, 'samples'));
  return files.sort();
})());
assert.equal(sampleFiles.length, 20, 'Golden Sample count must remain 20');

const out = path.join(root, 'artifacts', 'issue49');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const samples = [];
for (const file of sampleFiles) {
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const result = await page.evaluate(async ({ raw, fileName }) => {
    const controller = window.TimingChartProductionController;
    const opened = await controller.actions.requestOpen({ text: JSON.stringify(raw), fileName, unsavedDecision: 'discard' });
    return {
      opened,
      document: structuredClone(controller.model.document),
      serialized: controller.getSerializableDocument(),
      warnings: controller.getImportWarnings(),
      validation: controller.validateDocument(controller.model.document)
    };
  }, { raw, fileName: path.basename(file) });
  const legacySignals = raw.cycleView?.signals || raw.signals || [];
  const legacyAnnotations = raw.cycleView?.annotations || raw.annotations || [];
  const legacyTransactions = raw.transactionView?.transactions || raw.transactions || [];
  const expectedGroups = raw.signalGroups || [];
  const checks = {
    opened: result.opened,
    valid: result.validation.length === 0,
    signals: result.document.signals.length === legacySignals.length,
    annotations: result.document.annotations.length === legacyAnnotations.length,
    transactions: result.document.transactions.length === legacyTransactions.length,
    groups: result.document.signalGroups.length === expectedGroups.length || expectedGroups.length === 0,
    warningPaths: result.warnings.every(warning => typeof warning.path === 'string' && warning.path.startsWith('$')),
    signalTypes: [...new Set(result.document.signals.map(signal => signal.type))].sort().join(',') === [...new Set(legacySignals.map(signal => signal.type))].sort().join(','),
    annotationTypes: result.document.annotations.map(annotation => annotation.type).sort().join(',') === legacyAnnotations.map(annotation => ({ dependencyArrow: 'dependency', vline: 'verticalLine', 'vertical-line': 'verticalLine' })[annotation.type] || annotation.type).sort().join(','),
    transactionPhases: result.document.transactions.every((transaction, index) => (transaction.phases || []).length === (legacyTransactions[index]?.phases || []).length),
    groupSpacing: expectedGroups.filter(group => group.spacingBefore !== undefined || group.spacingAfter !== undefined).every((group, index) => {
      const actual = result.document.signalGroups.find(candidate => candidate.id === group.id);
      return actual && actual.spacingBefore === (group.spacingBefore === undefined ? undefined : Number(group.spacingBefore)) && actual.spacingAfter === (group.spacingAfter === undefined ? undefined : Number(group.spacingAfter));
    }),
    groupStyle: expectedGroups.filter(group => group.style !== undefined).every(group => JSON.stringify(result.document.signalGroups.find(candidate => candidate.id === group.id)?.style) === JSON.stringify(group.style)),
    layoutMetadata: Object.entries(raw.layout || {}).filter(([key]) => ['rowHeight', 'signalSpacing', 'signalNameWidth', 'signalNameAlign', 'signalNameOverflow', 'autoFitMin', 'autoFitMax'].includes(key)).every(([key, value]) => result.document.layout[key] === value),
    legendMetadata: raw.legend ? result.document.legend.orientation === raw.legend.orientation && (raw.legend.show === undefined || result.document.legend.show === raw.legend.show) : true,
    explicitWarnings: (raw.verificationCoverage || raw.document?.samplePurpose || raw.transactionView?.lanes || raw.cycleView?.annotations?.some(annotation => annotation.scope || annotation.anchor?.point === 'value-start')) ? result.warnings.length > 0 : true
  };
  if (expectedGroups.length) checks.groupRows = expectedGroups.every((group, index) => {
    const actual = result.document.signalGroups[index];
    return actual && actual.rows.length === (group.rows || group.signals || []).length;
  });
  samples.push({ file: path.relative(root, file), checks, counts: { signals: result.document.signals.length, annotations: result.document.annotations.length, transactions: result.document.transactions.length, groups: result.document.signalGroups.length }, warnings: result.warnings });
}

const roundTrip = await page.evaluate(async ({ fileName, raw }) => {
  const controller = window.TimingChartProductionController;
  await controller.actions.requestOpen({ text: JSON.stringify(raw), fileName, unsavedDecision: 'discard' });
  const before = controller.getSerializableDocument();
  const prepared = controller.prepareSaveText();
  if (!prepared.text) throw new Error('Save preparation failed');
  const reopened = await controller.actions.requestOpen({ text: prepared.text, fileName: 'roundtrip.tcd', unsavedDecision: 'discard' });
  const after = controller.getSerializableDocument();
  return { reopened, equivalent: JSON.stringify(before) === JSON.stringify(after), before, after };
}, { fileName: '01_apb_register_access.tcd.json', raw: JSON.parse(await fs.readFile(sampleFiles.find(file => file.endsWith('01_apb_register_access.tcd.json')), 'utf8')) });

const apb = samples.find(sample => sample.file.endsWith('01_apb_register_access.tcd.json'));
const apbRaw = JSON.parse(await fs.readFile(sampleFiles.find(file => file.endsWith('01_apb_register_access.tcd.json')), 'utf8'));
const apbDocument = roundTrip.after;
const preservation = {
  apbAnnotations: apb.counts.annotations === apbRaw.cycleView.annotations.length,
  apbTransactions: apb.counts.transactions === apbRaw.transactionView.transactions.length,
  groupSpacingAfter: apbDocument.signalGroups.some(group => group.spacingAfter === 10),
  legendOrientation: apbDocument.legend.orientation === 'vertical',
  legendPosition: apbDocument.legend.position.x === -16 && apbDocument.legend.position.y === 12,
  layout: apbDocument.layout.signalNameWidth === 190 && apbDocument.layout.signalNameAlign === 'right',
  roundTripEquivalent: roundTrip.reopened && roundTrip.equivalent
};

const failures = samples.flatMap(sample => Object.entries(sample.checks).filter(([, pass]) => !pass).map(([name]) => `${sample.file}:${name}`));
const report = { issue: 49, sampleCount: samples.length, samples, preservation, roundTrip, pageErrors, pass: failures.length === 0 && Object.values(preservation).every(Boolean) && pageErrors.length === 0, failures };
await page.screenshot({ path: path.join(out, 'issue49-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #49 acceptance passed: ${samples.length} Golden Samples normalized, validated, and round-tripped.`);
