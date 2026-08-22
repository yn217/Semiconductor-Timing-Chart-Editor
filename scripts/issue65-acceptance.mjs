import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue65';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4243'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await pause(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4243/gui-mockup/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const selectTab = async tab => { document.querySelector(`#bottomTabs [data-tab="${tab}"]`).click(); await wait(25); };
    const doc = () => c.getSerializableDocument();

    document.querySelector('.row[data-signal="req_valid"]').click(); await wait(35);
    const value = document.querySelector('#bottomContent [data-editor-field="value"][data-editor-index="1"]');
    if (!value) throw new Error('Signal editor value field missing');
    const beforeValue = doc().signals.find(signal => signal.id === 'req_valid').values[1].value;
    value.value = '0'; value.dispatchEvent(new Event('change', { bubbles: true })); await wait(30);
    if (doc().signals.find(signal => signal.id === 'req_valid').values[1].value === beforeValue) throw new Error('Signal value edit did not reach canonical model');
    if (!c.model.history.undo.length || !c.model.persistence.dirty) throw new Error('Signal edit did not create history/dirty state');

    c.actions.addCommentRow({ id: 'issue65_comment', title: 'Issue 65', body: 'initial' }); await wait(25);
    await selectTab('signal');
    const title = document.querySelector('[data-comment-field="title"]');
    if (!title) throw new Error('Comment editor missing');
    title.value = 'Updated comment'; title.dispatchEvent(new Event('change', { bubbles: true })); await wait(20);
    if (c.selectors.getComments().find(comment => comment.id === 'issue65_comment').title !== 'Updated comment') throw new Error('Comment edit did not reach canonical model');
    const duplicateButton = document.querySelector('[data-comment-action="duplicate"]');
    if (duplicateButton.disabled) throw new Error(`Comment duplicate button disabled: ${duplicateButton.title}`);
    duplicateButton.click(); await wait(25);
    const duplicateId = c.model.selection.id;
    if (!c.selectors.getComments().some(comment => comment.id === duplicateId)) throw new Error('Comment duplicate did not create a canonical row');
    const deleteButton = document.querySelector('[data-comment-action="delete"]');
    if (deleteButton.disabled) throw new Error(`Comment delete button disabled: ${deleteButton.title}`);
    deleteButton.click(); await wait(25);
    if (c.selectors.getComments().some(comment => comment.id === duplicateId)) throw new Error(`Comment delete did not remove canonical row: selection=${JSON.stringify(c.model.selection)} buttons=${document.querySelectorAll('[data-comment-action]').length}`);

    await selectTab('annotation');
    const annotationRow = document.querySelector('#bottomContent tr[data-annotation-id]');
    annotationRow.click(); await wait(25);
    const label = annotationRow.querySelector('[data-annotation-field="label"]');
    const color = annotationRow.querySelector('[data-annotation-field="color"]');
    if (!label || !color) throw new Error('Annotation table editor fields missing');
    label.value = 'Edited annotation'; label.dispatchEvent(new Event('change', { bubbles: true }));
    color.value = '#e39a25'; color.dispatchEvent(new Event('change', { bubbles: true })); await wait(25);
    const selectedAnnotation = c.model.document.annotations.find(item => item.id === c.model.selection.id);
    if (selectedAnnotation.label !== 'Edited annotation' || selectedAnnotation.color !== '#e39a25') throw new Error('Annotation table edit did not reach canonical model');

    await selectTab('transaction');
    c.actions.addTransaction({ id: 'issue65_txn', name: 'Initial', start: 1, end: 3 }); await wait(25);
    const transactionName = document.querySelector('[data-transaction-field="name"]');
    if (!transactionName) throw new Error('Transaction editor field missing');
    transactionName.value = 'Updated transaction'; transactionName.dispatchEvent(new Event('change', { bubbles: true })); await wait(25);
    if (c.model.document.transactions.find(item => item.id === 'issue65_txn').name !== 'Updated transaction') throw new Error('Transaction edit did not reach canonical model');

    await selectTab('json');
    document.querySelector('[data-json-action="export"]').click(); await wait(25);
    if (!window.TimingChartLastJsonExport?.includes('issue65_txn')) throw new Error('JSON export did not contain current canonical document');
    return { signalEdit: true, commentEditDuplicateDelete: true, annotationTableEdit: true, transactionEdit: true, jsonExport: true, pass: true };
  });
  await page.locator('.row[data-signal="clk"]').click();
  await page.waitForTimeout(35);
  await page.locator('.seg[data-mode="cycle"]').click();
  await page.waitForTimeout(35);
  await page.locator('#bottomTabs [data-tab="signal"]').click();
  await page.waitForTimeout(35);
  await page.locator('#bottomContent [data-clock-action="export"]').click();
  const clockExport = await page.evaluate(() => window.TimingChartLastClockExport);
  assert.match(clockExport, /generator/);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#bottomContent [data-clock-action="import"]').click();
  await (await chooser).setFiles({ name: 'clk.clock.json', mimeType: 'application/json', buffer: Buffer.from(clockExport) });
  await page.waitForTimeout(35);
  assert.ok(await page.evaluate(() => Boolean(window.TimingChartProductionController.getClockConfig('clk'))));
  await page.locator('#bottomTabs [data-tab="json"]').click();
  await page.waitForTimeout(35);
  const importedText = await page.evaluate(() => { const documentValue = structuredClone(window.TimingChartProductionController.getSerializableDocument()); documentValue.document.title = 'Issue65 imported through UI'; return JSON.stringify(documentValue); });
  const jsonChooser = page.waitForEvent('filechooser');
  await page.locator('#bottomContent [data-json-action="import"]').click();
  await (await jsonChooser).setFiles({ name: 'issue65-imported.tcd.json', mimeType: 'application/json', buffer: Buffer.from(importedText) });
  await page.waitForTimeout(45);
  assert.equal(await page.evaluate(() => window.TimingChartProductionController.model.document.document.title), 'Issue65 imported through UI');
  await page.screenshot({ path: `${root}/issue65-1672x941.png` });
  await browser.close();
  const report = { issue: 65, ...result, clockImportExport: true, pass: result.pass, knownIncomplete: ['JSON browser file-import E2E', 'full APB/AHB/AXI/CDC matrix'] };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.pass, 'Issue #65 progress acceptance failed');
  console.log('Issue #65 progress acceptance passed: Signal, Comment, Annotation, Transaction, and JSON editor paths use observable canonical operations.');
} finally { server.kill(); }
