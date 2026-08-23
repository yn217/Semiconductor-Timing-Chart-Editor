import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue119');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  if (!c?.model) return { error: 'Controller not initialized' };
  const model = c.model;

  // Make every default annotation visible so the table renders full endpoint text (visibility itself doesn't affect row rendering, but keep behavior explicit)
  model.view.tab = 'annotation';
  c.render?.();
  await wait(100);

  const table = document.querySelector('#bottomContent table');
  if (!table) return { error: 'No annotation table found' };

  const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const hasStartColumn = headers.includes('Start');
  const hasEndColumn = headers.includes('End');
  const hasStackedRangeColumn = headers.includes('Range');

  const rows = [...table.querySelectorAll('tbody tr')];
  const rowData = rows.map(row => {
    const cells = [...row.querySelectorAll('td')];
    // columns: Visible | # | Type | Label | Start | End | Color | Memo
    const typeText = cells[2]?.textContent.trim() || '';
    const startCell = cells[4];
    const endCell = cells[5];
    const startHasInput = !!startCell?.querySelector('input,select,textarea');
    const endHasInput = !!endCell?.querySelector('input,select,textarea');
    return {
      id: row.dataset.annotationId,
      type: typeText,
      start: startCell?.textContent.trim() || '',
      end: endCell?.textContent.trim() || '',
      startHasInput,
      endHasInput
    };
  });

  const markerRow = rowData.find(r => r.id === 'ann_default_marker');
  const dependencyRow = rowData.find(r => r.id === 'ann_default_dependency');
  const rangeRow = rowData.find(r => r.id === 'ann_default_range');
  const highlightRow = rowData.find(r => r.id === 'ann_default_highlight');

  return {
    tableExists: !!table,
    headers,
    hasStartColumn,
    hasEndColumn,
    hasStackedRangeColumn,
    rowData,
    markerRow,
    dependencyRow,
    rangeRow,
    highlightRow,
    allCellsReadOnly: rowData.every(r => !r.startHasInput && !r.endHasInput),
    markerEndIsDash: markerRow?.end === '—',
    dependencyStartNotEmpty: !!dependencyRow?.start && dependencyRow.start !== '—',
    dependencyEndNotEmpty: !!dependencyRow?.end && dependencyRow.end !== '—',
    rangeStartEndBothPresent: !!rangeRow?.start && rangeRow.start !== '—' && !!rangeRow?.end && rangeRow.end !== '—',
    highlightStartEndBothPresent: !!highlightRow?.start && highlightRow.start !== '—' && !!highlightRow?.end && highlightRow.end !== '—'
  };
});

// Row selection still works: click a non-input part of a row and verify selection updates
let selectionWorks = false;
const firstId = result.rowData?.[0]?.id;
if (firstId) {
  await page.click(`tr[data-annotation-id="${firstId}"] td:nth-child(2)`);
  await page.waitForTimeout(100);
  selectionWorks = await page.evaluate((id) => {
    const c = window.TimingChartProductionController;
    return c?.model?.selection?.kind === 'annotation' && c.model.selection.id === id;
  }, firstId);
}

// No semantic document mutation occurs merely by rendering the table
const docUnchangedAfterRender = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  const before = JSON.stringify(c.getSerializableDocument());
  c.render?.();
  const after = JSON.stringify(c.getSerializableDocument());
  return before === after;
});

await page.screenshot({ path: path.join(out, 'issue119-1672x941.png') });
await browser.close();

const pass = result.tableExists === true
  && result.hasStartColumn === true
  && result.hasEndColumn === true
  && result.hasStackedRangeColumn !== true
  && result.allCellsReadOnly === true
  && result.markerEndIsDash === true
  && result.dependencyStartNotEmpty === true
  && result.dependencyEndNotEmpty === true
  && result.rangeStartEndBothPresent === true
  && result.highlightStartEndBothPresent === true
  && selectionWorks === true
  && docUnchangedAfterRender === true
  && errors.length === 0;

const report = {
  issue: 119,
  result,
  selectionWorks,
  docUnchangedAfterRender,
  errors,
  pass,
  artifacts: ['issue119-1672x941.png']
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #119 acceptance passed: Annotation Bottom table has separate read-only Start/End summary columns (Visible | # | Type | Label | Start | End | Color | Memo). Marker shows — for End, Dependency shows From/To endpoints, Range/Highlight show both Start and End. Row selection and no-mutation-on-render verified.');
