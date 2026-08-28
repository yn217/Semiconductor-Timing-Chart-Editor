import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts','issue112');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
await page.goto(`file://${path.join(root,'gui-mockup','index.html').replaceAll('\\','/')}`);
await page.waitForTimeout(350);

const result=await page.evaluate(()=>{
  const c=window.TimingChartProductionController;
  const documentBefore=JSON.stringify(c.getSerializableDocument());
  const waveBefore=c.timeAxisMetrics?.waveDromRenders||0;
  const cases=[
    {id:'req_addr[7:0]',type:'bus',values:['00','12','34','9A'],header:'Display format'},
    {id:'req_valid',type:'binary',values:['0','1','0'],header:'Value'},
    {id:'state[1:0]',type:'state',values:['IDLE','REQ','WAIT','EXEC','DONE','IDLE'],header:'State'},
    {id:'rdata[15:0]',type:'bus',values:[],header:'Display format'},
    {id:'clk',type:'clock',values:[],header:'Period (cycles)'}
  ];
  const snapshots=[];
  for(const item of cases){
    const row=document.querySelector(`.row[data-signal="${CSS.escape(item.id)}"]`);
    if(!row) throw new Error(`missing row ${item.id}`);
    row.click();
    const rows=[...document.querySelectorAll('#bottomContent tbody tr[data-editor-index]')];
    const values=[...document.querySelectorAll('#bottomContent [data-editor-field="value"]')].map(input=>input.value);
    const editorText=document.querySelector('#bottomContent')?.innerText||'';
    const inspectorInputs=[...document.querySelectorAll('#inspectorBody input')].map(input=>input.value);
    snapshots.push({id:item.id,selection:c.model.selection.id,toolbar:document.querySelector('#bottomContent .selected-line')?.textContent||'',rows:rows.length,values,headerPresent:editorText.includes(item.header),inspectorMatches:inspectorInputs.includes(item.id)});
  }
  const rapid=['req_valid','req_addr[7:0]','state[1:0]','rdata[15:0]','clk'];
  const rapidSnapshots=[];
  for(const id of rapid){document.querySelector(`.row[data-signal="${CSS.escape(id)}"]`).click();rapidSnapshots.push({id,selection:c.model.selection.id,toolbar:document.querySelector('#bottomContent .selected-line')?.textContent||'',renderedTab:document.querySelector('#bottomContent')?.dataset.renderedTab||''});}
  return {documentBefore,waveBefore,snapshots,rapidSnapshots,documentAfterSelection:JSON.stringify(c.getSerializableDocument()),waveAfterSelection:c.timeAxisMetrics?.waveDromRenders||0,dirty:c.model.persistence.dirty,metrics:c.selectionMetrics};
});

const expected={
  'req_addr[7:0]':{type:'bus',rows:4,values:['00','12','34','9A'],header:'Display format'},
  req_valid:{type:'binary',rows:3,values:['0','1','0'],header:'Value'},
  'state[1:0]':{type:'state',rows:6,values:['IDLE','REQ','WAIT','EXEC','DONE','IDLE'],header:'State'},
  'rdata[15:0]':{type:'bus',rows:4,values:[],header:'Display format'},
  clk:{type:'clock',rows:0,values:[],header:'Period (cycles)'}
};
for(const snapshot of result.snapshots){
  const e=expected[snapshot.id];
  assert.equal(snapshot.selection,snapshot.id);
  assert.match(snapshot.toolbar,new RegExp(snapshot.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(snapshot.headerPresent,true);
  assert.equal(snapshot.inspectorMatches,true);
  assert.equal(snapshot.rows,e.rows);
  if(e.values.length)assert.deepEqual(snapshot.values,e.values);
}
assert.ok(result.rapidSnapshots.every(item=>item.selection===item.id&&item.renderedTab==='signal'));
assert.equal(result.documentBefore,result.documentAfterSelection);
assert.equal(result.waveBefore,result.waveAfterSelection);
assert.equal(result.dirty,false);
assert.equal(errors.length,0,errors.join('\n'));
await page.screenshot({path:path.join(out,'issue112-1672x941.png')});
await browser.close();
await fs.writeFile(path.join(out,'acceptance.json'),`${JSON.stringify({issue:112,canonicalRows:true,rapidSelectionNewestWins:true,selectionDoesNotMutateDocument:true,waveDromRegenerations:0,errors,pass:true},null,2)}\n`);
console.log('Issue #112 acceptance passed: canonical Signal editors update synchronously for Binary/Bus/State/Clock selection without WaveDrom regeneration.');
