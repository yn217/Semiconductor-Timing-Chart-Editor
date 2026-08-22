(() => {
  'use strict';

  // Phase 3A.1: the only UI state. app-ui.js is a renderer and owns no state or
  // Phase 3A event handlers.
  const model = {
    document: { id: 'example.tcd', timeBase: 'cycle', referenceClock: 'clk' },
    selection: { kind: 'signal', id: 'req_valid' },
    view: { mode: 'cycle', tab: 'signal', followSelection: true, pinned: false }
  };
  const controller = { model, getState: () => structuredClone(model), actions: {} };
  window.TimingChartProductionController = controller;

  const tabs = () => [...document.querySelectorAll('#bottomTabs [data-tab]')];
  const rows = () => [...document.querySelectorAll('.row[data-signal]')];
  const setHidden = (element, hidden) => {
    if (!element) return;
    element.hidden = hidden;
    element.classList.toggle('hidden', hidden);
  };
  const renderSelection = () => rows().forEach(row => row.classList.toggle('selected', row.dataset.signal === model.selection.id));
  const renderMode = () => {
    document.querySelectorAll('.seg').forEach(button => button.classList.toggle('active', button.dataset.mode === model.view.mode));
    const transaction = model.view.mode === 'transaction' || model.view.mode === 'split';
    setHidden(document.querySelector('#bottomTabs [data-tab="signal"]'), model.view.mode === 'transaction');
    setHidden(document.querySelector('#bottomTabs [data-tab="transaction"]'), !transaction);
    setHidden(document.querySelector('.ribbon-tabs .cycle-only'), model.view.mode === 'transaction');
    setHidden(document.querySelector('.ribbon-tabs .txn-only'), model.view.mode === 'cycle');
    setHidden(document.querySelector('#cycleCanvas'), model.view.mode === 'transaction');
    setHidden(document.querySelector('#transactionCanvas'), model.view.mode === 'cycle');
  };
  const renderTab = () => tabs().forEach(button => button.classList.toggle('active', button.dataset.tab === model.view.tab));
  const render = () => {
    renderMode();
    renderTab();
    renderSelection();
    window.TimingChartGoldenRenderer?.render(model);
  };

  controller.actions.setViewMode = nextMode => {
    model.view.mode = nextMode;
    if (nextMode === 'transaction') model.view.tab = 'transaction';
    if (nextMode === 'cycle' && model.view.tab === 'transaction') model.view.tab = 'signal';
    render();
  };
  controller.actions.setBottomTab = nextTab => {
    if (model.view.mode === 'cycle' && nextTab === 'transaction') return;
    if (model.view.mode === 'transaction' && nextTab === 'signal') return;
    model.view.tab = nextTab;
    render();
  };
  controller.actions.selectObject = row => {
    model.selection = { kind: row.dataset.kind === 'comment' ? 'comment' : 'signal', id: row.dataset.signal };
    if (model.view.followSelection && !model.view.pinned) model.view.tab = model.view.mode === 'transaction' ? 'transaction' : 'signal';
    render();
  };
  controller.actions.setFollowSelection = enabled => {
    model.view.followSelection = enabled;
    if (enabled) model.view.pinned = false;
    render();
  };
  controller.actions.setPinned = pinned => {
    model.view.pinned = pinned;
    if (pinned) model.view.followSelection = false;
    render();
  };

  document.querySelectorAll('.seg').forEach(button => button.addEventListener('click', () => controller.actions.setViewMode(button.dataset.mode)));
  tabs().forEach(button => button.addEventListener('click', () => controller.actions.setBottomTab(button.dataset.tab)));
  rows().forEach(row => row.addEventListener('click', () => controller.actions.selectObject(row)));
  const follow = document.querySelector('#bottomTabs input[type="checkbox"]');
  follow?.addEventListener('change', () => controller.actions.setFollowSelection(follow.checked));
  const pin = document.querySelector('#bottomTabs .follow button');
  pin?.addEventListener('click', () => controller.actions.setPinned(!model.view.pinned));

  render();
})();
