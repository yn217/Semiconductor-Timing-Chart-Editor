import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue51');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const checks = {};
const state = () => page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const m = c.model;
  return {
    document: c.getSerializableDocument(),
    selection: structuredClone(m.selection),
    view: structuredClone(m.view),
    timeSelection: structuredClone(m.timeSelection),
    editor: structuredClone(m.editor),
    crossHighlight: structuredClone(m.crossHighlight || []),
    waveGeometryIds: Object.keys(m.waveGeometry?.signals || {}),
    persistence: { fileName: m.persistence.fileName, dirty: m.persistence.dirty, lastError: m.persistence.lastError },
    renderedRows: [...document.querySelectorAll('[data-signal-id], [data-comment-id]')].map(node => node.dataset.signalId || node.dataset.commentId).filter(Boolean)
  };
});
const base = await page.evaluate(() => structuredClone(window.TimingChartProductionController.getSerializableDocument()));

const makeDocument = (id, extraSignalId, annotationId, transactionId) => {
  const value = structuredClone(base);
  value.document.id = id;
  value.document.title = id;
  value.signals = value.signals.filter(signal => signal.type !== 'commentRow');
  value.signalGroups = value.signalGroups.map(group => ({ ...group, rows: group.rows.filter(row => value.signals.some(signal => signal.id === row)) }));
  const extra = {
    id: extraSignalId,
    name: extraSignalId,
    type: 'binary',
    role: 'internal',
    source: { instancePath: [], signalName: extraSignalId },
    display: { name: extraSignalId },
    values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 5, value: 0 }]
  };
  value.signals.push(extra);
  value.signalGroups[1].rows.push(extraSignalId);
  value.annotations = [{
    id: annotationId,
    type: 'marker',
    label: id,
    color: '#1473e6',
    position: 'canvas',
    visible: true,
    anchor: { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } }
  }];
  value.transactions = [{
    id: transactionId,
    name: id,
    start: 1,
    end: 4,
    linkedSignals: ['req_valid'],
    phases: []
  }];
  return value;
};

const docA = makeDocument('issue51-a.tcd', 'a_only', 'ann_a', 'txn_a');
const docB = makeDocument('issue51-b.tcd', 'b_only', 'ann_b', 'txn_b');

checks.openA = await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue51-a.tcd', unsavedDecision: 'discard' }), JSON.stringify(docA));
await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.model.view.mode = 'split';
  c.model.view.tab = 'annotation';
  c.model.view.zoom = 1.35;
  c.model.view.columns.signalName = false;
  c.model.view.hiddenSignals = ['req_valid'];
  c.model.view.scope = [['top', 'u_a']];
  c.model.view.leftPanelMode = 'hierarchy';
  c.model.view.pinned = true;
  c.model.view.followSelection = false;
  c.model.selection = { kind: 'annotation', id: 'ann_a' };
  c.model.timeSelection = { cycle: 99, rangeStart: 8, rangeEnd: 10 };
  c.model.editor = { rowIndex: 2 };
  c.model.crossHighlight = ['req_valid', 'a_only'];
  c.model.waveGeometry = { signals: { stale_a: { cycleBoundary: [] } } };
  c.render();
});
const preReplace = await state();

checks.openB = await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue51-b.tcd', unsavedDecision: 'discard' }), JSON.stringify(docB));
const afterB = await state();
const bSignalIds = docB.signals.map(signal => signal.id);
checks.openClearsDocumentTransientState = afterB.document.document.id === 'issue51-b.tcd'
  && afterB.view.hiddenSignals.length === 0
  && afterB.view.scope.length === 0
  && afterB.view.leftPanelMode === 'group'
  && afterB.view.pinned === false
  && afterB.view.followSelection === true
  && afterB.crossHighlight.length === 0
  && afterB.timeSelection.cycle === 0
  && afterB.timeSelection.rangeStart === null
  && afterB.timeSelection.rangeEnd === null
  && afterB.waveGeometryIds.every(id => bSignalIds.includes(id))
  && !afterB.waveGeometryIds.includes('stale_a')
  && afterB.selection.id !== 'ann_a'
  && afterB.document.annotations.every(annotation => annotation.id !== 'ann_a')
  && afterB.renderedRows.includes('b_only')
  && !afterB.renderedRows.includes('a_only');
