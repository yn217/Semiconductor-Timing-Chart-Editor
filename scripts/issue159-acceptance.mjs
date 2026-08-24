import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'artifacts', 'issue159');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
await page.goto(`file://${root.replaceAll('\\', '/')}/gui-mockup/index.html`);
await page.waitForTimeout(400);

const result = await page.evaluate(() => {
  const controller = window.TimingChartProductionController;
  const waveform = window.TimingChartProductionWaveform;
  const missingBoundary = controller.getCycleBoundary({ signal: 'issue159_missing', cycle: 0, coordinateSpace: 'canvas' });
  const missingAnchor = controller.getAnchor({ signal: 'issue159_missing', cycle: 0, edge: 'rising', coordinateSpace: 'canvas' });
  const comment = controller.model.document.signals.find(signal => signal.type === 'commentRow');
  const commentBoundary = comment ? controller.getCycleBoundary({ signal: comment.id, cycle: 0, coordinateSpace: 'canvas' }) : undefined;
  const before = controller.renderMetrics.geometryBuilds;
  const ensuredMissing = waveform.ensureSignalGeometry?.(controller.model, 'issue159_missing');
  return {
    missingBoundary,
    missingAnchor,
    commentBoundary,
    ensuredMissing,
    geometryBuildDelta: controller.renderMetrics.geometryBuilds - before
  };
});

const acceptance = {
  issue: 159,
  viewport: { width: 1672, height: 941, deviceScaleFactor: 1 },
  result,
  pageErrors,
  pass: pageErrors.length === 0 && result.missingBoundary === undefined && result.missingAnchor === undefined && result.commentBoundary === undefined && result.ensuredMissing === undefined
};
await fs.mkdir(out, { recursive: true });
await page.screenshot({ path: path.join(out, 'issue159-1672x941.png') });
await fs.writeFile(path.join(out, 'acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(acceptance, null, 2));
assert.equal(acceptance.pass, true, JSON.stringify(acceptance));
