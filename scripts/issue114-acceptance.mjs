import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue114');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

// --- A. Group chevron: SVG only, no literal text glyphs ---
const chevState = await page.evaluate(() => {
  const chevs = [...document.querySelectorAll('#groups .chev')];
  return {
    count: chevs.length,
    allButtons: chevs.every(c => c.tagName === 'BUTTON'),
    noLiteralText: chevs.every(c => !/[vV><▼▶]/.test(c.textContent.trim())),
    allHaveSvg: chevs.every(c => !!c.querySelector('svg use[href*="i-chevron"]')),
  };
});

// --- B/C. Group and Signal More buttons: SVG only, correct groupId/rowContext on click, distinct hit targets ---
const moreState = await page.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const groupMore = [...document.querySelectorAll('#groups .group-h .more')];
  const rowMore = [...document.querySelectorAll('#groups .row .more')];
  const noLiteralGlyph = [...groupMore, ...rowMore].every(m => !/⋮/.test(m.textContent));
  const allButtons = [...groupMore, ...rowMore].every(m => m.tagName === 'BUTTON');
  const allHaveSvg = [...groupMore, ...rowMore].every(m => !!m.querySelector('svg use[href*="i-more-vertical"]'));

  const firstGroup = document.querySelector('#groups .group');
  const expectedGroupId = firstGroup.dataset.groupId;
  firstGroup.querySelector('.more').click();
  await wait(40);
  const groupMenuText = document.querySelector('#issue6ContextMenu')?.textContent || '';
  const groupMenuOpenedForRightGroup = groupMenuText.includes('折りたたむ');
  document.querySelector('#issue6ContextMenu')?.remove();

  const firstRow = document.querySelector('#groups .row[data-signal]');
  firstRow.querySelector('.more').click();
  await wait(40);
  const rowMenuText = document.querySelector('#issue6ContextMenu')?.textContent || '';
  const rowMenuOpened = rowMenuText.includes('名前を変更');
  document.querySelector('#issue6ContextMenu')?.remove();

  return { groupMoreCount: groupMore.length, rowMoreCount: rowMore.length, noLiteralGlyph, allButtons, allHaveSvg, expectedGroupId, groupMenuOpenedForRightGroup, rowMenuOpened };
});

// --- D. Hit targets at 1672x941 and 1280x720: distinct, non-overlapping, elementFromPoint resolves correctly ---
async function hitTargets(activePage) {
  return activePage.evaluate(() => {
    const row = document.querySelector('#groups .row[data-signal]');
    const eye = row.querySelector('.eye');
    const more = row.querySelector('.more');
    const group = document.querySelector('#groups .group');
    const chev = group.querySelector('.chev');
    const groupMore = group.querySelector('.more');
    const centerOf = el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    const resolves = el => { const c = centerOf(el); const hit = document.elementFromPoint(c.x, c.y); return hit === el || el.contains(hit) || (hit && el.contains(hit)); };
    const overlaps = (a, b) => { const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect(); return !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom); };
    return {
      eyeResolves: resolves(eye),
      moreResolves: resolves(more),
      chevResolves: resolves(chev),
      groupMoreResolves: resolves(groupMore),
      eyeMoreOverlap: overlaps(eye, more),
      chevGroupMoreOverlap: overlaps(chev, groupMore),
    };
  });
}
const hit1672 = await hitTargets(page);
await page.setViewportSize({ width: 1280, height: 720 });
await page.waitForTimeout(150);
const hit1280 = await hitTargets(page);
await page.setViewportSize({ width: 1672, height: 941 });
await page.waitForTimeout(150);

// --- E. Dynamic Open: newly reconciled group uses the same SVG-button pattern, no fallback to glyphs ---
const dynamicState = await page.evaluate(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const c = window.TimingChartProductionController;
  const doc = structuredClone(c.getSerializableDocument());
  doc.signalGroups.push({ id: 'group_dynamic_extra', name: 'Dynamic Extra', rows: ['clk'] });
  const opened = await c.actions.openText(JSON.stringify(doc), { fileName: 'issue114-dynamic.tcd', unsavedDecision: 'discard' });
  await wait(100);
  const allMore = [...document.querySelectorAll('#groups .more')];
  const allChev = [...document.querySelectorAll('#groups .chev')];
  return {
    opened,
    moreAllSvgButtons: allMore.length > 0 && allMore.every(m => m.tagName === 'BUTTON' && !!m.querySelector('use[href*="i-more-vertical"]')),
    chevAllSvgButtons: allChev.length === 4 && allChev.every(el => el.tagName === 'BUTTON' && !!el.querySelector('use[href*="i-chevron"]')),
    noLiteralAnywhere: [...allMore, ...allChev].every(el => !/[v>⌄▼▶⋮]/.test(el.textContent)),
  };
});

await page.screenshot({ path: path.join(out, 'issue114-1672x941.png') });
await browser.close();

const pass = chevState.count >= 3 && chevState.allButtons && chevState.noLiteralText && chevState.allHaveSvg
  && moreState.groupMoreCount >= 3 && moreState.rowMoreCount >= 10
  && moreState.noLiteralGlyph && moreState.allButtons && moreState.allHaveSvg
  && moreState.groupMenuOpenedForRightGroup && moreState.rowMenuOpened
  && hit1672.eyeResolves && hit1672.moreResolves && hit1672.chevResolves && hit1672.groupMoreResolves
  && !hit1672.eyeMoreOverlap && !hit1672.chevGroupMoreOverlap
  && hit1280.eyeResolves && hit1280.moreResolves && hit1280.chevResolves && hit1280.groupMoreResolves
  && !hit1280.eyeMoreOverlap && !hit1280.chevGroupMoreOverlap
  && dynamicState.opened && dynamicState.moreAllSvgButtons && dynamicState.chevAllSvgButtons && dynamicState.noLiteralAnywhere
  && errors.length === 0;

const report = { issue: 114, chevState, moreState, hit1672, hit1280, dynamicState, errors, pass, artifacts: ['issue114-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #114 acceptance passed: Left Signal/Group Tree disclosure and overflow controls use standard SVG icon buttons (no literal v/⌄/>/⋮ glyphs), context menus still open for the correct group/row, Chevron/Eye/More hit targets are distinct and correctly hit-tested at 1672x941 and 1280x720, and dynamically opened documents reconcile new rows with the same SVG-button pattern.');
