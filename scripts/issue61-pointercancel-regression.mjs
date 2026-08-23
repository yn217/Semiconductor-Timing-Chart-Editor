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
  const clock = c.selectors.getReferenceClock();
  const p2 = c.getCycleBoundary({ signal: clock.id, cycle: 2, coordinateSpace: 'canvas' });
  const p5 = c.getCycleBoundary({ signal: clock.id, cycle: 5, coordinateSpace: 'canvas' });
  const p4 = c.getCycleBoundary({ signal: clock.id, cycle: 4, coordinateSpace: 'canvas' });
  const target = document.querySelector('#cycleCanvas .wave-row .trace');
  const rect = target.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const before = {
    document: JSON.stringify(c.getSerializableDocument()),
    undo: c.model.history.undo.length,
    dirty: Boolean(c.model.persistence.dirty),
  };
  const init = { bubbles: true, button: 0, pointerId: 611, pointerType: 'mouse', clientY: y };
  target.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: p2.canvasX }));
  target.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: p5.canvasX }));
  target.dispatchEvent(new PointerEvent('pointercancel', { ...init, clientX: p5.canvasX }));
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rangeAfterCancel = [c.model.timeSelection.rangeStart, c.model.timeSelection.rangeEnd];
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, clientX: p4.canvasX, clientY: y }));
  await new Promise(resolve => requestAnimationFrame(resolve));
  return {
    before,
    rangeAfterCancel,
    cycleAfterNextClick: c.model.timeSelection.cycle,
    after: {
      document: JSON.stringify(c.getSerializableDocument()),
      undo: c.model.history.undo.length,
      dirty: Boolean(c.model.persistence.dirty),
    },
  };
});

await browser.close();
assert.deepEqual(result.rangeAfterCancel, [null, null], JSON.stringify(result));
assert.equal(result.cycleAfterNextClick, 4, 'the first click after pointercancel must not be suppressed');
assert.deepEqual(result.after, result.before, 'canceled range gesture must be view-only');
console.log('Issue #61 pointercancel regression passed:', JSON.stringify(result));
