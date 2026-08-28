import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue28';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4218'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const metrics = page => page.evaluate(() => {
  const center = document.querySelector('.center'); const canvas = document.querySelector('#cycleCanvas'); const bottom = document.querySelector('.bottom');
  const trace = document.querySelector('#cycleCanvas .trace svg')?.getBoundingClientRect();
  const boundary = window.TimingChartProductionController.getCycleBoundary({ signal: 'clk', cycle: 0, coordinateSpace: 'canvas' });
  return { center: center.getBoundingClientRect().height, canvas: canvas.getBoundingClientRect().height, bottom: bottom.getBoundingClientRect().height, trace: trace && [trace.left, trace.width, trace.top, trace.height], boundarySource: boundary?.source, boundaryX: boundary?.canvasX, history: window.TimingChartProductionController.model.history?.undo.length || 0 };
});
const splitterClick = async page => { const box = await page.locator('#cycleCanvas').boundingBox(); const x = box.x + Math.min(120, box.width / 2); const y = box.y + box.height - 2; await page.mouse.click(x, y); await page.waitForTimeout(80); };

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4218/', { waitUntil: 'networkidle' });
    const semanticBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
    const initial = await metrics(page);
    assert.equal(initial.bottom, 270);
    assert.equal(initial.boundarySource, 'wavedrom-svg');
    await splitterClick(page);
    const expanded = await metrics(page);
    assert.ok(expanded.bottom > initial.bottom + 50, JSON.stringify({ initial, expanded }));
    await splitterClick(page);
    const restored = await metrics(page);
    assert.ok(Math.abs(restored.bottom - initial.bottom) <= 1);
    const historyBeforeDrag = restored.history;
    const box = await page.locator('#cycleCanvas').boundingBox();
    const x = box.x + Math.min(120, box.width / 2); const y = box.y + box.height - 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 80, { steps: 5 }); const live = await metrics(page); assert.ok(live.bottom > restored.bottom + 50); await page.mouse.up(); await page.waitForTimeout(80);
    const draggedUp = await metrics(page);
    assert.ok(draggedUp.bottom > restored.bottom + 50);
    assert.equal(draggedUp.history, historyBeforeDrag);
    const currentBox = await page.locator('#cycleCanvas').boundingBox(); await page.mouse.move(x, currentBox.y + currentBox.height - 2); await page.mouse.down(); await page.mouse.move(x, 50, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80);
    const bounded = await metrics(page);
    assert.ok(bounded.bottom >= 150 && bounded.canvas >= 280);
    for (const tab of ['annotation', 'problems', 'json', 'signal']) { await page.locator(`#bottomTabs [data-tab="${tab}"]`).click(); assert.ok(Math.abs((await metrics(page)).bottom - bounded.bottom) <= 1); }
    await page.locator('#bottomTabs input[type="checkbox"]').uncheck(); await page.locator('#groups .row[data-signal="clk"]').click(); assert.ok(Math.abs((await metrics(page)).bottom - bounded.bottom) <= 1);
    assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), semanticBefore);
    const final = await metrics(page); assert.equal(final.boundarySource, 'wavedrom-svg');
    await page.screenshot({ path: `${root}/production-${viewport.width}x${viewport.height}.png` });
    results.push({ viewport, initial, expanded, restored, draggedUp, bounded, tabsPreserveHeight: true, semanticsUnchanged: true, noUndoEntry: true, pass: true });
    await page.close();
  }
  const report = { issue: 28, minBottomPx: 150, minCanvasPx: 280, viewStateOnly: true, goldenReferenceModified: false, results, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #28 acceptance passed: bottom splitter click/drag resize, bounds, tab persistence, and semantic isolation.');
} finally {
  server.kill();
}
