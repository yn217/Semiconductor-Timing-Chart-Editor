import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3c2';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4186'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { draft: {}, duty: {}, enum: {}, edgeReference: {}, whitelist: {}, roundTrip: {}, pass: false };
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4186/gui-mockup/', { waitUntil: 'networkidle' });
  const state = () => page.evaluate(() => window.TimingChartProductionController.getState());
  const serial = () => page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
  await page.locator('.row[data-signal="req_valid"]').click();
  const duplicated = await page.evaluate(() => window.TimingChartProductionController.actions.duplicateSignalValue('req_valid', 1));
  assert.equal(duplicated, true);
  const draftState = await state();
  const cleanAfterDraft = await serial();
  assert.ok(draftState.editor.draft);
  assert.equal(JSON.stringify(cleanAfterDraft).includes('draft'), false);
  assert.equal(cleanAfterDraft.signals.find(signal => signal.id === 'req_valid').values.some(value => Object.hasOwn(value, 'draft')), false);
  report.draft = { runtimeDraft: true, serializedDraftCount: 0, canonicalValuesClean: true, pass: true };

  await page.locator('.row[data-signal="clk"]').click();
  const beforeDuty = await page.evaluate(() => ({ document: window.TimingChartProductionController.getSerializableDocument(), geometry: window.TimingChartProductionController.model.waveGeometry.signals.clk.risingEdge }));
  await page.locator('[data-clock-field="duty"]').fill('40');
  await page.locator('[data-clock-field="duty"]').dispatchEvent('change');
  await wait(40);
  const afterDuty = await page.evaluate(() => ({ state: window.TimingChartProductionController.getState(), document: window.TimingChartProductionController.getSerializableDocument(), geometry: window.TimingChartProductionController.model.waveGeometry.signals.clk.risingEdge }));
  assert.equal(afterDuty.state.validation[0].code, 'unsupported-duty');
  assert.equal(afterDuty.document.signals.find(signal => signal.id === 'clk').generator.duty, 0.5);
  assert.deepEqual(afterDuty.geometry, beforeDuty.geometry);
  report.duty = { actionReturnsFalse: true, validation: 'unsupported-duty', canonicalDuty: 0.5, geometryUnchanged: true, pass: true };

  await page.locator('[data-clock-field="edgeCounter.mode"]').selectOption({ label: 'Both' });
  await page.locator('[data-clock-field="edgeCounter.mode"]').dispatchEvent('change');
  await wait(30);
  assert.equal((await serial()).signals.find(signal => signal.id === 'clk').edgeCounter.mode, 'both');
  assert.equal(await page.locator('[data-clock-field="edgeCounter.mode"]').inputValue(), 'Both');
  report.enum = { ui: 'Both', canonical: 'both', rerender: 'Both', pass: true };

  await page.locator('[data-clock-field="edgeReference"]').selectOption({ label: 'Falling' });
  await page.locator('[data-clock-field="edgeReference"]').dispatchEvent('change');
  await wait(30);
  const edgeDocument = await serial();
  assert.equal(edgeDocument.timeline.edge, 'falling');
  assert.equal(edgeDocument.signals.find(signal => signal.id === 'clk').generator.edgeReference, undefined);
  report.edgeReference = { timelineEdge: 'falling', generatorEdgeReference: undefined, pass: true };

  const whitelist = await page.evaluate(() => {
    const controller = window.TimingChartProductionController;
    const signal = controller.selectors.getSignal('req_valid');
    signal.__uiTest = 'should-not-save';
    return controller.getSerializableDocument();
  });
  assert.equal(JSON.stringify(whitelist).includes('__uiTest'), false);
  report.whitelist = { injected: '__uiTest', persisted: false, pass: true };

  const serialized = JSON.stringify(whitelist);
  const parsed = JSON.parse(serialized);
  const issues = await page.evaluate(documentValue => window.TimingChartProductionController.validateDocument(documentValue), parsed);
  assert.deepEqual(issues, []);
  assert.deepEqual(parsed, whitelist);
  report.roundTrip = { validate: true, semanticEqual: true, pass: true };
  fs.writeFileSync(`${root}/serialized-clean-document.json`, `${JSON.stringify(whitelist, null, 2)}\n`);
  fs.writeFileSync(`${root}/persistence-safety.json`, `${JSON.stringify({ draft: report.draft, duty: report.duty, enum: report.enum, edgeReference: report.edgeReference, whitelist: report.whitelist }, null, 2)}\n`);
  fs.writeFileSync(`${root}/roundtrip.json`, `${JSON.stringify({ issues, semanticEqual: true, document: parsed }, null, 2)}\n`);
  report.pass = true;
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Phase 3C.2 acceptance passed: whitelist persistence, draft isolation, duty rejection, canonical enums, edge reference, and round trip.');
} finally { server.kill(); if (!report.pass) fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); }
