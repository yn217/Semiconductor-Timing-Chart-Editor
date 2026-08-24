import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue32');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const labelsOf = host => [...host.querySelectorAll('.tool .tool-label')].map(node => node.textContent.replace(/\s/g, ''));
  const home = document.querySelector('#ribbonHome');
  const insert = document.querySelector('#ribbonInsert') || document.querySelector('.ribbon .rgroup.insert-only')?.closest('[id]');
  const homeLabels = home ? labelsOf(home) : [];
  return { homeLabels, homeHasCycleInsert: homeLabels.includes('Cycle挿入'), homeHasNCycleInsert: homeLabels.includes('NCycle挿入'), homeHasCycleDelete: homeLabels.includes('Cycle削除'), homeHasRangeDelete: homeLabels.includes('範囲削除') };
});

assert.equal(result.homeHasCycleInsert, false, 'Home Ribbon must not contain Cycle挿入 (moved to Insert Ribbon per #32)');
assert.equal(result.homeHasNCycleInsert, false, 'Home Ribbon must not contain N Cycle挿入 (moved to Insert Ribbon per #32)');
assert.equal(result.homeHasCycleDelete, true, 'Cycle削除 is not part of the #32 Home removal list and should remain');
assert.equal(result.homeHasRangeDelete, true, '範囲削除 is not part of the #32 Home removal list and should remain');

// Switch to Insert Ribbon and confirm the approved composition/labels are present and functional.
await page.locator('.rtab', { hasText: '挿入' }).click();
await page.waitForTimeout(60);
const insertState = await page.evaluate(() => {
  const insert = [...document.querySelectorAll('.ribbon .rgroup')].filter(node => node.offsetParent !== null);
  const labels = insert.flatMap(node => [...node.querySelectorAll('.tool .tool-label')].map(n => n.textContent.replace(/\s/g, '')));
  return { labels, hasCycleAdd: labels.includes('Cycle追加'), hasNCycleAdd: labels.includes('NCycle追加'), hasFullPath: labels.includes('フルパス確認'), hasBulkAdd: labels.includes('信号一括登録') };
});
assert.equal(insertState.hasCycleAdd, true, 'Insert Ribbon must expose Cycle追加');
assert.equal(insertState.hasNCycleAdd, true, 'Insert Ribbon must expose N Cycle追加');
assert.equal(insertState.hasFullPath, true, 'Insert Ribbon must expose フルパス確認');
assert.equal(insertState.hasBulkAdd, true, 'Insert Ribbon must expose 信号一括登録');

// Cycle追加 in Insert must still perform the real canonical insert-cycle operation (reused path, not a duplicate implementation).
const insertFlow = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const before = c.model.document.timeline.cycleCount;
  const undoBefore = c.model.history.undo.length;
  document.querySelector('[data-insert-command="insert-cycle"], [data-tool-id="insert-cycle"]')?.click();
  return { before, undoBefore };
});
await page.waitForTimeout(60);
const afterInsert = await page.evaluate(() => ({ cycleCount: window.TimingChartProductionController.model.document.timeline.cycleCount, undo: window.TimingChartProductionController.model.history.undo.length }));
assert.equal(afterInsert.cycleCount, insertFlow.before + 1, 'Cycle追加 in Insert Ribbon must add exactly one cycle via the canonical time-axis operation');
assert.equal(afterInsert.undo, insertFlow.undoBefore + 1, 'Cycle追加 must produce exactly one Undo entry');
await page.evaluate(() => window.TimingChartProductionController.actions.undo());

await page.screenshot({ path: path.join(out, 'issue32-1672x941.png') });
await browser.close();

const pass = !result.homeHasCycleInsert && !result.homeHasNCycleInsert && result.homeHasCycleDelete && result.homeHasRangeDelete
  && insertState.hasCycleAdd && insertState.hasNCycleAdd && insertState.hasFullPath && insertState.hasBulkAdd
  && errors.length === 0;
const report = { issue: 32, result, insertState, errors, pass };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #32 acceptance passed: Home Ribbon no longer exposes Cycle挿入/N Cycle挿入 (moved to Insert per the approved composition, while Cycle削除/範囲削除 remain since they were not in the removal list); the Insert Ribbon exposes the approved Cycle追加/N Cycle追加/フルパス確認/信号一括登録 labels, and Cycle追加 reuses the canonical time-axis insert-cycle operation with exactly one Undo entry.');
