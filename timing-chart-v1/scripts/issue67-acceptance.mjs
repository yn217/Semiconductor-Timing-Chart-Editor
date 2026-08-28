import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python', ['-m', 'http.server', '4267'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4267/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.annotationResolve));
  await page.locator('.ribbon-tabs .rtab').filter({ hasText: '挿入' }).click();
  await page.locator('#ribbonInsert [data-insert-command="add-range"]').click();
  await wait(40);
  await page.locator('.ribbon-tabs .rtab').filter({ hasText: '注釈' }).click();
  await wait(20);
  const initial = await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    const annotation = c.model.document.annotations.find(item => item.id === c.model.selection.id);
    return { id: annotation.id, type: annotation.type, start: structuredClone(annotation.start), end: structuredClone(annotation.end) };
  });
  assert.equal(initial.type, 'range');
  const pickPoint = async signalId => page.evaluate(signal => {
    const item = window.TimingChartProductionController.model.waveGeometry.signals[signal].transitionCenter[0];
    const trace = document.getElementById(window.TimingChartProductionController.model.waveGeometry.signals[signal].traceId);
    const svg = trace.querySelector('svg');
    const screen = new DOMPoint(item.localX, item.localY).matrixTransform(svg.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, signalId);
  await page.locator('#ribbonAnnotation [data-annotation-command="start-anchor"]').click();
  const startPoint = await pickPoint('state[1:0]'); await page.mouse.click(startPoint.x, startPoint.y); await wait(40);
  const afterStart = await page.evaluate(id => { const a = window.TimingChartProductionController.model.document.annotations.find(item => item.id === id); return structuredClone(a.start); }, initial.id);
  assert.equal(afterStart.signal, 'state[1:0]');
  await page.locator('#ribbonAnnotation [data-annotation-command="end-anchor"]').click();
  const endPoint = await pickPoint('rdata[15:0]'); await page.mouse.click(endPoint.x, endPoint.y); await wait(40);
  const afterEnd = await page.evaluate(id => { const a = window.TimingChartProductionController.model.document.annotations.find(item => item.id === id); return structuredClone(a.end); }, initial.id);
  assert.equal(afterEnd.signal, 'rdata[15:0]');
  const beforeReset = await page.evaluate(id => { const c = window.TimingChartProductionController; const a = c.model.document.annotations.find(item => item.id === id); c.actions.updateAnnotationAnchor(id, 'start', 'offset.x', 14); c.actions.updateAnnotationAnchor(id, 'start', 'offset.y', -6); return { signal: a.start.signal, cycle: a.start.cycle, point: a.start.point }; }, initial.id);
  await page.locator('#ribbonAnnotation [data-annotation-command="reset-offset"]').click(); await wait(30);
  const afterReset = await page.evaluate(id => { const a = window.TimingChartProductionController.model.document.annotations.find(item => item.id === id); return { signal: a.start.signal, cycle: a.start.cycle, point: a.start.point, offset: a.start.offset }; }, initial.id);
  assert.deepEqual({ signal: afterReset.signal, cycle: afterReset.cycle, point: afterReset.point }, beforeReset);
  assert.deepEqual(afterReset.offset, { x: 0, y: 0 });
  await page.evaluate(id => { const c = window.TimingChartProductionController; c.actions.updateAnnotationAnchor(id, 'start', 'offset.x', 11); c.actions.updateAnnotationAnchor(id, 'end', 'offset.y', -9); }, initial.id);
  await page.locator('#ribbonAnnotation [data-annotation-command="snap"]').click(); await wait(40);
  const afterSnap = await page.evaluate(id => { const a = window.TimingChartProductionController.model.document.annotations.find(item => item.id === id); return { start: structuredClone(a.start), end: structuredClone(a.end) }; }, initial.id);
  assert.deepEqual(afterSnap.start.offset, { x: 0, y: 0 }); assert.deepEqual(afterSnap.end.offset, { x: 0, y: 0 });

  await page.locator('.ribbon-tabs .rtab').filter({ hasText: '挿入' }).click();
  await page.locator('#ribbonInsert [data-insert-command="add-marker"]').click(); await wait(30);
  await page.locator('.ribbon-tabs .rtab').filter({ hasText: '注釈' }).click(); await wait(20);
  assert.equal(await page.locator('#ribbonAnnotation [data-annotation-command="end-anchor"]').isDisabled(), true, 'single-anchor End Anchor must be disabled');
  assert.equal(errors.length, 0, errors.join('\n'));
  await browser.close();
  console.log('Issue #67 acceptance passed: semantic Start/End Anchor picking, geometry Snap, Offset Reset distinction, and single-anchor applicability verified.');
} finally { server.kill(); }
