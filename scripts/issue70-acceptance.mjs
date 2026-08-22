import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue70';
fs.mkdirSync(root, { recursive: true });
const ribbonSource = fs.readFileSync('gui-mockup/annotation-ribbon.js', 'utf8');
assert.ok(!ribbonSource.includes('localRun'), 'Annotation Ribbon still has a private mutation runner');
assert.ok(!ribbonSource.includes('history.undo.push'), 'Annotation Ribbon owns a manual history stack');

const server = spawn('python', ['-m', 'http.server', '4242'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await pause(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4242/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartAnnotationRibbon && window.TimingChartProductionController));
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const command = id => document.querySelector(`#ribbonAnnotation [data-annotation-command="${id}"]`);
    const annotation = id => c.model.document.annotations.find(item => item.id === id);
    const canonical = () => JSON.stringify(c.getSerializableDocument());
    const tab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(node => node.textContent.trim() === '注釈');
    tab.click(); await wait(25);

    c.actions.addAnnotation('marker', { id: 'issue70_marker', label: 'Marker' }); await wait(25);
    if (!command('straight').disabled || !command('end-anchor').disabled || command('start-anchor').disabled) throw new Error('Marker type applicability is incorrect');
    command('start-anchor').click();
    if (document.querySelector('#cycleCanvas')?.dataset.annotationAnchorPick !== 'anchor') throw new Error('Start anchor selection did not enter pick mode');
    c.actions.cancelAnnotationAnchorSelection();

    const beforeInvalid = canonical(); const beforeHistory = c.model.history.undo.length; const beforeDirty = c.persistence?.dirty;
    if (c.actions.updateAnnotationAnchor('issue70_marker', 'anchor', 'cycle', -1) !== false) throw new Error('Invalid anchor mutation was accepted');
    if (canonical() !== beforeInvalid || c.model.history.undo.length !== beforeHistory || c.persistence?.dirty !== beforeDirty) throw new Error('Invalid annotation mutation was not atomic');

    command('color').click();
    const picker = document.querySelector('[data-annotation-color-picker]');
    if (!picker) throw new Error('Color control is not selectable');
    const beforeColor = annotation('issue70_marker').color;
    picker.value = '#e39a25'; picker.dispatchEvent(new Event('input', { bubbles: true })); picker.dispatchEvent(new Event('change', { bubbles: true })); await wait(25);
    if (annotation('issue70_marker').color !== '#e39a25' || beforeColor === annotation('issue70_marker').color) throw new Error(`Color selection did not update canonical annotation: before=${beforeColor} after=${annotation('issue70_marker').color} picker=${picker.value} selection=${JSON.stringify(c.model.selection)} parent=${picker.parentElement?.dataset.annotationCommand}`);
    if (!c.actions.undo() || annotation('issue70_marker').color !== beforeColor) throw new Error('Color undo failed');
    if (!c.actions.redo() || annotation('issue70_marker').color !== '#e39a25') throw new Error('Color redo failed');

    c.actions.addDependency({ signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } }, { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: 0 } }, { id: 'issue70_dependency' }); await wait(25);
    if (command('diagonal').disabled || command('start-anchor').disabled || command('end-anchor').disabled) throw new Error('Dependency controls are not enabled');
    command('diagonal').click(); await wait(20);
    if (annotation('issue70_dependency').lineType !== 'diagonal') throw new Error('Diagonal route did not update canonical annotation');
    command('start-anchor').click(); if (document.querySelector('#cycleCanvas')?.dataset.annotationAnchorPick !== 'from') throw new Error('Dependency start did not select from anchor'); c.actions.cancelAnnotationAnchorSelection();
    command('end-anchor').click(); if (document.querySelector('#cycleCanvas')?.dataset.annotationAnchorPick !== 'to') throw new Error('Dependency end did not select to anchor'); c.actions.cancelAnnotationAnchorSelection();
    const saved = c.prepareSaveText().text; await c.actions.openText(saved, { fileName: 'issue70-roundtrip.tcd', unsavedDecision: 'discard' }); await wait(25);
    if (annotation('issue70_dependency').lineType !== 'diagonal' || annotation('issue70_marker').color !== '#e39a25') throw new Error('Annotation Ribbon properties did not round-trip through Save/Open');
    return { invalidRollback: true, selectableColor: true, typeAwareControls: true, anchorPick: true, undoRedo: true, saveOpen: true, pass: true };
  });
  await page.screenshot({ path: `${root}/issue70-1672x941.png` });
  await browser.close();
  const report = { issue: 70, sourceContract: true, ...result, pass: result.pass };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.pass, 'Issue #70 acceptance failed');
  console.log('Issue #70 acceptance passed: Annotation Ribbon uses shared actions, atomic rollback, type-aware controls, real color selection, anchors, and persistence.');
} finally { server.kill(); }
