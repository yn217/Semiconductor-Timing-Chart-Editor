import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apb=await fs.readFile(path.join(root,'samples','golden-protocol','timing_chart_sample_pack','samples','01_apb_register_access.tcd.json'),'utf8');
const out=path.join(root,'artifacts','issue61'); await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[]; page.on('pageerror',error=>errors.push(error.stack||error.message));
let unexpectedDialog=''; page.on('dialog',dialog=>{unexpectedDialog=dialog.message(); void dialog.dismiss();});
await page.goto(`file://${path.join(root,'gui-mockup','index.html').replaceAll('\\','/')}`); await page.waitForTimeout(400);

const dragRange=async(start,end,selector='.timing-scroll-pane .wave-row .trace',yMode='center')=>{
  const points=await page.evaluate(({start,end,selector,yMode})=>{
    const c=window.TimingChartProductionController; const clock=c.selectors.getReferenceClock();
    const target=document.querySelector(selector); const row=target?.closest('.wave-row') || target;
    const a=c.getCycleBoundary({signal:clock.id,cycle:start,coordinateSpace:'canvas'}); const b=c.getCycleBoundary({signal:clock.id,cycle:end,coordinateSpace:'canvas'}); const rect=row.getBoundingClientRect(); return {a:a.canvasX,b:b.canvasX,y:yMode==='blank'?rect.top+1:rect.top+rect.height/2};
  },{start,end,selector,yMode});
  await page.mouse.move(points.a,points.y); await page.mouse.down();
  for (let index=1; index<=4; index+=1) { await page.mouse.move(points.a+(points.b-points.a)*index/4,points.y,{steps:1}); await page.waitForTimeout(8); }
  await page.mouse.up(); await page.waitForTimeout(20);
};
const dispatchRange=async(start,end)=>await page.evaluate(({start,end})=>{
  const c=window.TimingChartProductionController; const clock=c.selectors.getReferenceClock(); const a=c.getCycleBoundary({signal:clock.id,cycle:start,coordinateSpace:'canvas'}); const b=c.getCycleBoundary({signal:clock.id,cycle:end,coordinateSpace:'canvas'}); const target=document.querySelector('#cycleCanvas .wave-row .trace');
  const init={bubbles:true,button:0,pointerId:91,pointerType:'mouse',clientX:a.canvasX,clientY:1}; target.dispatchEvent(new PointerEvent('pointerdown',init));
  for(let i=1;i<=4;i+=1) target.dispatchEvent(new PointerEvent('pointermove',{...init,clientX:a.canvasX+(b.canvasX-a.canvasX)*i/4}));
  target.dispatchEvent(new PointerEvent('pointerup',{...init,clientX:b.canvasX}));
},{start,end});

await page.evaluate(()=>{const host=window.TimingChartTimingViewport.getScrollHost();host.scrollLeft=Math.min(320,host.scrollWidth-host.clientWidth);}); await page.waitForTimeout(40);
const first=await page.evaluate(()=>({cycleCount:window.TimingChartProductionController.model.document.timeline.cycleCount,wave:window.TimingChartProductionController.timeAxisMetrics.waveDromRenders,history:window.TimingChartProductionController.model.history.undo.length}));
await dragRange(3,7);
const selected=await page.evaluate(()=>{const c=window.TimingChartProductionController;const t=c.model.timeSelection;const overlay=document.querySelector('[data-time-range-selection]');const tool=[...document.querySelectorAll('.tool')].find(n=>n.querySelector('.tool-label')?.textContent?.replace(/\s/g,'').includes('範囲削除'));return {range:[t.rangeStart,t.rangeEnd],overlayVisible:Boolean(overlay),overlayWidth:overlay?.getBoundingClientRect().width||0,deleteEnabled:tool?.disabled===false,wave:c.timeAxisMetrics.waveDromRenders,history:c.model.history.undo.length};});
assert.deepEqual(selected.range,[3,7]); assert.ok(selected.overlayVisible&&selected.overlayWidth>0); assert.equal(selected.deleteEnabled,true); assert.equal(selected.wave,first.wave); assert.equal(selected.history,first.history);
await page.evaluate(()=>{window.prompt=()=>{throw new Error('numeric prompt is forbidden');};});
await page.getByRole('button',{name:/範囲\s*削除/}).click(); await page.waitForTimeout(80);
const deleted=await page.evaluate(()=>{const c=window.TimingChartProductionController;return {cycleCount:c.model.document.timeline.cycleCount,range:[c.model.timeSelection.rangeStart,c.model.timeSelection.rangeEnd],history:c.model.history.undo.length,overlay:Boolean(document.querySelector('[data-time-range-selection]'))};});
assert.equal(deleted.cycleCount,first.cycleCount-4); assert.deepEqual(deleted.range,[null,null]); assert.equal(deleted.history,first.history+1); assert.equal(deleted.overlay,false); assert.equal(unexpectedDialog,'');
assert.equal(await page.evaluate(()=>window.TimingChartProductionController.actions.undo()),true); await page.waitForTimeout(50); assert.equal(await page.evaluate(()=>window.TimingChartProductionController.model.document.timeline.cycleCount),first.cycleCount);

