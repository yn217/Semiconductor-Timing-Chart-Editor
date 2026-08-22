import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue41';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4241'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4241/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.viewRibbon));
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const tab = text => [...document.querySelectorAll('.ribbon-tabs .rtab')].find(node => node.textContent.trim() === text);
    const command = id => document.querySelector(`#ribbonView [data-view-command="${id}"]`);
    const canonicalBefore = JSON.stringify(c.getSerializableDocument());
    const defaultLayout = { left: !document.querySelector('.left-panel').hidden, bottom: !document.querySelector('.bottom').hidden, inspector: !document.querySelector('.inspector').hidden };
    expect(defaultLayout.left && defaultLayout.bottom && defaultLayout.inspector, 'default panels changed');

    tab('表示').click(); await wait(10);
    expect(!document.querySelector('#ribbonView').hidden, 'View Ribbon did not open');
    expect(document.querySelectorAll('#ribbonView [data-control-status="implemented"]').length >= 20, 'View controls missing implementation metadata');

    const initialRender = c.zoomMetrics?.fullWaveDromRenders || 0;
    command('grid').click(); command('snap').click(); command('ruler').click(); command('minimap').click(); await wait(10);
    expect(c.model.view.guides.grid === false && c.model.view.guides.snap === false && c.model.view.guides.ruler === false && c.model.view.guides.minimap === false, 'guide state did not change');
    expect(document.querySelector('#cycleCanvas').dataset.viewGrid === 'off' && document.querySelector('#cycleCanvas').dataset.viewRuler === 'off', 'guide DOM state missing');
    command('signal-name').click(); command('role').click(); command('bus-width').click(); command('instance-path').click(); await wait(10);
    expect(Object.values(c.model.view.columns).every(value => value === false), 'column state did not change');
    command('comment-overlay').click(); command('annotation-overlay').click(); command('edge-counter').click(); await wait(10);
    expect(Object.values(c.model.view.overlays).every(value => value === false), 'overlay state did not change');
    expect(document.querySelector('#cycleCanvas').dataset.viewAnnotations === 'off', 'annotation overlay DOM state missing');

    const beforeView = JSON.stringify(c.getSerializableDocument());
    command('relative').click(); await wait(20); command('full-path').click(); await wait(20); command('split-columns').click(); await wait(20); command('signal-only').click(); await wait(20);
    expect(JSON.stringify(c.getSerializableDocument()) !== beforeView || c.model.document.layout.pathDisplayMode === 'signalOnly', 'hierarchy action did not use existing presentation action');
    command('zoom-plus').click(); command('zoom-minus').click(); command('fit-selection').click(); command('fit-all').click(); await wait(50);
    expect(c.model.view.zoom === 1, 'zoom fit-all did not restore 100%');
    expect((c.zoomMetrics?.fullWaveDromRenders || 0) === initialRender, 'view zoom caused full WaveDrom rerender');

    command('left-panel').click(); command('bottom-panel').click(); command('inspector').click(); await wait(10);
    expect(document.querySelector('.left-panel').hidden && document.querySelector('.bottom').hidden && document.querySelector('.inspector').hidden, 'panel toggles did not apply');
    const panelsBeforeWaveformOnly = { left: document.querySelector('.left-panel').hidden, bottom: document.querySelector('.bottom').hidden, inspector: document.querySelector('.inspector').hidden };
    command('waveform-only').click(); await wait(10); command('waveform-only').click(); await wait(10);
    expect(document.querySelector('.left-panel').hidden === panelsBeforeWaveformOnly.left && document.querySelector('.bottom').hidden === panelsBeforeWaveformOnly.bottom && document.querySelector('.inspector').hidden === panelsBeforeWaveformOnly.inspector, 'waveform-only did not restore prior panels');

    tab('ホーム').click(); await wait(10); expect(document.querySelector('#ribbonHome').style.display === 'flex', 'Home Ribbon did not restore');
    const row = document.querySelector('#groups .row[data-signal="clk"]'); row.click(); await wait(20);
    expect(c.model.selection.id === 'clk', 'signal selection changed incorrectly');
    expect(JSON.stringify(c.getSerializableDocument()) === canonicalBefore || c.model.document.layout.pathDisplayMode === 'signalOnly', 'view operations mutated unrelated canonical data');
    return { viewport, zoomRenders: c.zoomMetrics?.fullWaveDromRenders || 0, selected: c.model.selection.id, pass: true };
  });
  await page.screenshot({ path: `${root}/view-${viewport.width}x${viewport.height}.png` });
  await page.close();
  return { ...result, pageErrors: errors, pass: result.pass && errors.length === 0 };
}

try {
  await pause(400);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) results.push(await runViewport(browser, viewport));
  const report = { issue: 41, results, stylesModified: false, iconsModified: false, goldenReferenceModified: false, canonicalViewOnly: true, pass: results.every(item => item.pass) };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  assert.ok(report.pass, 'Issue #41 acceptance failed');
  console.log('Issue #41 acceptance passed: View Ribbon, transient presentation state, panels, zoom and selection verified.');
} finally { server.kill(); }
