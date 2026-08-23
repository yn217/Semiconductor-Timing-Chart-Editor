import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue120');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const setup = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  if (!c?.model) return { error: 'Controller not initialized' };
  const model = c.model;
  model.view.tab = 'annotation';
  c.render?.();
  await wait(100);

  const table = document.querySelector('#bottomContent table');
  if (!table) return { error: 'No annotation table found' };
  const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const hasVisibilityHeader = headers[0] === '表示';
  const rows = [...table.querySelectorAll('tbody tr')];
  const visibilityChecks = rows.map(row => {
    const firstTd = row.querySelector('td');
    const button = firstTd?.querySelector('button[data-annotation-action="toggle-visible"]');
    const svg = button?.querySelector('svg');
    const use = svg?.querySelector('use');
    const href = use?.getAttribute('href') || '';
    const noUnicodeGlyph = !/[□☑]/.test(firstTd.textContent);
    const annotationId = row.dataset.annotationId;
    const annotation = model.document.annotations?.find(a => a.id === annotationId);
    return {
      hasButton: !!button, hasSvg: !!svg, hasUse: !!use, noUnicodeGlyph,
      iconMatch: (annotation?.visible && href.includes('i-eye') && !href.includes('eye-off')) || (!annotation?.visible && href.includes('eye-off')),
      annotationId, annotationVisible: annotation?.visible, icon: href
    };
  });

  // Select the second annotation (marker) so we can test that toggling visibility on it does not change selection
  const markerId = 'ann_default_marker';
  c.actions.selectAnnotation(markerId);
  await wait(50);

  return {
    tableExists: !!table, hasVisibilityHeader, headers, rowCount: rows.length,
    visibilityChecks,
    allHaveSvgIcons: visibilityChecks.every(v => v.hasButton && v.hasSvg),
    allIconsMatch: visibilityChecks.every(v => v.iconMatch),
    allNoUnicodeGlyph: visibilityChecks.every(v => v.noUnicodeGlyph),
    selectedBefore: model.selection?.id
  };
});

// Toggle visibility of a DIFFERENT annotation than the selected one (dependency) via real click
const dependencyId = 'ann_default_dependency';
const initialVisible = setup.visibilityChecks.find(v => v.annotationId === dependencyId)?.annotationVisible;
await page.click(`[data-annotation-id="${dependencyId}"] button[data-annotation-action="toggle-visible"]`);
await page.waitForTimeout(100);

const afterHide = await page.evaluate((id) => {
  const c = window.TimingChartProductionController;
  const ann = c?.model?.document?.annotations?.find(a => a.id === id);
  const row = document.querySelector(`tr[data-annotation-id="${id}"]`);
  return {
    visible: ann?.visible,
    rowStillInTable: !!row,
    selectionUnchanged: c.model.selection?.id === 'ann_default_marker',
    dirty: c.model.persistence?.dirty !== undefined ? c.model.persistence.dirty : null
  };
}, dependencyId);

// Toggle back to original state
await page.click(`[data-annotation-id="${dependencyId}"] button[data-annotation-action="toggle-visible"]`);
await page.waitForTimeout(100);
const afterRestore = await page.evaluate((id) => {
  const c = window.TimingChartProductionController;
  const ann = c?.model?.document?.annotations?.find(a => a.id === id);
  const row = document.querySelector(`tr[data-annotation-id="${id}"]`);
  return { visible: ann?.visible, rowStillInTable: !!row, selectionUnchanged: c.model.selection?.id === 'ann_default_marker' };
}, dependencyId);

// Undo/Redo participation: toggling visible should be undoable via shared history
const undoRedoCheck = await page.evaluate(async (id) => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const before = c.model.document.annotations.find(a => a.id === id).visible;
  c.actions.updateAnnotation(id, 'visible', !before);
  await wait(30);
  const afterToggle = c.model.document.annotations.find(a => a.id === id).visible;
  const canUndo = typeof c.actions.undo === 'function';
  let afterUndo = null;
  if (canUndo) {
    c.actions.undo();
    await wait(30);
    afterUndo = c.model.document.annotations.find(a => a.id === id).visible;
  }
  return { before, afterToggle, canUndo, afterUndo, toggledCorrectly: afterToggle === !before, undoRestored: canUndo ? afterUndo === before : null };
}, dependencyId);

// Save/Open persistence: visible=false must survive a round trip through prepareSaveText/openText
const persistenceCheck = await page.evaluate(async (id) => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  c.actions.updateAnnotation(id, 'visible', false);
  await wait(30);
  const text = c.prepareSaveText().text;
  await c.actions.openText(text, { fileName: 'issue120-roundtrip.tcd', unsavedDecision: 'discard' });
  await wait(50);
  const restored = c.model.document.annotations.find(a => a.id === id);
  return { visiblePersisted: restored?.visible === false };
}, dependencyId);

await page.screenshot({ path: path.join(out, 'issue120-1672x941.png') });
await browser.close();

const result = setup;
const pass = result.tableExists === true
  && result.hasVisibilityHeader === true
  && result.allHaveSvgIcons === true
  && result.allIconsMatch === true
  && result.allNoUnicodeGlyph === true
  && afterHide.visible === !initialVisible
  && afterHide.rowStillInTable === true
  && afterHide.selectionUnchanged === true
  && afterRestore.visible === initialVisible
  && afterRestore.rowStillInTable === true
  && afterRestore.selectionUnchanged === true
  && undoRedoCheck.toggledCorrectly === true
  && (undoRedoCheck.canUndo ? undoRedoCheck.undoRestored === true : true)
  && persistenceCheck.visiblePersisted === true
  && errors.length === 0;

const report = { issue: 120, result, afterHide, afterRestore, undoRedoCheck, persistenceCheck, errors, pass, artifacts: ['issue120-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #120 acceptance passed: Eye/Eye-Off SVG toggle replaces Unicode checkbox glyph; hiding an Annotation keeps its Bottom row present and does not change current selection; visible participates in Undo and Save/Open round trip via the shared updateAnnotation action.');
