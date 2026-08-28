import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const appUi = fs.readFileSync('gui-mockup/app-ui.js', 'utf8');
assert.doesNotMatch(appUi, /const\s+state\s*=/, 'app-ui.js owns UI state');
assert.doesNotMatch(appUi, /function\s+(activateTab|setMode)\s*\(/, 'app-ui.js owns view actions');
assert.doesNotMatch(appUi, /\$\$\('\.(btab|row|seg)'\).*addEventListener/, 'app-ui.js owns Phase 3A events');
for (const action of ['selectObject', 'setViewMode', 'setBottomTab', 'setFollowSelection', 'setPinned']) {
  assert.match(fs.readFileSync('gui-mockup/production-controller.js', 'utf8'), new RegExp(`actions\\.${action}`));
}
execFileSync('git', ['diff', '--quiet', '4eaa0b6', '--', 'references/gui-replacement-pack'], { stdio: 'inherit' });

const server = spawn('python', ['-m', 'http.server', '4177'], { cwd: process.cwd(), stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(700);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4177/gui-mockup/', { waitUntil: 'networkidle' });

  const consistency = async expected => {
    const result = await page.evaluate(() => ({
      modelTab: window.TimingChartProductionController.model.view.tab,
      activeTab: document.querySelector('#bottomTabs .btab.active')?.dataset.tab,
      renderedTab: document.querySelector('#bottomContent')?.dataset.renderedTab,
      text: document.querySelector('#bottomContent')?.textContent || ''
    }));
    assert.equal(result.modelTab, expected, `model tab mismatch: ${JSON.stringify(result)}`);
    assert.equal(result.activeTab, expected, `active tab mismatch: ${JSON.stringify(result)}`);
    assert.equal(result.renderedTab, expected, `rendered content mismatch: ${JSON.stringify(result)}`);
    assert.match(result.text, expected === 'annotation' ? /注釈を追加/ : expected === 'json' ? /formatVersion/ : expected === 'transaction' ? /Transaction名/ : /選択中の信号|選択中: Comment/);
  };
  const clickMode = async mode => { await page.locator(`[data-mode="${mode}"]`).click(); };
  const clickTab = async tab => { await page.locator(`[data-tab="${tab}"]`).click(); await consistency(tab); };
  const clickRow = async id => page.locator(`[data-signal="${id}"]`).click();

  // CASE 1: Follow OFF preserves Annotation after signal selection.
  await clickMode('cycle');
  await clickTab('annotation');
  await page.locator('#bottomTabs input[type="checkbox"]').uncheck();
  await clickRow('req_valid');
  await consistency('annotation');
  assert.deepEqual(await page.evaluate(() => window.TimingChartProductionController.model.selection), { kind: 'signal', id: 'req_valid' });

  // CASE 2: Pin preserves Annotation content while selection changes.
  await page.locator('#bottomTabs .follow button').click();
  await clickRow('clk');
  await consistency('annotation');
  assert.deepEqual(await page.evaluate(() => window.TimingChartProductionController.model.selection), { kind: 'signal', id: 'clk' });

  // CASE 3: Split preserves the selected Annotation tab and content.
  await clickMode('split');
  await consistency('annotation');

  // CASE 4: JSON survives Split -> Cycle -> Split.
  await clickTab('json');
  await clickMode('cycle');
  await consistency('json');
  await clickMode('split');
  await consistency('json');

  // CASE 5: Annotation survives Transaction -> Cycle.
  await clickMode('transaction');
  await clickTab('annotation');
  await clickMode('cycle');
  await consistency('annotation');

  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/phase3a1-state-consistency.json', JSON.stringify(await page.evaluate(() => window.TimingChartProductionController.getState()), null, 2));
  await browser.close();
  console.log('Phase 3A.1 acceptance passed: single state owner, CASE 1-5, and model/active/rendered tab consistency.');
} finally {
  server.kill();
}
