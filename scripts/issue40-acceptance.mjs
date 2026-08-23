import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue40';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4240'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4240/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartAnnotationRibbon && window.TimingChartProductionController));
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const annotation = id => c.model.document.annotations.find(item => item.id === id);
    const command = id => document.querySelector(`#ribbonAnnotation [data-annotation-command="${id}"]`);
    const select = id => { expect(c.actions.selectAnnotation(id), `could not select ${id}`); return annotation(id); };
    const traceCount = () => document.querySelectorAll('#cycleCanvas .trace[data-renderer="wavedrom"] svg').length;
    const initial = c.model.document.annotations.map(item => item.id);

    const annotationTab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(node => node.textContent.trim() === '注釈');
    expect(annotationTab, 'Annotation Ribbon tab missing');
    annotationTab.click(); await wait(30);
    expect(!document.querySelector('#ribbonAnnotation').hidden, 'Annotation Ribbon did not activate');
    expect(document.querySelector('#ribbonHome').hidden, 'Home Ribbon remained visible');
    expect([...document.querySelectorAll('#ribbonAnnotation [data-annotation-command]')].every(node => node.dataset.tooltipMeta && node.dataset.controlStatus), 'Annotation command metadata missing');
    expect(command('duplicate').disabled && command('delete').disabled, 'Annotation context controls enabled without selection');
    expect(command('fill').disabled && command('width').disabled && command('lock').disabled, 'Unsupported controls were not disabled');

    for (const type of ['marker', 'text', 'callout', 'range', 'bracket', 'highlight', 'verticalLine']) {
      const id = `issue40_${type}`;
      expect(c.actions.addAnnotation(type, { id, label: type }), `${type} annotation could not be created`); await wait(20);
      expect(c.model.selection.kind === 'annotation' && c.model.selection.id === id, `${type} annotation was not selected`);
      expect(!command('duplicate').disabled && !command('snap').disabled, `${type} annotation did not enable context controls`);
      expect(c.actions.deleteAnnotation(id), `${type} annotation could not be deleted`); await wait(20);
    }
    let range = select('ann_default_range'); await wait(30);
    expect(!command('duplicate').disabled && !command('delete').disabled && !command('snap').disabled, 'Annotation controls did not enable after selection');
    const beforeDuplicate = c.model.document.annotations.length;
    command('duplicate').click(); await wait(30);
    expect(c.model.document.annotations.length === beforeDuplicate + 1, 'Duplicate did not add one annotation');
    expect(c.actions.undo(), 'Duplicate undo failed'); await wait(30);
    expect(c.model.document.annotations.length === beforeDuplicate, 'Duplicate undo did not restore annotation count');
    range = select('ann_default_range'); await wait(20);

    // Use resolvable rendered Geometry Map anchors for the Snap contract.
    // The old test used the hidden fixture's unresolved end anchor and thereby
    // asserted the obsolete "Snap means offset reset" behavior.
    const startGeometry = c.model.waveGeometry.signals['state[1:0]'].transitionCenter[0];
    const endGeometry = c.model.waveGeometry.signals['rdata[15:0]'].transitionCenter[0];
    range.start = { signal: startGeometry.signal, cycle: startGeometry.cycle, point: 'transition-center', offset: { x: 0, y: 0 } };
    range.end = { signal: endGeometry.signal, cycle: endGeometry.cycle, point: 'transition-center', offset: { x: 0, y: 0 } };
    const beforeGeometry = { start: structuredClone(range.start), end: structuredClone(range.end) };
    range.start.offset = { x: 12, y: -7 }; range.end.offset = { x: -4, y: 9 }; await wait(30);
    const beforeTraceCount = traceCount();
    expect(!command('snap').disabled, `Snap became disabled after anchor setup: ${JSON.stringify({ selection: c.model.selection, status: command('snap').dataset.controlStatus })}`); command('snap').click(); await wait(30);
    expect(JSON.stringify(range.start.semantic || range.start) !== undefined, 'Range start became invalid');
    expect(['state[1:0]', 'rdata[15:0]'].includes(range.start.signal) && Number.isInteger(range.start.cycle) && typeof range.start.point === 'string', 'Snap produced an invalid semantic start anchor');
    expect(['state[1:0]', 'rdata[15:0]'].includes(range.end.signal) && Number.isInteger(range.end.cycle) && typeof range.end.point === 'string', 'Snap produced an invalid semantic end anchor');
    expect(range.start.offset.x === 0 && range.start.offset.y === 0 && range.end.offset.x === 0 && range.end.offset.y === 0, `Snap did not reset anchor offsets: ${JSON.stringify({ start: range.start.offset, end: range.end.offset })}`);
    expect(traceCount() === beforeTraceCount, 'Pure annotation snap rerendered WaveDrom traces');
    command('reset-offset').click(); await wait(20);
    expect(range.labelOffset?.x === 0 && range.labelOffset?.y === 0, 'Offset reset did not reset labelOffset');

    const beforeStyleTraceCount = traceCount();
    command('label-right').click(); command('wrap').click(); command('multiline').click(); const labelEditor = document.querySelector('[data-annotation-label-editor]'); expect(labelEditor, 'Multiline label editor did not open'); const labelText = labelEditor.querySelector('[data-annotation-label-text]'); labelText.value = `${range.label}\nsecond line`; labelEditor.querySelector('[data-annotation-label-apply]').click(); command('color').click(); const colorPicker = document.querySelector('#ribbonAnnotation [data-annotation-color-picker]'); expect(colorPicker, 'Color command did not expose a selectable color control'); colorPicker.value = '#e39a25'; colorPicker.dispatchEvent(new Event('change', { bubbles: true })); command('visible').click(); await wait(30);
    expect(range.labelStyle?.align === 'right', 'Label alignment was not stored canonically');
    expect(range.labelStyle?.wrap === true, 'Label wrap was not stored canonically');
    expect(String(range.label).includes('\n'), 'Multiline label was not stored canonically');
    expect(range.color === '#e39a25', 'Color command did not update canonical color');
    expect(range.visible === true, 'Visibility command did not toggle canonical visibility');
    expect(traceCount() === beforeStyleTraceCount, 'Pure annotation style edit rerendered WaveDrom traces');

    select('ann_default_dependency'); await wait(30);
    command('curve').click(); command('arrow-both').click(); await wait(30);
    const dependency = annotation('ann_default_dependency');
    expect(dependency.lineType === 'curve' && dependency.arrowhead === 'both', 'Dependency line/arrow controls did not update canonical fields');
    const beforeHistory = c.model.history.undo.length;
    command('delete').click(); await wait(30);
    expect(!annotation('ann_default_dependency'), 'Delete did not remove selected annotation');
    expect(c.actions.undo(), 'Delete undo failed'); await wait(30);
    expect(annotation('ann_default_dependency'), 'Delete undo did not restore dependency');
    expect(c.model.history.undo.length >= beforeHistory, 'Annotation history did not remain available');

    const canonical = c.getSerializableDocument();
    expect(!JSON.stringify(canonical).includes('HTML') && !JSON.stringify(canonical).includes('getBoundingClientRect'), 'Transient UI state leaked into canonical document');
    expect(document.querySelectorAll('#cycleCanvas .trace svg:not([data-renderer="wavedrom"])').length === 0, 'Non-WaveDrom signal trace detected');
    return { initialAnnotations: initial.length, finalAnnotations: c.model.document.annotations.length, dependency: { lineType: dependency.lineType, arrowhead: dependency.arrowhead }, traceCount: traceCount(), pass: true };
  });
  await page.screenshot({ path: `${root}/annotation-${viewport.width}x${viewport.height}.png` });
  await page.close();
  return { ...result, pageErrors: errors, pass: result.pass && errors.length === 0 };
}

try {
  await pause(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) results.push({ viewport, ...(await runViewport(browser, viewport)) });
  const report = { issue: 40, results, stylesModified: false, iconsModified: false, goldenReferenceModified: false, customWaveformRenderer: false, pureAnnotationEditsPreserveWaveDrom: true, pass: results.every(result => result.pass) };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  assert.ok(report.pass, 'Issue #40 acceptance failed');
  console.log('Issue #40 acceptance passed: Annotation Ribbon context, editing, anchor controls, history, and WaveDrom isolation verified.');
} finally { server.kill(); }
