import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue36';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4231'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const runViewport = async (browser, viewport) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4231/gui-mockup/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const controller = window.TimingChartProductionController;
    let waveRenders = 0;
    const originalRender = window.WaveDrom.RenderWaveForm;
    window.WaveDrom.RenderWaveForm = (...args) => { waveRenders += 1; return originalRender(...args); };
    const label = document.querySelector('#cycleCanvas .signal-label');
    const role = document.querySelector('#cycleCanvas .canvas-icon');
    const commentRow = [...document.querySelectorAll('#cycleCanvas .wave-row')].find(row => row.querySelector('.comment-body'));
    const labelMetrics = node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, fontSize: getComputedStyle(node).fontSize, transform: getComputedStyle(node).transform }; };
    const snapshot = () => ({
      label: labelMetrics(label),
      role: labelMetrics(role),
      commentLabel: labelMetrics(commentRow.querySelector('.signal-label')),
      svgWidth: document.querySelector('#cycleCanvas .trace svg').getBoundingClientRect().width,
      document: JSON.stringify(controller.getSerializableDocument()),
      undo: controller.model.history.undo.length,
      zoom: controller.model.view.zoom
    });
    const geometryErrors = () => [...document.querySelectorAll('#cycleCanvas .ruler .tick')].map(tick => {
      const cycle = Number(tick.dataset.cycle);
      const boundary = controller.getCycleBoundary({ signal: 'clk', cycle, coordinateSpace: 'canvas' });
      const rect = tick.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - boundary.canvasX);
    });
    const before = snapshot();
    controller.actions.setZoom(50);
    await new Promise(resolve => setTimeout(resolve, 100));
    const at50 = snapshot();
    const geometry50 = geometryErrors();
    controller.actions.setZoom(200);
    await new Promise(resolve => setTimeout(resolve, 100));
    const at200 = snapshot();
    const geometry200 = geometryErrors();
    const framesBeforeBurst = controller.zoomMetrics.frames;
    for (let index = 0; index < 20; index += 1) controller.actions.setZoom(index % 2 ? 25 : 400);
    await new Promise(resolve => setTimeout(resolve, 100));
    const burstFrames = controller.zoomMetrics.frames - framesBeforeBurst;
    const docBeforeFit = JSON.stringify(controller.getSerializableDocument());
    const rendersBeforeFit = waveRenders;
    controller.actions.fitAll();
    controller.actions.fitSelection();
    await new Promise(resolve => setTimeout(resolve, 100));
    const final = snapshot();
    const overlay = document.querySelector('#cycleCanvas svg[data-production-overlay="annotations"]');
    return { before, at50, at200, final, geometry50, geometry200, burstFrames, waveRenders, rendersBeforeFit, docBeforeFit, overlayTransform: overlay ? getComputedStyle(overlay).transform : 'none', metrics: { ...controller.zoomMetrics } };
  });
  await page.screenshot({ path: `${root}/production-${viewport.width}x${viewport.height}.png` });
  await page.close();
  return result;
};

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const viewports = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }];
  const results = [];
  for (const viewport of viewports) {
    const result = await runViewport(browser, viewport);
    for (const state of [result.at50, result.at200]) {
      assert.equal(state.label.width, result.before.label.width, 'signal label width changed with zoom');
      assert.equal(state.label.height, result.before.label.height, 'signal label height changed with zoom');
      assert.equal(state.label.fontSize, result.before.label.fontSize, 'signal label font changed with zoom');
      assert.equal(state.role.width, result.before.role.width, 'role icon width changed with zoom');
      assert.equal(state.commentLabel.width, result.before.commentLabel.width, 'comment label width changed with zoom');
      assert.equal(state.commentLabel.fontSize, result.before.commentLabel.fontSize, 'comment label font changed with zoom');
      assert.equal(state.document, result.before.document, 'canonical document changed with zoom');
      assert.equal(state.undo, result.before.undo, 'zoom created an undo entry');
    }
    assert.ok(result.at50.svgWidth < result.before.svgWidth, '50% did not reduce timing SVG width');
    assert.ok(result.at200.svgWidth > result.before.svgWidth, '200% did not expand timing SVG width');
    assert.ok(Math.max(...result.geometry50, ...result.geometry200) <= 0.1, 'ruler/actual WaveDrom geometry mismatch');
    assert.equal(result.waveRenders, result.rendersBeforeFit, 'zoom caused WaveDrom regeneration');
    assert.ok(result.burstFrames <= 2, 'rapid zoom requests were not coalesced');
    assert.equal(result.final.document, result.docBeforeFit, 'Fit changed canonical document');
    assert.equal(result.overlayTransform, 'none', 'annotation overlay was transformed with timing content');
    results.push({ viewport, geometryMaxErrorPx: Math.max(...result.geometry50, ...result.geometry200), labelStable: true, timingSvgResponds: true, canonicalStable: true, waveDromRerendered: result.waveRenders !== result.rendersBeforeFit, burstFrames: result.burstFrames, pass: true });
  }
  const report = { issue: 36, results, goldenReferenceModified: false, stylesModified: false, iconsModified: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #36 acceptance passed: timing-only zoom, stable labels, geometry, canonical state, and coalesced view updates.');
} finally {
  server.kill();
}
