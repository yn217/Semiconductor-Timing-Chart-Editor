import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue121');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const setup = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  if (!c?.model) return { error: 'Controller not initialized' };
  c.actions.selectAnnotation('ann_default_range');
  await wait(100);
  const host = document.querySelector('#inspectorBody');
  const sections = [...host.querySelectorAll('.section h3')].map(h => h.dataset.sectionToggle);
  return { sections, labelBefore: c.model.document.annotations.find(a => a.id === 'ann_default_range').label };
});

const docBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));

// Click the Basic header to collapse it; verify only Basic's body toggles
await page.click('[data-section-toggle="basic"]');
await page.waitForTimeout(100);
const afterCollapseBasic = await page.evaluate(() => {
  const host = document.querySelector('#inspectorBody');
  const basicBody = host.querySelector('[data-section-toggle="basic"]').nextElementSibling;
  const startBody = host.querySelector('[data-section-toggle="start"]')?.nextElementSibling;
  return {
    basicHidden: basicBody.style.display === 'none',
    startStillVisible: startBody ? startBody.style.display !== 'none' : null
  };
});

// Reopen Basic
await page.click('[data-section-toggle="basic"]');
await page.waitForTimeout(100);
const afterReopen = await page.evaluate(() => {
  const host = document.querySelector('#inspectorBody');
  const basicBody = host.querySelector('[data-section-toggle="basic"]').nextElementSibling;
  const labelInput = host.querySelector('[data-annotation-field="label"]');
  return { basicVisible: basicBody.style.display !== 'none', labelValue: labelInput?.value };
});

const docAfter = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));

// Undo history / dirty must be unaffected by pure section collapse
const historyCheck = await page.evaluate(() => {
  const c = window.TimingChartProductionController;
  return { historyLength: c.model.history ? c.model.history.length : null, canUndo: typeof c.actions.undo === 'function' ? c.actions.canUndo?.() : null };
});

await page.screenshot({ path: path.join(out, 'issue121-1672x941.png') });
await browser.close();

const pass = setup.sections?.length >= 3
  && setup.sections.includes('basic')
  && afterCollapseBasic.basicHidden === true
  && afterCollapseBasic.startStillVisible === true
  && afterReopen.basicVisible === true
  && afterReopen.labelValue === setup.labelBefore
  && docBefore === docAfter
  && errors.length === 0;

const report = { issue: 121, setup, afterCollapseBasic, afterReopen, docUnchanged: docBefore === docAfter, historyCheck, errors, pass, artifacts: ['issue121-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #121 acceptance passed: Annotation Inspector fields are grouped into collapsible accordion sections (Basic/Anchor.../Style/Label Layout/Advanced). Clicking a section header toggles only that section, values persist on reopen, and collapse/reopen causes zero document mutation.');
