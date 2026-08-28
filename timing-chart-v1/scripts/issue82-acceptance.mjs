import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue82');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const geometry = () => page.evaluate(() => {
  const center = document.querySelector('.center');
  const names = ['#cycleCanvas', '#transactionCanvas', '.bottom'];
  const rect = element => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }; };
  const elements = Object.fromEntries(names.map(name => [name, rect(document.querySelector(name))]));
  const centerRect = rect(center);
  const ordered = [elements['#cycleCanvas'], elements['#transactionCanvas'], elements['.bottom']].filter(box => box && box.height > 0);
  const inside = ordered.every(box => box.top >= centerRect.top - 0.5 && box.bottom <= centerRect.bottom + 0.5 && box.left >= centerRect.left - 0.5 && box.right <= centerRect.right + 0.5);
  const nonOverlap = ordered.every((box, index) => index === 0 || box.top >= ordered[index - 1].bottom - 0.5);
  return { mode: center.dataset.viewMode, contract: center.dataset.layoutContract, gridRows: getComputedStyle(center).gridTemplateRows.split(' ').filter(Boolean), center: centerRect, elements, inside, nonOverlap };
});
const clickMode = async mode => { await page.locator(`.seg[data-mode="${mode}"]`).click(); await page.waitForTimeout(80); return geometry(); };

const beforeDocument = await page.evaluate(() => ({ text: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), history: window.TimingChartProductionController.model.history.undo.length }));
const cycle = await clickMode('cycle');
const transaction = await clickMode('transaction');
const split = await clickMode('split');
const splitInitialHeight = split.elements['.bottom'].height;
const tabBefore = await page.evaluate(() => window.TimingChartProductionController.model.view.tab);
await page.locator('#bottomTabs [data-tab="annotation"]').click();
await page.waitForTimeout(30);
const splitAnnotation = await page.evaluate(() => ({ modelTab: window.TimingChartProductionController.model.view.tab, active: document.querySelector('#bottomTabs [data-tab="annotation"]')?.classList.contains('active'), rendered: document.querySelector('#bottomContent')?.dataset.renderedTab }));

const bottomRect = await page.locator('.bottom').boundingBox();
const centerRect = await page.locator('.center').boundingBox();
await page.mouse.move(centerRect.x + 220, bottomRect.y + 3);
await page.mouse.down();
await page.mouse.move(centerRect.x + 220, bottomRect.y - 35);
await page.mouse.up();
await page.waitForTimeout(80);
const splitAfterResize = await geometry();

const splitRoundTrip = await clickMode('cycle');
const splitAgain = await clickMode('split');
const afterDocument = await page.evaluate(() => ({ text: JSON.stringify(window.TimingChartProductionController.getSerializableDocument()), history: window.TimingChartProductionController.model.history.undo.length, tab: window.TimingChartProductionController.model.view.tab, rendered: document.querySelector('#bottomContent')?.dataset.renderedTab }));
const checks = {
  cycleTwoRegions: cycle.mode === 'cycle' && cycle.gridRows.length === 2 && !cycle.elements['#transactionCanvas'].height,
  transactionTwoRegions: transaction.mode === 'transaction' && transaction.gridRows.length === 2 && !transaction.elements['#cycleCanvas'].height,
  splitThreeRegions: split.mode === 'split' && split.gridRows.length === 3 && split.elements['#cycleCanvas'].height > 0 && split.elements['#transactionCanvas'].height > 0 && split.elements['.bottom'].height > 0,
  splitInsideAndNonOverlapping: split.inside && split.nonOverlap && splitAfterResize.inside && splitAfterResize.nonOverlap,
  splitResizeChangesBottom: splitAfterResize.elements['.bottom'].height !== splitInitialHeight && splitAfterResize.elements['#cycleCanvas'].height > 0 && splitAfterResize.elements['#transactionCanvas'].height > 0,
  tabContentConsistent: splitAnnotation.modelTab === 'annotation' && splitAnnotation.active && splitAnnotation.rendered === 'annotation' && afterDocument.tab === 'annotation' && afterDocument.rendered === 'annotation',
  switchingAndResizeDoNotMutateDocument: beforeDocument.text === afterDocument.text && beforeDocument.history === afterDocument.history,
  explicitLayoutOwner: split.contract === 'explicit' && splitAfterResize.contract === 'explicit'
};
const acceptance = { issue: 82, checks, geometry: { cycle, transaction, split, splitAfterResize, splitRoundTrip, splitAgain }, errors, pass: Object.values(checks).every(Boolean) && errors.length === 0, artifacts: ['issue82-1672x941.png', 'issue82-1280x720.png'] };
await page.screenshot({ path: path.join(out, 'issue82-1672x941.png') });
await page.setViewportSize({ width: 1280, height: 720 });
const small = await clickMode('split');
acceptance.geometry.small = small;
acceptance.checks.smallViewportUsable = small.inside && small.nonOverlap && small.gridRows.length === 3 && small.elements['#cycleCanvas'].height >= 1 && small.elements['#transactionCanvas'].height >= 1;
acceptance.pass = Object.values(acceptance.checks).every(Boolean) && errors.length === 0;
await page.screenshot({ path: path.join(out, 'issue82-1280x720.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log(`Issue #82 acceptance passed: ${Object.keys(acceptance.checks).length} browser checks.`);
