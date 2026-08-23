import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue111');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const read = () => page.evaluate(() => structuredClone(window.TimingChartProductionController.getSerializableDocument()));
const open = value => page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue111.tcd', unsavedDecision: 'discard' }), JSON.stringify(value));
const base = await read();
assert.equal(base.formatVersion, 2, 'new documents must serialize as v2');
assert.deepEqual(base.bookmarks, []);
assert.deepEqual(base.timeGroups, []);
assert.deepEqual(base.timeline.labelAnchors, []);
assert.deepEqual(base.checkSettings, {});

const v1 = structuredClone(base);
v1.formatVersion = 1;
delete v1.bookmarks;
delete v1.timeGroups;
delete v1.checkSettings;
delete v1.timeline.labelAnchors;
assert.equal(await open(v1), true, 'v1 fixture did not migrate');
const migrated = await read();
assert.equal(migrated.formatVersion, 2);
assert.deepEqual(migrated.bookmarks, []);
assert.deepEqual(migrated.timeGroups, []);
assert.deepEqual(migrated.timeline.labelAnchors, []);
assert.equal(migrated.signals.find(signal => signal.id === 'req_valid').values[1].start, 3, 'v1 migration changed signal timing');

const enriched = structuredClone(migrated);
enriched.bookmarks = [
  { id: 'bm_a', name: 'First response', start: 7, comment: 'BVALID' },
  { id: 'bm_b', name: 'Same cycle', start: 7 }
];
enriched.timeGroups = [{ id: 'tg_wait', name: 'Wait', category: 'Wait', start: 2, end: 7, comment: 'Hold', presentation: { collapsed: true, foldStyle: 'axis-break', foldLabel: 'Wait', resumeLabelAnchorId: 'rla_wait' } }];
enriched.timeline.labelAnchors = [{ id: 'rla_wait', source: 7, display: 0, ownerTimeGroupId: 'tg_wait' }];
enriched.checkSettings = { enabledCategories: ['timeline', 'bus-width'] };
enriched.signals.find(signal => signal.id === 'clk').generator.duty = 0.25;
assert.equal(await open(enriched), true, 'v2 enriched fixture did not open');
const roundTrip = await read();
assert.deepEqual(roundTrip.bookmarks, enriched.bookmarks);
assert.deepEqual(roundTrip.timeGroups, enriched.timeGroups);
assert.deepEqual(roundTrip.timeline.labelAnchors, enriched.timeline.labelAnchors);
assert.deepEqual(roundTrip.checkSettings, enriched.checkSettings);
assert.equal(roundTrip.signals.find(signal => signal.id === 'clk').generator.duty, 0.25);
const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText());
assert.equal(saved.error, undefined, `v2 enriched document failed Save validation: ${saved.error}`);
const savedValue = JSON.parse(saved.text);
assert.equal(savedValue.formatVersion, 2);
assert.equal(JSON.stringify(savedValue), JSON.stringify(JSON.parse(saved.text)), 'Save output is not valid JSON');
assert.equal('duration' in savedValue.timeGroups[0], false, 'derived duration leaked into persistence');
assert.equal('scrollLeft' in savedValue, false);
assert.equal('waveGeometry' in savedValue, false);
assert.equal('waveJSON' in savedValue, false);
assert.equal(await open(savedValue), true, 'v2 saved output did not reopen');
const savedAgain = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
assert.equal(savedAgain, saved.text, 'Save/Open/Save was not deterministic');

const beforeFuture = await read();
const future = { ...structuredClone(beforeFuture), formatVersion: 999, unknownFeature: { shouldNotBePersisted: true } };
assert.equal(await open(future), false, 'future format was opened destructively');
assert.deepEqual(await read(), beforeFuture, 'future format rejection mutated current document');
const preview = await page.evaluate(() => window.TimingChartProductionController.getCompatibilityPreview());
assert.equal(preview.sourceFormatVersion, 999);
assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openCompatibilityText(text, { fileName: 'future-compatible.tcd' }), JSON.stringify(future)), true, 'Compatibility Mode open failed');
assert.equal((await page.evaluate(() => window.TimingChartProductionController.getCompatibilityPreview())).mode, 'compatibility');
assert.ok((await page.evaluate(() => window.TimingChartProductionController.prepareSaveText())).error, 'Compatibility Mode Save was not protected');

const nan = structuredClone(beforeFuture);
nan.bookmarks = [{ id: 'bm_nan', name: 'bad', start: Number.NaN }];
const saveNaN = await page.evaluate(value => {
  const c = window.TimingChartProductionController;
  c.model.document = value;
  return c.prepareSaveText();
}, nan);
assert.ok(saveNaN.error, 'non-finite number was not rejected before Save');

await page.screenshot({ path: path.join(out, 'issue111-1672x941.png') });
const report = { issue: 111, migrationV1: true, v2RoundTrip: true, futureVersionPreservesState: true, deterministicSave: true, nonFiniteRejected: true, errors, pass: errors.length === 0 };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #111 acceptance passed: v1 migration, v2 persistence boundary, future-version safety, deterministic Save/Open, and non-finite rejection.');
