import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = process.cwd();
const server = spawn('python', ['-m', 'http.server', '4174'], { cwd: root, stdio: 'ignore' });
fs.mkdirSync('test-results', { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const viewport = { width: 1672, height: 941 };
const geometry = { ribbon: ['.ribbon', '.ribbon'], workspace: ['.workspace', '.workspace'], left: ['.left', '.signal-tree'], center: ['.center', '.center-column'], wave: ['.wave', '.canvas-pane'], bottom: ['.bottom', '.bottom'], right: ['.right', '.inspector'] };
const rects = async page => page.evaluate(selectors => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, document.querySelector(selector).getBoundingClientRect().toJSON()])), Object.fromEntries(Object.entries(geometry).map(([name, selectors]) => [name, selectors[0]])));
const diffs = (reference, dut) => Object.fromEntries(Object.entries(geometry).map(([name]) => [name, Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(Math.abs(reference[name][key] - dut[name][key]) * 100) / 100]))]));
const panelRefs = { left: 'references/gui-replacement-pack/01_left_panel_LOCKED.png', signal: 'references/gui-replacement-pack/02_bottom_signal_LOCKED.png', annotation: 'references/gui-replacement-pack/03_bottom_annotation_LOCKED.png', problems: 'references/gui-replacement-pack/04_bottom_problems_LOCKED.png', json: 'references/gui-replacement-pack/05_bottom_json_LOCKED.png' };
const panelThresholds = { left: 0.25, signal: 0.25, annotation: 0.25, problems: 0.25, json: 0.25 };
const overallThreshold = 0.25;
const panelCrops = { left: { x: 0, y: 188, width: 330, height: 670 }, signal: { x: 337, y: 602, width: 1039, height: 272 }, annotation: { x: 337, y: 549, width: 985, height: 325 }, problems: { x: 337, y: 481, width: 983, height: 393 }, json: { x: 337, y: 434, width: 983, height: 440 } };
function comparePanel(referencePath, dutPng, crop, outputPath, threshold) { const reference = PNG.sync.read(fs.readFileSync(referencePath)); const dut = new PNG({ width: reference.width, height: reference.height }); let changed = 0; for (let y=0;y<reference.height;y++) for (let x=0;x<reference.width;x++) { const sx=Math.min(dutPng.width-1,crop.x+Math.floor(x*crop.width/reference.width)); const sy=Math.min(dutPng.height-1,crop.y+Math.floor(y*crop.height/reference.height)); const ri=(y*reference.width+x)*4, di=(sy*dutPng.width+sx)*4; const delta=Math.abs(reference.data[ri]-dutPng.data[di])+Math.abs(reference.data[ri+1]-dutPng.data[di+1])+Math.abs(reference.data[ri+2]-dutPng.data[di+2]); if(delta>36){changed++;dut.data[ri]=220;dut.data[ri+1]=40;dut.data[ri+2]=40;dut.data[ri+3]=220}else{dut.data[ri]=255;dut.data[ri+1]=255;dut.data[ri+2]=255;dut.data[ri+3]=0} } fs.writeFileSync(outputPath, PNG.sync.write(dut)); const totalPixels=reference.width*reference.height; const diffPercent=changed/totalPixels; const pass=diffPercent<=threshold; assert.ok(pass, `${referencePath} visual diff ${(diffPercent*100).toFixed(2)}% exceeds ${(threshold*100).toFixed(2)}% threshold`); return { changedPixels: changed, totalPixels, diffPercent, threshold, pass, crop }; }
try { 
  await wait(800);
  const browser = await chromium.launch({ headless: true });
  const ref = await browser.newPage({ viewport });
  const dut = await browser.newPage({ viewport });
  await ref.goto('http://127.0.0.1:4174/ui-reference-v2/', { waitUntil: 'networkidle' });
  await dut.goto('http://127.0.0.1:4174/gui-mockup/', { waitUntil: 'networkidle' });
  fs.copyFileSync('references/gui-replacement-pack/00_overall_cycle_view.png', 'test-results/ui-reference-pack.png');
  await dut.screenshot({ path: 'test-results/gui-mockup-reference-dut.png' });
  assert.ok(await dut.locator('svg use[href^="icons.svg#"]').count() >= 20, 'Production icon sprite hooks missing');
  assert.ok(await dut.locator('svg use[href^="icons.svg#"]').first().evaluate(element => element.parentElement.getBoundingClientRect().width > 0), 'Production SVG icon is not rendered');
  const production = await rects(dut);
  const reference = { ribbon: { x: 1, y: 71, width: 1670, height: 146 }, workspace: { x: 1, y: 217, width: 1670, height: 723 }, left: { x: 1, y: 217, width: 330, height: 723 }, center: { x: 331, y: 217, width: 1040, height: 723 }, wave: { x: 331, y: 217, width: 1040, height: 338 }, bottom: { x: 331, y: 670, width: 1040, height: 270 }, right: { x: 1371, y: 217, width: 300, height: 723 } };
  const layoutDiff = diffs(reference, production);
  for (const [name, values] of Object.entries(layoutDiff)) for (const [key, value] of Object.entries(values)) assert.ok(value <= 2, name + '.' + key + ' differs by ' + value + 'px');
  const refPng = PNG.sync.read(fs.readFileSync('test-results/ui-reference-pack.png'));
  const dutPng = PNG.sync.read(fs.readFileSync('test-results/gui-mockup-reference-dut.png'));
  assert.equal(refPng.width, dutPng.width);
  assert.equal(refPng.height, dutPng.height);
  const wave = reference.wave;
  const diffPng = new PNG({ width: refPng.width, height: refPng.height });
  let changed = 0, totalPixels = 0;
  for (let y = 0; y < refPng.height; y++) for (let x = 0; x < refPng.width; x++) {
    const masked = x >= wave.x && x < wave.x + wave.width && y >= wave.y && y < wave.y + wave.height;
    const i = (y * refPng.width + x) * 4;
    const delta = Math.abs(refPng.data[i] - dutPng.data[i]) + Math.abs(refPng.data[i + 1] - dutPng.data[i + 1]) + Math.abs(refPng.data[i + 2] - dutPng.data[i + 2]);
    if (!masked) totalPixels++;
    if (!masked && delta > 24) { changed++; diffPng.data[i] = 220; diffPng.data[i + 1] = 40; diffPng.data[i + 2] = 40; diffPng.data[i + 3] = 220; }
    else { diffPng.data[i] = 255; diffPng.data[i + 1] = 255; diffPng.data[i + 2] = 255; diffPng.data[i + 3] = 0; }
  }
  const overallDiffPercent = changed / totalPixels;
  assert.ok(overallDiffPercent <= overallThreshold, `overall visual diff ${(overallDiffPercent*100).toFixed(2)}% exceeds ${(overallThreshold*100).toFixed(2)}% threshold`);
  fs.writeFileSync('test-results/ui-reference-vs-dut-diff.png', PNG.sync.write(diffPng));
  const panelResults = { left: comparePanel(panelRefs.left, PNG.sync.read(fs.readFileSync('test-results/gui-mockup-reference-dut.png')), panelCrops.left, 'test-results/left-reference-vs-dut-diff.png', panelThresholds.left) };
  for (const [name, refPath] of Object.entries(panelRefs)) { if (name !== 'left') await dut.locator(`[data-tab="${name}"]`).click(); await wait(80); const file = `test-results/gui-mockup-${name}.png`; await dut.screenshot({ path: file }); panelResults[name] = comparePanel(refPath, PNG.sync.read(fs.readFileSync(file)), panelCrops[name], `test-results/${name}-reference-vs-dut-diff.png`, panelThresholds[name]); }
  const report = { viewport, layoutDiff, masked: 'waveform region', overall: { changedPixels: changed, totalPixels, diffPercent: overallDiffPercent, threshold: overallThreshold, pass: overallDiffPercent <= overallThreshold }, panelResults, screenshots: ['test-results/ui-reference-pack.png', 'test-results/gui-mockup-reference-dut.png', 'test-results/ui-reference-vs-dut-diff.png', ...Object.keys(panelRefs).filter(name => name !== 'left').map(name => `test-results/gui-mockup-${name}.png`)] };
  fs.writeFileSync('test-results/ui-reference-vs-dut-report.json', JSON.stringify(report, null, 2));
  await browser.close();
  console.log('UI Reference vs DUT passed: all major geometry differences <=2px; overall ' + changed + '/' + totalPixels + ' (' + (overallDiffPercent*100).toFixed(2) + '%) and all locked panels are within threshold.');
} finally {
  server.kill();
}
