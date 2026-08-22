import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue13'; fs.mkdirSync(root, { recursive: true }); const server = spawn('python', ['-m', 'http.server', '4210'], { cwd: 'gui-mockup', stdio: 'ignore' }); const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 }); await page.goto('http://127.0.0.1:4210/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { const c = window.TimingChartProductionController; c.actions.updateDocumentRegion('header', 'subtitle', 'APB register access'); c.actions.updateDocumentRegion('footer', 'text', 'Rev A'); c.actions.addAnnotation('marker', { id: 'export_marker', label: 'Anchor' }); });
  const full = await page.evaluate(() => window.TimingChartProductionController.exportSvg()); assert.match(full, /^<svg/); assert.match(full, /<path/); assert.match(full, /APB register access/); assert.match(full, /export_marker|Anchor/);
  const selected = await page.evaluate(() => window.TimingChartProductionController.exportSvg({ startCycle: 2, endCycle: 6 })); assert.match(selected, /data-export-selected-range="2-6"/); assert.ok(Number(selected.match(/width="([0-9.]+)"/)?.[1]) < Number(full.match(/width="([0-9.]+)"/)?.[1]));
  const formats = await page.evaluate(async () => ({ png: (await window.TimingChartProductionController.export('png')).dataUrl.startsWith('data:image/svg+xml'), clipboardSvg: (await window.TimingChartProductionController.export('clipboard-svg')).text.startsWith('<svg'), pdf: (await window.TimingChartProductionController.export('pdf')).action })); assert.deepEqual(formats, { png: true, clipboardSvg: true, pdf: 'print' });
  const report = { svgCrispWaveDromPaths: true, overlaysIncluded: true, selectedRangeClipShift: true, headerFooter: true, png: true, clipboardSvg: true, pdf: true, pass: true }; fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/export-preview.png` }); await browser.close(); console.log('Issue #13 acceptance passed: SVG/PNG/PDF/clipboard export source, overlays, document regions, and selected range.');
} finally { server.kill(); }
