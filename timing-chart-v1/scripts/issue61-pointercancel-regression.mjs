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
  const controller = window.TimingChartProductionController;
  const clock = controller.selectors.getReferenceClock();
  const point = cycle => controller.getCycleBoundary({ signal: clock.id, cycle, coordinateSpace: 'canvas' });
  const target = document.querySelector('#cycleCanvas .wave-row .trace');
  const rect = target.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const before = {
    document: JSON.stringify(controller.getSerializableDocument()),
    undo: controller.model.history.undo.length,
    dirty: Boolean(controller.model.persistence.dirty)
  };
  const init = { bubbles: true, button: 0, pointerId: 611, pointerType: 'mouse', clientY: y };
  target.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: point(2).canvasX }));
  target.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: point(5).canvasX }));
  target.dispatchEvent(new PointerEvent('pointercancel', { ...init, clientX: point(5).canvasX }));
  await new Promise(resolve => requestAnimationFrame(resolve));
  const rangeAfterCancel = [controller.model.timeSelection.rangeStart, controller.model.timeSelection.rangeEnd];
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, clientX: point(4).canvasX, clientY: y }));
  await new Promise(resolve => requestAnimationFrame(resolve));
  return {
    before,
    rangeAfterCancel,
    cycleAfterNextClick: controller.model.timeSelection.cycle,
    rangeDeleteDisabled: [...document.querySelectorAll('.tool')].find(node => node.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes('範囲削除'))?.disabled,
    after: {
      document: JSON.stringify(controller.getSerializableDocument()),
      undo: controller.model.history.undo.length,
      dirty: Boolean(controller.model.persistence.dirty)
    }
  };
});

await browser.close();
assert.deepEqual(result.rangeAfterCancel, [null, null], JSON.stringify(result));
assert.equal(result.cycleAfterNextClick, 4, 'the first click after pointercancel must not be suppressed');
assert.equal(result.rangeDeleteDisabled, true, 'range delete must be disabled after cancellation');
assert.deepEqual(result.after, result.before, 'canceled range gesture must be view-only');
console.log('Issue #61 pointercancel regression passed:', JSON.stringify({
  rangeAfterCancel: result.rangeAfterCancel,
  cycleAfterNextClick: result.cycleAfterNextClick,
  rangeDeleteDisabled: result.rangeDeleteDisabled,
  documentUnchanged: result.after.document === result.before.document,
  undoUnchanged: result.after.undo === result.before.undo,
  dirtyUnchanged: result.after.dirty === result.before.dirty
}));
