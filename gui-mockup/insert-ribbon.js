(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const normalize = value => String(value || '').replace(/[\s\n]+/g, '').trim();
  const icon = id => `<svg aria-hidden="true"><use href="icons.svg#${id}"></use></svg>`;
  const meta = (id, label, description, affects) => ({ id, label, description, affects });
  const commandMeta = new Map();
  const addButton = (id, label, iconId, description, handler, group) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tool'; button.dataset.insertCommand = id;
    const info = meta(id, label, description, group); commandMeta.set(id, info);
    button.dataset.tooltipMeta = JSON.stringify(info); button.title = description; button.innerHTML = `${icon(iconId)}<span class="tool-label">${label}</span>`;
    button.dataset.controlStatus = 'implemented';
    button.addEventListener('click', event => { event.preventDefault(); handler(event); });
    return button;
  };
  const group = (title, children) => { const node = document.createElement('div'); node.className = 'rgroup'; children.forEach(child => node.appendChild(child)); const caption = document.createElement('div'); caption.className = 'rgroup-title'; caption.textContent = title; node.appendChild(caption); return node; };
  const menu = (id, items) => {
    const node = document.createElement('div'); node.id = id; node.hidden = true; node.style.cssText = 'position:fixed;z-index:2200;display:grid;gap:2px;padding:5px;background:#fff;border:1px solid #b8c5d4;border-radius:4px;box-shadow:0 6px 18px #0003;';
    items.forEach(item => { const button = document.createElement('button'); button.type = 'button'; button.textContent = item.label; button.dataset.insertMenuCommand = item.id; button.dataset.controlStatus = item.disabled ? 'disabled' : 'implemented'; button.title = item.description; button.disabled = Boolean(item.disabled); button.style.cssText = 'border:0;background:#fff;text-align:left;padding:6px 10px;'; if (!item.disabled) button.addEventListener('click', () => { item.handler(); node.hidden = true; }); node.appendChild(button); });
    document.body.appendChild(node); return node;
  };
  const closeMenus = () => document.querySelectorAll('[data-insert-menu]').forEach(node => { node.hidden = true; });
  const openMenu = (node, anchor) => { closeMenus(); const rect = anchor.getBoundingClientRect(); node.style.left = `${rect.left}px`; node.style.top = `${rect.bottom + 3}px`; node.hidden = false; };
  const groupId = () => controller.model.document.signalGroups[0]?.id;
  const addSignal = type => controller.actions.addSignal({ type, name: `${type}_${Date.now()}`, role: 'internal' }, groupId());
  const addAnnotation = type => {
    if (type === 'dependency') return controller.actions.addDependency({ signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: 0 } }, { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: 0 } }, { label: 'Dependency', lineType: 'straight', arrowhead: 'end' });
    return controller.actions.addAnnotation(type, { label: type === 'marker' ? 'Marker' : type === 'range' ? 'Range' : type === 'text' ? 'Text' : 'Callout' });
  };
  const insertPoint = () => Math.max(0, Math.min(Number(controller.model.view.insertionCycle ?? 0), Number(controller.model.document.timeline.cycleCount)));
  const openNDialog = () => {
    closeMenus();
    const dialog = document.createElement('div'); dialog.id = 'insertNCyclesDialog'; dialog.dataset.insertMenu = 'true'; dialog.style.cssText = 'position:fixed;z-index:2201;left:50%;top:38%;transform:translate(-50%,-50%);padding:14px;background:#fff;border:1px solid #b8c5d4;border-radius:5px;box-shadow:0 8px 24px #0003;font:12px sans-serif;';
    dialog.innerHTML = '<b>N Cycle追加</b><label style="display:block;margin-top:8px">Cycles <input data-insert-count type="number" min="1" value="2" style="width:70px"></label><div style="margin-top:10px;text-align:right"><button type="button" data-insert-cancel>Cancel</button> <button type="button" data-insert-apply>Apply</button></div>';
    dialog.querySelector('[data-insert-cancel]').addEventListener('click', () => dialog.remove()); dialog.querySelector('[data-insert-apply]').addEventListener('click', () => { const count = Number(dialog.querySelector('[data-insert-count]').value); if (Number.isInteger(count) && count > 0) controller.actions.insertCycles(insertPoint(), count); dialog.remove(); }); document.body.appendChild(dialog); dialog.querySelector('[data-insert-count]').focus();
  };
  const openHierarchy = command => {
    controller.render?.();
    const item = document.querySelector(`#addMenu [data-hierarchy-command="${command}"]`);
    if (item) { document.querySelector('#addMenu')?.classList.add('show'); item.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  };
  const insert = document.createElement('div'); insert.id = 'ribbonInsert'; insert.className = 'ribbon'; insert.hidden = true; insert.dataset.ribbonPanel = 'insert'; insert.style.display = 'none';
  const signalMenu = menu('insertSignalMenu', [
    { id: 'binary', label: 'Binary', description: 'Binary信号を追加', handler: () => addSignal('binary') },
    { id: 'bus', label: 'Bus', description: 'Bus信号を追加', handler: () => addSignal('bus') },
    { id: 'state', label: 'State', description: 'State信号を追加', handler: () => addSignal('state') },
    { id: 'clock', label: 'Clock', description: 'Clock信号を追加', handler: () => addSignal('clock') }
  ]); signalMenu.dataset.insertMenu = 'true';
  const otherMenu = menu('insertOtherMenu', [
    { id: 'verticalLine', label: 'Vertical Line', description: '縦線注釈を追加', handler: () => addAnnotation('verticalLine') },
    { id: 'bracket', label: 'Bracket', description: 'ブラケット注釈を追加', handler: () => addAnnotation('bracket') },
    { id: 'highlight', label: 'Highlight', description: '背景ハイライト注釈を追加', handler: () => addAnnotation('highlight') }
  ]); otherMenu.dataset.insertMenu = 'true';
  const signalButton = addButton('add-signal', '信号を追加 ▼', 'i-plus', 'Binary / Bus / State / Clock信号を追加', event => openMenu(signalMenu, event.currentTarget), '行');
  const signalGroup = group('行', [signalButton, addButton('add-comment', 'コメント行', 'i-comment', 'Comment Rowを追加', () => controller.actions.addCommentRow({}, groupId()), '行'), addButton('add-spacer', 'Spacer', 'i-spacing', 'Spacerを追加', () => controller.actions.addSpacer(groupId(), 16), '行'), addButton('add-group', 'Group', 'i-plus', 'Presentation Groupを追加', () => controller.actions.addGroup(), '行')]);
  const annotationGroup = group('注釈', [addButton('add-marker', 'マーカー', 'i-comment', 'Marker annotationを追加', () => addAnnotation('marker'), '注釈'), addButton('add-range', '範囲', 'i-spacing', 'Range annotationを追加', () => addAnnotation('range'), '注釈'), addButton('add-text', 'テキスト', 'i-comment', 'Text annotationを追加', () => addAnnotation('text'), '注釈'), addButton('add-callout', 'コールアウト', 'i-comment', 'Callout annotationを追加', () => addAnnotation('callout'), '注釈'), addButton('add-dependency', '依存矢印', 'i-spacing', 'Dependency Arrowを追加', () => addAnnotation('dependency'), '注釈'), (() => { const b = addButton('annotation-other', 'その他 ▼', 'i-more', 'その他のAnnotationを追加', event => openMenu(otherMenu, event.currentTarget), '注釈'); return b; })()]);
  const axisGroup = group('時間軸', [addButton('insert-cycle', 'Cycle追加', 'i-cycle-add', '現在の挿入位置へ1 Cycle追加', () => controller.actions.insertCycles(insertPoint(), 1), '時間軸'), addButton('insert-n-cycles', 'N Cycle追加', 'i-cycle-add', '追加数を指定してAtomicにCycle追加', openNDialog, '時間軸')]);
  const hierarchyGroup = group('階層 / 一括追加', [addButton('full-path', 'フルパス確認', 'i-search', '階層信号のFull Path一覧を表示', () => openHierarchy('full-path'), '階層'), addButton('bulk-add', '信号一括登録', 'i-plus', 'Full PathをParse Previewして一括登録', () => openHierarchy('bulk-add'), '階層')]);
  insert.append(signalGroup, annotationGroup, axisGroup, hierarchyGroup); document.querySelector('#ribbonHome')?.after(insert);
  const home = document.querySelector('#ribbonHome'); const tabs = [...document.querySelectorAll('.ribbon-tabs .rtab')]; const insertTab = tabs.find(tab => normalize(tab.textContent) === '挿入');
  const setRibbon = active => { if (!home || !insertTab) return; const showing = active === insertTab; home.hidden = showing; home.style.display = showing ? 'none' : 'flex'; insert.hidden = !showing; insert.style.display = showing ? 'flex' : 'none'; insertTab.classList.toggle('active', showing); if (showing) document.querySelectorAll('#ribbonHome .rgroup').forEach(node => { if (normalize(node.textContent).includes('Cycle挿入') || normalize(node.textContent).includes('N Cycle挿入')) node.hidden = true; }); };
  if (insertTab) insertTab.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); setRibbon(insertTab); }); tabs.filter(tab => tab !== insertTab).forEach(tab => tab.addEventListener('click', () => setRibbon(tab)));
  document.addEventListener('click', event => { if (!event.target.closest('[data-insert-menu], [data-insert-command]')) closeMenus(); });
  window.TimingChartInsertRibbon = { commandMeta, setRibbon, insertPoint };
})();
