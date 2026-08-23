import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts','issue47');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
await page.goto(`file://${path.join(root,'gui-mockup','index.html').replaceAll('\\','/')}`);
await page.waitForTimeout(350);

const result=await page.evaluate(async()=>{
  const c=window.TimingChartProductionController;
  const source=c.getSerializableDocument();
  const group=source.signalGroups[0];
  for(let index=0;index<60;index+=1){
    const id=`minimap_bulk_${index}`;
    source.signals.push({id,name:id,type:'binary',role:'internal',values:[{start:0,value:index%2}]});
    group.rows.push(id);
  }
  const opened=await c.actions.openText(JSON.stringify(source),{fileName:'large-minimap.tcd',unsavedDecision:'discard'});
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const body=document.querySelector('.inspector-body');
  body.replaceChildren(...Array.from({length:80},(_,index)=>{const section=document.createElement('div');section.className='section';section.textContent=`Tall Inspector field ${index}`;return section;}));
  const measure=()=>{
    const workspace=document.querySelector('.workspace')?.getBoundingClientRect();
    const inspector=document.querySelector('.inspector')?.getBoundingClientRect();
    const mini=document.querySelector('.inspector .minimap')?.getBoundingClientRect();
    const bodyRect=body?.getBoundingClientRect();
    return {workspace,inspector,mini,bodyRect,bodyScrollHeight:body?.scrollHeight||0,bodyClientHeight:body?.clientHeight||0,miniVisible:mini?.height>0&&!document.querySelector('.inspector .minimap')?.hidden};
  };
  const large=measure();
  const miniButton=document.querySelector('[data-view-command="minimap"]');
  [...document.querySelectorAll('.ribbon-tabs .rtab')].find(tab=>tab.textContent.trim()==='表示')?.click();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  miniButton?.click();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const hidden=measure();
  miniButton?.click();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const restored=measure();
  return {opened,signalCount:c.model.document.signals.length,large,hidden,restored,layout:document.querySelector('.inspector')?.dataset.minimapLayout};
});

assert.equal(result.opened,true);
assert.ok(result.signalCount>=69);
assert.ok(result.large.bodyScrollHeight>result.large.bodyClientHeight);
assert.ok(result.large.miniVisible);
assert.ok(result.large.mini.bottom<=result.large.inspector.bottom+0.1);
assert.ok(result.large.mini.height>=100);
assert.equal(result.hidden.miniVisible,false);
assert.ok(result.restored.miniVisible);
assert.ok(result.restored.mini.bottom<=result.restored.inspector.bottom+0.1);
assert.equal(errors.length,0,errors.join('\n'));
await page.screenshot({path:path.join(out,'issue47-1672x941.png')});
await browser.close();
await fs.writeFile(path.join(out,'acceptance.json'),`${JSON.stringify({issue:47,largeSignalOpen:true,inspectorBodyScrolls:true,minimapPinned:true,minimapToggle:true,errors,pass:true},null,2)}\n`);
console.log('Issue #47 acceptance passed: tall Inspector content scrolls independently and MiniMap remains pinned and toggleable.');
