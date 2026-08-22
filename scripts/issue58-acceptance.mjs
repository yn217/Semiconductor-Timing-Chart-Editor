import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'issue58');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(350);

const base = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
const malicious = structuredClone(base);
const signal = malicious.signals.find(item => item.type !== 'commentRow');
const comment = malicious.signals.find(item => item.type === 'commentRow');
const group = malicious.signalGroups[0];
const marker = '<img src="x" onerror="window.__issue58Executed=1">&<script>window.__issue58Executed=2</script>';
signal.display.name = marker;
signal.name = marker;
group.name = marker;
malicious.signalGroups.push({ id: 'malicious_group', name: marker, rows: ['req_valid'] });
comment.title = marker;
comment.body = marker;
malicious.annotations[0].label = marker;
malicious.annotations[0].comment = marker;
malicious.transactions = [{ id: 'malicious_txn', name: marker, start: 1, end: 6, lane: marker, source: marker, destination: marker, comment: marker, phases: [{ name: marker, start: 1, end: 3 }] }];
malicious.document.title = marker;
malicious.document.header.subtitle = marker;
malicious.document.footer.text = marker;

const opened = await page.evaluate(async value => { window.__issue58Executed = 0; return window.TimingChartProductionController.actions.openText(JSON.stringify(value), { fileName: 'issue58-malicious.tcd.json', unsavedDecision: 'discard' }); }, malicious);
assert.equal(opened, true, 'malicious fixture did not open');
await page.waitForTimeout(100);
const observed = await page.evaluate(expected => {
  const c = window.TimingChartProductionController;
  c.model.view.leftPanelMode = 'group';
  c.render();
  const groupText = [...document.querySelectorAll('#groups .group-title')].some(node => node.textContent === c.model.document.signalGroups[0].name);
  c.model.view.leftPanelMode = 'hierarchy';
  c.model.document.layout.pathDisplayMode = 'full';
  c.render();
  c.actions.setViewMode('transaction');
  c.actions.setBottomTab('transaction');
  return {
    executed: window.__issue58Executed,
    unexpectedImages: document.querySelectorAll('img[src="x"]').length,
    unexpectedScripts: [...document.querySelectorAll('script')].filter(node => node.textContent.includes('issue58Executed=')).length,
    signalText: [...document.querySelectorAll('.row-name')].some(node => node.textContent === c.model.document.signals.find(item => item.type !== 'commentRow').display.name),
    groupText,
    groupTexts: [...document.querySelectorAll('#groups .group-title')].map(node => node.textContent),
    groupMarkup: document.querySelector('#groups')?.innerText,
    commentText: [...document.querySelectorAll('.row-name,.comment-body')].some(node => node.textContent === c.model.document.signals.find(item => item.type === 'commentRow').body),
    transactionText: document.querySelector('#transactionCanvas')?.textContent.includes(c.model.document.transactions[0].name),
    annotationText: document.body.textContent.includes(c.model.document.annotations[0].label),
    stableId: Boolean(document.querySelector(`.row[data-signal="${CSS.escape(c.model.document.signals.find(item => item.type !== 'commentRow').id)}"]`)),
    hierarchyText: document.querySelector('#groups')?.textContent.includes(expected)
  };
}, marker);
assert.equal(observed.executed, 0, 'malicious document text executed code');
assert.equal(observed.unexpectedImages, 0, 'malicious signal text created an img element');
assert.equal(observed.unexpectedScripts, 0, 'malicious document text created a script element');
assert.equal(observed.signalText, true, 'signal display name was not rendered as literal text');
assert.equal(observed.groupText, true, `group name was not rendered as literal text: ${JSON.stringify(observed)}`);
assert.equal(observed.commentText, true, 'comment title/body was not rendered as literal text');
assert.equal(observed.transactionText, true, 'transaction name was not rendered as literal text');
assert.equal(observed.annotationText, true, 'annotation label was not rendered as literal text');
assert.equal(observed.stableId, true, 'row identity was not based on canonical ID');

const saved = await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text);
assert.ok(saved, 'malicious document could not be serialized');
const reopened = await page.evaluate(async text => window.TimingChartProductionController.actions.openText(text, { fileName: 'issue58-roundtrip.tcd', unsavedDecision: 'discard' }), saved);
assert.equal(reopened, true, 'malicious document could not be reopened');
const roundTrip = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument());
assert.equal(roundTrip.signals.find(item => item.id === signal.id)?.display.name, marker, 'signal text did not survive Save/Open');
assert.equal(roundTrip.signalGroups[0].name, marker, 'group text did not survive Save/Open');
assert.equal(roundTrip.annotations[0].label, marker, 'annotation text did not survive Save/Open');
assert.equal(roundTrip.transactions[0].name, marker, 'transaction text did not survive Save/Open');
await page.screenshot({ path: path.join(out, 'issue58-1672x941.png') });

const source = await fs.readFile(path.join(root, 'gui-mockup', 'app-ui.js'), 'utf8');
assert.equal(source.includes('ensureIssue6RowsSafe'), true, 'safe DOM row renderer is missing');
const report = { issue: 58, observed, roundTrip: true, errors, safeDynamicRendering: true, pass: errors.length === 0 };
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (!report.pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log('Issue #58 acceptance passed: hostile signal/group/comment/annotation/transaction text remained literal and round-tripped.');
