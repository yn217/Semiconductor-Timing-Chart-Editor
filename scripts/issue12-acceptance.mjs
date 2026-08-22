import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue12'; fs.mkdirSync(root, { recursive: true }); const server = spawn('python', ['-m', 'http.server', '4209'], { cwd: 'gui-mockup', stdio: 'ignore' }); const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 }); await page.goto('http://127.0.0.1:4209/', { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument().signals);
  const paragraph = 'This is a deliberately long document description that must wrap independently from the waveform width and remain readable in a generated document region.';
  await page.evaluate(paragraph => { const c = window.TimingChartProductionController; c.actions.updateDocumentRegion('header', 'subtitle', 'APB register access'); c.actions.updateDocumentRegion('header', 'description', paragraph); c.actions.updateDocumentRegion('header', 'notes', paragraph); c.actions.updateDocumentRegion('header', 'preconditions', ['Clock is stable', 'Reset is deasserted']); c.actions.updateDocumentRegion('header', 'constraints', ['No overlapping request']); c.actions.updateDocumentRegion('header', 'exceptions', ['Wait states are permitted']); c.actions.updateDocumentRegion('footer', 'figureNumber', 'Figure 12'); c.actions.updateDocumentRegion('footer', 'revision', 'Rev A'); c.actions.updateDocumentRegion('footer', 'text', 'Timing chart acceptance'); }, paragraph);
  const documentValue = await page.evaluate(() => window.TimingChartProductionController.getSerializableDocument()); assert.equal(documentValue.document.header.subtitle, 'APB register access'); assert.equal(documentValue.document.footer.figureNumber, 'Figure 12'); assert.equal(JSON.stringify(documentValue.signals), JSON.stringify(before));
  const wrapped = await page.evaluate(text => window.TimingChartProductionController.formatDocumentText(text, 40), paragraph); assert.ok(wrapped.length > 2); assert.ok(wrapped.every(line => line.length <= 40));
  const saved = JSON.parse(await page.evaluate(() => window.TimingChartProductionController.prepareSaveText().text)); assert.equal(saved.document.header.description, paragraph); assert.equal(saved.document.footer.revision, 'Rev A');
  const report = { headerFooterCanonical: true, automaticWrapping: true, waveformWidthIndependent: true, exportReadyRegions: true, pass: true }; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/document-regions.png` }); await browser.close(); console.log('Issue #12 acceptance passed: canonical document header/footer regions, wrapping, and persistence.');
} finally { server.kill(); }
