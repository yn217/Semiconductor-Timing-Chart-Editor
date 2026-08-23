import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python', ['-m', 'http.server', '4269'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto('http://127.0.0.1:4269/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.annotationResolve));
  await page.locator('.ribbon-tabs .rtab').filter({ hasText: '注釈' }).click();
  const ids = await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    c.actions.addDependency({ signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } }, { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: 0 } }, { id: 'issue69_dependency', label: 'Style label' });
    c.actions.addAnnotation('callout', { id: 'issue69_callout', label: 'Callout', anchor: { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } } });
    c.actions.selectAnnotation('issue69_dependency');
    return { dependency: 'issue69_dependency', callout: 'issue69_callout', marker: 'ann_default_marker', waveBaseline: c.renderMetrics.waveDromRenders };
  });
  await wait(30);
  const styleInput = field => page.locator(`#ribbonAnnotation [data-annotation-style-field="${field}"]`);
  const annotationInput = field => page.locator(`#ribbonAnnotation [data-annotation-field="${field}"]`);
  const command = value => page.locator(`#ribbonAnnotation [data-annotation-command="${value}"]`);
  const setField = async (locator, value) => { await locator.fill(String(value)); await locator.blur(); };
  const select = async id => { await page.evaluate(annotationId => window.TimingChartProductionController.actions.selectAnnotation(annotationId), id); await wait(20); };

  await select(ids.marker);
  assert.equal(await command('width').isDisabled(), true);
  assert.equal(await command('fill').isDisabled(), true);
  assert.equal(await page.evaluate(annotationId => window.TimingChartProductionController.actions.updateAnnotation(annotationId, 'style.fillColor', '#22aa44'), ids.marker), false);

  await select(ids.dependency);
  assert.equal(await command('width').isEnabled(), true);
  assert.equal(await command('fill').isDisabled(), true);
  await setField(styleInput('strokeWidth'), 3);
  await styleInput('lineStyle').selectOption('dash');
  await setField(styleInput('strokeOpacity'), 0.5);
  const picker = page.locator('[data-annotation-color-picker]');
  await picker.evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, '#e39a25');
  assert.equal(await page.locator(`#cycleCanvas [data-annotation-id="${ids.dependency}"][data-annotation-part="geometry"]`).getAttribute('stroke'), '#e39a25');
  await picker.evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, '#2f6fed');
  await setField(styleInput('text.fontFamily'), 'Courier New');
  await setField(styleInput('text.fontSize'), 16);
  await setField(styleInput('text.maxWidth'), 70);
  await setField(styleInput('text.lineHeight'), 1.5);
  await command('bold').click(); await command('italic').click(); await command('underline').click(); await command('strikethrough').click(); await command('label-right').click(); await command('wrap').click();
  await setField(annotationInput('labelOffset.x'), 12); await setField(annotationInput('labelOffset.y'), -10);
  await command('placement-start').click();
  await command('multiline').click();
  const editor = page.locator('[data-annotation-label-editor]');
  assert.equal(await editor.getAttribute('role'), 'dialog');
  await editor.locator('[data-annotation-label-text]').fill('first line\nsecond line\nthird line with wrapping words');
  await editor.locator('[data-annotation-label-apply]').click();
  await wait(30);

  const startX = Number(await page.locator(`#cycleCanvas text[data-annotation-id="${ids.dependency}"]`).getAttribute('x'));
  await command('placement-end').click(); await wait(20);
  const endX = Number(await page.locator(`#cycleCanvas text[data-annotation-id="${ids.dependency}"]`).getAttribute('x'));
  assert.ok(endX > startX + 50, `${startX} -> ${endX}`);
  for (const placement of ['center', 'above', 'below', 'end']) { await command(`placement-${placement}`).click(); assert.equal(await page.evaluate(annotationId => window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).labelPlacement, ids.dependency), placement); }

  const dependencyState = await page.evaluate(annotationId => {
    const c = window.TimingChartProductionController; const annotation = c.model.document.annotations.find(item => item.id === annotationId); const geometry = document.querySelector(`#cycleCanvas [data-annotation-id="${CSS.escape(annotationId)}"][data-annotation-part="geometry"]`); const text = document.querySelector(`#cycleCanvas text[data-annotation-id="${CSS.escape(annotationId)}"]`); return { annotation: structuredClone(annotation), line: geometry ? { stroke: geometry.getAttribute('stroke'), width: geometry.getAttribute('stroke-width'), dash: geometry.getAttribute('stroke-dasharray'), opacity: geometry.getAttribute('stroke-opacity') } : null, text: text ? { family: text.getAttribute('font-family'), size: text.getAttribute('font-size'), weight: text.getAttribute('font-weight'), fontStyle: text.getAttribute('font-style'), decoration: text.getAttribute('text-decoration'), anchor: text.getAttribute('text-anchor'), lineCount: text.querySelectorAll('tspan').length, secondLineDy: text.querySelectorAll('tspan')[1]?.getAttribute('dy') } : null, ribbon: { width: document.querySelector('[data-annotation-style-field="strokeWidth"]')?.value, alignRight: document.querySelector('[data-annotation-command="label-right"]')?.getAttribute('aria-pressed'), wrap: document.querySelector('[data-annotation-command="wrap"]')?.getAttribute('aria-pressed'), placementEnd: document.querySelector('[data-annotation-command="placement-end"]')?.getAttribute('aria-pressed') } };
  }, ids.dependency);
  assert.deepEqual({ stroke: dependencyState.line.stroke, width: dependencyState.line.width, dash: dependencyState.line.dash, opacity: dependencyState.line.opacity }, { stroke: '#2f6fed', width: '3', dash: '6 4', opacity: '0.5' });
  assert.deepEqual({ family: dependencyState.text.family, size: dependencyState.text.size, weight: dependencyState.text.weight, fontStyle: dependencyState.text.fontStyle, anchor: dependencyState.text.anchor }, { family: 'Courier New', size: '16', weight: '700', fontStyle: 'italic', anchor: 'end' });
  assert.match(dependencyState.text.decoration, /underline/); assert.match(dependencyState.text.decoration, /line-through/); assert.ok(dependencyState.text.lineCount >= 3); assert.equal(dependencyState.text.secondLineDy, '24');
  assert.equal(dependencyState.annotation.labelOffset.x, 12); assert.equal(dependencyState.annotation.labelOffset.y, -10); assert.equal(dependencyState.ribbon.width, '3'); assert.equal(dependencyState.ribbon.alignRight, 'true'); assert.equal(dependencyState.ribbon.wrap, 'true'); assert.equal(dependencyState.ribbon.placementEnd, 'true');

  await select(ids.callout);
  assert.equal(await command('width').isEnabled(), true); assert.equal(await command('fill').isEnabled(), true);
  await setField(styleInput('strokeWidth'), 2); await setField(styleInput('fillColor'), '#22aa44'); await setField(styleInput('fillOpacity'), 0.4); await wait(20);
  const callout = await page.evaluate(annotationId => { const annotation = window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId); const rect = document.querySelector(`#cycleCanvas rect[data-annotation-id="${CSS.escape(annotationId)}"]`); return { style: structuredClone(annotation.style), rect: rect ? { fill: rect.getAttribute('fill'), opacity: rect.getAttribute('fill-opacity') } : null }; }, ids.callout);
  assert.equal(callout.style.fillColor, '#22aa44'); assert.equal(callout.style.fillOpacity, 0.4); assert.equal(callout.rect.fill, '#22aa44'); assert.equal(callout.rect.opacity, '0.4');

  await select(ids.dependency);
  const invalidRanges = await page.evaluate(annotationId => { const c = window.TimingChartProductionController; return [c.actions.updateAnnotation(annotationId, 'style.strokeOpacity', 1.1), c.actions.updateAnnotation(annotationId, 'style.text.lineHeight', 0.09), c.actions.updateAnnotation(annotationId, 'style.strokeColor', 'red')]; }, ids.dependency);
  assert.deepEqual(invalidRanges, [false, false, false]);
  const historyMatrix = await page.evaluate(({ dependency, callout }) => {
    const c = window.TimingChartProductionController;
    const get = id => structuredClone(c.model.document.annotations.find(item => item.id === id));
    const valueAt = (id, field) => field.split('.').reduce((value, key) => value?.[key], get(id));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const results = [];
    const check = (id, field, value) => {
      const before = valueAt(id, field); const undoBefore = c.model.history.undo.length;
      const changed = c.actions.updateAnnotation(id, field, value); const after = valueAt(id, field);
      const oneEntry = c.model.history.undo.length === undoBefore + 1;
      const undo = c.actions.undo(); const undoRestored = same(valueAt(id, field), before);
      const redo = c.actions.redo(); const redoRestored = same(valueAt(id, field), after);
      c.actions.undo();
      results.push({ field, changed, oneEntry, undo, undoRestored, redo, redoRestored, finalRestored: same(valueAt(id, field), before) });
    };
    [
      ['style.strokeColor', '#8844cc'], ['style.strokeWidth', 4], ['style.lineStyle', 'dot'], ['style.strokeOpacity', 0.75],
      ['style.text.color', '#114488'], ['style.text.fontFamily', 'Arial'], ['style.text.fontSize', 18], ['style.text.bold', false],
      ['style.text.italic', false], ['style.text.underline', false], ['style.text.strikethrough', false], ['style.text.align', 'left'],
      ['style.text.wrap', false], ['style.text.maxWidth', 90], ['style.text.lineHeight', 0.1], ['labelPlacement', 'start'],
      ['labelOffset.x', 15], ['labelOffset.y', -14], ['visible', false], ['zOrder', 37], ['locked', true]
    ].forEach(([field, value]) => check(dependency, field, value));
    [['style.fillColor', '#aa22cc'], ['style.fillOpacity', 0.65]].forEach(([field, value]) => check(callout, field, value));
    return results;
  }, ids);
  assert.equal(historyMatrix.length, 23);
  assert.deepEqual(historyMatrix.filter(item => !item.changed || !item.oneEntry || !item.undo || !item.undoRestored || !item.redo || !item.redoRestored || !item.finalRestored), []);
  const historyBefore = await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length);
  await setField(styleInput('strokeWidth'), 4);
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.history.undo.length), historyBefore + 1);
  await command('front').click(); const front = await page.evaluate(annotationId => window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).zOrder, ids.dependency); await command('back').click(); const back = await page.evaluate(annotationId => window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).zOrder, ids.dependency); assert.ok(front > back);

  await command('lock').click(); await wait(20);
  const beforeLockedOffset = await page.evaluate(annotationId => structuredClone(window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).labelOffset), ids.dependency);
  const lockedResult = await page.evaluate(annotationId => { const c = window.TimingChartProductionController; const annotation = c.model.document.annotations.find(item => item.id === annotationId); return { locked: annotation.locked, style: c.actions.updateAnnotation(annotationId, 'style.strokeWidth', 5), anchor: c.actions.updateAnnotationAnchor(annotationId, 'from', 'cycle', 4), picker: c.actions.beginAnnotationAnchorSelection('start') }; }, ids.dependency);
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  assert.deepEqual(lockedResult, { locked: true, style: false, anchor: false, picker: false });
  assert.equal(await command('lock').isEnabled(), true); assert.equal(await command('width').isDisabled(), true);
  assert.deepEqual(await page.evaluate(annotationId => window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).labelOffset, ids.dependency), beforeLockedOffset);
  const lockedPointerDrag = await page.evaluate(annotationId => {
    const c = window.TimingChartProductionController; const before = structuredClone(c.model.document.annotations.find(item => item.id === annotationId)); const target = document.querySelector(`#cycleCanvas text[data-annotation-id="${CSS.escape(annotationId)}"]`); const rect = target.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: rect.x, clientY: rect.y }));
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: rect.x + 20, clientY: rect.y + 15 }));
    return JSON.stringify(before) === JSON.stringify(c.model.document.annotations.find(item => item.id === annotationId));
  }, ids.dependency);
  assert.equal(lockedPointerDrag, true);
  assert.equal(await page.locator('#ribbonAnnotation [data-annotation-command="visible"]').count(), 1);

  const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
  const savedAnnotation = JSON.parse(saved).annotations.find(item => item.id === ids.dependency);
  const savedCallout = JSON.parse(saved).annotations.find(item => item.id === ids.callout);
  assert.equal(savedAnnotation.style.strokeColor, '#2f6fed'); assert.equal(savedAnnotation.style.strokeWidth, 4); assert.equal(savedAnnotation.style.text.fontFamily, 'Courier New'); assert.equal(savedAnnotation.style.text.bold, true); assert.equal(savedAnnotation.labelPlacement, 'end'); assert.equal(savedAnnotation.locked, true); assert.equal(savedAnnotation.label.split('\n').length, 3);
  assert.equal(savedCallout.style.fillColor, '#22aa44'); assert.equal(savedCallout.style.fillOpacity, 0.4);
  assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue69-roundtrip.tcd', unsavedDecision: 'discard' }), saved), true); await wait(35);
  await select(ids.dependency);
  const roundTrip = await page.evaluate(({ dependency, callout }) => { const c = window.TimingChartProductionController; const annotation = c.model.document.annotations.find(item => item.id === dependency); const calloutAnnotation = c.model.document.annotations.find(item => item.id === callout); return { annotation: structuredClone(annotation), callout: structuredClone(calloutAnnotation), ribbon: { width: document.querySelector('[data-annotation-style-field="strokeWidth"]')?.value, widthDisabled: document.querySelector('[data-annotation-style-field="strokeWidth"]')?.disabled, locked: document.querySelector('[data-annotation-command="lock"]')?.getAttribute('aria-pressed') }, waveDromRenders: c.renderMetrics.waveDromRenders }; }, ids);
  assert.equal(roundTrip.annotation.style.strokeColor, '#2f6fed'); assert.equal(roundTrip.annotation.style.strokeWidth, 4); assert.equal(roundTrip.annotation.style.text.fontSize, 16); assert.equal(roundTrip.annotation.labelOffset.x, 12); assert.equal(roundTrip.annotation.locked, true); assert.equal(roundTrip.waveDromRenders, ids.waveBaseline);
  assert.equal(roundTrip.callout.style.fillColor, '#22aa44'); assert.equal(roundTrip.callout.style.fillOpacity, 0.4); assert.deepEqual(roundTrip.ribbon, { width: '4', widthDisabled: true, locked: 'true' });
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: 'artifacts/issue69/issue69-1672x941.png' });
  const report = { issue: 69, controls: { twoColors: true, stroke: true, fill: true, typography: true, multiline: true, wrap: true, labelOffset: true, placement: true, zOrder: true, lock: true, visibilityCommandCount: 1 }, typeAware: true, saveOpen: { dependencyStyle: true, calloutFill: true }, undoRedo: { propertiesChecked: historyMatrix.map(item => item.field), singleHistoryEntry: true }, lockBlocks: ['style', 'anchor', 'picker', 'keyboard', 'pointerDrag'], waveDromRegenerationDelta: roundTrip.waveDromRenders - ids.waveBaseline, pageErrors: errors, pass: true };
  await fs.writeFile('artifacts/issue69/acceptance.json', `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #69 acceptance passed: canonical style/text/object controls, type applicability, multiline editing, lock, history, renderer, and persistence.');
} finally { server.kill(); }
