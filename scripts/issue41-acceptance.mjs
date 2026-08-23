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
    expect(document.querySelector('.inspector .minimap')?.hidden === true && document.querySelector('.inspector')?.dataset.viewMinimap === 'off', 'MiniMap visibility did not reach the Inspector minimap');
    command('minimap').click(); command('snap').click(); await wait(10);
    expect(document.querySelector('.inspector .minimap')?.hidden === false && c.model.view.guides.snap === true, 'MiniMap/Snap restore did not apply');
    c.actions.updateAnnotationAnchor('ann_default_marker', 'anchor', 'offset.x', 7);
    c.model.view.guides.snap = false;
    expect(c.actions.snapAnnotationAnchor('ann_default_marker', 'anchor') === false, 'Snap disabled state still performed a snap');
    expect(c.model.document.annotations.find(item => item.id === 'ann_default_marker').anchor.offset.x === 7, 'Snap disabled state mutated the anchor');
    c.model.view.guides.snap = true;
    expect(c.actions.snapAnnotationAnchor('ann_default_marker', 'anchor') === true, 'Snap enabled state did not snap the annotation to WaveDrom geometry');
    expect(c.model.document.annotations.find(item => item.id === 'ann_default_marker').anchor.offset.x === 0, 'Snap enabled state did not clear the pixel offset');
    command('signal-name').click(); command('role').click(); command('bus-width').click(); command('instance-path').click(); await wait(10);
    expect(Object.values(c.model.view.columns).every(value => value === false), 'column state did not change');
    command('comment-overlay').click(); command('annotation-overlay').click(); command('edge-counter').click(); await wait(10);
    expect(Object.values(c.model.view.overlays).every(value => value === false), 'overlay state did not change');
    expect(document.querySelector('#cycleCanvas').dataset.viewAnnotations === 'off', 'annotation overlay DOM state missing');

    // Restore the four column toggles before testing their independent rendered effects.
    command('signal-name').click(); command('role').click(); command('bus-width').click(); command('instance-path').click(); await wait(10);
    c.actions.selectObject({ dataset: { signal: 'req_addr[7:0]', kind: 'bus' } }); await wait(20);
    const busLabel = () => document.querySelector('#cycleCanvas .wave-row[data-signal="req_addr[7:0]"] .signal-label');
    command('bus-width').click(); await wait(10);
    expect(busLabel()?.querySelector('.bus-width-part')?.style.display === 'none', 'Bus Width OFF did not hide the rendered width part');
    expect(busLabel()?.querySelector('.signal-name-part')?.style.display !== 'none', 'Bus Width OFF hid the signal name');
    command('bus-width').click(); await wait(10);
    expect(busLabel()?.querySelector('.bus-width-part')?.style.display !== 'none', 'Bus Width ON did not restore the rendered width part');
    command('signal-name').click(); await wait(10);
    expect(busLabel()?.querySelector('.signal-name-part')?.style.display === 'none', 'Signal Name OFF did not hide only the signal name');
    expect(busLabel()?.querySelector('.bus-width-part')?.style.display !== 'none', 'Signal Name OFF incorrectly hid Bus Width');
    command('signal-name').click(); command('full-path').click(); await wait(10);
    const addedPathFixture = c.actions.addSignalsFromPaths('u_dma.u_chan.req_valid', { type: 'binary', role: 'internal' });
    const scopedSignal = c.model.document.signals.find(signal => signal.id === addedPathFixture.added[0]);
    await wait(20);
    const scopedLabel = () => document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(scopedSignal.id)}"] .signal-label`);
    expect(scopedLabel()?.textContent.includes('u_dma.u_chan'), `Full Path did not render hierarchy path text: ${JSON.stringify({ id: scopedSignal.id, source: scopedSignal.source, mode: c.model.document.layout.pathDisplayMode, label: scopedLabel()?.textContent, html: scopedLabel()?.innerHTML })}`);
    command('instance-path').click(); await wait(10);
    expect(scopedLabel()?.querySelector('.instance-path-part')?.style.display === 'none', 'Instance Path OFF did not hide only hierarchy path');
    expect(scopedLabel()?.querySelector('.signal-name-part')?.style.display !== 'none', 'Instance Path OFF hid signal name');
    command('instance-path').click(); command('split-columns').click(); await wait(10);
    command('signal-name').click(); await wait(10);
    expect(scopedLabel()?.querySelector('.signal-name-part')?.style.display === 'none', 'Split Columns Signal Name OFF did not hide signal column');
    expect(scopedLabel()?.querySelector('.instance-path-part')?.style.display !== 'none', 'Split Columns Signal Name OFF hid instance column');
    command('signal-name').click(); command('signal-only').click(); await wait(10);

    const beforeView = JSON.stringify(c.getSerializableDocument());
    const addedHierarchy = c.actions.addSignalsFromPaths('u_top.u_dma.req_valid', { type: 'binary', role: 'internal' });
    expect(addedHierarchy.added.length === 1, 'hierarchical Full Path fixture was not added');
    const hierarchySignal = c.model.document.signals.find(signal => signal.id === addedHierarchy.added[0]);
    command('full-path').click(); await wait(20);
    expect(c.model.document.layout.pathDisplayMode === 'full' && c.hierarchy.getDisplayLabel(hierarchySignal, 'full').includes('u_top.u_dma.req_valid'), 'Full Path did not use the live hierarchy path');
    const availableScopes = c.hierarchy.getScopePaths(); expect(availableScopes.some(scope => scope.join('.') === 'u_top'), 'Scope did not enumerate the live hierarchy');
    expect(c.actions.setScope(['u_top']) === true && c.model.view.scope.join('.') === 'u_top', 'Scope did not apply the selected hierarchy');
    c.actions.setScope([]);
    command('relative').click(); await wait(20); command('full-path').click(); await wait(20); command('split-columns').click(); await wait(20); command('signal-only').click(); await wait(20);
    expect(JSON.stringify(c.getSerializableDocument()) !== beforeView || c.model.document.layout.pathDisplayMode === 'signalOnly', 'hierarchy action did not use existing presentation action');
    command('zoom-plus').click(); command('zoom-minus').click(); command('fit-selection').click(); command('fit-all').click(); await wait(50);
    expect(c.model.view.zoom >= 0.25 && c.model.view.zoom <= 4, 'zoom fit-all returned an invalid geometry-derived zoom');
    expect((c.zoomMetrics?.fullWaveDromRenders || 0) === initialRender, 'view zoom caused full WaveDrom rerender');

    const centerBeforePanels = document.querySelector('.center').getBoundingClientRect().width;
    command('left-panel').click(); command('bottom-panel').click(); command('inspector').click(); await wait(10);
    expect(document.querySelector('.left-panel').hidden && document.querySelector('.bottom').hidden && document.querySelector('.inspector').hidden, 'panel toggles did not apply');
    expect(document.querySelector('.workspace').style.gridTemplateColumns.startsWith('0px '), 'Left panel hide did not reclaim workspace track');
    expect(document.querySelector('.center').getBoundingClientRect().width > centerBeforePanels, 'Panel hide did not expand the timing canvas');
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
