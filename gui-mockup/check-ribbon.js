(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller?.model) return;
  const model = controller.model;
  const icon = id => `<svg aria-hidden="true"><use href="icons.svg#${id}"></use></svg>`;
  const normalize = value => String(value || '').replace(/[\s\n]+/g, '').trim();
  const CATEGORY_LABELS = { schema: 'Document/Schema', signal: 'Signal/値', bus: 'Bus幅/値範囲', timeline: 'Timeline/変更点順序', clock: 'Clock/基準Clock', annotation: 'Annotation Anchor', transaction: 'Transaction/Link' };

  const button = (id, label, iconId, description, handler) => {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'tool'; node.dataset.checkCommand = id;
    node.dataset.tooltipMeta = JSON.stringify({ id, label, description, affects: 'validation/review only' });
    node.title = description; node.innerHTML = `${icon(iconId)}<span class="tool-label">${label}</span>`;
    node.dataset.controlStatus = 'implemented';
    node.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (!node.disabled) handler(event); });
    return node;
  };
  const setDisabled = (node, disabled, reason = '') => { node.disabled = disabled; if (reason) node.title = reason; };
  const group = (title, children) => { const node = document.createElement('div'); node.className = 'rgroup'; children.forEach(child => node.appendChild(child)); const caption = document.createElement('div'); caption.className = 'rgroup-title'; caption.textContent = title; node.appendChild(caption); return node; };

  const currentGroup = () => model.document.signalGroups?.find(g => g.id === model.view.currentGroupId) || model.document.signalGroups?.find(g => (g.rows || []).includes(model.selection?.id)) || null;
  const openProblems = () => { model.view.problemGroupContext = false; controller.actions.setBottomTab('problems'); };
  const runAll = () => { controller.actions.setProblemFilter('all', 'all'); controller.actions.setProblemObjectFilter(null); controller.actions.refreshProblems(); controller.actions.setBottomTab('problems'); };
  const runSelection = () => {
    const id = model.selection?.id;
    if (!id) return;
    controller.actions.setProblemFilter(model.view.problemSeverityFilter || 'all', id);
    controller.actions.setProblemObjectFilter(null);
    controller.actions.setBottomTab('problems');
  };
  const runGroup = () => {
    const group = currentGroup();
    if (!group) return;
    controller.actions.setProblemFilter(model.view.problemSeverityFilter || 'all', 'all');
    controller.actions.setProblemObjectFilter(group.rows || []);
    controller.actions.setBottomTab('problems');
  };

  const runGroupBtn = button('run-group', '現在Groupをチェック', 'i-spacing', '現在のGroup配下のSignal/Rowに関する問題のみへ絞込', runGroup);
  const runCommands = group('実行', [
    button('run-all', '全チェック', 'i-search', '正規Documentを検証し、絞込を解除してProblemsを開く', runAll),
    button('run-selection', '選択をチェック', 'i-select-fit', '現在選択中のSignal/Annotation/Transactionに関する問題のみへ絞込', runSelection),
    runGroupBtn,
    button('open-problems', 'Problemsを開く', 'i-eye', '再検証せずProblemsタブを表示', openProblems)
  ]);

  const categoryButtons = {};
  const applyCategoryFilter = () => {
    const active = Object.keys(categoryButtons).filter(key => categoryButtons[key].dataset.active === 'true');
    controller.actions.setProblemCategoryFilter(active.length ? active : null);
  };
  const categoryToggle = (key, label) => {
    const node = button(`category-${key}`, label, 'i-settings', `${label}分類の問題のみ表示 (再クリックで解除)`, () => {
      node.dataset.active = node.dataset.active === 'true' ? 'false' : 'true';
      node.setAttribute('aria-pressed', node.dataset.active);
      applyCategoryFilter();
    });
    node.dataset.active = 'false';
    node.setAttribute('aria-pressed', 'false');
    categoryButtons[key] = node;
    return node;
  };
  const categoryCommands = group('チェック項目', Object.entries(CATEGORY_LABELS).map(([key, label]) => categoryToggle(key, label)));

  const severityButtons = {};
  const severityToggle = (key, label, iconId) => {
    const node = button(`severity-${key}`, label, iconId, `Problems結果を${label}のみへ絞込 (Problemsタブと共有)`, () => controller.actions.setProblemFilter(key, model.view.problemSignalFilter || 'all'));
    severityButtons[key] = node;
    return node;
  };
  const severityCommands = group('重要度', [
    severityToggle('all', 'すべて', 'i-eye'),
    severityToggle('err', 'エラー', 'i-more'),
    severityToggle('warn', '警告', 'i-more'),
    severityToggle('info', '情報', 'i-comment')
  ]);

  const refreshBtn = button('refresh', '再検証', 'i-redo', '正規Documentを再検証しProblems件数を更新', () => controller.actions.refreshProblems());
  const utilityCommands = group('更新', [refreshBtn]);

  const ribbon = document.createElement('div');
  ribbon.id = 'ribbonCheck'; ribbon.className = 'ribbon'; ribbon.hidden = true; ribbon.style.display = 'none';
  ribbon.dataset.ribbonPanel = 'check';
  ribbon.append(runCommands, categoryCommands, severityCommands, utilityCommands);
  document.querySelector('#ribbonHome')?.after(ribbon);

  const refresh = () => {
    setDisabled(runGroupBtn, !currentGroup(), currentGroup() ? '' : '現在Groupを選択してください (Group headerをクリック)');
    const selectionActive = Boolean(model.selection?.id);
    const runSelectionBtn = ribbon.querySelector('[data-check-command="run-selection"]');
    if (runSelectionBtn) setDisabled(runSelectionBtn, !selectionActive, selectionActive ? '' : 'Signal/Annotation/Transactionを選択してください');
    const severityActive = model.view.problemSeverityFilter || 'all';
    Object.entries(severityButtons).forEach(([key, node]) => node.setAttribute('aria-pressed', String(key === severityActive)));
    const categoryFilter = Array.isArray(model.view.problemCategoryFilter) ? model.view.problemCategoryFilter : [];
    Object.entries(categoryButtons).forEach(([key, node]) => { const active = categoryFilter.includes(key); node.dataset.active = String(active); node.setAttribute('aria-pressed', String(active)); });
    const issues = controller.getProblems?.(model.document) || [];
    const errors = issues.filter(issue => controller.problemCategoryOf && (issue.severity === 'error' || /invalid|missing|duplicate|unsupported|outside|negative|overflow|mismatch|undefined/.test(issue.code || '')) && issue.severity !== 'info').length;
    refreshBtn.title = `正規Documentを再検証しProblems件数を更新 (現在: ${issues.length}件, うちエラー ${errors}件)`;
  };

  const tabs = [...document.querySelectorAll('.ribbon-tabs .rtab')];
  const tab = tabs.find(node => normalize(node.textContent) === 'チェック');
  const home = document.querySelector('#ribbonHome');
  const insert = document.querySelector('#ribbonInsert');
  const setRibbon = active => {
    const showing = active === tab;
    const leavingCheck = !showing && ribbon.style.display === 'flex';
    if (showing) {
      if (home) { home.hidden = true; home.style.display = 'none'; }
      if (insert) { insert.hidden = true; insert.style.display = 'none'; }
      ribbon.hidden = false; ribbon.style.display = 'flex'; refresh();
      return;
    }
    ribbon.hidden = true; ribbon.style.display = 'none';
    if (leavingCheck && normalize(active?.textContent) !== '挿入' && normalize(active?.textContent) !== '注釈' && normalize(active?.textContent) !== '表示' && home) { home.hidden = false; home.style.display = 'flex'; }
  };
  tab?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); setRibbon(tab); });
  tabs.filter(node => node !== tab).forEach(node => node.addEventListener('click', () => setRibbon(node)));

  controller.registerRenderHook?.('check-ribbon', refresh);
  refresh();
  // Group-header clicks set model.view.currentGroupId directly without
  // triggering a render, so refresh this ribbon's Group-context-dependent
  // button state explicitly rather than waiting for an unrelated render.
  document.addEventListener('click', event => { if (event.target.closest?.('.group-h') && !event.target.closest('.chev,.more')) refresh(); });
  window.TimingChartCheckRibbon = { refresh, setRibbon };
  setTimeout(() => { controller.controlAudit?.registerSubtree?.(ribbon); window.TimingChartTooltipContract?.registerSubtree?.(ribbon); }, 0);
})();
