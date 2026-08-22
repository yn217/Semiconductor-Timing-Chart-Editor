(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller?.model || controller.selectionFastPathInstalled) return;
  controller.selectionFastPathInstalled = true;

  const model = controller.model;
  const metrics = controller.selectionMetrics = controller.selectionMetrics || {
    selections: 0,
    detailFrames: 0,
    cancelledDetailFrames: 0,
    fullRenders: 0,
    lastHighlightMs: 0,
    lastDetailsMs: 0
  };

  let outerRaf = 0;
  let innerRaf = 0;
  let generation = 0;

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const getSignal = id => controller.selectors?.getSignal?.(id);
  const getComment = id => controller.selectors?.getComments?.().find(item => item.id === id);
  const busRange = signal => {
    if (!signal) return '';
    if (signal.source?.msb !== undefined && signal.source?.lsb !== undefined) return `[${signal.source.msb}:${signal.source.lsb}]`;
    return signal.width ? `[${Number(signal.width) - 1}:0]` : '';
  };

  const renderHighlight = () => {
    const started = performance.now();
    document.querySelectorAll('.row[data-signal]').forEach(row => {
      const id = row.dataset.commentId || row.dataset.signal;
      row.classList.toggle('selected', id === model.selection?.id || (model.crossHighlight || []).includes(id));
      row.setAttribute('aria-selected', id === model.selection?.id ? 'true' : 'false');
    });
    document.querySelectorAll('#bottomTabs [data-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === model.view.tab);
    });
    metrics.lastHighlightMs = performance.now() - started;
  };

  const selectedToolbar = signal => {
    const role = signal?.role === 'output' ? ['out', 'o'] : signal?.role === 'internal' ? ['wire', 'wire'] : ['in', 'i'];
    return `<div class="selected-line">選択中の信号:　${esc(signal?.id || '')} <span class="role ${role[0]}">${role[1]}</span></div>`;
  };

  const editorInput = (index, field, value, type = 'text') => `<input data-editor-index="${index}" data-editor-field="${field}" value="${esc(value)}" type="${type}" style="width:100%;border:0;background:transparent;text-align:center;font:inherit;padding:0">`;

  const derivedRows = signal => {
    const values = [...(signal?.values || [])].sort((a, b) => Number(a.start) - Number(b.start));
    return values.map((value, index) => ({
      value,
      index,
      duration: index < values.length - 1 ? Number(values[index + 1].start) - Number(value.start) : null,
      end: index < values.length - 1 ? Number(values[index + 1].start) : null
    }));
  };

  const commonToolbar = () => '<div class="toolbar-line"><button class="mini-btn primary" data-editor-action="add">＋ 変更点を追加</button><button class="mini-btn" data-editor-action="duplicate">▣ 行を複製</button><button class="mini-btn" data-editor-action="delete">🗑 行を削除</button><button class="mini-btn">⇩ インポート...</button><button class="mini-btn">⇧ エクスポート...</button><button class="mini-btn">⟳ プレビュー更新</button></div>';

  const renderEventSignalPanel = signal => {
    const rows = derivedRows(signal);
    const selected = model.editor?.rowIndex ?? Math.max(0, rows.length - 1);
    const isBus = signal.type === 'bus';
    const isState = signal.type === 'state';
    const valueTitle = isState ? 'State' : 'Value';
    const extraHead = isBus ? '<th>Display format</th>' : isState ? '<th>Color</th>' : '';
    const body = rows.map(({ value, index, duration, end }) => {
      const extra = isBus ? `<td class=center>${esc(signal.displayFormat === 'hex' ? 'Hex' : signal.displayFormat || 'Auto')}</td>` : isState ? '<td class=center>Auto</td>' : '';
      return `<tr class="${index === selected ? 'selected-row' : ''}" data-editor-index="${index}"><td>${index === selected ? '☑' : '□'}</td><td class=center>${index + 1}</td><td class=center>${editorInput(index, 'start', value.start, 'number')}</td><td class=center>${editorInput(index, 'value', value.value)}</td>${extra}<td class=center>${duration ?? '—'}</td><td class=center>${end ?? '—'}</td><td>${editorInput(index, 'comment', value.comment || '')}</td></tr>`;
    }).join('');
    return `${selectedToolbar(signal)}${commonToolbar()}<table><thead><tr><th>□</th><th>#</th><th>Start (cycle)</th><th>${valueTitle}</th>${extraHead}<th>Duration (cycles)</th><th>End (cycle)</th><th>コメント</th></tr></thead><tbody>${body}</tbody></table>`;
  };

  const clockField = (label, field, value, type = 'number') => `<div class="field"><label>${label}</label><input data-clock-field="${field}" value="${esc(value)}" type="${type}"></div>`;
  const clockSelect = (label, field, value, options) => `<div class="field"><label>${label}</label><select data-clock-field="${field}">${options.map(option => `<option ${String(option).toLowerCase() === String(value).toLowerCase() ? 'selected' : ''}>${option}</option>`).join('')}</select></div>`;
  const renderClockPanel = signal => {
    const generator = signal.generator || {};
    const counter = signal.edgeCounter || {};
    const timeline = model.document.timeline || {};
    return `<div class="selected-line">選択中の信号:　${esc(signal.name || signal.id)}　種別: Clock</div><div class="toolbar-line"><button class="mini-btn">∿ プリセット⌄</button><button class="mini-btn">▣ 複製</button><button class="mini-btn">⇩ インポート...</button><button class="mini-btn">⇧ エクスポート...</button><button class="mini-btn">⟳ プレビュー更新</button></div><div class="clock-form">${clockField('Start (cycle)', 'start', generator.start ?? 0)}${clockField('Period (cycles)', 'period', generator.period ?? 1)}${clockField('Duty (%)', 'duty', (generator.duty ?? 0.5) * 100)}${clockField('Phase (cycles)', 'phase', generator.phase ?? 0)}${clockSelect('Initial level', 'initialLevel', generator.initial ?? 0, ['0', '1'])}${clockSelect('Edge基準', 'edgeReference', timeline.edge || 'rising', ['Rising', 'Falling'])}</div><div class="edge-box"><b>エッジ番号表示</b><div class="edge-grid" style="margin-top:8px">${clockSelect('Show', 'edgeCounter.show', counter.show === false ? 'OFF' : 'ON', ['ON', 'OFF'])}${clockSelect('Mode', 'edgeCounter.mode', counter.mode || 'rising', ['Rising', 'Falling', 'Both'])}${clockField('Start number', 'edgeCounter.startNumber', counter.startNumber ?? 1)}${clockSelect('Count from', 'edgeCounter.countFrom', counter.countFrom || 'signal-start', ['signal-start', 'selected-edge', 'marker', 'visible-range-start'])}${clockField('Show every', 'edgeCounter.labelEvery', counter.labelEvery ?? 1)}${clockSelect('Position', 'edgeCounter.position', counter.position || 'above', ['Above', 'Below'])}${clockField('Offset X', 'edgeCounter.offset.x', counter.offset?.x ?? 0)}${clockField('Offset Y', 'edgeCounter.offset.y', counter.offset?.y ?? -6)}</div></div>`;
  };

  const renderCommentPanel = comment => `<div class="selected-line">選択中: Comment Row　${esc(comment?.title || '')}</div><div class="toolbar-line"><button class="mini-btn">複製</button><button class="mini-btn">削除</button></div><div class="clock-form" style="grid-template-columns:1fr 2fr"><div class="field"><label>Title（左パネル用）</label><input data-comment-field="title" value="${esc(comment?.title || '')}"></div><div class="field"><label>Body（タイミングチャート用）</label><input data-comment-field="body" value="${esc(comment?.body || '')}"></div></div>`;

  const bindSignalEditor = content => {
    const signalId = model.selection?.id;
    content.querySelectorAll('[data-editor-field]').forEach(input => input.addEventListener('change', () => controller.actions.updateSignalValue(signalId, Number(input.dataset.editorIndex), input.dataset.editorField, input.value)));
    content.querySelector('[data-editor-action="add"]')?.addEventListener('click', () => controller.actions.addSignalValue(signalId));
    content.querySelector('[data-editor-action="duplicate"]')?.addEventListener('click', () => controller.actions.duplicateSignalValue(signalId, model.editor?.rowIndex ?? 0));
    content.querySelector('[data-editor-action="delete"]')?.addEventListener('click', () => controller.actions.deleteSignalValue(signalId, model.editor?.rowIndex ?? 0));
    content.querySelectorAll('[data-clock-field]').forEach(input => input.addEventListener('change', () => controller.actions.updateClock(input.dataset.clockField, input.value)));
    content.querySelectorAll('[data-comment-field]').forEach(input => input.addEventListener('change', () => controller.actions.updateComment(signalId, input.dataset.commentField, input.value)));
  };

  const renderHierarchyInspector = (host, signal) => {
    if (!signal) return;
    const mode = model.document.layout?.pathDisplayMode || 'signalOnly';
    if (model.view.leftPanelMode !== 'hierarchy' && mode === 'signalOnly') return;
    const source = signal.source || { instancePath: [], signalName: signal.name || signal.id };
    const full = controller.hierarchy?.getFullPath?.(signal) || signal.name || signal.id;
    const relative = controller.hierarchy?.getRelativePath?.(signal) || full;
    host.insertAdjacentHTML('beforeend', `<div class="section" data-hierarchy-inspector="true"><h3>Source / Hierarchy</h3><div class="prop"><span>Instance Path</span><b title="${esc(full)}">${esc((source.instancePath || []).join('.') || '(flat)')}</b></div><div class="prop"><span>Signal</span><b>${esc(source.signalName || signal.name)}</b></div><div class="prop"><span>Bus Width</span><b>${esc(busRange(signal) || '—')}</b></div><div class="prop"><span>Display Name</span><b>${esc(signal.display?.name || source.signalName || signal.name)}</b></div><div class="prop"><span>Relative</span><b title="${esc(full)}">${esc(relative)}</b></div></div>`);
  };

  const renderSignalInspector = () => {
    const host = document.querySelector('#inspectorBody');
    if (!host || model.view.tab !== 'signal') return;
    const signal = getSignal(model.selection?.id);
    const comment = !signal ? getComment(model.selection?.id) : null;
    if (comment) {
      host.innerHTML = `<div class="section"><h3>Comment Row</h3><div class="prop"><span>Title</span><b>${esc(comment.title)}</b></div><div class="prop"><span>Body</span><b>${esc(comment.body)}</b></div></div>`;
      return;
    }
    if (!signal) return;
    host.innerHTML = `<div class="section"><h3>信号プロパティ</h3><div class="prop"><span>名前</span><input value="${esc(signal.id)}"></div><div class="prop"><span>種別</span><input value="${esc(signal.type)}"></div><div class="prop"><span>可視性</span><select><option>表示</option><option>非表示</option></select></div></div><div class="section"><h3>表示</h3><label><input type=checkbox checked> 波形を表示</label><br><label><input type=checkbox checked> ラベルを表示</label></div>`;
    renderHierarchyInspector(host, signal);
  };

  const renderSelectionDetails = expectedGeneration => {
    innerRaf = 0;
    if (expectedGeneration !== generation) {
      metrics.cancelledDetailFrames += 1;
      return;
    }
    const started = performance.now();
    if (model.view.tab === 'signal') {
      const content = document.querySelector('#bottomContent');
      if (content) {
        const signal = getSignal(model.selection?.id);
        const comment = !signal ? getComment(model.selection?.id) : null;
        if (comment) content.innerHTML = renderCommentPanel(comment);
        else if (signal?.type === 'clock') content.innerHTML = renderClockPanel(signal);
        else if (signal) content.innerHTML = renderEventSignalPanel(signal);
        content.dataset.renderedTab = 'signal';
        bindSignalEditor(content);
      }
      renderSignalInspector();
    }
    metrics.detailFrames += 1;
    metrics.lastDetailsMs = performance.now() - started;
    document.dispatchEvent(new CustomEvent('timingchart:selection-details-rendered', { detail: { id: model.selection?.id, durationMs: metrics.lastDetailsMs } }));
  };

  const scheduleDetails = () => {
    generation += 1;
    const expectedGeneration = generation;
    if (outerRaf) cancelAnimationFrame(outerRaf);
    if (innerRaf) cancelAnimationFrame(innerRaf);
    outerRaf = requestAnimationFrame(() => {
      outerRaf = 0;
      // Use a second frame so the selected-row highlight is painted before
      // rebuilding the editor/Inspector details.
      innerRaf = requestAnimationFrame(() => renderSelectionDetails(expectedGeneration));
    });
  };

  controller.actions.selectObject = row => {
    const id = row?.dataset?.kind === 'comment' ? row.dataset.commentId || row.dataset.signal : row?.dataset?.signal;
    if (!id) return false;
    const kind = row.dataset.kind === 'comment' ? 'comment' : 'signal';
    model.selection = { kind, id };
    if (kind === 'signal') {
      const signal = getSignal(id);
      model.editor.rowIndex = Math.max(0, (signal?.values?.length || 1) - 1);
    }
    if (model.view.followSelection && !model.view.pinned) model.view.tab = model.view.mode === 'transaction' ? 'transaction' : 'signal';

    metrics.selections += 1;
    renderHighlight();
    scheduleDetails();
    document.dispatchEvent(new CustomEvent('timingchart:selection-highlighted', { detail: { id, durationMs: metrics.lastHighlightMs } }));
    return true;
  };

  controller.renderSelectionFast = () => {
    renderHighlight();
    scheduleDetails();
  };
})();
