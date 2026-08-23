import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue47');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function loadWithSignals(page, count) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
  await page.waitForTimeout(300);
  return page.evaluate(async signalCount => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const c = window.TimingChartProductionController;
    const doc = structuredClone(c.getSerializableDocument());
    const group = doc.signalGroups[0];
    const seed = doc.signals[0];
    for (let i = 0; i < signalCount; i += 1) {
      const id = `perf_sig_${i}`;
      doc.signals.push({ ...structuredClone(seed), id, name: id, source: { instancePath: ['top'], signalName: id }, display: { name: id }, values: [{ start: 0, value: i % 2 }] });
      group.rows.push(id);
    }
    const opened = await c.actions.openText(JSON.stringify(doc), { fileName: `issue47-${signalCount}.tcd`, unsavedDecision: 'discard' });
    await wait(80);
    document.querySelector(`.row[data-signal="perf_sig_0"]`)?.click();
    await wait(60);
    return opened;
  }, count);
}

function measure(page) {
  return page.evaluate(() => {
    const rect = el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height }; };
    const inspector = document.querySelector('.inspector');
    const minimap = document.querySelector('.inspector .minimap');
    const body = document.querySelector('.inspector-body');
    return {
      innerHeight: window.innerHeight,
      inspector: rect(inspector),
      minimap: rect(minimap),
      minimapVisible: minimap.getBoundingClientRect().bottom <= window.innerHeight + 1 && minimap.getBoundingClientRect().height > 0,
      minimapHeight: minimap.getBoundingClientRect().height,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      pageOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
    };
  });
}

// --- 9-signal startup sample at 1672x941: unchanged reference layout ---
const startupPage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await loadWithSignals(startupPage, 0);
const startupState = await measure(startupPage);
await startupPage.screenshot({ path: path.join(out, 'issue47-startup-1672x941.png') });
await startupPage.close();

// --- >50 signals at 1672x941: MiniMap must stay visible, Inspector body scrolls ---
const largePage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await loadWithSignals(largePage, 60);
const largeState = await measure(largePage);
await largePage.screenshot({ path: path.join(out, 'issue47-large-1672x941.png') });

// --- Toggle View -> MiniMap OFF/ON ---
const toggleState = await largePage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const viewTab = [...document.querySelectorAll('.rtab')].find(t => t.textContent.trim() === '表示');
  viewTab.click();
  await wait(30);
  const toggle = document.querySelector('[data-view-command="minimap"]');
  toggle.click();
  await wait(60);
  const minimap = document.querySelector('.inspector .minimap');
  const off = { hidden: minimap.hidden, visible: !!minimap.offsetParent };
  toggle.click();
  await wait(60);
  const on = { hidden: minimap.hidden, visible: !!minimap.offsetParent, bottom: minimap.getBoundingClientRect().bottom };
  return { off, on };
});
await largePage.close();

// --- >50 signals at 1280x720: same guarantees at the compact reference width ---
const compactPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await loadWithSignals(compactPage, 60);
const compactState = await measure(compactPage);
await compactPage.screenshot({ path: path.join(out, 'issue47-large-1280x720.png') });
await compactPage.close();

// --- Selecting a tall Clock Inspector (clk signal) must not displace MiniMap ---
const clockPage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await loadWithSignals(clockPage, 60);
const clockState = await clockPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  document.querySelector('.row[data-signal="clk"]')?.click();
  await wait(60);
  const minimap = document.querySelector('.inspector .minimap');
  const b = minimap.getBoundingClientRect();
  return { minimapVisible: b.bottom <= window.innerHeight + 1 && b.height > 0 };
});
await clockPage.close();
await browser.close();

const pass = startupState.minimapVisible === true
  && startupState.pageOverflow === false
  && largeState.minimapVisible === true
  && largeState.minimapHeight >= 60
  && largeState.bodyScrollable === true
  && largeState.pageOverflow === false
  && toggleState.off.hidden === true
  && toggleState.off.visible === false
  && toggleState.on.hidden === false
  && toggleState.on.visible === true
  && compactState.minimapVisible === true
  && compactState.pageOverflow === false
  && clockState.minimapVisible === true
  && errors.length === 0;

const report = { issue: 47, startupState, largeState, toggleState, compactState, clockState, errors, pass, artifacts: ['issue47-startup-1672x941.png', 'issue47-large-1672x941.png', 'issue47-large-1280x720.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #47 acceptance passed: right-pane MiniMap stays visible and pinned to the bottom with 60+ signals, a tall Clock Inspector, and both 1672x941/1280x720 widths, while the Inspector body scrolls internally and View->MiniMap OFF/ON keeps working.');
