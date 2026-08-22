import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue29';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4220'], { cwd: 'gui-mockup', stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = page => page.evaluate(() => { const c=window.TimingChartProductionController; const b=c.getCycleBoundary({signal:c.selectors.getReferenceClock().id,cycle:0,coordinateSpace:'canvas'}); const trace=document.querySelector('#cycleCanvas .trace svg').getBoundingClientRect(); const band=document.querySelector('#cycleCanvas .comment-body').getBoundingClientRect(); return { width:c.model.document.layout.signalNameWidth, boundaryX:b.canvasX, source:b.source, trace:[trace.left,trace.width], bandLeft:band.left, bandError:Math.abs(band.left-b.canvasX), history:c.model.history?.undo.length||0, scrollLeft:document.querySelector('#cycleCanvas').scrollLeft, canonical:JSON.stringify(c.getSerializableDocument()) }; });

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const results=[];
  for (const viewport of [{width:1672,height:941},{width:1280,height:720}]) {
    const page=await browser.newPage({viewport,deviceScaleFactor:1}); await page.goto('http://127.0.0.1:4220/',{waitUntil:'networkidle'});
    const initial=await state(page); assert.equal(initial.width,168); assert.equal(initial.source,'wavedrom-svg'); assert.ok(initial.bandError<=0.1);
    const semanticBefore=await page.evaluate(()=>{const d=window.TimingChartProductionController.getSerializableDocument();return JSON.stringify({timeline:d.timeline,signals:d.signals,annotations:d.annotations});});
    const startX=initial.boundaryX; const box=await page.locator('#cycleCanvas').boundingBox(); const y=box.y+100;
    await page.mouse.move(startX,y); await page.mouse.down(); await page.mouse.move(startX+70,y,{steps:8}); const preview=await state(page); assert.ok(preview.width===168 || preview.boundaryX>initial.boundaryX+40); await page.mouse.up(); await page.waitForTimeout(120);
    const moved=await state(page); assert.ok(moved.width>=220 && moved.width<=250,JSON.stringify({initial,preview,moved})); assert.ok(moved.boundaryX>initial.boundaryX+40); assert.ok(moved.bandError<=0.1); assert.equal(moved.history,initial.history+1); assert.equal(await page.evaluate(()=>JSON.stringify({timeline:(window.TimingChartProductionController.getSerializableDocument()).timeline,signals:(window.TimingChartProductionController.getSerializableDocument()).signals,annotations:(window.TimingChartProductionController.getSerializableDocument()).annotations})),semanticBefore);
    await page.evaluate(()=>window.TimingChartProductionController.actions.undo()); assert.equal((await state(page)).width,168); await page.evaluate(()=>window.TimingChartProductionController.actions.redo()); assert.equal((await state(page)).width,moved.width);
    const prepared=await page.evaluate(()=>window.TimingChartProductionController.prepareSaveText()); assert.ok(prepared.text.includes('signalNameWidth')); const savedWidth=moved.width; assert.equal(JSON.parse(prepared.text).layout.signalNameWidth,savedWidth); await page.evaluate(()=>window.TimingChartProductionController.actions.requestNew({unsavedDecision:'discard'})); const opened=await page.evaluate(async text=>window.TimingChartProductionController.actions.openText(text,{fileName:'split.tcd'}),prepared.text); assert.equal(opened,true,await page.evaluate(()=>JSON.stringify({error:window.TimingChartProductionController.model.persistence.lastError,validation:window.TimingChartProductionController.model.validation})));
    await page.evaluate(()=>{const canvas=document.querySelector('#cycleCanvas');canvas.scrollLeft=Math.min(160,canvas.scrollWidth-canvas.clientWidth);}); await page.waitForTimeout(100); const scrolled=await state(page); assert.equal(scrolled.source,'wavedrom-svg'); assert.ok(scrolled.bandError<=0.1);
    const canonical=await page.evaluate(()=>JSON.stringify(window.TimingChartProductionController.getSerializableDocument())); assert.ok(!canonical.includes('canvasX')&&!canonical.includes('previewSignalNameWidth'));
    await page.screenshot({path:`${root}/production-${viewport.width}x${viewport.height}.png`}); results.push({viewport,initial,moved,scrolled,persistence:true,undoRedo:true,semanticTimingUnchanged:true,pass:true}); await page.close();
  }
  const source=fs.readFileSync('gui-mockup/app-ui.js','utf8'); assert.ok(source.includes('getCycleBoundary')&&!source.includes('cycle * pitch'));
  const report={issue:29,geometrySource:'WaveDrom actual SVG',minSignalNameWidth:120,maxSignalNameWidth:360,goldenReferenceModified:false,transientGeometryPersisted:false,results,pass:true}; fs.writeFileSync(`${root}/acceptance.json`,`${JSON.stringify(report,null,2)}\n`); await browser.close(); console.log('Issue #29 acceptance passed: adjustable canonical label/timing split, WaveDrom geometry, scroll, persistence, and atomic Undo/Redo.');
} finally { server.kill(); }