checks.viewPreferencesPreserved = afterB.view.mode === 'split'
  && afterB.view.tab === 'annotation'
  && afterB.view.zoom === 1.35
  && afterB.view.columns.signalName === false;

await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.model.view.hiddenSignals = ['b_only'];
  c.model.crossHighlight = ['b_only'];
  c.model.waveGeometry = { signals: { stale_b: {} } };
  c.model.timeSelection = { cycle: 7, rangeStart: 2, rangeEnd: 5 };
  c.model.selection = { kind: 'annotation', id: 'ann_b' };
  c.render();
});
const beforeNew = await state();
checks.newClearsDocumentTransientState = await page.evaluate(async () => window.TimingChartProductionController.actions.requestNew({ unsavedDecision: 'discard' }));
const afterNew = await state();
checks.newClearsDocumentTransientState = checks.newClearsDocumentTransientState
  && afterNew.document.document.id === 'untitled.tcd'
  && afterNew.view.hiddenSignals.length === 0
  && afterNew.crossHighlight.length === 0
  && afterNew.waveGeometryIds.every(id => afterNew.document.signals.some(signal => signal.id === id))
  && afterNew.timeSelection.cycle === 0
  && afterNew.selection.id !== 'ann_b';

checks.failedOpenLeavesStateUnchanged = await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'bad.tcd', unsavedDecision: 'discard' }), '{invalid') === false;
const afterFailed = await state();
checks.failedOpenLeavesStateUnchanged = checks.failedOpenLeavesStateUnchanged
  && JSON.stringify(afterFailed.document) === JSON.stringify(afterNew.document)
  && JSON.stringify(afterFailed.view) === JSON.stringify(afterNew.view)
  && JSON.stringify(afterFailed.selection) === JSON.stringify(afterNew.selection)
  && JSON.stringify(afterFailed.crossHighlight) === JSON.stringify(afterNew.crossHighlight)
  && JSON.stringify(afterFailed.timeSelection) === JSON.stringify(afterNew.timeSelection);

await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue51-undo.tcd', unsavedDecision: 'discard' }), JSON.stringify(docB));
const beforeUndo = await page.evaluate(() => structuredClone(window.TimingChartProductionController.getSerializableDocument()));
checks.undoRestoreUsesReplacementPath = await page.evaluate(() => window.TimingChartProductionController.actions.updateSignalValue('req_valid', 0, 'value', 1));
await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  c.model.view.hiddenSignals = ['b_only'];
  c.model.crossHighlight = ['b_only'];
  c.model.waveGeometry = { signals: { stale_undo: {} } };
  c.model.selection = { kind: 'annotation', id: 'ann_b' };
  c.render();
});
const undoResult = await page.evaluate(() => window.TimingChartProductionController.actions.undo());
const afterUndo = await state();
const redoResult = await page.evaluate(() => window.TimingChartProductionController.actions.redo());
const afterRedo = await state();
checks.undoRestoreUsesReplacementPath = checks.undoRestoreUsesReplacementPath && undoResult
  && JSON.stringify(afterUndo.document) === JSON.stringify(beforeUndo)
  && afterUndo.view.hiddenSignals.length === 0
  && afterUndo.crossHighlight.length === 0
  && !afterUndo.waveGeometryIds.includes('stale_undo')
  && afterUndo.selection.id !== 'ann_b';
checks.redoRestoreUsesReplacementPath = redoResult
  && afterRedo.document.signals.find(signal => signal.id === 'req_valid')?.values?.[0]?.value === 1
  && afterRedo.view.hiddenSignals.length === 0
  && afterRedo.crossHighlight.length === 0
  && !afterRedo.waveGeometryIds.includes('stale_undo');

const final = await state();
await page.screenshot({ path: path.join(out, 'issue51-1672x941.png') });
await browser.close();

const acceptance = {
  issue: 51,
  checks,
  preReplace: { documentId: preReplace.document.document.id, hiddenSignals: preReplace.view.hiddenSignals, selection: preReplace.selection, timeSelection: preReplace.timeSelection },
  final: { documentId: final.document.document.id, selection: final.selection, view: final.view, waveGeometryIds: final.waveGeometryIds },
  errors,
  pass: Object.values(checks).every(Boolean) && errors.length === 0,
  artifacts: ['issue51-1672x941.png']
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log(`Issue #51 acceptance passed: ${Object.keys(checks).length} lifecycle checks.`);
