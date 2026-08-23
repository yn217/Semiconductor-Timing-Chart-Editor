import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = 'artifacts/issue25';
const sampleRoot = 'samples/golden-protocol/timing_chart_sample_pack/samples';
const samples = [
  '01_apb_register_access.tcd.json',
  '02_ahb_lite_pipelined_transfer.tcd.json',
  '03_axi4_full_write_burst.tcd.json'
].map(fileName => ({ fileName, text: fs.readFileSync(`${sampleRoot}/${fileName}`, 'utf8') }));
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

async function inspectRenderedRows(page) {
  return page.evaluate(() => {
    const c = window.TimingChartProductionController;
    const backgroundByRole = { input: 'rgb(223, 242, 223)', output: 'rgb(226, 239, 255)', internal: 'rgb(255, 255, 255)' };
    const roles = [];
    for (const signal of c.model.document.signals.filter(item => item.type !== 'commentRow')) {
      for (const [surface, selector] of [['left', `#groups .row[data-signal="${CSS.escape(signal.id)}"] .role`], ['canvas', `#cycleCanvas .wave-row[data-signal="${CSS.escape(signal.id)}"] .canvas-icon.role`]]) {
        const node = document.querySelector(selector); if (!node || !node.getClientRects().length) continue;
        const box = node.getBoundingClientRect(); const style = getComputedStyle(node);
        roles.push({ id: signal.id, role: signal.role, surface, background: style.backgroundColor, expectedBackground: backgroundByRole[signal.role], width: box.width, height: box.height, text: node.textContent.trim() });
      }
    }
    const comments = [];
    for (const comment of c.model.document.signals.filter(item => item.type === 'commentRow')) {
      for (const [surface, selector] of [['left', `#groups .row[data-signal="${CSS.escape(comment.id)}"] .role`], ['canvas', `#cycleCanvas .wave-row[data-signal="${CSS.escape(comment.id)}"] .canvas-icon.role`]]) {
        const node = document.querySelector(selector); if (!node || !node.getClientRects().length) continue;
        const box = node.getBoundingClientRect();
        comments.push({ id: comment.id, title: comment.title, surface, use: node.querySelector('use')?.getAttribute('href'), text: node.textContent.trim(), aria: node.getAttribute('aria-label'), width: box.width, height: box.height });
      }
    }
    return {
      roles,
      comments,
      literalCommentGlyphs: [...document.querySelectorAll('.role.comment')].filter(node => node.textContent.includes('▣')).length,
      waveDromRenders: c.renderMetrics.waveDromRenders,
      geometryBuilds: c.renderMetrics.geometryBuilds,
      tracePaths: [...document.querySelectorAll('#cycleCanvas .trace svg[data-renderer="wavedrom"] path')].map(path => path.getAttribute('d')),
      leftRowHeights: [...document.querySelectorAll('#groups .row')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height),
      canvasRowHeights: [...document.querySelectorAll('#cycleCanvas .wave-row')].filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height),
      labelGaps: [...document.querySelectorAll('#groups .row .row-name, #cycleCanvas .signal-label')].filter(node => node.getClientRects().length).map(node => ({ gap: node.dataset.labelGap, leadingSpace: /^\s/.test(node.textContent) }))
    };
  });
}

