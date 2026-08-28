import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue122');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function runAtWidth(width) {
  const page = await browser.newPage({ viewport: { width, height: 941 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(`${width}px: ${error.message}`));
  await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
  await page.waitForTimeout(500);

  const setup = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    let attempts = 0;
    while (!c?.model && attempts < 50) { await wait(50); attempts++; }
    if (!c?.model) return { error: 'Controller not initialized' };
    c.actions.selectAnnotation('ann_default_range');
    await wait(80);
    return { selectedBefore: c.model.selection?.id };
  });

  const docBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
  const centerRectBefore = await page.evaluate(() => {
    const r = document.querySelector('.center').getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  });
  const leftPanelRectBefore = await page.evaluate(() => document.querySelector('.left-panel').getBoundingClientRect());

  // Collapse via the panel-head restore/collapse control (⋯ button)
  await page.click('.inspector .panel-head span:nth-child(2)');
  await page.waitForTimeout(150);

  const afterCollapse = await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    const inspector = document.querySelector('.inspector');
    const inspectorBody = document.querySelector('.inspector-body');
    const inspectorRect = inspector.getBoundingClientRect();
    const center = document.querySelector('.center').getBoundingClientRect();
    const restoreControl = document.querySelector('.inspector .panel-head span:nth-child(2)');
    const restoreRect = restoreControl?.getBoundingClientRect();
    return {
      collapsedAttr: inspector.dataset.inspectorCollapsed,
      bodyHidden: getComputedStyle(inspectorBody).display === 'none',
      inspectorWidth: inspectorRect.width,
      centerWidth: center.width,
      centerLeft: center.left,
      restoreControlVisible: !!(restoreRect && restoreRect.width > 0 && restoreRect.height > 0),
      selectedDuring: c.model.selection?.id
    };
  });

  const leftPanelRectAfter = await page.evaluate(() => document.querySelector('.left-panel').getBoundingClientRect());

  // Restore via the same control
  await page.click('.inspector .panel-head span:nth-child(2)');
  await page.waitForTimeout(150);

  const afterRestore = await page.evaluate(() => {
    const c = window.TimingChartProductionController;
    const inspector = document.querySelector('.inspector');
    const inspectorBody = document.querySelector('.inspector-body');
    return {
      collapsedAttr: inspector.dataset.inspectorCollapsed,
      bodyVisible: getComputedStyle(inspectorBody).display !== 'none',
      selectedAfter: c.model.selection?.id
    };
  });

  const docAfter = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
  const centerRectAfter = await page.evaluate(() => {
    const r = document.querySelector('.center').getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  });

  await page.screenshot({ path: path.join(out, `issue122-${width}px.png`) });
  await page.close();

  return {
    width, setup, docBefore, centerRectBefore, leftPanelRectBefore,
    afterCollapse, leftPanelRectAfter, afterRestore, docAfter, centerRectAfter
  };
}

const wide = await runAtWidth(1672);
const narrow = await runAtWidth(1280);
await browser.close();

function evalRun(r) {
  const centerExpanded = r.afterCollapse.centerWidth > r.centerRectBefore.width;
  const centerNoOverlapLeft = r.afterCollapse.centerLeft >= r.leftPanelRectAfter.right - 1;
  const inspectorShrunk = r.afterCollapse.inspectorWidth < 100;
  const selectionPreservedDuring = r.afterCollapse.selectedDuring === r.setup.selectedBefore;
  const selectionPreservedAfter = r.afterRestore.selectedAfter === r.setup.selectedBefore;
  const docIdentical = r.docBefore === r.docAfter;
  const collapsedOnce = r.afterCollapse.collapsedAttr === 'true' && r.afterCollapse.bodyHidden === true;
  const restoredOnce = r.afterRestore.collapsedAttr === 'false' && r.afterRestore.bodyVisible === true;
  const restoreControlVisible = r.afterCollapse.restoreControlVisible === true;
  return {
    width: r.width, centerExpanded, centerNoOverlapLeft, inspectorShrunk,
    selectionPreservedDuring, selectionPreservedAfter, docIdentical,
    collapsedOnce, restoredOnce, restoreControlVisible,
    pass: centerExpanded && centerNoOverlapLeft && inspectorShrunk && selectionPreservedDuring && selectionPreservedAfter && docIdentical && collapsedOnce && restoredOnce && restoreControlVisible
  };
}

const wideEval = evalRun(wide);
const narrowEval = evalRun(narrow);

const pass = wideEval.pass === true && narrowEval.pass === true && errors.length === 0;

const report = { issue: 122, wideEval, narrowEval, errors, pass, artifacts: ['issue122-1672px.png', 'issue122-1280px.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #122 acceptance passed at 1672px and 1280px: the right Inspector pane collapses to a narrow strip with a visible restore control, the Center waveform area gains the freed width without overlapping the Left panel, current selection survives collapse/restore, and .tcd serialization is byte-identical before/after.');
