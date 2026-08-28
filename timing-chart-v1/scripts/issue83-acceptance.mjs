import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue83');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const checks = {};
  const timelineText = () => [...document.querySelectorAll('#transactionCanvas .canvas-meta span')].map(node => node.textContent.trim());
  const base = structuredClone(c.getSerializableDocument());
  const transaction = { id: 'issue83_txn', name: 'Three phase', start: 2, end: 10, linkedSignals: ['req_valid'], phases: [{ name: 'Request', start: 2, end: 4 }, { name: 'Wait', start: 4, end: 7 }, { name: 'Data', start: 7, end: 10 }] };
  checks.addTransaction = c.actions.addTransaction(transaction);
  const before = structuredClone(c.getSerializableDocument());
  const mode = document.querySelector('.view-mode [data-mode="transaction"]'); mode.click(); await pause(40);
  const row = document.querySelector('#transactionCanvas .txn-lane[data-transaction-id="issue83_txn"]');
  const bar = row?.querySelector('.txnbar');
  const barRect = bar?.getBoundingClientRect();
  const phases = [...(row?.querySelectorAll('.phase') || [])].map(node => { const rect = node.getBoundingClientRect(); return { name: node.textContent.split('\n')[0], left: rect.left, width: rect.width, start: Number(node.dataset.phaseStart), rect: { left: rect.left, width: rect.width } }; });
  const phaseRects = [...(row?.querySelectorAll('.phase') || [])].map(node => { const rect = node.getBoundingClientRect(); return { left: rect.left, width: rect.width, label: node.textContent }; });
  const expected = transaction.phases.map(phase => ({ left: barRect.left + ((phase.start - base.timeline.start) / base.timeline.cycleCount) * barRect.width, width: ((phase.end - phase.start) / base.timeline.cycleCount) * barRect.width }));
  checks.headerUsesCurrentTimeline = timelineText().join(' | ').includes('0 - 10 cycles') && !timelineText().join(' | ').includes('0 - 60');
  checks.phaseCount = phaseRects.length === 3;
  checks.phaseWidthsUseSemanticDurations = phaseRects.length === 3 && Math.abs(phaseRects[0].width - expected[0].width) <= 1 && Math.abs(phaseRects[1].width - expected[1].width) <= 1 && Math.abs(phaseRects[2].width - expected[2].width) <= 1;
  checks.phaseOffsetsUseSharedTimeline = phaseRects.length === 3 && Math.abs(phaseRects[0].left - expected[0].left) <= 1 && Math.abs(phaseRects[1].left - expected[1].left) <= 1 && Math.abs(phaseRects[2].left - expected[2].left) <= 1;
  checks.unequalGeometryObservable = phaseRects.length === 3 && new Set(phaseRects.map(phase => Math.round(phase.width))).size >= 2;
  checks.statusIsNotFakeNormal = !document.querySelector('#bottomContent')?.textContent.includes('● 正常');
  c.actions.setTimeRange(0, 20); await pause(30);
  checks.headerUpdatesAfterTimelineChange = timelineText().join(' | ').includes('0 - 20 cycles');
  const afterRange = structuredClone(c.getSerializableDocument());
  checks.transactionDataUnchangedByView = afterRange.transactions[0].phases[1].start === 4;
  const invalid = structuredClone(afterRange); invalid.transactions[0].phases[1].end = 99;
  const invalidProblems = c.validateDocument(invalid);
  checks.invalidPhaseProducesStructuredProblem = invalidProblems.some(issue => issue.code === 'invalid-transaction-phase-bounds' && issue.id === 'issue83_txn');
  const saved = JSON.stringify(afterRange);
  checks.openRoundTrip = await c.actions.openText(saved, { fileName: 'issue83-roundtrip.tcd', unsavedDecision: 'discard' });
  checks.roundTripPreservesPhases = JSON.stringify(c.getSerializableDocument().transactions[0].phases) === JSON.stringify(afterRange.transactions[0].phases);
  c.actions.setViewMode('split'); await pause(20);
  checks.sameTimelineInSplit = c.model.document.timeline.end === 20;
  return { checks, header: timelineText(), phaseRects, expected, before, afterRange, errors: [] };
});

const report = { issue: 83, ...result, errors, pass: Object.values(result.checks).every(Boolean) && errors.length === 0, artifacts: ['issue83-1672x941.png'] };
await page.screenshot({ path: path.join(out, 'issue83-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #83 acceptance passed: ${Object.keys(result.checks).length} browser checks.`);
