(()=>{
'use strict';
const byEdit=(host,key)=>host.querySelector(`[data-edit="${key}"]`)?.closest('.field');
function enhanceBottom(){
  const host=document.getElementById('bottomContent'); if(!host)return;
  host.classList.add('golden-bottom');
  const table=host.querySelector('.event-table');
  if(table){
    host.classList.add('golden-signal-editor');
    const quick=host.querySelector('.quick-buttons');
    if(quick&&!quick.dataset.golden){quick.dataset.golden='1';quick.classList.add('golden-actionbar');host.insertBefore(quick,table);}
  }
  const form=host.querySelector('.form');
  if(form&&!form.dataset.golden){
    form.dataset.golden='1'; host.classList.add('golden-annotation-editor');
    const range=document.createElement('fieldset'); range.className='golden-fieldset golden-range'; range.innerHTML='<legend>範囲</legend>';
    const label=document.createElement('fieldset'); label.className='golden-fieldset golden-label'; label.innerHTML='<legend>ラベル</legend>';
    const style=document.createElement('fieldset'); style.className='golden-fieldset golden-style'; style.innerHTML='<legend>位置調整</legend>';
    ['start.signal','start.cycle','end.signal','end.cycle'].forEach(k=>{const n=byEdit(form,k);if(n)range.appendChild(n);});
    {const n=byEdit(form,'label');if(n)label.appendChild(n);}
    ['offset.x','offset.y'].forEach(k=>{const n=byEdit(form,k);if(n)style.appendChild(n);});
    form.innerHTML=''; form.append(range,label,style);
  }
  const json=host.querySelector('.json-view');
  if(json){host.classList.add('golden-json-editor');json.classList.add('golden-json-area');}
}
function enhanceInspector(){
  const host=document.getElementById('inspectorContent'); if(!host)return;
  host.classList.add('golden-inspector');
  const content=host.querySelector('.inspector-content');if(!content||content.dataset.golden)return;
  content.dataset.golden='1';
  const fields=[...content.children];
  const basic=document.createElement('section');basic.className='golden-inspector-section';basic.innerHTML='<h3>基本</h3>';
  const layout=document.createElement('section');layout.className='golden-inspector-section';layout.innerHTML='<h3>配置</h3>';
  fields.forEach(n=>{
    const t=(n.textContent||'').toLowerCase();
    if(t.includes('spacing')||t.includes('offset')||t.includes('row height')||t.includes('alignment')||t.includes('width'))layout.appendChild(n);else basic.appendChild(n);
  });
  content.replaceChildren(basic,layout);
}
function enhance(){enhanceBottom();enhanceInspector();}
const obs=new MutationObserver(enhance);obs.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('DOMContentLoaded',enhance);setTimeout(enhance,0);
})();
