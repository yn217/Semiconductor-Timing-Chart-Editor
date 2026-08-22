import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue31';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4214'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const stable = value => JSON.stringify(value);

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const report = { viewports: [], semanticZoomUnchanged: true, outsideAndEscapeClose: true, onePopup: true, pass: true };
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4214/', { waitUntil: 'networkidle' });
    const statusHeight = await page.locator('.status').evaluate(node => node.getBoundingClientRect().height);
    const beforeRange = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
    const beforeHistory = await page.evaluate(() => window.TimingChartProductionController.model.history?.undo.length || 0);

    await page.locator('[data-status-control="range"]').click();
    const rangePopup = page.locator('[data-status-popup="range"]');
    assert.equal(await rangePopup.count(), 1);
    const rangeBox = await rangePopup.boundingBox();
    assert.ok(rangeBox.width < 260 && rangeBox.height < 200, 'Time Range popup must stay compact');
    await rangePopup.locator('[data-status-field="end"]').fill('20');
    await rangePopup.locator('[data-status-action="apply"]').click();
    assert.equal(await page.locator('[data-status-popup]').count(), 0);
    const afterRange = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
    assert.equal(afterRange.timeline.start, 0);
    assert.equal(afterRange.timeline.end, 20);
    assert.equal(afterRange.timeline.cycleCount, 20);
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length), beforeHistory + 1);
    assert.equal((await page.locator('[data-status-control="range"]').textContent()).trim(), 'Time Range: 0 - 20 cycle');
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.getCycleBoundary({ signal: 'clk', cycle: 10, coordinateSpace: 'canvas' }).source), 'wavedrom-svg');

    await page.evaluate(() => window.TimingChartProductionController.actions.undo());
    assert.equal((await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument())).timeline.end, 10);
    await page.locator('[data-status-control="range"]').click();
    await page.locator('[data-status-popup="range"] [data-status-field="end"]').fill('20');
    await page.locator('[data-status-popup="range"] [data-status-action="apply"]').click();

    const semanticBeforeZoom = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
    const historyBeforeZoom = await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length);
    await page.locator('[data-status-control="zoom"]').click();
    const zoomPopup = page.locator('[data-status-popup="zoom"]');
    assert.equal(await page.locator('[data-status-popup]').count(), 1);
    await zoomPopup.locator('[data-status-action="plus"]').click();
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.view.zoom), 1.1);
    await zoomPopup.locator('[data-status-action="minus"]').click();
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.view.zoom), 1);
    await zoomPopup.locator('[data-status-field="zoom"]').fill('150');
    await zoomPopup.locator('[data-status-field="zoom"]').press('Enter');
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.view.zoom), 1.5);
    assert.equal(stable(await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument())), stable(semanticBeforeZoom));
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length), historyBeforeZoom);
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.getCycleBoundary({ signal: 'clk', cycle: 10, coordinateSpace: 'canvas' }).source), 'wavedrom-svg');
    assert.equal(await page.locator('.status').evaluate(node => node.getBoundingClientRect().height), statusHeight);

    await page.locator('[data-status-control="range"]').click();
    await page.locator('[data-status-popup="range"] [data-status-field="end"]').fill('0');
    await page.locator('[data-status-popup="range"] [data-status-action="apply"]').click();
    assert.equal(await page.locator('[data-status-popup="range"] [data-status-error]').textContent(), 'Invalid range');
    assert.equal((await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument())).timeline.end, 20);
    await page.locator('[data-status-popup="range"] [data-status-field="end"]').fill('20');
    await page.locator('[data-status-popup="range"] [data-status-action="apply"]').click();
    assert.equal(await page.locator('[data-status-popup]').count(), 0);
    await page.locator('[data-status-control="range"]').click();
    assert.equal(await page.locator('[data-status-popup]').count(), 1);
    await page.mouse.click(8, 8);
    assert.equal(await page.locator('[data-status-popup]').count(), 0);
    await page.locator('[data-status-control="zoom"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-status-popup]').count(), 0);

    await page.locator('[data-status-control="zoom"]').click();
    await page.locator('[data-status-popup="zoom"] [data-status-action="fit-all"]').click();
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.view.zoom), 1);
    await page.locator('[data-status-control="zoom"]').click();
    await page.locator('[data-status-popup="zoom"] [data-status-action="fit-selection"]').click();
    assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.view.zoom), 1.25);

    await page.screenshot({ path: `${root}/status-popups-${viewport.width}x${viewport.height}.png` });
    report.viewports.push({ ...viewport, statusBarHeight: statusHeight, rangeApplied: true, undoAtomic: true, zoomViewOnly: true, wavedromGeometrySource: true, pass: true });
    await page.close();
  }
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #31 acceptance passed: compact Time Range/Zoom popups, semantic range history, view-only zoom, and WaveDrom geometry re-resolution.');
} finally {
  server.kill();
}
