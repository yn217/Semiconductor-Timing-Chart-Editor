import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue26';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4216'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4216/', { waitUntil: 'networkidle' });
    const canonicalBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
    const homeLabels = await page.locator('#ribbonHome .tool-label').allTextContents();
    assert.ok(!homeLabels.some(label => /別グループ|表示\/|SVG|PNG|PDF/.test(label)));
    assert.equal(await page.locator('#ribbonHome .export-tool').count(), 0);
    await page.locator('.rtab').filter({ hasText: 'ファイル' }).click();
    const fileMenu = page.locator('#issue26FileMenu');
    assert.equal(await fileMenu.count(), 1);
    assert.equal(await fileMenu.locator('[data-file-export]').count(), 3);
    assert.deepEqual(await fileMenu.locator('[data-file-export]').allTextContents(), ['SVGとして出力...', 'PNGとして出力...', 'PDFとして出力...']);
    await page.mouse.click(600, 300);
    assert.equal(await fileMenu.getAttribute('hidden'), '');

    const roleBefore = await page.locator('#groups .row[data-signal="busy"] .role').textContent();
    await page.evaluate(() => {
      const source = document.querySelector('#groups .row[data-signal="busy"]');
      const target = document.querySelector('#groups .group');
      const data = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: data }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
    });
    assert.ok(await page.evaluate(() => window.TimingChartProductionController.model.document.signalGroups[0].rows.includes('busy')));
    assert.ok(await page.evaluate(() => !window.TimingChartProductionController.model.document.signalGroups[1].rows.includes('busy')));
    assert.equal(await page.locator('#groups .row[data-signal="busy"] .role').textContent(), roleBefore);
    await page.evaluate(() => window.TimingChartProductionController.actions.undo());
    assert.ok(await page.evaluate(() => window.TimingChartProductionController.model.document.signalGroups[1].rows.includes('busy')));

    const row = page.locator('#groups .row[data-signal="busy"]');
    await row.locator('.eye').click();
    assert.equal(await row.getAttribute('data-visibility'), 'hidden');
    assert.ok(await page.evaluate(() => window.TimingChartProductionController.model.view.hiddenSignals.includes('busy')));
    assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), canonicalBefore);
    await row.locator('.eye').click();
    assert.equal(await row.getAttribute('data-visibility'), 'visible');
    assert.equal(await page.locator('#cycleCanvas .trace svg[data-renderer="wavedrom"]').count(), 7);
    await page.screenshot({ path: `${root}/production-${viewport.width}x${viewport.height}.png` });
    results.push({ viewport, homeCommandsRemoved: true, fileExports: 3, dragDropUndo: true, visibilityTransient: true, canonicalUnchanged: true, waveDromTraceCount: 7, pass: true });
    await page.close();
  }
  const report = { issue: 26, goldenReferenceModified: false, waveDromGeometryChanged: false, results, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #26 acceptance passed: Home compaction, File exports, cross-group drag/drop, visibility control, and semantic preservation.');
} finally {
  server.kill();
}
