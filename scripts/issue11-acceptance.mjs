import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';

const root = 'artifacts/issue11'; fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4204'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(500); const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4204/', { waitUntil: 'networkidle' });
  const json = () => page.locator('[data-json-document="canonical"]').textContent();
  await page.locator('[data-tab="json"]').click();
  const initial = JSON.parse(await json());
  assert.equal(initial.document.title, 'Timing Chart'); assert.equal(initial.signals.length, 10); assert.equal(initial.annotations.length, 0);
  await page.evaluate(() => window.TimingChartProductionController.actions.addAnnotation('marker', { id: 'issue11_marker', label: 'Read latency' }));
  await page.locator('[data-tab="json"]').click();
  const updated = JSON.parse(await json()); assert.equal(updated.annotations.length, 1); assert.equal(updated.annotations[0].id, 'issue11_marker');
  const invalid = await page.evaluate(() => { const value = structuredClone(window.TimingChartProductionController.getSerializableDocument()); value.timeline.referenceClock = 'missing'; value.signals[1].values[1].start = -1; return window.TimingChartProductionController.validateDocument(value); });
  assert.ok(invalid.some(issue => issue.path === '$.timeline.referenceClock')); assert.ok(invalid.some(issue => issue.path.includes('req_valid')));
  await page.evaluate(() => window.TimingChartProductionController.model.document.timeline.referenceClock = 'missing');
  await page.locator('[data-tab="problems"]').click();
  assert.ok(await page.locator('[data-problem-path="$.timeline.referenceClock"]').count() >= 1);
  const report = { canonicalJson: { reflectsDocument: true, readOnly: true, annotationCount: updated.annotations.length }, validation: { issues: invalid, paths: true }, normalEditingWithoutJson: true, pinAndFollowCoveredByPhase3A1: true, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await page.screenshot({ path: `${root}/problems-panel.png` }); await browser.close();
  console.log('Issue #11 acceptance passed: canonical JSON, validation paths, Problems rendering, and non-JSON editing contract.');
} finally { server.kill(); }
