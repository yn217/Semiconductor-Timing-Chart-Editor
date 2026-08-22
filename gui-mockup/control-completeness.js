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
    document.querySelectorAll('#ribbonHome .tool').forEach(tool => {
      const text = label(tool);
      const action = homeActions.find(([name]) => text.includes(name));
      if (action) { implement(tool, action[1]); return; }
      if (/新規|開く|保存|Undo|Redo|Cycle挿入|Cycle削除|NCycle挿入|範囲削除/.test(text)) { record(tool, 'implemented'); return; }
      if (/グリッド|スナップ|ルーラー|ミニマップ/.test(text)) return;
      if (/切取|コピー|貼付|削除|複製|上へ|下へ|別グループへ移動|表示\/非表示|行間隔|Group間隔|自動レイアウト|SVG出力|PNG出力|PDF出力/.test(text)) disable(tool, '未実装の操作です。対応予定: #32 / #34');
    });
    document.querySelectorAll('#ribbonHome .toggles input').forEach(input => disable(input, '表示設定のSemantic Model接続は未実装です。対応予定: #32'));
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
    if (filter) disable(filter, 'フィルター条件UIは未実装です。対応予定: #32');
    const overflow = document.querySelector('#leftPanel .panel-head .iconbtn');
    if (overflow) disable(overflow, '左パネルの追加メニュー以外の操作は未実装です。対応予定: #32');
    if (document.body.dataset.controlInspectorBound === 'true') return;
    document.body.dataset.controlInspectorBound = 'true';
    document.addEventListener('click', event => {
      const row = event.target.closest?.('#groups .row');
      if (row && event.target.closest('.more')) controller.model.selection = { kind: row.dataset.kind === 'comment' ? 'comment' : 'signal', id: row.dataset.commentId || row.dataset.signal };
      const command = event.target.closest?.('#issue6ContextMenu [data-command]')?.dataset.command;
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
  run();
})();
