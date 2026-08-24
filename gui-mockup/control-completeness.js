(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const normalize = value => String(value || '').replace(/[\s\n]+/g, '').trim();
  const label = element => normalize(element.querySelector?.('.tool-label')?.textContent || element.textContent || element.getAttribute('aria-label'));
  const inventory = controller.controlAudit = controller.controlAudit || { controls: [], lastRun: 0, metrics: { controlAuditRuns: 0, registrationCalls: 0, observedMutationBatches: 0 } };
  inventory.metrics ??= { controlAuditRuns: 0, registrationCalls: 0, observedMutationBatches: 0 };
  const unsupportedNoOps = /インポート|エクスポート|プレビュー更新|プリセット|^複製$|^削除$|^Import$|^Export$/;

  const record = (element, status, reason = '') => {
    element.dataset.controlStatus = status;
    if (reason) element.title = reason;
    const key = element.dataset.controlKey || `${element.tagName}:${label(element)}:${element.className}`;
    element.dataset.controlKey = key;
    const entry = { key, label: label(element), tag: element.tagName.toLowerCase(), status, reason, visible: !element.hidden && element.offsetParent !== null };
    const index = inventory.controls.findIndex(item => item.key === key);
    if (index < 0) inventory.controls.push(entry); else inventory.controls[index] = entry;
  };
  const disable = (element, reason) => {
    if (!element || element.dataset.controlStatus === 'implemented') return;
    element.disabled = true;
    record(element, 'disabled', reason);
  };
  const implement = (element, handler) => {
    if (!element || element.dataset.controlStatus) return;
    element.dataset.controlStatus = 'implemented';
    element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); handler(event); });
    record(element, 'implemented');
  };

  const selectedGroup = () => {
    const selection = controller.model.selection || {};
    return controller.model.document.signalGroups?.find(group => group.id === controller.model.view.currentGroupId) || controller.model.document.signalGroups?.find(group => (group.rows || []).includes(selection.id)) || controller.model.document.signalGroups?.[0] || null;
  };
  const openLayoutPopup = (kind, target) => {
    document.querySelector('[data-layout-popup]')?.remove();
    const popup = document.createElement('div'); popup.dataset.layoutPopup = kind; popup.style.cssText = 'position:fixed;z-index:2200;min-width:230px;padding:12px;background:#fff;border:1px solid #b8c5d4;border-radius:5px;box-shadow:0 6px 18px #0003;font:12px sans-serif;color:#243047;';
    const rect = target.getBoundingClientRect(); popup.style.left = `${Math.max(4, Math.min(innerWidth - 250, rect.left))}px`; popup.style.top = `${Math.min(innerHeight - 210, rect.bottom + 4)}px`;
    const field = (labelText, name, value) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0"><span>${labelText}</span><input data-layout-field="${name}" type="number" min="0" max="48" step="1" value="${Number(value) || 0}" style="width:76px"></label>`;
    if (kind === 'row') popup.innerHTML = `<b>行間隔</b>${field('Signal / Comment', 'signalSpacing', controller.model.document.layout.signalSpacing ?? 6)}<div style="display:flex;gap:5px;justify-content:flex-end;margin-top:10px"><button type="button" data-layout-action="minus" data-control-status="implemented">−</button><button type="button" data-layout-action="plus" data-control-status="implemented">＋</button><button type="button" data-layout-action="reset" data-control-status="implemented">Reset</button><button type="button" data-layout-action="apply" data-control-status="implemented">Apply</button></div>`;
    else { const group = selectedGroup(); if (!group) return; popup.dataset.groupId = group.id; popup.innerHTML = `<b>Group間隔: ${String(group.name || group.id)}</b>${field('Before', 'spacingBefore', group.spacingBefore)}${field('After', 'spacingAfter', group.spacingAfter)}<div style="display:flex;gap:5px;justify-content:flex-end;margin-top:10px"><button type="button" data-layout-action="reset" data-control-status="implemented">Reset</button><button type="button" data-layout-action="apply" data-control-status="implemented">Apply</button></div>`; }
    const close = () => popup.remove();
    popup.addEventListener('click', event => { const action = event.target.closest('[data-layout-action]')?.dataset.layoutAction; if (!action) return; if (kind === 'row') { const input = popup.querySelector('[data-layout-field="signalSpacing"]'); if (action === 'minus') input.value = Math.max(0, Number(input.value) - 1); if (action === 'plus') input.value = Math.min(48, Number(input.value) + 1); if (action === 'reset') input.value = 6; if (action === 'apply') { if (controller.actions.setGlobalSignalSpacing(input.value)) close(); } } else { const before = popup.querySelector('[data-layout-field="spacingBefore"]'); const after = popup.querySelector('[data-layout-field="spacingAfter"]'); if (action === 'reset') { before.value = 0; after.value = 0; } if (action === 'apply') { if (controller.actions.setGroupSpacingValues(popup.dataset.groupId, before.value, after.value)) close(); } } });
    popup.addEventListener('keydown', event => { if (event.key === 'Escape') close(); if (event.key === 'Enter') popup.querySelector('[data-layout-action="apply"]')?.click(); });
    document.body.appendChild(popup); controller.controlAudit?.registerSubtree?.(popup); popup.querySelector('input')?.focus();
  };

  const applyRibbon = () => {
    document.querySelectorAll('.ribbon-tabs .rtab').forEach(tab => {
      const text = normalize(tab.textContent);
      if (text === 'ファイル' || text === 'ホーム') { record(tab, 'implemented'); return; }
      if (tab.dataset.controlStatus !== 'implemented') {
        tab.dataset.controlStatus = 'implemented';
        tab.addEventListener('click', () => {
          document.querySelectorAll('.ribbon-tabs .rtab').forEach(item => item.classList.toggle('active', item === tab));
          document.querySelector('#ribbonHome')?.setAttribute('data-active-ribbon', text);
        });
      }
      record(tab, 'implemented', 'Ribbon tab selection is implemented; detailed commands remain tracked by #32 / #34');
    });
    const homeActions = [
      ['Zoom−', () => controller.actions.setZoom(Math.max(25, Math.round(controller.model.view.zoom * 100) - 10))],
      ['Zoom＋', () => controller.actions.setZoom(Math.min(400, Math.round(controller.model.view.zoom * 100) + 10))],
      ['100%Zoom', () => controller.actions.setZoom(100)],
      ['全体表示', () => controller.actions.fitAll()],
      ['選択に合わせる', () => controller.actions.fitSelection()]
    ];
    const editActions = new Map([
      ['切取', ['cut', () => controller.actions.cutSelection()]],
      ['コピー', ['copy', () => controller.actions.copySelection()]],
      ['貼付', ['paste', () => controller.actions.pasteSelection()]],
      ['削除', ['delete', () => controller.actions.deleteSelection()]],
      ['複製', ['duplicate', () => controller.actions.duplicateSelection()]]
    ]);
    const layoutActions = new Map([
      ['行間隔', currentTool => openLayoutPopup('row', currentTool)],
      ['Group間隔', currentTool => openLayoutPopup('group', currentTool)],
      ['自動レイアウト', () => controller.actions.autoLayout()]
    ]);
    document.querySelectorAll('#ribbonHome .tool').forEach(tool => {
      if (tool.dataset.txnAction) return;
      const text = label(tool);
      const action = homeActions.find(([name]) => text.includes(name));
      if (action) { implement(tool, action[1]); return; }
      const edit = [...editActions.entries()].find(([name]) => text === name || (name === '切取' && text.startsWith(name)) || (name === '貼付' && text.startsWith(name)));
      if (edit) { tool.dataset.editCommand = edit[1][0]; implement(tool, edit[1][1]); return; }
      const layout = [...layoutActions.entries()].find(([name]) => text.includes(name));
      if (layout) { implement(tool, () => layout[1](tool)); return; }
      if (text === '上へ' || text === '下へ') {
        implement(tool, () => controller.actions.moveSignalBy(controller.model.selection?.id, text === '上へ' ? -1 : 1));
        return;
      }
      if (/新規|開く|保存|Undo|Redo|Cycle挿入|Cycle削除|NCycle挿入|範囲削除/.test(text)) { record(tool, 'implemented'); return; }
      if (/グリッド|スナップ|ルーラー|ミニマップ/.test(text)) return;
      if (/切取|コピー|貼付|削除|複製|上へ|下へ|別グループへ移動|表示\/非表示|行間隔|Group間隔|自動レイアウト|SVG出力|PNG出力|PDF出力/.test(text)) disable(tool, '未実装の操作です。対応予定: #32 / #34');
    });
    document.querySelectorAll('#ribbonHome .toggles input').forEach(input => { if (input.dataset.viewGuideBound || input.dataset.controlStatus === 'implemented') record(input, 'implemented'); });
  };

  const applyLeftPanel = () => {
    const search = document.querySelector('#leftPanel .search');
    if (search && search.dataset.controlStatus !== 'implemented') {
      search.dataset.controlStatus = 'implemented';
      search.addEventListener('input', () => {
        const query = normalize(search.value).toLowerCase();
        document.querySelectorAll('#groups .row').forEach(row => { row.hidden = Boolean(query) && !normalize(row.textContent).toLowerCase().includes(query); });
      });
      record(search, 'implemented');
    }
    const filter = document.querySelector('#leftPanel .search-row .iconbtn');
    if (filter) { if (filter.dataset.controlStatus === 'implemented') record(filter, 'implemented'); else disable(filter, 'フィルター条件UIは未実装です。対応予定: #32'); }
    const overflow = document.querySelector('#leftPanel .panel-head .iconbtn');
    if (overflow) { if (overflow.dataset.controlStatus === 'implemented') record(overflow, 'implemented'); else disable(overflow, '左パネルの追加メニュー以外の操作は未実装です。対応予定: #32'); }
    if (document.body.dataset.controlInspectorBound === 'true') return;
    document.body.dataset.controlInspectorBound = 'true';
    document.addEventListener('click', event => {
      const commandButton = event.target.closest?.('#issue6ContextMenu [data-command]');
      const command = commandButton?.dataset.command;
      if (command !== 'inspector') return;
      const id = controller.model.selection?.id;
      if (id) {
        controller.model.selection = { kind: 'signal', id };
        controller.actions.setBottomTab('signal');
        controller.renderSelectionFast?.();
      }
    }, { capture: true });
  };

  const disableBottomNoOps = () => {
    document.querySelectorAll('#bottomContent button').forEach(button => {
      if (button.dataset.editorAction || button.dataset.annotationAction || button.dataset.commentAction || button.dataset.clockAction || button.dataset.jsonAction || button.dataset.transactionAction || button.dataset.problemAction) { record(button, 'implemented'); return; }
      if (unsupportedNoOps.test(normalize(button.textContent))) disable(button, 'この操作は未実装です。対応Issue: #38以降');
    });
    document.querySelectorAll('#inspectorBody [data-annotation-field]').forEach(input => {
      if (input.dataset.controlStatus === 'implemented') return;
      input.dataset.controlStatus = 'implemented';
      input.addEventListener('change', () => controller.actions.updateAnnotation(controller.model.selection.id, input.dataset.annotationField, input.type === 'checkbox' ? input.checked : input.value));
      record(input, 'implemented');
    });
    document.querySelectorAll('#inspectorBody input:not([data-annotation-field]), #inspectorBody select:not([data-annotation-field])').forEach(input => {
      input.readOnly = true;
      input.disabled = input.tagName === 'SELECT' || input.type === 'checkbox';
      record(input, 'disabled', 'Inspector項目はread-onlyです。対応予定: #38以降');
    });
  };

  const registerSubtree = root => {
    if (!root) return;
    inventory.metrics.registrationCalls++;
    const descendants = root.querySelectorAll ? [...root.querySelectorAll('button, input, select, .tool, .mini-btn, .rtab')] : [];
    const nodes = [root, ...descendants];
    nodes.forEach(element => {
      if (element.matches?.('[data-annotation-field]') && element.dataset.annotationBound !== 'true') {
        element.dataset.annotationBound = 'true';
        element.addEventListener('change', () => controller.actions.updateAnnotation(controller.model.selection.id, element.dataset.annotationField, element.type === 'checkbox' ? element.checked : element.value));
        record(element, 'implemented');
      }
      if (element.dataset.annotationCommand || element.dataset.insertCommand || element.dataset.insertMenuCommand) {
        if (!element.dataset.controlStatus) element.dataset.controlStatus = element.disabled ? 'disabled' : 'implemented';
        record(element, element.dataset.controlStatus, element.disabled ? element.title : '');
      }
      if (element.matches?.('#bottomContent button') && !element.dataset.commentAction && !element.dataset.clockAction && !element.dataset.jsonAction && !element.dataset.transactionAction && !element.dataset.annotationAction && !element.dataset.editorAction && unsupportedNoOps.test(normalize(element.textContent))) disable(element, 'この操作は未実装です。対応Issue: #38以降');
      if (element.matches?.('#bottomContent .mini-btn') && controller.model.view.tab === 'problems') {
        const text = normalize(element.textContent);
        const filter = text.startsWith('すべて') ? 'all' : text.startsWith('エラー') ? 'err' : text.startsWith('警告') ? 'warn' : text.startsWith('情報') ? 'info' : '';
        if (filter) { element.dataset.problemFilter = filter; record(element, 'implemented'); }
      }
    });
  };

  const refreshReorderControls = () => {
    const selection = controller.model.selection || {};
    const group = controller.model.document.signalGroups?.find(item => (item.rows || []).includes(selection.id));
    const index = group ? group.rows.indexOf(selection.id) : -1;
    const reorderable = (selection.kind === 'signal' || selection.kind === 'comment') && Boolean(group) && index >= 0;
    document.querySelectorAll('#ribbonHome .tool').forEach(tool => {
      if (tool.dataset.txnAction) return;
      const text = label(tool);
      if (text !== '上へ' && text !== '下へ') return;
      const isUp = text === '上へ';
      const atBoundary = !reorderable || (isUp ? index === 0 : index === group.rows.length - 1);
      tool.disabled = atBoundary;
      tool.dataset.controlStatus = 'implemented';
      const reason = !reorderable ? 'SignalまたはComment Rowを選択してください' : atBoundary ? (isUp ? 'このGroupの先頭行です' : 'このGroupの末尾行です') : '';
      if (reason) tool.title = reason; else tool.removeAttribute('title');
    });
  };
  controller.refreshReorderControls = refreshReorderControls;
  const refreshEditControls = () => {
    const state = controller.actions.getSelectionCommandState?.() || {};
    const reasons = { copy: 'コピー対象を選択してください', cut: '切取り可能な対象を選択してください', delete: '削除可能な対象を選択してください', duplicate: '複製可能な対象を選択してください', paste: '貼付可能なアプリ内Clipboardがありません' };
    document.querySelectorAll('#ribbonHome .tool[data-edit-command]').forEach(tool => {
      const command = tool.dataset.editCommand; const enabled = Boolean(state[command]);
      tool.disabled = !enabled; tool.dataset.controlStatus = 'implemented';
      if (enabled) tool.removeAttribute('title'); else tool.title = reasons[command] || '現在の選択では使用できません';
      record(tool, 'implemented', enabled ? '' : tool.title);
    });
  };
  controller.refreshCommandState = refreshEditControls;
  const run = () => {
    inventory.metrics.controlAuditRuns++;
    applyRibbon();
    applyLeftPanel();
    disableBottomNoOps();
    document.querySelectorAll('.seg, #bottomTabs .btab, #leftAdd').forEach(element => record(element, 'implemented'));
    document.querySelectorAll('#bottomTabs input[type="checkbox"]').forEach(element => record(element, 'implemented'));
    document.querySelectorAll('#bottomTabs .follow button').forEach(element => record(element, 'implemented'));
    document.querySelectorAll('.tool button, button').forEach(element => {
      if (normalize(element.textContent).includes('Zoom')) record(element, 'implemented');
    });
    document.querySelectorAll('#bottomContent [data-editor-field], #bottomContent [data-clock-field], #bottomContent [data-comment-field], #bottomContent [data-annotation-field]').forEach(element => record(element, 'implemented'));
    inventory.lastRun = Date.now();
    inventory.visibleEnabled = [...document.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), .tool:not([disabled]), .mini-btn:not([disabled])')].filter(element => !element.hidden && element.offsetParent !== null).length;
  };
  inventory.register = record;
  inventory.registerSubtree = registerSubtree;
  inventory.run = run;
  controller.registerRenderHook?.('control-completeness-reorder', refreshReorderControls);
  controller.registerRenderHook?.('control-completeness-edit', refreshEditControls);
  document.addEventListener('click', event => {
    if (event.target.closest?.('#groups .row')) requestAnimationFrame(refreshReorderControls);
  }, true);
  run();
  refreshReorderControls();
  refreshEditControls();
})();
