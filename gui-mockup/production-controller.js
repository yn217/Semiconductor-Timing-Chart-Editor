(() => {
  'use strict';

  // Phase 3A adapter: owns semantic document/view/selection state without changing
  // the locked Replacement Pack DOM or its visual classes.
  const model = {
    document: { id: 'example.tcd', timeBase: 'cycle', referenceClock: 'clk' },
    selection: { kind: 'signal', id: 'req_valid' },
    view: { mode: 'cycle', tab: 'signal', followSelection: true, pinned: false }
  };
  const controller = { model, getState: () => structuredClone(model) };
  window.TimingChartProductionController = controller;

  const tabButtons = () => [...document.querySelectorAll('#bottomTabs [data-tab]')];
  const activeTab = () => document.querySelector('#bottomTabs .btab.active')?.dataset.tab || 'signal';
  const setTabVisual = tab => tabButtons().forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  const mode = () => document.querySelector('.seg.active')?.dataset.mode || 'cycle';
  const syncMode = nextMode => {
    model.view.mode = nextMode;
    const transaction = nextMode === 'transaction' || nextMode === 'split';
    const signalTab = document.querySelector('#bottomTabs [data-tab="signal"]');
    const transactionTab = document.querySelector('#bottomTabs [data-tab="transaction"]');
    const insertTab = document.querySelector('.ribbon-tabs .cycle-only');
    const transactionRibbonTab = document.querySelector('.ribbon-tabs .txn-only');
    const setHidden = (element, hidden) => { if (!element) return; element.hidden = hidden; element.classList.toggle('hidden', hidden); };
    setHidden(signalTab, nextMode === 'transaction');
    setHidden(transactionTab, !transaction);
    setHidden(insertTab, nextMode === 'transaction');
    setHidden(transactionRibbonTab, nextMode === 'cycle');
    const nextTab = nextMode === 'transaction' ? 'transaction' : model.view.tab === 'transaction' && nextMode === 'cycle' ? 'signal' : model.view.tab;
    model.view.tab = nextTab;
    setTabVisual(nextTab);
  };

  document.querySelectorAll('.seg').forEach(button => button.addEventListener('click', () => {
    syncMode(button.dataset.mode);
  }));

  tabButtons().forEach(button => button.addEventListener('click', () => {
    const selected = button.dataset.tab;
    if (model.view.mode === 'cycle' && selected === 'transaction') return;
    model.view.tab = selected;
  }));

  document.querySelectorAll('.row[data-signal]').forEach(row => row.addEventListener('click', () => {
    const previousTab = model.view.tab;
    model.selection = { kind: row.dataset.kind === 'comment' ? 'comment' : 'signal', id: row.dataset.signal };
    if (model.view.followSelection) model.view.tab = model.view.mode === 'transaction' ? 'transaction' : 'signal';
    if (!model.view.followSelection && previousTab !== activeTab()) tabButtons().find(button => button.dataset.tab === previousTab)?.click();
  }));

  const follow = document.querySelector('#bottomTabs input[type="checkbox"]');
  const pin = document.querySelector('#bottomTabs .follow button');
  follow?.addEventListener('change', () => { model.view.followSelection = follow.checked; });
  pin?.addEventListener('click', () => {
    model.view.pinned = !model.view.pinned;
    model.view.followSelection = !model.view.pinned;
    if (follow) follow.checked = model.view.followSelection;
  });

  window.addEventListener('beforeunload', () => { controller.lastState = controller.getState(); });
  syncMode(mode());
  controller.mode = mode;
  controller.activeTab = activeTab;
})();
