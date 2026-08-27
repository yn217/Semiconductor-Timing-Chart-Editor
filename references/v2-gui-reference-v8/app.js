
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

$$('.chevron').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const group=btn.closest('.group-row').dataset.group;
    const expanded=btn.getAttribute('aria-expanded')==='true';
    btn.setAttribute('aria-expanded',String(!expanded));
    btn.style.transform=expanded?'rotate(-90deg)':'';
    // IMPORTANT: tree disclosure is tree-only. It does not change waveform visibility.
    $$(`[data-group-child="${group}"]`).forEach(row=>row.classList.toggle('collapsed-by-group',expanded));
  });
});

function setWaveVisible(name, visible){
  $$(`[data-row="${CSS.escape(name)}"]`).forEach(el=>{
    el.classList.toggle('hidden-wave',!visible);
  });
  const treeRow=$$('.signal-row').find(r=>r.dataset.signal===name);
  if(treeRow){
    treeRow.classList.toggle('dimmed',!visible);
    const eye=$('.eye',treeRow);
    eye.classList.toggle('on',visible); eye.classList.toggle('off',!visible);
    eye.setAttribute('aria-label',visible?'Hide waveform':'Show waveform');
    eye.innerHTML = visible
      ? '<svg class="eye-icon" viewBox="0 0 20 20"><path d="M2.5 10s2.6-4.2 7.5-4.2 7.5 4.2 7.5 4.2-2.6 4.2-7.5 4.2S2.5 10 2.5 10Z" fill="none" stroke="currentColor" stroke-width="1.35"/><circle cx="10" cy="10" r="2.1" fill="none" stroke="currentColor" stroke-width="1.35"/></svg>'
      : '<svg class="eyeoff-icon" viewBox="0 0 20 20"><path d="M3 3l14 14M2.5 10s2.6-4.2 7.5-4.2c1.4 0 2.6.35 3.6.85M17.5 10s-2.6 4.2-7.5 4.2c-1.45 0-2.7-.37-3.73-.9" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>';
  }
  if($('#insName').value===name) $('#insVisible').checked=visible;
}
$$('.eye').forEach(btn=>btn.addEventListener('click',e=>{
  e.stopPropagation();
  const row=btn.closest('.signal-row');
  setWaveVisible(row.dataset.signal,btn.classList.contains('off'));
}));

$$('.signal-row').forEach(row=>row.addEventListener('click',e=>{
  if(e.target.closest('button')) return;
  const name=row.dataset.signal, role=row.dataset.role, comment=row.dataset.kind==='comment';
  $('#statusSelected').textContent=name; $('#insName').value=name; $('#leafSignal').textContent=name; $('#editSignal').textContent=name;
  $('#editType').textContent=comment?'Annotation':name==='clk'?'Clock':'Signal';
  $('#insRole').value=role==='internal'?'wire':role;
  $('#insVisible').checked=!$(`[data-row="${CSS.escape(name)}"]`)?.classList.contains('hidden-wave');
}));

$('#insVisible').addEventListener('change',()=>setWaveVisible($('#insName').value,$('#insVisible').checked));

$('#searchBox').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  $$('.signal-row').forEach(row=>{
    const groupCollapsed=row.classList.contains('collapsed-by-group');
    const match=(row.dataset.signal||'').toLowerCase().includes(q);
    row.style.display=q&&!match?'none':groupCollapsed?'none':'';
  });
});

$$('.mode').forEach(b=>b.addEventListener('click',()=>{$$('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));
$$('.tab').forEach(b=>b.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));
$$('.btab').forEach(b=>b.addEventListener('click',()=>{$$('.btab').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));
let zoom=100;function applyZoom(){ $('#zoomPct').textContent=zoom+'%';$('#statusZoom').textContent='Zoom: '+zoom+'%';}
$('#zoomOut').addEventListener('click',()=>{zoom=Math.max(50,zoom-25);applyZoom()});$('#zoomIn').addEventListener('click',()=>{zoom=Math.min(200,zoom+25);applyZoom()});
$$('.toggle').forEach(b=>b.addEventListener('click',()=>{b.classList.toggle('on');if(b.dataset.toggle==='minimap')$('#minimap').style.display=b.classList.contains('on')?'':'none'}));
