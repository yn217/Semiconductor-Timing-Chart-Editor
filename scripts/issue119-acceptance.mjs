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

  // Wait for controller and model to initialize
  let attempts = 0;
  while (!c?.model && attempts < 50) {
    await wait(50);
    attempts++;
  }

  if (!c?.model) return { error: 'Controller not initialized' };

  const model = c.model;

  // Switch to Annotation tab in bottom panel
  model.view.tab = 'annotation';
  c.render?.();
  await wait(100);

  // Check if annotation table exists and has correct structure
  const table = document.querySelector('#bottomContent table');
  if (!table) return { error: 'No annotation table found in #bottomContent' };

  // Get table headers
  const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());

  // Verify new "Range" column exists and old "Start"/"End" columns do not
  const hasRangeColumn = headers.includes('Range');
  const hasStartColumn = headers.includes('Start');
  const hasEndColumn = headers.includes('End');

  // Get sample annotation rows to verify Range display format
  const rows = [...table.querySelectorAll('tbody tr')];
  const sampleRows = rows.slice(0, Math.min(3, rows.length)).map(row => {
    const cells = [...row.querySelectorAll('td')];
    const typeCell = cells[2]?.textContent.trim() || '';
    const rangeCell = cells[3]?.textContent.trim() || '';
    return { type: typeCell, range: rangeCell };
  });

  // Verify range display is concise (just numbers and dashes, no verbose text)
  const rangesConcise = sampleRows.every(r => {
    // Should be like "5" or "5–10" or "—", not "clk ↑ (5)"
    return /^(\d+|—|\d+–\d+)$/.test(r.range) || r.range === '';
  });

  return {
    tableExists: !!table,
    headerCount: headers.length,
    headers,
    hasRangeColumn,
    hasStartColumn,
    hasEndColumn,
    sampleRows,
    rangesConcise,
    annotationCount: rows.length
  };
});

await page.screenshot({ path: path.join(out, 'issue119-1672x941.png') });
await browser.close();

const pass = result.tableExists === true
  && result.hasRangeColumn === true
  && result.hasStartColumn !== true
  && result.hasEndColumn !== true
  && result.rangesConcise === true
  && errors.length === 0;

const report = {
  issue: 119,
  result,
  errors,
  pass,
  artifacts: ['issue119-1672x941.png']
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #119 acceptance passed: Annotation Bottom table Start/End replaced with concise Range summary (cycle numbers, ranges like "5–10", or "—" for missing anchors). Table is more scannable and easier to read than verbose anchor text.');
