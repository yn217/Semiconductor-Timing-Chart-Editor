(() => {
  'use strict';

  const signals = [
    { id: 'clk', name: 'clk', type: 'clock', role: 'input', generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: true, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } },
    { id: 'req_valid', name: 'req_valid', type: 'binary', role: 'input', values: [{ start: 0, value: 0, comment: '初期値' }, { start: 3, value: 1, comment: 'リクエスト有効' }, { start: 7, value: 0, comment: 'リクエスト無効（終了）' }] },
    { id: 'req_addr[7:0]', name: 'req_addr[7:0]', type: 'bus', role: 'input', width: 8, displayFormat: 'hex', values: [{ start: 0, value: '00', comment: '初期値' }, { start: 2, value: '12', comment: 'アドレス1' }, { start: 4, value: '34', comment: 'アドレス2' }, { start: 7, value: '9A', comment: '最終値' }] },
    { id: 'comment_01', type: 'commentRow', title: 'Address phase', body: 'アドレス位相フェーズ（req_valid = 1 の期間）', groupId: 'group_input' },
    { id: 'busy', name: 'busy', type: 'binary', role: 'internal', values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 8, value: 0 }] },
    { id: 'state[1:0]', name: 'state[1:0]', type: 'state', role: 'internal', values: [{ start: 0, value: 'IDLE', comment: '初期状態' }, { start: 2, value: 'REQ', comment: 'リクエスト受付' }, { start: 4, value: 'WAIT', comment: '応答待ち' }, { start: 6, value: 'EXEC', comment: '実行中' }, { start: 8, value: 'DONE', comment: '完了' }, { start: 9, value: 'IDLE', comment: '待機へ復帰' }] },
    { id: 'comment_02', type: 'commentRow', title: 'Processing note', body: '処理中は新しいリクエストを受け付けない', groupId: 'group_internal' },
    { id: 'ready', name: 'ready', type: 'binary', role: 'output', values: [{ start: 0, value: 0 }, { start: 8, value: 1 }, { start: 9, value: 0 }] },
    { id: 'rdata[15:0]', name: 'rdata[15:0]', type: 'bus', role: 'output', width: 16, displayFormat: 'hex', values: [{ start: 0, value: 'XXXX' }, { start: 3, value: '0000' }, { start: 6, value: '5678' }, { start: 8, value: 'ABCD' }] },
    { id: 'comment_03', type: 'commentRow', title: 'Read latency', body: 'リクエスト受付からレスポンス出力まで 6 cycle', groupId: 'group_output' }
  ];
  const canonicalDocument = {
    formatVersion: 1,
    document: { id: 'example.tcd', title: 'Timing Chart' },
    timeline: { start: 0, end: 10, timeBase: 'cycle', cycleCount: 10, referenceClock: 'clk', edge: 'rising' },
    signalGroups: [
      { id: 'group_input', name: '入力 (Input)', rows: ['clk', 'req_valid', 'req_addr[7:0]', 'comment_01'] },
      { id: 'group_internal', name: '内部制御 (Internal Control)', rows: ['busy', 'state[1:0]', 'comment_02'] },
      { id: 'group_output', name: '出力 (Output)', rows: ['ready', 'rdata[15:0]', 'comment_03'] }
    ],
    signals,
    annotations: [],
    legend: { orientation: 'horizontal', usedRolesOnly: true },
    layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: 'left', rowHeight: 28, signalSpacing: 6, overflow: 'ellipsis' },
    transactions: [],
    constraints: []
  };
  const model = { document: canonicalDocument, selection: { kind: 'signal', id: 'req_valid' }, editor: { rowIndex: 2 }, validation: [], view: { mode: 'cycle', tab: 'signal', followSelection: true, pinned: false } };
  const controller = { model, getState: () => structuredClone(model), actions: {} };
  const getSignals = () => model.document.signals.filter(signal => signal.type !== 'commentRow');
  const getSignal = id => getSignals().find(signal => signal.id === id);
  const getTimeline = () => model.document.timeline;
  const getComments = () => model.document.signals.filter(signal => signal.type === 'commentRow');
  const getGroupRows = groupId => model.document.signalGroups.find(group => group.id === groupId)?.rows || [];
  const getReferenceClock = () => getSignal(getTimeline().referenceClock);
  const serializeSignal = signal => {
    if (signal.type === 'commentRow') return { id: signal.id, type: signal.type, title: signal.title, body: signal.body, ...(signal.groupId ? { groupId: signal.groupId } : {}) };
    const result = { id: signal.id, name: signal.name, type: signal.type, role: signal.role };
    if (signal.width !== undefined) result.width = signal.width;
    if (signal.displayFormat !== undefined) result.displayFormat = signal.displayFormat;
    if (signal.type === 'clock') {
      result.generator = { start: signal.generator.start, period: signal.generator.period, duty: signal.generator.duty, phase: signal.generator.phase, initial: signal.generator.initial, polarity: signal.generator.polarity };
      result.edgeCounter = { show: signal.edgeCounter.show, mode: signal.edgeCounter.mode, startNumber: signal.edgeCounter.startNumber, countFrom: signal.edgeCounter.countFrom, labelEvery: signal.edgeCounter.labelEvery, position: signal.edgeCounter.position, offset: { x: signal.edgeCounter.offset.x, y: signal.edgeCounter.offset.y } };
    } else result.values = (signal.values || []).map(value => ({ start: value.start, value: value.value, ...(value.comment !== undefined ? { comment: value.comment } : {}) }));
    return result;
  };
  const serializeDocument = documentValue => ({
    formatVersion: documentValue.formatVersion,
    document: { id: documentValue.document.id, title: documentValue.document.title },
    timeline: { start: documentValue.timeline.start, end: documentValue.timeline.end, timeBase: documentValue.timeline.timeBase, cycleCount: documentValue.timeline.cycleCount, referenceClock: documentValue.timeline.referenceClock, edge: documentValue.timeline.edge },
    signalGroups: documentValue.signalGroups.map(group => ({ id: group.id, name: group.name, rows: [...group.rows] })),
    signals: documentValue.signals.map(serializeSignal),
    annotations: structuredClone(documentValue.annotations),
    legend: structuredClone(documentValue.legend),
    layout: structuredClone(documentValue.layout),
    transactions: structuredClone(documentValue.transactions),
    constraints: structuredClone(documentValue.constraints)
  });
  controller.selectors = { getSignals, getSignal, getTimeline, getComments, getGroupRows, getReferenceClock };
  controller.getSerializableDocument = () => serializeDocument(model.document);
  controller.validateDocument = documentValue => {
    const issues = [];
    if (documentValue?.formatVersion !== 1) issues.push({ code: 'format-version' });
    for (const field of ['document', 'timeline', 'signalGroups', 'signals', 'annotations', 'legend', 'layout', 'transactions', 'constraints']) if (!(field in (documentValue || {}))) issues.push({ code: `missing-${field}` });
    const ids = new Set();
    for (const signal of documentValue?.signals || []) {
      for (const key of Object.keys(signal)) if (['draft', 'selected', 'editing', 'dirty', 'validation', 'waveGeometry', 'edgeReference'].includes(key)) issues.push({ code: 'transient-or-unsupported-field', id: signal.id, field: key });
      if (ids.has(signal.id)) issues.push({ code: 'duplicate-signal-id', id: signal.id });
      ids.add(signal.id);
        if (signal.type === 'clock') {
          const generator = signal.generator || {};
          const counter = signal.edgeCounter || {};
          if (generator.edgeReference !== undefined || generator.duty !== 0.5 || generator.period <= 0 || !Number.isFinite(generator.phase)) issues.push({ code: 'invalid-clock-generator', id: signal.id });
          if (!['rising', 'falling', 'both'].includes(counter.mode) || !['above', 'below'].includes(counter.position) || !['signal-start', 'selected-edge', 'marker', 'visible-range-start'].includes(counter.countFrom) || !Number.isInteger(counter.labelEvery) || counter.labelEvery < 1) issues.push({ code: 'invalid-edge-counter', id: signal.id });
        } else if (signal.type !== 'commentRow') {
        let previous = -1;
        for (const value of signal.values || []) { if (Number(value.start) <= previous) issues.push({ code: 'invalid-start-order', id: signal.id }); previous = Number(value.start); }
        if (signal.type === 'clock' && (!signal.generator || signal.generator.period <= 0 || signal.generator.duty <= 0 || signal.generator.duty > 1)) issues.push({ code: 'invalid-clock-generator', id: signal.id });
      }
    }
    const signalIds = ids;
    for (const group of documentValue?.signalGroups || []) for (const row of group.rows || []) if (!signalIds.has(row)) issues.push({ code: 'invalid-group-row', groupId: group.id, row });
    if (!signalIds.has(documentValue?.timeline?.referenceClock) || documentValue.signals.find(signal => signal.id === documentValue.timeline.referenceClock)?.type !== 'clock') issues.push({ code: 'invalid-reference-clock' });
    if (!['rising', 'falling'].includes(documentValue?.timeline?.edge)) issues.push({ code: 'invalid-timeline-edge' });
    return issues;
  };
  window.TimingChartProductionController = controller;

  const tabs = () => [...document.querySelectorAll('#bottomTabs [data-tab]')];
  const rows = () => [...document.querySelectorAll('.row[data-signal]')];
  const setHidden = (element, hidden) => { if (!element) return; element.hidden = hidden; element.classList.toggle('hidden', hidden); };
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
  const render = () => { renderMode(); renderTab(); renderSelection(); window.TimingChartGoldenRenderer?.render(model); window.TimingChartProductionWaveform?.render(model); };
  controller.actions.setViewMode = nextMode => { model.view.mode = nextMode; if (nextMode === 'transaction') model.view.tab = 'transaction'; if (nextMode === 'cycle' && model.view.tab === 'transaction') model.view.tab = 'signal'; render(); };
  controller.actions.setBottomTab = nextTab => { if (model.view.mode === 'cycle' && nextTab === 'transaction') return; if (model.view.mode === 'transaction' && nextTab === 'signal') return; model.view.tab = nextTab; render(); };
  controller.actions.selectObject = row => { model.selection = { kind: row.dataset.kind === 'comment' ? 'comment' : 'signal', id: row.dataset.kind === 'comment' ? row.dataset.commentId || row.dataset.signal : row.dataset.signal }; if (model.selection.kind === 'signal') model.editor.rowIndex = Math.max(0, getSignal(model.selection.id)?.values?.length - 1 || 0); if (model.view.followSelection && !model.view.pinned) model.view.tab = model.view.mode === 'transaction' ? 'transaction' : 'signal'; render(); };
  controller.actions.setFollowSelection = enabled => { model.view.followSelection = enabled; if (enabled) model.view.pinned = false; render(); };
  controller.actions.setPinned = pinned => { model.view.pinned = pinned; if (pinned) model.view.followSelection = false; render(); };
  const setValidation = issues => { model.validation = issues; };
  const canonicalize = signal => signal.values.sort((a, b) => Number(a.start) - Number(b.start));
  const validateValue = (signal, index, candidate) => { const issues = []; const start = Number(candidate.start); if (!Number.isInteger(start) || start < 0) issues.push({ field: 'start', code: 'negative-or-non-integer' }); if (start >= getTimeline().cycleCount) issues.push({ field: 'start', code: 'outside-document' }); if (signal.values.some((value, valueIndex) => valueIndex !== index && Number(value.start) === start)) issues.push({ field: 'start', code: 'duplicate-start' }); if (signal.type === 'binary' && !['0', '1', 'X', 'Z', 'x', 'z'].includes(String(candidate.value))) issues.push({ field: 'value', code: 'invalid-binary' }); if (signal.type === 'bus' && signal.width && /^[0-9a-f]+$/i.test(String(candidate.value)) && String(candidate.value).replace(/^0x/i, '').length * 4 > signal.width) issues.push({ field: 'value', code: 'bus-width-overflow' }); return issues; };
  const valueFromInput = (signal, value, field) => field === 'start' ? Number(value) : field === 'value' && signal.type === 'binary' && /^[01]$/.test(value) ? Number(value) : value;
  controller.actions.updateSignalValue = (signalId, index, field, rawValue) => { const signal = getSignal(signalId); if (!signal || !signal.values[index]) return false; const candidate = { ...signal.values[index], [field]: valueFromInput(signal, rawValue, field) }; const issues = validateValue(signal, index, candidate); setValidation(issues); if (issues.length) return false; signal.values[index] = candidate; canonicalize(signal); model.editor.rowIndex = signal.values.indexOf(candidate); render(); return true; };
  controller.actions.addSignalValue = signalId => { const signal = getSignal(signalId); if (!signal) return false; const values = [...signal.values].sort((a, b) => Number(a.start) - Number(b.start)); const start = Math.max(1, Number(values.at(-1)?.start ?? 0) - 1); if (values.some(value => Number(value.start) === start)) return false; signal.values.push({ start, value: signal.type === 'binary' ? 0 : signal.type === 'state' ? 'IDLE' : '00', comment: '' }); canonicalize(signal); model.editor.rowIndex = signal.values.findIndex(value => Number(value.start) === start); setValidation([]); render(); return true; };
  controller.actions.duplicateSignalValue = (signalId, index) => { const signal = getSignal(signalId); if (!signal || !signal.values[index]) return false; const start = Number(signal.values[index].start) + 1; if (start >= getTimeline().cycleCount || signal.values.some(value => Number(value.start) === start)) return false; const duplicate = { ...signal.values[index], start }; model.editor.draft = { signalId, sourceIndex: index, value: structuredClone(duplicate) }; signal.values.push(duplicate); canonicalize(signal); model.editor.rowIndex = signal.values.findIndex(value => Number(value.start) === start); render(); return true; };
  controller.actions.deleteSignalValue = (signalId, index) => { const signal = getSignal(signalId); if (!signal || !signal.values[index] || signal.values.length <= 1) return false; signal.values.splice(index, 1); canonicalize(signal); model.editor.rowIndex = Math.max(0, Math.min(index, signal.values.length - 1)); setValidation([]); render(); return true; };
  controller.actions.updateClock = (field, rawValue) => { const signal = getSignal('clk'); const generator = signal.generator; const value = Number(rawValue); if (field === 'duty') { if (value !== 50) { setValidation([{ field, code: 'unsupported-duty', message: 'WaveDrom標準では任意Dutyは未対応です' }]); return false; } generator.duty = 0.5; } else if (field === 'period') { if (!Number.isFinite(value) || value <= 0) { setValidation([{ field, code: 'invalid-period' }]); return false; } generator.period = value; } else if (field === 'phase') { if (!Number.isFinite(value)) { setValidation([{ field, code: 'invalid-phase' }]); return false; } generator.phase = value; } else if (field === 'start') generator.start = value; else if (field === 'initialLevel') generator.initial = Number(value); else if (field === 'edgeReference') model.document.timeline.edge = String(rawValue).toLowerCase(); else if (field.startsWith('edgeCounter.')) { const path = field.slice(12).split('.'); if (path.length === 2) signal.edgeCounter[path[0]][path[1]] = Number(rawValue); else if (path[0] === 'show') signal.edgeCounter.show = rawValue === 'ON'; else if (path[0] === 'mode') signal.edgeCounter.mode = String(rawValue).toLowerCase(); else if (path[0] === 'position') signal.edgeCounter.position = String(rawValue).toLowerCase(); else if (path[0] === 'startNumber' || path[0] === 'labelEvery') signal.edgeCounter[path[0]] = Number(rawValue); else signal.edgeCounter[path[0]] = rawValue; } render(); return true; };
  controller.actions.updateComment = (commentId, field, value) => { const comment = getComments().find(item => item.id === commentId); if (!comment || !['title', 'body'].includes(field)) return false; comment[field] = String(value); render(); return true; };
  document.querySelectorAll('.seg').forEach(button => button.addEventListener('click', () => controller.actions.setViewMode(button.dataset.mode)));
  tabs().forEach(button => button.addEventListener('click', () => controller.actions.setBottomTab(button.dataset.tab)));
  rows().forEach(row => row.addEventListener('click', () => controller.actions.selectObject(row)));
  const follow = document.querySelector('#bottomTabs input[type="checkbox"]'); follow?.addEventListener('change', () => controller.actions.setFollowSelection(follow.checked));
  const pin = document.querySelector('#bottomTabs .follow button'); pin?.addEventListener('click', () => controller.actions.setPinned(!model.view.pinned));
  render();
})();
