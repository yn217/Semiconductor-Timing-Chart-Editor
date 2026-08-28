import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sampleDir=path.join(root,'samples','golden-protocol','timing_chart_sample_pack','samples');
const files=['01_apb_register_access.tcd.json','02_ahb_lite_pipelined_transfer.tcd.json','03_axi4_full_write_burst.tcd.json'];
const documents=await Promise.all(files.map(file=>fs.readFile(path.join(sampleDir,file),'utf8')));
const out=path.join(root,'artifacts','issue46');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
await page.goto(`file://${path.join(root,'gui-mockup','index.html').replaceAll('\\','/')}`);
await page.waitForTimeout(350);
const result=await page.evaluate(async ({documents,files})=>{
  const c=window.TimingChartProductionController;
  const snapshots=[];
  for(let i=0;i<documents.length;i+=1){
    const opened=await c.actions.openText(documents[i],{fileName:files[i],unsavedDecision:'discard'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const modelGroups=(c.model.document.signalGroups||[]).map(group=>({id:group.id,rows:[...(group.rows||[])]}));
    const domGroups=[...document.querySelectorAll('#groups > .group')].map(group=>({id:group.dataset.groupId,rows:[...group.querySelectorAll(':scope > .row')].map(row=>row.dataset.signal)}));
    snapshots.push({opened,modelGroups,domGroups,domRows:[...document.querySelectorAll('#groups .row[data-signal]')].map(row=>row.dataset.signal)});
  }
  const before=JSON.stringify(c.getSerializableDocument());
  const beforeTree=[...document.querySelectorAll('#groups .row[data-signal]')].map(row=>row.dataset.signal);
  const invalid=await c.actions.openText('{not-json',{fileName:'broken.tcd',unsavedDecision:'discard'});
  const after=JSON.stringify(c.getSerializableDocument());
  const afterTree=[...document.querySelectorAll('#groups .row[data-signal]')].map(row=>row.dataset.signal);
  return {snapshots,invalid,beforeEqualsAfter:before===after,treePreserved:JSON.stringify(beforeTree)===JSON.stringify(afterTree)};
},{documents,files});
for(const snapshot of result.snapshots){
  assert.equal(snapshot.opened,true);
  assert.deepEqual(snapshot.domGroups,snapshot.modelGroups);
}
assert.equal(result.invalid,false);
assert.equal(result.beforeEqualsAfter,true);
assert.equal(result.treePreserved,true);
assert.equal(errors.length,0,errors.join('\n'));
await page.screenshot({path:path.join(out,'issue46-1672x941.png')});
await browser.close();
await fs.writeFile(path.join(out,'acceptance.json'),`${JSON.stringify({issue:46,sequentialOpen:true,replaceStyleReconciliation:true,failedOpenPreservesDocument:true,errors,pass:true},null,2)}\n`);
console.log('Issue #46 acceptance passed: sequential Open replaces Signal Tree groups/rows and failed Open preserves the current document.');
