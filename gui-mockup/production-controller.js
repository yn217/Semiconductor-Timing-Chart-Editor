(() => {
  'use strict';

  // Phase 3A.1: the only UI state. app-ui.js is a renderer and owns no state or
  // Phase 3A event handlers.
  const model = {
    document: {
      id: 'example.tcd', cycleCount: 10, timeBase: 'cycle', referenceClock: 'clk', edge: 'rising',
      signals: [
        { id: 'clk', name: 'clk', type: 'clock', role: 'input', polarity: 'positive', period: 1, phase: 0 },
        { id: 'req_valid', name: 'req_valid', type: 'binary', role: 'input', values: [{ start: 0, value: 0, comment: '初期値' }, { start: 3, value: 1, comment: 'リクエスト有効' }, { start: 7, value: 0, comment: 'リクエスト無効（終了）' }] },
        { id: 'req_addr[7:0]', name: 'req_addr[7:0]', type: 'bus', role: 'input', width: 8, displayFormat: 'hex', values: [{ start: 0, value: '00', comment: '初期値' }, { start: 2, value: '12', comment: 'アドレス1' }, { start: 4, value: '34', comment: 'アドレス2' }, { start: 7, value: '9A', comment: '最終値' }] },
        { id: 'busy', name: 'busy', type: 'binary', role: 'internal', values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 8, value: 0 }] },
        { id: 'state[1:0]', name: 'state[1:0]', type: 'state', role: 'internal', values: [{ start: 0, value: 'IDLE', comment: '初期状態' }, { start: 2, value: 'REQ', comment: 'リクエスト受付' }, { start: 4, value: 'WAIT', comment: '応答待ち' }, { start: 6, value: 'EXEC', comment: '実行中' }, { start: 8, value: 'DONE', comment: '完了' }, { start: 9, value: 'IDLE', comment: '待機へ復帰' }] },
        { id: 'ready', name: 'ready', type: 'binary', role: 'output', values: [{ start: 0, value: 0 }, { start: 8, value: 1 }, { start: 9, value: 0 }] },
        { id: 'rdata[15:0]', name: 'rdata[15:0]', type: 'bus', role: 'output', width: 16, displayFormat: 'hex', values: [{ start: 0, value: 'XXXX' }, { start: 3, value: '0000' }, { start: 6, value: '5678' }, { start: 8, value: 'ABCD' }] }
      ],
      comments: [
        { id: 'comment_01', title: 'Address phase', body: 'アドレス位相フェーズ（req_valid = 1 の期間）' },
        { id: 'comment_02', title: 'Processing note', body: '処理中は新しいリクエストを受け付けない' },
        { id: 'comment_03', title: 'Read latency', body: 'リクエスト受付からレスポンス出力まで 6 cycle' }
      ],
      stateStyles: {},
      clockSettings: { start: 0, duty: 50, initialLevel: 0, edgeReference: 'Rising', edgeCounter: { show: true, mode: 'rising', startNumber: 1, labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } }
    },
    selection: { kind: 'signal', id: 'req_valid' },
    editor: { rowIndex: 2 },
    validation: [],
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
    window.TimingChartProductionWaveform?.render(model);
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
    model.selection = { kind: row.dataset.kind === 'comment' ? 'comment' : 'signal', id: row.dataset.kind === 'comment' ? row.dataset.commentId || row.dataset.signal : row.dataset.signal };
    if (model.selection.kind === 'signal') model.editor.rowIndex = Math.max(0, signalById(model.selection.id)?.values?.length - 1 || 0);
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

  const signalById = id => model.document.signals.find(signal => signal.id === id);
  const selectedComment = () => model.document.comments.find(comment => comment.id === model.selection.id);
  const setValidation = issues => { model.validation = issues; };
  const canonicalize = signal => { signal.values.sort((a, b) => Number(a.start) - Number(b.start)); };
  const validateValue = (signal, index, candidate) => {
    const issues = [];
    const start = Number(candidate.start);
    if (!Number.isInteger(start) || start < 0) issues.push({ field: 'start', code: 'negative-or-non-integer' });
    if (start >= model.document.cycleCount) issues.push({ field: 'start', code: 'outside-document' });
    if (signal.values.some((value, valueIndex) => valueIndex !== index && Number(value.start) === start)) issues.push({ field: 'start', code: 'duplicate-start' });
    if (signal.type === 'binary' && !['0', '1', 'X', 'Z', 'x', 'z'].includes(String(candidate.value))) issues.push({ field: 'value', code: 'invalid-binary' });
    if (signal.type === 'bus' && signal.width && /^[0-9a-f]+$/i.test(String(candidate.value)) && String(candidate.value).replace(/^0x/i, '').length * 4 > signal.width) issues.push({ field: 'value', code: 'bus-width-overflow' });
    return issues;
  };
  const valueFromInput = (signal, value, field) => field === 'start' ? Number(value) : field === 'value' && signal.type === 'binary' && /^[01]$/.test(value) ? Number(value) : value;
  controller.actions.updateSignalValue = (signalId, index, field, rawValue) => {
    const signal = signalById(signalId);
    if (!signal || !signal.values[index]) return false;
    const candidate = { ...signal.values[index], [field]: valueFromInput(signal, rawValue, field) };
    const issues = validateValue(signal, index, candidate);
    setValidation(issues);
    if (issues.length) return false;
    signal.values[index] = candidate;
    canonicalize(signal);
    model.editor.rowIndex = signal.values.indexOf(candidate);
    render();
    return true;
  };
  controller.actions.addSignalValue = signalId => {
    const signal = signalById(signalId);
    if (!signal) return false;
    const values = [...signal.values].sort((a, b) => Number(a.start) - Number(b.start));
    const last = values.at(-1)?.start ?? 0;
    const start = Math.max(1, Number(last) - 1);
    if (values.some(value => Number(value.start) === start)) return false;
    signal.values.push({ start, value: signal.type === 'binary' ? 0 : signal.type === 'state' ? 'IDLE' : '00', comment: '' });
    canonicalize(signal);
    model.editor.rowIndex = signal.values.findIndex(value => Number(value.start) === start);
    setValidation([]);
    render();
    return true;
  };
  controller.actions.duplicateSignalValue = (signalId, index) => {
    const signal = signalById(signalId);
    if (!signal || !signal.values[index]) return false;
    const source = signal.values[index];
    const start = Number(source.start) + 1 < model.document.cycleCount ? Number(source.start) + 1 : undefined;
    if (start === undefined || signal.values.some(value => Number(value.start) === start)) return false;
    signal.values.push({ ...source, start, draft: true });
    canonicalize(signal);
    model.editor.rowIndex = signal.values.findIndex(value => Number(value.start) === start);
    render();
    return true;
  };
  controller.actions.deleteSignalValue = (signalId, index) => {
    const signal = signalById(signalId);
    if (!signal || !signal.values[index] || signal.values.length <= 1) return false;
    signal.values.splice(index, 1);
    canonicalize(signal);
    model.editor.rowIndex = Math.max(0, Math.min(index, signal.values.length - 1));
    setValidation([]);
    render();
    return true;
  };
  controller.actions.updateClock = (field, rawValue) => {
    const signal = signalById('clk');
    const settings = model.document.clockSettings;
    const value = Number(rawValue);
    if (field === 'duty') {
      settings.duty = value;
      setValidation(value === 50 ? [] : [{ field, code: 'unsupported-duty', message: 'WaveDrom標準では任意Dutyは未対応です' }]);
    } else if (field === 'period') {
      if (!Number.isFinite(value) || value <= 0) { setValidation([{ field, code: 'invalid-period' }]); return false; }
      signal.period = value;
    } else if (field === 'phase') {
      if (!Number.isFinite(value)) { setValidation([{ field, code: 'invalid-phase' }]); return false; }
      signal.phase = value;
    } else if (field === 'start') settings.start = value;
    else if (field === 'initialLevel') settings.initialLevel = Number(value);
    else if (field === 'edgeReference') settings.edgeReference = rawValue;
    else if (field.startsWith('edgeCounter.')) settings.edgeCounter[field.slice(12)] = rawValue;
    setValidation(model.validation);
    render();
    return true;
  };
  controller.actions.updateComment = (commentId, field, value) => {
    const comment = model.document.comments.find(item => item.id === commentId);
    if (!comment || !['title', 'body'].includes(field)) return false;
    comment[field] = String(value);
    render();
    return true;
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
