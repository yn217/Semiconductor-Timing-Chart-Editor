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
  const idOf = row => row?.dataset?.signalId || row?.dataset?.signal || row?.dataset?.commentId || null;
  const orders = () => {
    const canonical = (c.model.document.signalGroups || []).flatMap(group => group.rows || []);
    const wanted = new Set(canonical);
    const left = [...document.querySelectorAll('#groups .row')].map(idOf).filter(id => id && wanted.has(id));
    const timing = [...document.querySelectorAll('#cycleCanvas .wave-row')].map(idOf).filter(id => id && wanted.has(id));
    const frozenHost = window.TimingChartFrozenLabels?.frozenWave;
    const frozen = frozenHost ? [...frozenHost.children].map(idOf).filter(id => id && wanted.has(id)) : [];
    return { canonical, left, timing, frozen };
  };
  const target = c.model.document.signalGroups[0].rows[1];
  document.querySelector(`#groups .row[data-signal="${CSS.escape(target)}"]`)?.click();
  const up = [...document.querySelectorAll('#ribbonHome .tool')].find(node => (node.querySelector('.tool-label')?.textContent || '').replace(/\s/g, '').includes('上へ'));
  const before = orders();
  up.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterUp = orders();
  c.actions.undo();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterUndo = orders();
  c.actions.redo();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterRedo = orders();
  return { target, before, afterUp, afterUndo, afterRedo };
});

await browser.close();
const check = (name, value) => {
  assert.deepEqual(value.left, value.canonical, `${name}: Left Tree order diverged from canonical`);
  assert.deepEqual(value.timing, value.canonical, `${name}: Timing row order diverged from canonical`);
  assert.deepEqual(value.frozen, value.canonical, `${name}: Frozen label order diverged from canonical`);
};
check('after Up', result.afterUp);
check('after Undo', result.afterUndo);
check('after Redo', result.afterRedo);
console.log('Issue #48 surface-order regression passed:', JSON.stringify(result));
