import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'artifacts', 'issue30');
await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const model = c.model;
  const signal = id => model.document.signals.find(item => item.id === id);
  const sourceBefore = structuredClone(signal('req_valid').source);
  const roleBefore = signal('req_valid').role;
  const geometryBefore = document.querySelector('#cycleCanvas .trace path')?.getAttribute('d') || '';
  const checks = {};
  checks.canonical = model.document.signals.filter(item => item.type !== 'commentRow').every(item => Array.isArray(item.source?.instancePath) && typeof item.source?.signalName === 'string');
  checks.flatBackwardCompatible = c.hierarchy.parseFullPath('req_valid').valid && c.hierarchy.parseFullPath('req_valid').instancePath.length === 0;
  checks.displayNameIndependent = c.actions.setDisplayName('req_valid', 'Request Valid') && signal('req_valid').source.signalName === sourceBefore.signalName && signal('req_valid').display.name === 'Request Valid';
  c.actions.setDisplayName('req_valid', 'req_valid');
  const groupMove = c.actions.moveSignal('req_valid', 'group_internal');
  checks.groupMovePreservesHierarchy = groupMove && JSON.stringify(signal('req_valid').source) === JSON.stringify(sourceBefore) && signal('req_valid').role === roleBefore;
  c.actions.moveSignal('req_valid', 'group_input');
  const modes = {};
  for (const mode of ['signalOnly', 'relative', 'full', 'splitColumns']) { c.actions.setPathDisplayMode(mode); modes[mode] = c.hierarchy.getDisplayLabel(signal('req_valid'), mode); }
  checks.displayModes = modes.signalOnly === 'req_valid' && modes.relative === 'req_valid' && modes.full === 'req_valid' && modes.splitColumns === 'req_valid';
  signal('req_valid').source = { instancePath: ['top', 'u_soc', 'u_dma', 'u_axi'], signalName: 'req_valid' };
  c.actions.setScope(['top', 'u_soc', 'u_dma']);
  c.actions.setPathDisplayMode('relative');
  checks.relativeScope = c.hierarchy.getRelativePath(signal('req_valid')) === 'u_axi.req_valid';
  const beforeScopeDocument = JSON.stringify(c.getSerializableDocument());
  c.actions.setScope(['top']);
  checks.scopeDoesNotChangeCanonical = JSON.stringify(c.getSerializableDocument()) === beforeScopeDocument;
  c.actions.setLeftPanelMode('hierarchy');
  checks.hierarchyView = document.querySelector('#groups .hierarchy-root') !== null && document.querySelector('#groups .row[data-signal="req_valid"]') !== null;
  c.actions.setLeftPanelMode('group');
  checks.groupViewRestored = document.querySelector('#groups .group-h') !== null;
  const beforeCount = model.document.signals.length;
  const preview = c.hierarchy.previewBatch('top.u_soc.u_dma.u_axi.araddr[31:0]\ntop.u_soc.u_dma.u_axi.arvalid\ninvalid path\ntop.u_soc.u_dma.u_axi.araddr[31:0]');
  checks.batchPreview = preview.filter(item => item.status === 'valid').length === 2 && preview.some(item => item.status === 'invalid') && preview.some(item => item.status === 'duplicate');
  const added = c.actions.addSignalsFromPaths('top.u_soc.u_dma.u_axi.araddr[31:0]\ntop.u_soc.u_dma.u_axi.arvalid');
  checks.batchAdd = added.added.length === 2 && model.document.signals.length === beforeCount + 2;
  const afterAdd = JSON.stringify(c.getSerializableDocument());
  checks.batchUndoOneOperation = c.actions.undo() && model.document.signals.length === beforeCount;
  checks.batchRedoOneOperation = c.actions.redo() && JSON.stringify(c.getSerializableDocument()) === afterAdd;
  const saved = JSON.stringify(c.getSerializableDocument());
  checks.saveOpenHierarchy = await c.actions.openText(saved, { fileName: 'issue30.tcd', unsavedDecision: 'discard' }) && signal('req_valid').source.instancePath.join('.') === 'top.u_soc.u_dma.u_axi';
  c.actions.setPathDisplayMode('signalOnly');
  checks.waveGeometryUnchanged = document.querySelector('#cycleCanvas .trace path')?.getAttribute('d') === geometryBefore;
  checks.fullPathCommands = document.querySelector('#addMenu [data-hierarchy-command="full-path"]')?.textContent === 'フルパス確認' && document.querySelector('#addMenu [data-hierarchy-command="bulk-add"]')?.textContent === '信号一括登録';
  return { checks, modes, savedDocument: c.getSerializableDocument() };
});

await page.screenshot({ path: path.join(artifactDir, 'production-1672x941.png'), fullPage: false });
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(artifactDir, 'production-1280x720.png'), fullPage: false });
await browser.close();

const failures = Object.entries(result.checks).filter(([, pass]) => !pass).map(([name]) => name);
const acceptance = { viewport: { width: 1672, height: 941 }, checks: result.checks, errors, pass: failures.length === 0 && errors.length === 0, artifacts: ['production-1672x941.png', 'production-1280x720.png'] };
await fs.writeFile(path.join(artifactDir, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log(`Issue #30 acceptance passed: ${Object.keys(result.checks).length} checks, 1672x941 and 1280x720 screenshots.`);
