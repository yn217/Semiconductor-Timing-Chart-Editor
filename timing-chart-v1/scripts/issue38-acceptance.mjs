import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue38';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4234'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4234/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.TimingChartProductionController?.controlAudit?.lastRun > 0);
  const result = await page.evaluate(async () => {
    const controller = window.TimingChartProductionController;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const visible = () => [...document.querySelectorAll('button, input, select, .tool, .mini-btn, .rtab')].filter(element => !element.hidden && element.offsetParent !== null);
    const statusOf = element => element.dataset.controlStatus || '';
    const inventory = visible().map(element => ({
      label: (element.querySelector?.('.tool-label')?.textContent || element.textContent || element.value || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
      tag: element.tagName.toLowerCase(),
      disabled: Boolean(element.disabled),
      status: statusOf(element),
      reason: element.title || ''
    }));
    const unknown = inventory.filter(item => !item.disabled && !['implemented', 'disabled'].includes(item.status) && item.label !== 'on');
    expect(unknown.length === 0, `enabled controls without acceptance status: ${JSON.stringify(unknown)}`);

    const search = document.querySelector('#leftPanel .search');
    search.value = 'req_addr';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.row[data-signal="req_addr[7:0]"]').hidden === false, 'search did not retain matching row');
    expect(document.querySelector('.row[data-signal="req_valid"]').hidden === true, 'search did not filter non-matching row');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const zoomBefore = controller.model.view.zoom;
    const zoomIn = [...document.querySelectorAll('#ribbonHome .tool')].find(element => (element.textContent || '').includes('Zoom＋'));
    zoomIn.click();
    await pause(30);
    expect(controller.model.view.zoom > zoomBefore, 'Ribbon Zoom+ did not update view state');
    const fitAll = [...document.querySelectorAll('#ribbonHome .tool')].find(element => (element.textContent || '').includes('全体'));
    fitAll.click();
    await pause(30);
    const fitZoom = controller.model.view.zoom;
    expect(fitZoom >= 0.25 && fitZoom <= 4, 'Ribbon Fit All returned an invalid geometry-derived zoom');

    controller.actions.setBottomTab('annotation');
    const annotation = controller.model.document.annotations?.[0];
    expect(annotation, 'missing annotation fixture');
    controller.actions.selectAnnotation(annotation.id);
    await pause(30);
    const annotationField = document.querySelector('#inspectorBody [data-annotation-field="label"]');
    expect(annotationField, 'annotation inspector field missing');
    const previousLabel = annotation.label;
    annotationField.value = `${previousLabel}-acceptance`;
    annotationField.dispatchEvent(new Event('change', { bubbles: true }));
    await pause(30);
    expect(annotation.label === `${previousLabel}-acceptance`, 'annotation inspector field was not persisted to model');

    controller.actions.setBottomTab('signal');
    const row = document.querySelector('.row[data-signal="req_valid"]');
    row.querySelector('.more').click();
    await pause(10);
    const inspectorCommand = [...document.querySelectorAll('#issue6ContextMenu [data-command]')].find(element => element.dataset.command === 'inspector');
    expect(inspectorCommand, 'Inspector menu command missing');
    inspectorCommand.click();
    expect(controller.model.selection.id === 'req_valid', 'Inspector command did not select target');
    await pause(30);
    expect(document.querySelector('#inspectorBody')?.textContent.includes('信号プロパティ'), 'Inspector command did not render signal inspector');

    const report = {
      enabledControlCount: inventory.filter(item => !item.disabled).length,
      disabledControlCount: inventory.filter(item => item.disabled).length,
      inventory,
      unknownEnabledControls: unknown,
      search: true,
      ribbonZoom: true,
      annotationInspector: true,
      inspectorCommand: true,
      fileMenuClosedByDefault: document.querySelector('#issue26FileMenu')?.hidden === true,
      disabledControls: inventory.filter(item => item.disabled).map(item => ({ label: item.label, reason: item.reason })),
      pass: true
    };
    expect(report.fileMenuClosedByDefault === true, 'File menu is visible by default');
    return report;
  });
  await page.screenshot({ path: `${root}/production-1672x941.png` });
  fs.writeFileSync(`${root}/control-inventory.json`, `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
  console.log(`Issue #38 acceptance passed: ${result.enabledControlCount} enabled controls audited, ${result.disabledControlCount} explicitly disabled.`);
} finally {
  server.kill();
}