function assertRows(checks, { requireDefaultComments = false } = {}) {
  assert.ok(checks.roles.length > 0, 'No rendered role badges');
  assert.ok(checks.roles.every(role => role.background === role.expectedBackground), JSON.stringify(checks.roles.filter(role => role.background !== role.expectedBackground)));
  assert.ok(checks.roles.every(role => role.width > 0 && role.height > 0));
  assert.ok(checks.comments.length > 0, 'No rendered Comment Row icons');
  assert.ok(checks.comments.every(icon => icon.use === 'icons.svg#i-comment' && icon.text === '' && icon.aria === 'Comment / Note'));
  assert.equal(checks.literalCommentGlyphs, 0);
  assert.ok(checks.labelGaps.length > 0 && checks.labelGaps.every(label => label.gap === '4px' && !label.leadingSpace));
  assert.ok(checks.leftRowHeights.every(height => height === 36));
  assert.ok(checks.canvasRowHeights.every(height => height >= 35));
  if (requireDefaultComments) {
    for (const title of ['Address phase', 'Processing note', 'Read latency']) {
      assert.deepEqual(checks.comments.filter(comment => comment.title === title).map(comment => comment.surface).sort(), ['canvas', 'left']);
    }
  }
}

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4215/gui-mockup/', { waitUntil: 'networkidle' });
    const canonicalBefore = await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument()));
    const startup = await inspectRenderedRows(page); assertRows(startup, { requireDefaultComments: true });
    assert.ok(startup.roles.some(role => role.role === 'input' && role.surface === 'left'));
    assert.ok(startup.roles.some(role => role.role === 'input' && role.surface === 'canvas'));
    assert.ok(startup.roles.some(role => role.role === 'output' && role.surface === 'left'));
    assert.ok(startup.roles.some(role => role.role === 'output' && role.surface === 'canvas'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.TimingChartProductionController.getSerializableDocument())), canonicalBefore);

    const scrollResult = await page.evaluate(() => { const pane = document.querySelector('.timing-scroll-pane'); pane.scrollLeft = Math.min(300, pane.scrollWidth - pane.clientWidth); pane.dispatchEvent(new Event('scroll')); return pane.scrollLeft; });
    await wait(35);
    const scrolled = await inspectRenderedRows(page); assertRows(scrolled, { requireDefaultComments: true });
    assert.deepEqual(scrolled.tracePaths, startup.tracePaths);
    assert.equal(scrolled.waveDromRenders, startup.waveDromRenders);
    assert.equal(scrolled.geometryBuilds, startup.geometryBuilds);
    await page.evaluate(() => { const pane = document.querySelector('.timing-scroll-pane'); pane.scrollLeft = 0; pane.dispatchEvent(new Event('scroll')); });
    await wait(20);

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

    const sequentialOpen = [];
    for (const [index, sample] of samples.entries()) {
      assert.equal(await page.evaluate(async ({ text, fileName }) => window.TimingChartProductionController.actions.openText(text, { fileName, unsavedDecision: 'discard' }), sample), true, sample.fileName);
      const dynamicId = `issue25_comment_${index}`; const dynamicTitle = `Issue 25 ${sample.fileName}`;
      assert.equal(await page.evaluate(({ id, title }) => window.TimingChartProductionController.actions.addCommentRow({ id, title, body: 'Dynamic Comment Row' }), { id: dynamicId, title: dynamicTitle }), true);
      await wait(35);
      const opened = await inspectRenderedRows(page); assertRows(opened);
      assert.deepEqual(opened.comments.filter(comment => comment.id === dynamicId).map(comment => comment.surface).sort(), ['canvas', 'left']);
      sequentialOpen.push({ fileName: sample.fileName, dynamicComment: dynamicId, roles: opened.roles.length, commentIcons: opened.comments.length });
    }

    assert.ok(await page.locator('#cycleCanvas .trace svg[data-renderer="wavedrom"]').count() > 0);
    if (viewport.width === 1672) await page.screenshot({ path: `${root}/sequential-open-1672x941.png` });
    results.push({ viewport, startupRoleBadges: true, frozenScrollPx: scrollResult, frozenRoleBadges: true, commentIcon: 'icons.svg#i-comment', dynamicSequentialOpen: sequentialOpen, labelGapPx: 4, canonicalUnchanged: true, waveDromGeometryUnchangedByScroll: true, visualDelta });
    await page.close();
  }
  const report = { issue: 25, regression: 'role badge backgrounds and Comment Row SVG parity', intentionalVisualDelta: true, goldenReferenceModified: false, stylesModified: false, iconsModified: false, results, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #25 regression acceptance passed: role badge backgrounds and deterministic Comment SVG survive frozen scroll and APB/AHB/AXI sequential Open.');
} finally {
  server.kill();
}
