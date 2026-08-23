import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(400);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const group = c.model.document.signalGroups[0];
  const ids = [...group.rows];
  const timingState = () => Object.fromEntries(ids.map(id => {
    const row = document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(id)}"]`);
    return [id, row ? { hidden: row.hidden, display: getComputedStyle(row).display } : null];
  }));
  const before = {
    document: JSON.stringify(c.getSerializableDocument()),
    revision: c.model.documentRevision,
    undo: c.model.history.undo.length,
    dirty: Boolean(c.model.persistence.dirty),
    waveDrom: c.renderMetrics.waveDromRenders,
    geometry: c.renderMetrics.geometryBuilds,
    timing: timingState(),
  };
  const groupNode = [...document.querySelectorAll('#groups .group')].find(node => node.querySelector('.group-title')?.textContent.includes('入力'));
  groupNode.querySelector('.chev').click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const leftHidden = ids.every(id => document.querySelector(`#groups .row[data-signal="${CSS.escape(id)}"]`)?.hidden === true);
  const after = {
    document: JSON.stringify(c.getSerializableDocument()),
    revision: c.model.documentRevision,
    undo: c.model.history.undo.length,
    dirty: Boolean(c.model.persistence.dirty),
    waveDrom: c.renderMetrics.waveDromRenders,
    geometry: c.renderMetrics.geometryBuilds,
    timing: timingState(),
  };
  return { ids, leftHidden, before, after };
});

await browser.close();
assert.equal(result.leftHidden, true, JSON.stringify(result));
assert.equal(result.after.document, result.before.document, 'Tree collapse must not change canonical .tcd content');
assert.equal(result.after.revision, result.before.revision, 'Tree collapse must not advance document revision');
assert.equal(result.after.undo, result.before.undo, 'Tree collapse must not create Undo history');
assert.equal(result.after.dirty, result.before.dirty, 'Tree collapse must not change Dirty');
assert.equal(result.after.waveDrom, result.before.waveDrom, 'Tree collapse must not regenerate WaveDrom');
assert.equal(result.after.geometry, result.before.geometry, 'Tree collapse must not rebuild local waveform geometry');
assert.deepEqual(result.after.timing, result.before.timing, 'Tree collapse must not hide/reorder Timing Chart rows');
console.log('Issue #44 view-only collapse regression passed:', JSON.stringify(result));
