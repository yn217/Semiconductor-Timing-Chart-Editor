import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python', ['-m', 'http.server', '4268'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto('http://127.0.0.1:4268/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.annotationResolve));
  await page.locator('.ribbon-tabs .rtab').filter({ hasText: '注釈' }).click();
  await wait(30);

  const dependency = await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    c.actions.addDependency(
      { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } },
      { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: 0 } },
      { id: 'issue68_dependency', arrowhead: 'end' }
    );
    return c.model.selection.id;
  });
  await wait(40);
  const command = value => page.locator(`#ribbonAnnotation [data-annotation-command="${value}"]`);
  const overlay = () => page.locator(`#cycleCanvas svg[data-production-overlay="annotations"] [data-annotation-id="${dependency}"]`);
  const state = async () => page.evaluate(id => {
    const nodes = [...document.querySelectorAll(`#cycleCanvas svg[data-production-overlay="annotations"] [data-annotation-id="${CSS.escape(id)}"]`)].filter(node => node.dataset.annotationPart === 'geometry');
    return { type: window.TimingChartProductionController.model.document.annotations.find(item => item.id === id)?.type, lineType: window.TimingChartProductionController.model.document.annotations.find(item => item.id === id)?.lineType, arrowhead: window.TimingChartProductionController.model.document.annotations.find(item => item.id === id)?.arrowhead, nodes: nodes.length, pathD: nodes.map(node => node.getAttribute('d')), markerStart: nodes.filter(node => node.hasAttribute('marker-start')).length, markerEnd: nodes.filter(node => node.hasAttribute('marker-end')).length };
  }, dependency);

  assert.equal(await command('straight').isDisabled(), false);
  assert.equal((await state()).nodes, 1);
  await command('orthogonal').click(); await wait(25);
  const orthogonal = await state();
  assert.equal(orthogonal.lineType, 'orthogonal'); assert.equal(orthogonal.nodes, 3);
  await command('curve').click(); await wait(25);
  const curve = await state();
  assert.equal(curve.lineType, 'curve'); assert.equal(curve.nodes, 1); assert.match(curve.pathD[0], / C /);
  assert.equal(await command('diagonal').isDisabled(), true);
  const beforeDiagonal = await state(); await page.evaluate(() => document.querySelector('#ribbonAnnotation [data-annotation-command="diagonal"]')?.click()); const afterDiagonal = await state();
  assert.deepEqual(afterDiagonal, beforeDiagonal);

  await command('arrow-start').click(); await wait(25);
  const startArrow = await state(); assert.equal(startArrow.arrowhead, 'start'); assert.equal(startArrow.markerStart, 1); assert.equal(startArrow.markerEnd, 0);
  await command('arrow-both').click(); await wait(25);
  const bothArrow = await state(); assert.equal(bothArrow.arrowhead, 'both'); assert.equal(bothArrow.markerStart, 1); assert.equal(bothArrow.markerEnd, 1);

  const markerId = await page.evaluate(() => { const c = window.TimingChartProductionController; c.actions.addAnnotation('marker', { id: 'issue68_marker', anchor: { signal: 'req_valid', cycle: 2, point: 'rising', offset: { x: 0, y: 0 } } }); return c.model.selection.id; });
  await wait(30);
  assert.equal(await command('straight').isDisabled(), true);
  assert.equal(await command('arrow-start').isDisabled(), true);
  const markerBefore = await page.evaluate(id => JSON.stringify(window.TimingChartProductionController.model.document.annotations.find(item => item.id === id)), markerId);
  await page.evaluate(() => document.querySelector('#ribbonAnnotation [data-annotation-command="arrow-start"]')?.click());
  assert.equal(await page.evaluate(id => JSON.stringify(window.TimingChartProductionController.model.document.annotations.find(item => item.id === id)), markerId), markerBefore);

  const rangeId = await page.evaluate(() => { const c = window.TimingChartProductionController; c.actions.addAnnotation('range', { id: 'issue68_range', start: { signal: 'req_valid', cycle: 2, point: 'cycle-boundary', offset: { x: 0, y: 0 } }, end: { signal: 'req_valid', cycle: 7, point: 'cycle-boundary', offset: { x: 0, y: 0 } } }); return c.model.selection.id; });
  await wait(30);
  assert.equal(await command('arrow-both').isDisabled(), false);
  await command('arrow-both').click(); await wait(25);
  const rangeState = await page.evaluate(id => {
    const annotation = window.TimingChartProductionController.model.document.annotations.find(item => item.id === id);
    const nodes = [...document.querySelectorAll(`#cycleCanvas svg[data-production-overlay="annotations"] [data-annotation-id="${CSS.escape(id)}"]`)].filter(node => node.dataset.annotationPart === 'geometry');
    return { arrowhead: annotation.arrowhead, markerStart: nodes.filter(node => node.hasAttribute('marker-start')).length, markerEnd: nodes.filter(node => node.hasAttribute('marker-end')).length };
  }, rangeId);
  assert.deepEqual(rangeState, { arrowhead: 'both', markerStart: 1, markerEnd: 1 });
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: 'artifacts/issue68/issue68-1672x941.png' });
  await browser.close();
  console.log('Issue #68 acceptance passed: type-aware routes/arrows, Arrow Start, Range arrows, and disabled Diagonal/non-applicable controls.');
} finally { server.kill(); }
