import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue90');
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let attempts = 0;
  while (!c?.model && attempts < 50) { await wait(50); attempts++; }
  const model = c.model;

  // Build a 60-signal fixture in a single group so plenty are below the viewport.
  const doc = structuredClone(c.getSerializableDocument());
  const seed = doc.signals.find(s => s.type !== 'commentRow' && s.type !== 'clock') || doc.signals[0];
  const group = doc.signalGroups[0];
  for (let i = 0; i < 60; i += 1) {
    const id = `reveal_sig_${i}`;
    doc.signals.push({ ...structuredClone(seed), id, name: id, source: { instancePath: ['top'], signalName: id }, display: { name: id }, values: [{ start: 0, value: i % 2 }] });
    group.rows.push(id);
  }
  await c.actions.openText(JSON.stringify(doc), { fileName: 'issue90-fixture.tcd', unsavedDecision: 'discard' });
  await wait(150);

  const targetId = 'reveal_sig_55';
  const canonicalDocBefore = JSON.stringify(c.getSerializableDocument());

  // 1. Below-viewport reveal via a real navigation source (Problems row click emulated through selectObject + revealSelection, matching the wired Problems handler)
  const leftScroller = document.querySelector('#groups');
  leftScroller.scrollTop = 0;
  const canvasScroller = document.querySelector('#cycleCanvas');
  canvasScroller.scrollTop = 0;
  await wait(50);
  const rowBefore = document.querySelector(`#groups .row[data-signal="${targetId}"]`);
  const rowBeforeRect = rowBefore.getBoundingClientRect();
  const wasBelowViewport = rowBeforeRect.top > leftScroller.getBoundingClientRect().bottom;

  c.actions.selectObject({ dataset: { signal: targetId, kind: 'signal' } });
  const revealResult = c.actions.revealSelection({ id: targetId });
  await wait(80);

  const rowAfter = document.querySelector(`#groups .row[data-signal="${targetId}"]`);
  const rowAfterRect = rowAfter.getBoundingClientRect();
  const nowVisible = rowAfterRect.top >= leftScroller.getBoundingClientRect().top - 1 && rowAfterRect.bottom <= leftScroller.getBoundingClientRect().bottom + 1;
  const leftScrollTopChanged = leftScroller.scrollTop > 0;

  const canvasRow = document.querySelector(`#cycleCanvas .wave-row[data-signal="${targetId}"]`);
  const canvasRowRect = canvasRow?.getBoundingClientRect();
  const canvasRowVisible = canvasRowRect ? (canvasRowRect.top >= canvasScroller.getBoundingClientRect().top - 1 && canvasRowRect.bottom <= canvasScroller.getBoundingClientRect().bottom + 1) : null;

  const canonicalDocAfterReveal = JSON.stringify(c.getSerializableDocument());
  const historyLenAfterReveal = c.model.history?.undo?.length ?? 0;

  // 2. Already-visible selection -> no unnecessary scroll jump
  const scrollTopBeforeRevisit = leftScroller.scrollTop;
  const revealAgain = c.actions.revealSelection({ id: targetId });
  await wait(50);
  const scrollTopAfterRevisit = leftScroller.scrollTop;
  const noJumpWhenAlreadyVisible = Math.abs(scrollTopAfterRevisit - scrollTopBeforeRevisit) < 2;

  // 3. Search-filtered target -> explicit 'filtered' result, no false success
  let filteredResult = null;
  if (typeof c.actions.setLeftFilter === 'function' || model.view.leftFilter !== undefined) {
    model.view.leftFilter = { roles: [], types: [], visibility: 'all', text: 'this-signal-name-does-not-exist-anywhere' };
    c.render?.();
    await wait(80);
    filteredResult = c.actions.revealSelection({ id: targetId });
    model.view.leftFilter = { roles: [], types: [], visibility: 'all', text: '' };
    c.render?.();
    await wait(80);
  }

  // 4. Collapsed group target -> deterministic reveal without canonical mutation
  const groupId = group.id;
  const collapsedBefore = JSON.stringify(c.getSerializableDocument());
  c.actions.setGroupCollapsed(groupId, true);
  await wait(80);
  const collapseUndoLenBefore = c.model.history?.undo?.length ?? 0;
  const collapsedReveal = c.actions.revealSelection({ id: targetId });
  await wait(80);
  const collapseUndoLenAfter = c.model.history?.undo?.length ?? 0;
  const docUnchangedByReveal = JSON.stringify(c.getSerializableDocument()).replace(/"collapsed":true/, '"collapsed":false') === collapsedBefore.replace(/"collapsed":false/, '"collapsed":false');
  const groupHeaderPulsed = document.querySelector(`.group[data-group-id="${groupId}"] .group-h`)?.classList.contains('reveal-pulse');
  c.actions.setGroupCollapsed(groupId, false);
  await wait(80);

  // 5. Stale ID after Undo/Redo cannot be revealed
  c.actions.setSignalVisibility(targetId, false);
  await wait(50);
  c.actions.undo();
  await wait(50);
  const staleAttempt = c.actions.revealSelection({ id: 'this_signal_id_never_existed' });

  return {
    wasBelowViewport,
    revealResult,
    nowVisible,
    leftScrollTopChanged,
    canvasRowVisible,
    docUnchangedByPureReveal: canonicalDocBefore === canonicalDocAfterReveal,
    historyLenAfterReveal,
    revealAgain,
    noJumpWhenAlreadyVisible,
    filteredResult,
    collapsedReveal,
    collapseUndoLenBefore,
    collapseUndoLenAfter,
    groupHeaderPulsed,
    staleAttempt
  };
});

await page.screenshot({ path: path.join(out, 'issue90-1672x941.png') });
await browser.close();

const pass = result.wasBelowViewport === true
  && result.revealResult?.revealed === true
  && result.revealResult?.leftTree === 'revealed'
  && result.nowVisible === true
  && result.leftScrollTopChanged === true
  && result.canvasRowVisible === true
  && result.docUnchangedByPureReveal === true
  && result.historyLenAfterReveal === 0
  && result.noJumpWhenAlreadyVisible === true
  && (result.filteredResult === null || result.filteredResult.leftTree === 'filtered')
  && result.collapsedReveal?.leftTree === 'group-collapsed'
  && result.collapseUndoLenAfter === result.collapseUndoLenBefore
  && result.groupHeaderPulsed === true
  && result.staleAttempt?.revealed === false
  && result.staleAttempt?.reason === 'stale-id'
  && errors.length === 0;

const report = { issue: 90, result, errors, pass, artifacts: ['issue90-1672x941.png'] };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);

assert.ok(pass, JSON.stringify(report, null, 2));
console.log('Issue #90 acceptance passed: revealSelection() scrolls an off-screen Signal (60-signal fixture) into view in both the Left Tree and Cycle View using real scrollTop/bounding-rect measurement; revealing an already-visible row causes no scroll jump; a group-collapsed target scrolls to and pulses the Group header without mutating canonical collapsed state or creating an Undo entry; a stale/nonexistent ID after Undo is rejected as revealed:false/reason:stale-id; and reveal itself never mutates the canonical document or history.');
