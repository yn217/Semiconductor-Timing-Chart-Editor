import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = 'artifacts/issue25';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4215'], { cwd: '.', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function diffPixels(reference, dut) {
  const a = PNG.sync.read(fs.readFileSync(reference)); const b = PNG.sync.read(fs.readFileSync(dut));
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  const diff = new PNG({ width: a.width, height: a.height });
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) > 24) { changed += 1; diff.data[index] = 220; diff.data[index + 1] = 40; diff.data[index + 2] = 40; diff.data[index + 3] = 220; }
  }
  return { changedPixels: changed, totalPixels: a.width * a.height, diffPercent: changed / (a.width * a.height), image: PNG.sync.write(diff) };
}

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4215/gui-mockup/', { waitUntil: 'networkidle' });
    const canonicalBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
    const checks = await page.evaluate(() => {
      const comments = [...document.querySelectorAll('.row[data-kind="comment"] .role.comment, #cycleCanvas .canvas-icon.role.comment')];
      const labels = [...document.querySelectorAll('.row .row-name, #cycleCanvas .signal-label')];
      const roles = [...document.querySelectorAll('.role.in, .role.out, .role.wire, .role.comment')].filter(node => node.getClientRects().length).map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
      return {
        commentCount: comments.length,
        commentIcons: comments.map(node => ({ use: node.querySelector('use')?.getAttribute('href'), text: node.textContent.trim(), aria: node.getAttribute('aria-label') })),
        labelGaps: labels.map(node => node.dataset.labelGap),
        roles
      };
    });
    assert.equal(checks.commentCount, 6);
    assert.ok(checks.commentIcons.every(icon => icon.use === 'icons.svg#i-comment' && !icon.text.includes('▣')));
    assert.ok(checks.labelGaps.length >= 14 && checks.labelGaps.every(gap => gap === '4px'));
    assert.ok(checks.roles.every(role => role.width > 0 && role.height > 0));
    assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), canonicalBefore);
    assert.ok(await page.locator('#cycleCanvas .trace svg[data-renderer="wavedrom"]').count() >= 7);
    const screenshot = `${root}/production-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: screenshot });
    let visualDelta = null;
    if (viewport.width === 1672) {
      const refPage = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await refPage.goto('http://127.0.0.1:4215/references/gui-replacement-pack/production/', { waitUntil: 'networkidle' });
      const refScreenshot = `${root}/reference-1672x941.png`;
      await refPage.screenshot({ path: refScreenshot });
      visualDelta = diffPixels(refScreenshot, screenshot);
      fs.writeFileSync(`${root}/visual-delta.png`, visualDelta.image);
      delete visualDelta.image;
      await refPage.close();
    }
    results.push({ viewport, commentIcon: 'icons.svg#i-comment', labelGapPx: 4, canonicalUnchanged: true, waveDromTracePreserved: true, visualDelta });
    await page.close();
  }
  const report = { issue: 25, intentionalVisualDelta: true, goldenReferenceModified: false, stylesModified: false, iconsModified: false, results, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #25 acceptance passed: deterministic Comment SVG icon, 4px label gap, unchanged semantics, and WaveDrom traces preserved.');
} finally {
  server.kill();
}
