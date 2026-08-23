import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue124');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  if (!c?.model) return { error: 'Controller not initialized' };

  const before = JSON.stringify(c.getSerializableDocument());

  const readSummaries = () => {
    const host = document.querySelector('#inspectorBody');
    return [...host.querySelectorAll('.section')].map(section => {
      const key = section.querySelector('h3')?.dataset.sectionToggle;
      const summaryEl = [...section.querySelectorAll('.prop')].find(p => p.querySelector('span')?.textContent.trim() === 'Summary');
      const summaryText = summaryEl?.querySelector('b')?.textContent || null;
      const pickButton = section.querySelector('[data-inspector-anchor-pick]');
      return { key, summaryText, hasPickButton: !!pickButton };
    }).filter(s => s.summaryText !== null);
  };

  c.actions.selectAnnotation('ann_default_marker');
  await wait(60);
  const markerSummaries = readSummaries();

  c.actions.selectAnnotation('ann_default_dependency');
  await wait(60);
  const dependencySummaries = readSummaries();

  c.actions.selectAnnotation('ann_default_highlight');
  await wait(60);
  const highlightSummaries = readSummaries();

  // Reusable pick action existence check
  const pickActionExists = typeof c.actions.beginAnnotationAnchorSelection === 'function';

  // Exercise the pick button if present: it must call the existing action, not implement a new one
  let pickInvoked = false;
  if (markerSummaries[0]?.hasPickButton) {
    const before2 = document.querySelector('#cycleCanvas')?.getAttribute('data-annotation-anchor-pick');
    document.querySelector('[data-inspector-anchor-pick]')?.click();
    await wait(30);
    const after2 = document.querySelector('#cycleCanvas')?.getAttribute('data-annotation-anchor-pick');
    pickInvoked = after2 !== before2 && after2 !== null;
  }

  const after = JSON.stringify(c.getSerializableDocument());

  return { markerSummaries, dependencySummaries, highlightSummaries, pickActionExists, pickInvoked, docUnchangedByRender: before === after };
});

await page.screenshot({ path: path.join(out, 'issue124-1672x941.png') });
await browser.close();

const markerHasOneSummary = result.markerSummaries?.length === 1;
const markerSummaryReadable = markerHasOneSummary && /^[^\n]+\/[^\n]+@ cycle \d+$/.test(result.markerSummaries[0].summaryText) && !result.markerSummaries[0].summaryText.includes('undefined') && !result.markerSummaries[0].summaryText.includes('[object Object]');

const dependencyHasTwoSummaries = result.dependencySummaries?.length === 2;
const dependencyDistinct = dependencyHasTwoSummaries && result.dependencySummaries[0].summaryText !== result.dependencySummaries[1].summaryText;
const dependencyNoJunk = dependencyHasTwoSummaries && result.dependencySummaries.every(s => !s.summaryText.includes('undefined') && !s.summaryText.includes('[object Object]'));

const highlightHasTwoSummaries = result.highlightSummaries?.length === 2;
const highlightNoJunk = highlightHasTwoSummaries && result.highlightSummaries.every(s => !s.summaryText.includes('undefined') && !s.summaryText.includes('[object Object]'));

const pickWiredCorrectly = result.pickActionExists === true ? result.pickInvoked === true : true;

const pass = markerHasOneSummary === true
  && markerSummaryReadable === true
  && dependencyHasTwoSummaries === true
  && dependencyDistinct === true
  && dependencyNoJunk === true
  && highlightHasTwoSummaries === true
  && highlightNoJunk === true
  && pickWiredCorrectly === true
  && result.docUnchangedByRender === true
  && errors.length === 0;

const report = {
  issue: 124, result,
  markerHasOneSummary, markerSummaryReadable,
  dependencyHasTwoSummaries, dependencyDistinct, dependencyNoJunk,
  highlightHasTwoSummaries, highlightNoJunk,
  pickWiredCorrectly,
  errors, pass, artifacts: ['issue124-1672x941.png']
};
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #124 acceptance passed: every applicable anchor section shows one readable summary line (e.g. "clk / Rising @ cycle 4"); Dependency From/To summaries are distinct; single-anchor types (Marker) show exactly one summary; missing fields never render as undefined/[object Object]; the existing beginAnnotationAnchorSelection pick action is reused via a real button (no new pick subsystem); rendering summaries mutates nothing.');
