import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue85');
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
  const clone = value => structuredClone(value);
  const base = clone(c.getSerializableDocument());
  const checks = {};
  const details = {};

  const ahb = clone(base);
  ahb.document.id = 'issue85-ahb.tcd';
  ahb.signals = ahb.signals.filter(signal => ['clk', 'busy'].includes(signal.id));
  ahb.signalGroups = [{ id: 'ahb_signals', name: 'AHB Signals', rows: ['clk', 'busy'] }];
  ahb.timeline.referenceClock = 'clk';
  ahb.annotations = [];
  ahb.transactions = [];
  checks.openAhb = await c.actions.openText(JSON.stringify(ahb), { fileName: 'issue85-ahb.tcd', unsavedDecision: 'discard' });
  const protocolChecks = {};
  for (const protocol of ['apb', 'ahb', 'axi']) {
    const protocolDocument = clone(ahb);
    protocolDocument.document.id = `issue85-${protocol}.tcd`;
    protocolDocument.document.title = protocol.toUpperCase();
    protocolDocument.transactions = [];
    protocolChecks[protocol] = await c.actions.openText(JSON.stringify(protocolDocument), { fileName: `issue85-${protocol}.tcd`, unsavedDecision: 'discard' }) && c.actions.addTransaction() && c.model.document.transactions.at(-1)?.linkedSignals.length === 0;
  }
  checks.protocolDocumentsUseNoFixtureLinks = Object.values(protocolChecks).every(Boolean);
  details.protocolChecks = protocolChecks;
  const beforeAdd = JSON.stringify(c.getSerializableDocument());
  const beforeHistory = c.model.history.undo.length;
  const added = c.actions.addTransaction();
  const created = c.model.document.transactions.at(-1);
  checks.newTransactionUsesOnlyCurrentSignals = added && created?.linkedSignals?.length === 0 && created.linkedSignals.every(id => c.model.document.signals.some(signal => signal.id === id));
  checks.newTransactionHasInBoundsPhases = added && created.phases.length > 0 && created.phases.every(phase => phase.start >= created.start && phase.end <= created.end && phase.end > phase.start);
  checks.newTransactionOneHistoryEntry = added && c.model.history.undo.length === beforeHistory + 1;
  checks.noStartupFixtureLinks = !created?.linkedSignals?.some(id => ['req_valid', 'ready'].includes(id));
  details.newTransaction = { transaction: created, beforeDocument: beforeAdd, history: c.model.history.undo.length };

  const source = { id: 'txn_source', name: 'Three phase source', start: 2, end: 6, lane: 'master', source: 'master', destination: 'slave', linkedSignals: ['busy'], phases: [{ name: 'Request', start: 2, end: 3 }, { name: 'Wait', start: 3, end: 5 }, { name: 'Data', start: 5, end: 6 }], comment: 'source' };
  checks.addSource = c.actions.addTransaction(source);
  const sourceBeforeDuplicate = clone(c.model.document.transactions.find(transaction => transaction.id === source.id));
  const beforeDuplicateHistory = c.model.history.undo.length;
  checks.duplicate = c.actions.duplicateTransaction(source.id);
  const duplicate = c.model.document.transactions.find(transaction => transaction.id !== source.id && transaction.name === 'Three phase source copy');
  const offset = sourceBeforeDuplicate.end - sourceBeforeDuplicate.start;
  checks.phasesShiftTogether = Boolean(duplicate) && duplicate.start === sourceBeforeDuplicate.end && duplicate.end === sourceBeforeDuplicate.end + offset && duplicate.phases.every((phase, index) => phase.start === sourceBeforeDuplicate.phases[index].start + offset && phase.end === sourceBeforeDuplicate.phases[index].end + offset);
  checks.duplicatePhasesInBounds = Boolean(duplicate) && duplicate.phases.every(phase => phase.start >= duplicate.start && phase.end <= duplicate.end && phase.end > phase.start);
  checks.duplicateOneHistoryEntry = checks.duplicate && c.model.history.undo.length === beforeDuplicateHistory + 1;
  checks.crossHighlightValid = checks.duplicate && c.model.crossHighlight.every(id => c.model.document.signals.some(signal => signal.id === id));
  details.duplicate = { source: sourceBeforeDuplicate, duplicate, offset };

  const beforeInvalidLink = clone(c.getSerializableDocument());
  const beforeInvalidLinkHistory = c.model.history.undo.length;
  checks.invalidLinkRejectedAtomically = c.actions.addTransaction({ start: 0, end: 2, linkedSignals: ['missing_signal'] }) === false && JSON.stringify(c.getSerializableDocument()) === JSON.stringify(beforeInvalidLink) && c.model.history.undo.length === beforeInvalidLinkHistory;

  const beforeCollision = clone(c.getSerializableDocument());
  c.model.document.transactions = [];
  checks.addTxn001 = c.actions.addTransaction({ id: 'txn_001', start: 0, end: 2 });
  checks.addTxn003 = c.actions.addTransaction({ id: 'txn_003', start: 2, end: 4 });
  checks.deleteNonContiguous = c.actions.deleteTransaction('txn_001');
  const generatedAfterDelete = c.actions.addTransaction({ start: 4, end: 6 });
  const generatedTransaction = c.model.document.transactions.at(-1);
  checks.generatedIdAvoidsCollision = generatedAfterDelete && generatedTransaction?.id !== 'txn_003' && new Set(c.model.document.transactions.map(transaction => transaction.id)).size === c.model.document.transactions.length;
  details.ids = c.model.document.transactions.map(transaction => transaction.id);

  const invalidSource = { id: 'txn_edge', name: 'Out of range duplicate', start: 6, end: 10, linkedSignals: [], phases: [{ name: 'All', start: 6, end: 10 }] };
  checks.addInvalidSource = c.actions.addTransaction(invalidSource);
  const beforeRejectedDuplicate = clone(c.getSerializableDocument());
  const beforeRejectedHistory = c.model.history.undo.length;
  checks.outOfRangeDuplicateRejected = c.actions.duplicateTransaction('txn_edge') === false && JSON.stringify(c.getSerializableDocument()) === JSON.stringify(beforeRejectedDuplicate) && c.model.history.undo.length === beforeRejectedHistory;

  const saved = clone(c.getSerializableDocument());
  checks.saveOpenRoundTrip = await c.actions.openText(JSON.stringify(saved), { fileName: 'issue85-roundtrip.tcd', unsavedDecision: 'discard' });
  const reopened = c.getSerializableDocument();
  checks.roundTripPreservesTransactions = JSON.stringify(reopened.transactions) === JSON.stringify(saved.transactions);
  await pause(50);
  details.finalTransactions = reopened.transactions;
  details.beforeCollisionCount = beforeCollision.transactions.length;
  return { checks, details };
});

const report = { issue: 85, ...result, errors, pass: Object.values(result.checks).every(Boolean) && errors.length === 0, artifacts: ['issue85-1672x941.png'] };
await page.screenshot({ path: path.join(out, 'issue85-1672x941.png') });
await browser.close();
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`Issue #85 acceptance passed: ${Object.keys(result.checks).length} browser checks.`);
