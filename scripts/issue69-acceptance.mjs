import assert from 'node:assert/strict';
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
  const id = await page.evaluate(() => { const c = window.TimingChartProductionController; c.actions.addDependency({ signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } }, { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: 0 } }, { id: 'issue69_dependency', label: 'Style label' }); return c.model.selection.id; });
  await wait(30);
  const styleInput = field => page.locator(`#ribbonAnnotation input[data-annotation-style-field="${field}"]`);
  const command = value => page.locator(`#ribbonAnnotation [data-annotation-command="${value}"]`);
  const line = () => page.locator(`#cycleCanvas svg[data-production-overlay="annotations"] [data-annotation-id="${id}"][data-annotation-part="geometry"]`).first();
  await styleInput('strokeWidth').fill('3'); await styleInput('strokeWidth').blur();
  await styleInput('lineStyle').fill('dash'); await styleInput('lineStyle').blur();
  await styleInput('strokeOpacity').fill('0.5'); await styleInput('strokeOpacity').blur();
  const picker = page.locator('[data-annotation-color-picker]'); await picker.evaluate(node => { node.value = '#e39a25'; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); });
  await styleInput('text.fontSize').fill('16'); await styleInput('text.fontSize').blur();
  await command('bold').click(); await command('placement-above').click(); await wait(40);
  const afterStyle = await page.evaluate(annotationId => {
    const c = window.TimingChartProductionController; const annotation = c.model.document.annotations.find(item => item.id === annotationId); const node = document.querySelector(`#cycleCanvas svg[data-production-overlay="annotations"] [data-annotation-id="${CSS.escape(annotationId)}"][data-annotation-part="geometry"]`); const text = document.querySelector(`#cycleCanvas svg[data-production-overlay="annotations"] text[data-annotation-id="${CSS.escape(annotationId)}"]`); return { style: structuredClone(annotation.style), legacyColor: annotation.color, line: node ? { width: node.getAttribute('stroke-width'), dash: node.getAttribute('stroke-dasharray'), opacity: node.getAttribute('stroke-opacity') } : null, label: text ? { fill: text.getAttribute('fill'), fontSize: text.getAttribute('font-size'), weight: text.getAttribute('font-weight'), y: text.getAttribute('y') } : null, placement: annotation.labelPlacement };
  }, id);
  assert.equal(afterStyle.style.strokeWidth, 3); assert.equal(afterStyle.style.lineStyle, 'dash'); assert.equal(afterStyle.style.strokeOpacity, 0.5); assert.equal(afterStyle.style.strokeColor, '#e39a25'); assert.equal(afterStyle.legacyColor, '#e39a25'); assert.equal(afterStyle.line.width, '3'); assert.equal(afterStyle.line.dash, '6 4'); assert.equal(afterStyle.line.opacity, '0.5'); assert.equal(afterStyle.style.text.fontSize, 16); assert.equal(afterStyle.style.text.bold, true); assert.equal(afterStyle.placement, 'above');
  const beforeLock = JSON.stringify(afterStyle.style);
  await command('lock').click(); await wait(20);
  const lockedResult = await page.evaluate(annotationId => { const c = window.TimingChartProductionController; return { locked: c.model.document.annotations.find(item => item.id === annotationId).locked, changed: c.actions.updateAnnotation(annotationId, 'style.strokeWidth', 5) }; }, id);
  assert.equal(lockedResult.locked, true); assert.equal(lockedResult.changed, false); assert.equal(JSON.stringify(await page.evaluate(annotationId => window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).style, id)), beforeLock);
  await command('lock').click();
  const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
  assert.equal(await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue69-roundtrip.tcd', unsavedDecision: 'discard' }), saved), true); await wait(35);
  const roundTrip = await page.evaluate(annotationId => window.TimingChartProductionController.model.document.annotations.find(item => item.id === annotationId).style, id);
  assert.equal(roundTrip.strokeColor, '#e39a25'); assert.equal(roundTrip.strokeWidth, 3); assert.equal(roundTrip.text.fontSize, 16);
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.screenshot({ path: 'artifacts/issue69/issue69-1672x941.png' });
  await browser.close();
  console.log('Issue #69 acceptance passed: canonical annotation style, typography, placement, lock, renderer output, and Save/Open persistence.');
} finally { server.kill(); }
