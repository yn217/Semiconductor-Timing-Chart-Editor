import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue44');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

// --- No literal mockup chevron text; standard SVG icon used ---
const iconState = await page.evaluate(() => {
  const chevs = [...document.querySelectorAll('#groups .group-h .chev')];
  return {
    count: chevs.length,
    noLiteralText: chevs.every(c => !/[vV><▼▶]/.test(c.textContent.trim())),
    allHaveSvgUse: chevs.every(c => !!c.querySelector('svg use[href*="i-chevron"]')),
    allExpandedIcon: chevs.every(c => c.querySelector('use').getAttribute('href').includes('i-chevron-down')),
    hitAreas: chevs.map(c => c.getBoundingClientRect()).map(r => ({ w: r.width, h: r.height })),
  };
});

// --- Click chevron toggles exactly one group; icon + aria-expanded flip; rows hide/show ---
const toggleState = await page.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const groups = [...document.querySelectorAll('#groups .group')];
  const inputGroup = groups.find(g => g.querySelector('.group-title')?.textContent.includes('入力'));
  const otherGroup = groups.find(g => g !== inputGroup);
  const chev = inputGroup.querySelector('.chev');
  const otherRowsBefore = [...otherGroup.querySelectorAll('.row[data-signal]')].map(r => r.hidden);
  chev.click();
  await wait(40);
  const rowsHidden = [...inputGroup.querySelectorAll('.row[data-signal]')].every(r => r.hidden);
  const ariaCollapsed = chev.getAttribute('aria-expanded') === 'false';
  const iconCollapsed = chev.querySelector('use').getAttribute('href').includes('i-chevron-right');
  const otherRowsUnaffected = [...otherGroup.querySelectorAll('.row[data-signal]')].map(r => r.hidden).every((v, i) => v === otherRowsBefore[i]);
  chev.click();
  await wait(40);
  const rowsShown = [...inputGroup.querySelectorAll('.row[data-signal]')].every(r => !r.hidden);
  const ariaExpanded = chev.getAttribute('aria-expanded') === 'true';
  const iconExpanded = chev.querySelector('use').getAttribute('href').includes('i-chevron-down');
  // clicking the group title (not the chevron) must not collapse
  const titleRowHiddenBefore = inputGroup.querySelector('.row[data-signal]').hidden;
  inputGroup.querySelector('.group-title').click();
  await wait(20);
  const titleRowHiddenAfter = inputGroup.querySelector('.row[data-signal]').hidden;
  return { rowsHidden, ariaCollapsed, iconCollapsed, otherRowsUnaffected, rowsShown, ariaExpanded, iconExpanded, titleClickSafe: titleRowHiddenBefore === titleRowHiddenAfter };
});

// --- Large document: left panel scrolls independently to the last Output row, canvas untouched ---
const scrollState = await page.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const c = window.TimingChartProductionController;
  const doc = structuredClone(c.getSerializableDocument());
  const outputGroup = doc.signalGroups.find(g => /出力|Output/.test(g.name)) || doc.signalGroups[doc.signalGroups.length - 1];
  const seed = doc.signals[0];
  for (let i = 0; i < 40; i += 1) {
    const id = `perf_sig_${i}`;
    doc.signals.push({ ...structuredClone(seed), id, name: id, source: { instancePath: ['top'], signalName: id }, display: { name: id }, values: [{ start: 0, value: i % 2 }] });
    outputGroup.rows.push(id);
  }
  const opened = await c.actions.openText(JSON.stringify(doc), { fileName: 'issue44-large.tcd', unsavedDecision: 'discard' });
  await wait(100);
  const canvas = document.querySelector('#cycleCanvas');
  const canvasScrollBefore = canvas ? canvas.scrollTop : 0;
  const groupsEl = document.querySelector('#groups');
  const lastRow = [...document.querySelectorAll('#groups .row[data-signal]')].pop();
  lastRow.scrollIntoView();
  await wait(30);
  const rect = lastRow.getBoundingClientRect();
  const groupsRect = groupsEl.getBoundingClientRect();
  const lastRowReachable = rect.top >= groupsRect.top - 1 && rect.bottom <= groupsRect.bottom + 1;
  const canvasScrollAfter = canvas ? canvas.scrollTop : 0;
  const pageOverflow = document.documentElement.scrollHeight > window.innerHeight + 1;
  // collapsing a group after scroll recalculates reachability of the final row
  const outputGroupEl = [...document.querySelectorAll('#groups .group')].find(g => /出力|Output/.test(g.querySelector('.group-title')?.textContent || ''));
  outputGroupEl.querySelector('.chev').click();
  await wait(40);
  const outputRowsHiddenAfterCollapse = [...outputGroupEl.querySelectorAll('.row[data-signal]')].every(r => r.hidden);
  outputGroupEl.querySelector('.chev').click();
  await wait(40);
  return { opened, lastRowId: lastRow.dataset.signal, lastRowReachable, canvasUnaffected: canvasScrollBefore === canvasScrollAfter, pageOverflow, outputRowsHiddenAfterCollapse };
});

await page.screenshot({ path: path.join(out, 'issue44-1672x941.png') });
await browser.close();

const pass = iconState.count >= 3
  && iconState.noLiteralText === true
  && iconState.allHaveSvgUse === true
  && iconState.allExpandedIcon === true
  && iconState.hitAreas.every(box => box.w >= 20 && box.h >= 20)
  && toggleState.rowsHidden === true
  && toggleState.ariaCollapsed === true
  && toggleState.iconCollapsed === true
  && toggleState.otherRowsUnaffected === true
  && toggleState.rowsShown === true
  && toggleState.ariaExpanded === true
  && toggleState.iconExpanded === true
  && toggleState.titleClickSafe === true
  && scrollState.opened === true
  && scrollState.lastRowId === 'perf_sig_39'
  && scrollState.lastRowReachable === true
  && scrollState.canvasUnaffected === true
  && scrollState.pageOverflow === false
  && scrollState.outputRowsHiddenAfterCollapse === true
  && errors.length === 0;

const report = { issue: 44, iconState, toggleState, scrollState, errors, pass, artifacts: ['issue44-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #44 acceptance passed: standard SVG disclosure chevrons toggle exactly one Group (rows hide/show, other Groups unaffected, aria-expanded + icon stay in sync, title click does not collapse), and the left Signal Tree scrolls independently to the final Output row without moving the Canvas or overflowing the page.');
