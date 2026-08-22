import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/gui-phase3c';
fs.mkdirSync(root, { recursive: true });
execFileSync('node', ['scripts/phase3a-golden-manifest.mjs'], { stdio: 'inherit' });
execFileSync('git', ['diff', '--quiet', '4eaa0b6', '--', 'references/gui-replacement-pack'], { stdio: 'inherit' });
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('gui-mockup/styles.css')).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync('references/gui-replacement-pack/production/styles.css')).digest('hex'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('gui-mockup/icons.svg')).digest('hex'), crypto.createHash('sha256').update(fs.readFileSync('references/gui-replacement-pack/production/icons.svg')).digest('hex'));

const server = spawn('python', ['-m', 'http.server', '4183'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = { cases: {}, geometry: {}, validation: {}, staticTraceCount: 0, customTraceCount: 0, pass: false };
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4183/gui-mockup/', { waitUntil: 'networkidle' });
  assert.deepEqual(errors, [], errors.join('\n'));
  const model = () => page.evaluate(() => window.TimingChartProductionController.getState());
  const clickSignal = async id => { await page.locator(`.row[data-signal="${id}"]`).click(); await wait(30); };
  const input = (field, index = null) => page.locator(`#bottomContent [data-editor-field="${field}"]${index === null ? '' : `[data-editor-index="${index}"]`}`).first();
  const change = async (locator, value) => { await locator.fill(String(value)); await locator.dispatchEvent('change'); await wait(60); };
  const traceMarkup = () => page.evaluate(() => [...document.querySelectorAll('#cycleCanvas .trace svg')].map(svg => svg.outerHTML).join('|'));

  await page.screenshot({ path: `${root}/edit-waveform-before.png` });
  await clickSignal('req_valid');
  assert.equal((await model()).selection.id, 'req_valid');
  await change(input('start', 1), 4);
  let m = await model();
  assert.equal(m.document.signals.find(s => s.id === 'req_valid').values[1].start, 4);
  assert.equal(await input('start', 1).inputValue(), '4');
  assert.equal(await page.locator('#bottomContent tbody tr').nth(0).locator('td').nth(4).textContent(), '4');
  assert.equal(await page.locator('#bottomContent tbody tr').nth(0).locator('td').nth(5).textContent(), '4');
  result.cases.case1 = 'PASS';
  result.geometry.afterStartEdit = await page.evaluate(() => window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 4, edge: 'transition-center' }));
  await page.screenshot({ path: `${root}/binary-editor.png` });
  result.geometry.strict = await page.evaluate(() => ({
    rising: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 4, edge: 'rising' }) !== undefined,
    falling: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 7, edge: 'falling' }) !== undefined,
    wrongDirection: window.TimingChartProductionWaveform.getAnchor({ signal: 'req_valid', cycle: 7, edge: 'rising' }) === undefined
  }));
  assert.ok(result.geometry.strict.rising && result.geometry.strict.falling && result.geometry.strict.wrongDirection);

  const beforeValue = await traceMarkup();
  await change(input('value', 1), 0);
  m = await model();
  assert.equal(m.document.signals.find(s => s.id === 'req_valid').values.find(v => v.start === 4).value, 0);
  assert.notEqual(await traceMarkup(), beforeValue);
  result.cases.case2 = 'PASS';

  await page.locator('[data-editor-action="add"]').click(); await wait(60);
  m = await model();
  const req = m.document.signals.find(s => s.id === 'req_valid');
  assert.deepEqual(req.values.map(v => v.start), [...req.values.map(v => v.start)].sort((a, b) => a - b));
  assert.ok(req.values.some(v => v.start === 6));
  result.cases.case3 = 'PASS';
  await page.locator('[data-editor-action="delete"]').click(); await wait(60);
  assert.equal((await model()).document.signals.find(s => s.id === 'req_valid').values.length, 3);
  result.cases.case4 = 'PASS';

  await clickSignal('req_addr[7:0]');
  await change(input('value', 1), 'AB');
  m = await model();
  assert.equal(m.document.signals.find(s => s.id === 'req_addr[7:0]').values[1].value, 'AB');
  assert.match(await traceMarkup(), /AB/);
  await page.screenshot({ path: `${root}/bus-editor.png` });
  result.cases.case5 = 'PASS';

  await clickSignal('state[1:0]');
  await change(input('value', 1), 'REQUEST');
  m = await model();
  assert.equal(m.document.signals.find(s => s.id === 'state[1:0]').values[1].value, 'REQUEST');
  assert.match(await traceMarkup(), /REQUEST/);
  await page.screenshot({ path: `${root}/state-editor.png` });
  result.cases.case6 = 'PASS';

  await clickSignal('clk');
  const clockBefore = await traceMarkup();
  await change(page.locator('[data-clock-field="period"]'), 2);
  m = await model();
  assert.equal(m.document.signals.find(s => s.id === 'clk').period, 2);
  assert.notEqual(await traceMarkup(), clockBefore);
  await page.screenshot({ path: `${root}/clock-editor.png` });
  result.cases.case7 = 'PASS';

  await page.locator('.row[data-kind="comment"]').first().click(); await wait(60);
  await change(page.locator('[data-comment-field="title"]'), 'Address phase updated');
  assert.equal(await page.locator('.row[data-kind="comment"]').first().locator('.row-name').textContent(), 'Address phase updated');
  await change(page.locator('[data-comment-field="body"]'), 'Updated comment body');
  assert.equal(await page.locator('#cycleCanvas .wave-row').filter({ has: page.locator('.comment-body') }).first().locator('.comment-body').textContent(), 'Updated comment body');
  await page.screenshot({ path: `${root}/comment-editor.png` });
  result.cases.case8 = 'PASS';

  await clickSignal('req_valid');
  const beforeInvalid = await model();
  await change(input('start', 1), 0);
  m = await model();
  assert.equal(m.validation[0].code, 'duplicate-start');
  assert.deepEqual(m.document.signals.find(s => s.id === 'req_valid').values, beforeInvalid.document.signals.find(s => s.id === 'req_valid').values);
  result.validation.duplicateStart = m.validation[0];
  result.cases.case9 = 'PASS';

  await clickSignal('clk');
  await change(page.locator('[data-clock-field="duty"]'), 40);
  m = await model();
  assert.equal(m.validation[0].code, 'unsupported-duty');
  assert.equal(await page.locator('#cycleCanvas .trace svg').evaluateAll(svgs => svgs.filter(svg => svg.dataset.renderer !== 'wavedrom').length), 0);
  result.validation.duty = m.validation[0];
  result.cases.case10 = 'PASS';

  result.staticTraceCount = await page.locator('#cycleCanvas .trace [data-static-mock="true"]').count();
  result.customTraceCount = await page.locator('#cycleCanvas .trace svg:not([data-renderer="wavedrom"])').count();
  assert.equal(result.staticTraceCount, 0);
  assert.equal(result.customTraceCount, 0);
  await page.screenshot({ path: `${root}/edit-waveform-after.png` });
  result.pass = true;
  fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(result, null, 2));
  await browser.close();
  console.log('Phase 3C acceptance passed: model-driven binary/bus/state/clock/comment editors, WaveDrom rerender, validation, and strict geometry anchors.');
} finally { server.kill(); if (!result.pass) fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(result, null, 2)); }
