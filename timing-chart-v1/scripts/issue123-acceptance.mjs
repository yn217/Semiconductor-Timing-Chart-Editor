import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue123');
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

  const sequence = ['ann_default_marker', 'ann_default_dependency', 'ann_default_highlight', 'ann_default_callout'];
  const before = JSON.stringify(c.getSerializableDocument());
  const captures = {};
  for (const id of sequence) {
    c.actions.selectAnnotation(id);
    await wait(60);
    const host = document.querySelector('#inspectorBody');
    const sectionKeys = [...host.querySelectorAll('.section h3')].map(h => h.dataset.sectionToggle);
    const sectionTitles = [...host.querySelectorAll('.section h3')].map(h => h.textContent.replace('▼', '').replace('▶', '').trim());
    captures[id] = { sectionKeys, sectionTitles };
  }
  const after = JSON.stringify(c.getSerializableDocument());
  return { captures, docUnchanged: before === after };
});

await page.screenshot({ path: path.join(out, 'issue123-1672x941.png') });
await browser.close();

const marker = result.captures?.ann_default_marker;
const dependency = result.captures?.ann_default_dependency;
const highlight = result.captures?.ann_default_highlight;
const callout = result.captures?.ann_default_callout;

const markerNoEnd = marker && !marker.sectionKeys.includes('end') && !marker.sectionKeys.includes('to') && marker.sectionKeys.includes('anchor');
const dependencyHasFromTo = dependency && dependency.sectionKeys.includes('from') && dependency.sectionKeys.includes('to') && !dependency.sectionKeys.includes('start') && !dependency.sectionKeys.includes('anchor');
const dependencyTitlesDistinct = dependency && dependency.sectionTitles.some(t => t.includes('From')) && dependency.sectionTitles.some(t => t.includes('To'));
const highlightHasStartEnd = highlight && highlight.sectionKeys.includes('start') && highlight.sectionKeys.includes('end');
const calloutOneAnchor = callout && callout.sectionKeys.includes('anchor') && !callout.sectionKeys.includes('end') && !callout.sectionKeys.includes('to');

const pass = markerNoEnd === true
  && dependencyHasFromTo === true
  && dependencyTitlesDistinct === true
  && highlightHasStartEnd === true
  && calloutOneAnchor === true
  && result.docUnchanged === true
  && errors.length === 0;

const report = { issue: 123, result, markerNoEnd, dependencyHasFromTo, dependencyTitlesDistinct, highlightHasStartEnd, calloutOneAnchor, errors, pass, artifacts: ['issue123-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #123 acceptance passed: Inspector sections are type-aware. Marker shows one Anchor section (no End). Dependency shows From/To (not generic Start/End). Highlight shows Start+End. Callout shows a single Anchor section. Switching selection refreshes sections immediately with zero document mutation.');
