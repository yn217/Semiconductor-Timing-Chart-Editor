import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue65');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.actions?.updateAnnotation));

const transition = async (sourceType, targetType) => page.evaluate(([sourceType, targetType]) => {
  const c = window.TimingChartProductionController;
  const id = `issue65_${sourceType}_${targetType}`;
  c.actions.addAnnotation(sourceType, { id, label: `${sourceType} source` });
  const before = structuredClone(c.model.document.annotations.find(annotation => annotation.id === id));
  const historyBefore = c.model.history.undo.length;
  const changed = c.actions.updateAnnotation(id, 'type', targetType);
  const after = structuredClone(c.model.document.annotations.find(annotation => annotation.id === id));
  return { id, before, after, changed, historyDelta: c.model.history.undo.length - historyBefore };
}, [sourceType, targetType]);

const markerRange = await transition('marker', 'range');
assert.equal(markerRange.changed, true); assert.equal(markerRange.historyDelta, 1);
assert.ok(markerRange.after.start && markerRange.after.end); assert.equal('anchor' in markerRange.after, false);
await page.evaluate(id => window.TimingChartProductionController.actions.undo(), markerRange.id);
assert.equal(await page.evaluate(id => window.TimingChartProductionController.model.document.annotations.find(annotation => annotation.id === id).type, markerRange.id), 'marker');
await page.evaluate(() => window.TimingChartProductionController.actions.redo());

const rangeDependency = await transition('range', 'dependency');
assert.equal(rangeDependency.changed, true); assert.equal(rangeDependency.historyDelta, 1);
assert.ok(rangeDependency.after.from && rangeDependency.after.to); assert.equal('start' in rangeDependency.after, false); assert.equal('end' in rangeDependency.after, false);
const dependencyMarker = await transition('dependency', 'marker');
assert.equal(dependencyMarker.changed, true); assert.equal(dependencyMarker.historyDelta, 1);
assert.ok(dependencyMarker.after.anchor); assert.equal('from' in dependencyMarker.after, false); assert.equal('to' in dependencyMarker.after, false);
const textCallout = await transition('text', 'callout');
assert.equal(textCallout.changed, true); assert.equal(textCallout.historyDelta, 1); assert.ok(textCallout.after.anchor);
const calloutHighlight = await transition('callout', 'highlight');
assert.equal(calloutHighlight.changed, true); assert.equal(calloutHighlight.historyDelta, 1); assert.ok(calloutHighlight.after.start && calloutHighlight.after.end);

await page.evaluate(id => { const c = window.TimingChartProductionController; c.model.selection = { kind: 'annotation', id }; c.model.view.tab = 'annotation'; c.render(); }, calloutHighlight.id);
assert.equal(await page.locator('#bottomContent tr[data-annotation-id="'+calloutHighlight.id+'"] [data-annotation-field="type"]').inputValue(), 'highlight');
assert.match(await page.locator('#inspectorBody').textContent(), /highlight|背景/);
const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue65-type-roundtrip.tcd', unsavedDecision: 'discard' }), saved), true);
assert.equal(await page.evaluate(id => window.TimingChartProductionController.model.document.annotations.find(annotation => annotation.id === id).type, calloutHighlight.id), 'highlight');
await page.screenshot({ path: path.join(out, 'issue65-annotation-type-1672x941.png') });
await browser.close();
assert.equal(errors.length, 0, errors.join('\n'));
await fs.writeFile(path.join(out, 'annotation-type-acceptance.json'), `${JSON.stringify({ issue: 65, transitions: [markerRange, rangeDependency, dependencyMarker, textCallout, calloutHighlight], errors, pass: true }, null, 2)}\n`);
console.log('Issue #65 annotation type acceptance passed: semantic migrations, one-step history, Undo/Redo, and Save/Open round-trip.');
