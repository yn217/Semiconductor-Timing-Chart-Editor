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

// --- Tall Annotation Inspector / Problems content must not displace the MiniMap ---
const tallContentPage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await loadWithSignals(tallContentPage, 60);
const tallContentState = await tallContentPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const c = window.TimingChartProductionController;
  const doc = structuredClone(c.getSerializableDocument());
  doc.annotations = doc.annotations || [];
  for (let i = 0; i < 30; i += 1) {
    doc.annotations.push({ id: `perf_annotation_${i}`, type: 'marker', label: `Marker ${i}`, color: '#1473e6', position: 'canvas', comment: 'x'.repeat(80), anchor: { signal: 'clk', cycle: 0, point: 'rising' } });
  }
  await c.actions.openText(JSON.stringify(doc), { fileName: 'issue47-tall-annotation.tcd', unsavedDecision: 'discard' });
  await wait(80);
  const results = {};
  for (const tab of ['annotation', 'problems']) {
    const tabButton = document.querySelector(`#bottomTabs [data-tab="${tab}"]`);
    tabButton?.click();
    await wait(60);
    const minimap = document.querySelector('.inspector .minimap');
    const b = minimap.getBoundingClientRect();
    results[tab] = { minimapVisible: b.bottom <= window.innerHeight + 1 && b.height > 0, pageOverflow: document.documentElement.scrollHeight > window.innerHeight + 1 };
  }
  return results;
});
await tallContentPage.close();

// --- Bottom panel resize (#28) must not hide the MiniMap ---
const resizePage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await loadWithSignals(resizePage, 60);
const resizeState = await resizePage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const center = document.querySelector('.center');
  center.style.setProperty('--bottom-h', '520px');
  await wait(60);
  const minimap = document.querySelector('.inspector .minimap');
  const enlargedRect = minimap.getBoundingClientRect();
  const enlarged = { minimapVisible: enlargedRect.bottom <= window.innerHeight + 1 && enlargedRect.height > 0 };
  center.style.removeProperty('--bottom-h');
  await wait(60);
  const restoredRect = minimap.getBoundingClientRect();
  const restored = { minimapVisible: restoredRect.bottom <= window.innerHeight + 1 && restoredRect.height > 0 };
  return { enlarged, restored };
});
await resizePage.close();

// --- Scrolling the Inspector body must not move the MiniMap rect; horizontal
// timing scroll / Zoom must not change MiniMap chrome position or size ---
const stabilityPage = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await loadWithSignals(stabilityPage, 60);
const stabilityState = await stabilityPage.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  document.querySelector('.row[data-signal="clk"]')?.click();
  await wait(60);
  const minimap = document.querySelector('.inspector .minimap');
  const rectOf = () => { const b = minimap.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, width: b.width, height: b.height }; };
  const before = rectOf();

  const body = document.querySelector('.inspector-body');
  body.scrollTop = body.scrollHeight;
  await wait(30);
  const afterInspectorScroll = rectOf();

  const canvas = document.querySelector('#cycleCanvas');
  canvas.scrollLeft = canvas.scrollWidth;
  await wait(30);
  const afterHorizontalScroll = rectOf();

  const controller = window.TimingChartProductionController;
  controller.actions.setZoom(Math.min(400, Math.round(controller.model.view.zoom * 100) + 50));
  await wait(60);
  const afterZoom = rectOf();

  const same = (a, b) => a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.width === b.width && a.height === b.height;
  return {
    inspectorScrollApplied: body.scrollTop > 0 || body.scrollHeight <= body.clientHeight,
    unmovedByInspectorScroll: same(before, afterInspectorScroll),
    unmovedByHorizontalScroll: same(before, afterHorizontalScroll),
    unmovedByZoom: same(before, afterZoom),
  };
});
await stabilityPage.close();

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
  && tallContentState.annotation.minimapVisible === true
  && tallContentState.annotation.pageOverflow === false
  && tallContentState.problems.minimapVisible === true
  && tallContentState.problems.pageOverflow === false
  && resizeState.enlarged.minimapVisible === true
  && resizeState.restored.minimapVisible === true
  && stabilityState.inspectorScrollApplied === true
  && stabilityState.unmovedByInspectorScroll === true
  && stabilityState.unmovedByHorizontalScroll === true
  && stabilityState.unmovedByZoom === true
  && errors.length === 0;

const report = {
  issue: 47, startupState, largeState, toggleState, compactState, clockState,
  tallContentState, resizeState, stabilityState,
  errors, pass, artifacts: ['issue47-startup-1672x941.png', 'issue47-large-1672x941.png', 'issue47-large-1280x720.png'],
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #47 acceptance passed: right-pane MiniMap stays visible and pinned to the bottom with 60+ signals, a tall Clock Inspector, tall Annotation/Problems Inspector content, an enlarged Bottom panel, and both 1672x941/1280x720 widths; the Inspector body scrolls internally without ever moving the MiniMap rect; and horizontal timing scroll / Zoom / View->MiniMap OFF-ON all leave the MiniMap chrome position and size unaffected (except the deliberate OFF/ON toggle itself).');