await page.reload(); await page.waitForTimeout(400);
await page.evaluate(() => { const node=document.querySelector('#cycleCanvas'); const original=node.setPointerCapture?.bind(node); window.__pointerCaptureCount=0; if(original) node.setPointerCapture=id=>{window.__pointerCaptureCount+=1; return original(id);}; });
await page.evaluate(()=>{const node=window.TimingChartTimingViewport?.getScrollHost?.(); if(node) node.scrollLeft=Math.min(420,node.scrollWidth-node.clientWidth);}); await page.waitForTimeout(40);
const beforeReverseWave=await page.evaluate(()=>window.TimingChartProductionController.timeAxisMetrics.waveDromRenders);
await dragRange(7,3); const reverse=await page.evaluate(()=>({range:[window.TimingChartProductionController.model.timeSelection.rangeStart,window.TimingChartProductionController.model.timeSelection.rangeEnd],capture:window.__pointerCaptureCount,wave:window.TimingChartProductionController.timeAxisMetrics.waveDromRenders})); assert.deepEqual(reverse.range,[3,7]); assert.ok(reverse.capture>0); assert.equal(reverse.wave,beforeReverseWave);
await page.keyboard.press('Escape'); assert.deepEqual(await page.evaluate(()=>[window.TimingChartProductionController.model.timeSelection.rangeStart,window.TimingChartProductionController.model.timeSelection.rangeEnd]),[null,null]);

await page.evaluate(()=>{window.TimingChartTimingViewport.getScrollHost().scrollLeft=0;}); await page.waitForTimeout(40);
for (const selector of ['.timing-scroll-pane .wave-row[data-signal="req_addr[7:0]"] .trace', '.timing-scroll-pane .wave-row[data-kind="comment"] .comment-body']) {
  await dragRange(2,5,selector,'blank');
  assert.deepEqual(await page.evaluate(()=>[window.TimingChartProductionController.model.timeSelection.rangeStart,window.TimingChartProductionController.model.timeSelection.rangeEnd]),[2,5]);
  await page.keyboard.press('Escape');
}
await page.evaluate(async text=>{await window.TimingChartProductionController.actions.openText(text,{fileName:'01_apb_register_access.tcd.json',unsavedDecision:'discard'});},apb); await page.waitForTimeout(80);
const shiftResult=await page.evaluate(()=>{const c=window.TimingChartProductionController,clock=c.selectors.getReferenceClock(),a=c.getCycleBoundary({signal:clock.id,cycle:2,coordinateSpace:'canvas'}),b=c.getCycleBoundary({signal:clock.id,cycle:5,coordinateSpace:'canvas'}); c.actions.selectTimeAtCanvasX(a.canvasX); c.actions.selectTimeAtCanvasX(b.canvasX,{shiftKey:true}); return [c.model.timeSelection.rangeStart,c.model.timeSelection.rangeEnd];}); assert.deepEqual(shiftResult,[2,5]); await page.keyboard.press('Escape');
for (const zoom of [50,100,150,200]) { assert.equal(await page.evaluate(value=>window.TimingChartProductionController.actions.setZoom(value),zoom),true); await page.waitForTimeout(60); }
const host=page.locator('.timing-scroll-pane'); await host.evaluate(node=>{node.scrollLeft=Math.min(320,node.scrollWidth-node.clientWidth);}); await page.waitForTimeout(30); const waveBeforeDrag=await page.evaluate(()=>window.TimingChartProductionController.timeAxisMetrics.waveDromRenders); await dragRange(3,7); const afterDynamic=await page.evaluate(()=>{const c=window.TimingChartProductionController;return {range:[c.model.timeSelection.rangeStart,c.model.timeSelection.rangeEnd],wave:c.timeAxisMetrics.waveDromRenders};}); assert.deepEqual(afterDynamic.range,[3,7]); assert.equal(afterDynamic.wave,waveBeforeDrag);

await page.setViewportSize({width:1280,height:720}); await page.waitForTimeout(100); await page.evaluate(()=>{const node=window.TimingChartTimingViewport?.getScrollHost?.(); if(node) node.scrollLeft=0; window.TimingChartProductionController.actions.setZoom(50);}); await page.waitForTimeout(100); await page.keyboard.press('Escape'); await dispatchRange(2,5); assert.deepEqual(await page.evaluate(()=>[window.TimingChartProductionController.model.timeSelection.rangeStart,window.TimingChartProductionController.model.timeSelection.rangeEnd]),[2,5]);
assert.equal(errors.length,0,errors.join('\n')); await page.screenshot({path:path.join(out,'issue61-1280x720.png')}); await page.setViewportSize({width:1672,height:941}); await page.waitForTimeout(80); await page.screenshot({path:path.join(out,'issue61-1672x941.png')}); await browser.close();
await fs.writeFile(path.join(out,'acceptance.json'),`${JSON.stringify({issue:61,dragSelection:true,reverseDrag:true,deleteWithoutPrompt:true,undo:true,afterOpen:true,zoom150:true,scroll:true,viewport1280:true,waveDromRegenerationsDuringDrag:0,errors,pass:true},null,2)}\n`);
console.log('Issue #61 acceptance passed: geometry-backed range selection, prompt-free delete, Undo, Open/Zoom/scroll, and 1280x720 drag.');
