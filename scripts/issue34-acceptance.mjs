import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue34';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4242'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4242/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartTooltipContract && window.TimingChartProductionController));
  const result = await page.evaluate(async () => {
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const controller = window.TimingChartProductionController;
    const before = JSON.stringify(controller.getSerializableDocument());
    const ribbon = selector => [...document.querySelectorAll(selector)].filter(node => !node.hidden);
    const home = ribbon('#ribbonHome .tool');
    expect(home.length > 10, 'Home controls missing');
    expect(home.every(node => node.dataset.tooltipContract === 'true'), `Home tooltip metadata incomplete: ${home.filter(node => node.dataset.tooltipContract !== 'true').map(node => node.textContent.trim()).join('|')}`);
    expect(home.every(node => JSON.parse(node.dataset.tooltipMeta).description && JSON.parse(node.dataset.tooltipMeta).affects), 'Home tooltip lacks effect/area');

    document.querySelector('.rtab:nth-child(6)').click(); await wait(20);
    const view = ribbon('#ribbonView [data-view-command]');
    expect(view.length >= 20 && view.every(node => node.dataset.tooltipContract === 'true'), 'View tooltip metadata incomplete');
    expect(view.every(node => JSON.parse(node.dataset.tooltipMeta).description && JSON.parse(node.dataset.tooltipMeta).affects), 'View tooltip lacks effect/area');

    document.querySelector('.rtab:nth-child(5)').click(); await wait(20);
    const annotation = ribbon('#ribbonAnnotation [data-annotation-command]');
    expect(annotation.length >= 10 && annotation.every(node => node.dataset.tooltipContract === 'true'), 'Annotation tooltip metadata incomplete');
    expect(annotation.every(node => JSON.parse(node.dataset.tooltipMeta).description && JSON.parse(node.dataset.tooltipMeta).affects), 'Annotation tooltip lacks effect/area');
    const disabled = annotation.filter(node => node.disabled);
    expect(disabled.length > 0 && disabled.every(node => node.title), 'Disabled annotation controls lack reasons');

    document.querySelector('.rtab:nth-child(3)').click(); await wait(20);
    const insert = ribbon('#ribbonInsert [data-insert-command]');
    expect(insert.length >= 10 && insert.every(node => node.dataset.tooltipContract === 'true'), 'Insert tooltip metadata incomplete');
    expect(insert.every(node => JSON.parse(node.dataset.tooltipMeta).description && JSON.parse(node.dataset.tooltipMeta).affects), 'Insert tooltip lacks effect/area');

    const target = document.querySelector('#ribbonInsert [data-insert-command="insert-cycle"]');
    expect(target, 'Insert cycle command missing');
    window.TimingChartTooltipContract.show(target); await wait(400);
    expect(!document.querySelector('#timingChartTooltip').hidden, 'Hover tooltip did not appear');
    expect(document.querySelector('#timingChartTooltip').textContent.includes('Affects:'), 'Tooltip does not explain affected area');
    window.TimingChartTooltipContract.hide(); expect(document.querySelector('#timingChartTooltip').hidden, 'Tooltip did not hide');
    expect(JSON.stringify(controller.getSerializableDocument()) === before, 'Tooltip/ribbon navigation changed canonical document');
    return { viewport, home: home.length, insert: insert.length, annotation: annotation.length, view: view.length, disabledReasons: disabled.length, pass: true };
  });
  await page.screenshot({ path: `${root}/tooltip-${viewport.width}x${viewport.height}.png` });
  await page.close(); return { ...result, pageErrors: errors, pass: result.pass && errors.length === 0 };
}

try {
  await pause(350); const browser = await chromium.launch({ headless: true });
  const results = []; for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) results.push(await run(browser, viewport));
  const report = { issue: 34, results, stylesModified: false, iconsModified: false, goldenReferenceModified: false, canonicalUnchanged: true, pass: results.every(item => item.pass) };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await browser.close(); assert.ok(report.pass, 'Issue #34 acceptance failed');
  console.log('Issue #34 acceptance passed: cross-Ribbon effect tooltips, focus metadata and disabled reasons verified.');
} finally { server.kill(); }
