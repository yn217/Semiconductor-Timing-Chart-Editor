(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller?.model || controller.selectionFastPathInstalled) return;
  controller.selectionFastPathInstalled = true;

  const model = controller.model;
  const metrics = controller.selectionMetrics = controller.selectionMetrics || {};
  Object.assign(metrics, {
    selections: metrics.selections || 0,
    detailFrames: metrics.detailFrames || 0,
    cancelledDetailFrames: metrics.cancelledDetailFrames || 0,
    lastHighlightMs: 0,
    lastDetailsMs: 0,
    lastBottomMs: 0,
    lastInspectorMs: 0,
    fullRendersFromSelection: 0
  });

  let detailRaf = 0;
  let detailTimer = 0;
  let generation = 0;
  let previousPrimaryRow = document.querySelector('.row[data-signal].selected');

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const getSignal = id => controller.selectors?.getSignal?.(id);
  const getComment = id => controller.selectors?.getComments?.().find(item => item.id === id);

  const findVisibleRow = id => {
    if (!id) return null;
    try { return document.querySelector(`.row[data-signal="${CSS.escape(String(id))}"]`); }
    catch { return [...document.querySelectorAll('.row[data-signal]')].find(row => (row.dataset.commentId || row.dataset.signal) === id) || null; }
  };

  const renderHighlight = preferredRow => {
    const started = performance.now();
    const id = model.selection?.id;
    const currentRow = preferredRow instanceof Element ? preferredRow : findVisibleRow(id);

    if (previousPrimaryRow && previousPrimaryRow !== currentRow) {
      previousPrimaryRow.classList.remove('selected');
      previousPrimaryRow.setAttribute('aria-selected', 'false');
    }
    if (currentRow) {
      currentRow.classList.add('selected');
      currentRow.setAttribute('aria-selected', 'true');
      previousPrimaryRow = currentRow;
    }

    // Transaction cross-highlights are normally empty during ordinary signal
    // selection. Only touch those rows when the cross-highlight set is active.
    const cross = model.crossHighlight || [];
    if (cross.length) {
      document.querySelectorAll('.row[data-signal]').forEach(row => {
        const rowId = row.dataset.commentId || row.dataset.signal;
        if (rowId !== id) row.classList.toggle('selected', cross.includes(rowId));
      });
    }

    document.querySelectorAll('#bottomTabs [data-tab].active').forEach(button => {
      if (button.dataset.tab !== model.view.tab) button.classList.remove('active');
    });
    document.querySelector(`#bottomTabs [data-tab="${model.view.tab}"]`)?.classList.add('active');
    metrics.lastHighlightMs = performance.now() - started;
  };

  const installDelegatedEditorBinding = content => {
    if (!content || content.dataset.selectionDelegated === 'true') return;
    content.dataset.selectionDelegated = 'true';

    content.addEventListener('change', event => {
      const target = event.target;
      const signalId = model.selection?.id;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches('[data-editor-field]')) {
        controller.actions.updateSignalValue(signalId, Number(target.dataset.editorIndex), target.dataset.editorField, target.value);
      } else if (target.matches('[data-clock-field]')) {
        controller.actions.updateClock(signalId, target.dataset.clockField, target.value);
      } else if (target.matches('[data-comment-field]')) {
        controller.actions.updateComment(signalId, target.dataset.commentField, target.value);
      }
    });

    content.addEventListener('click', event => {
      const editorRow = event.target.closest?.('tbody tr[data-editor-index]');
      if (editorRow) {
        model.editor.rowIndex = Number(editorRow.dataset.editorIndex);
        controller.render();
        return;
      }
      const button = event.target.closest?.('[data-editor-action]');
      if (!button) return;
      const signalId = model.selection?.id;
      const action = button.dataset.editorAction;
      if (action === 'add') controller.actions.addSignalValue(signalId);
      else if (action === 'duplicate') controller.actions.duplicateSignalValue(signalId, model.editor?.rowIndex ?? 0);
      else if (action === 'delete') controller.actions.deleteSignalValue(signalId, model.editor?.rowIndex ?? 0);
    });
  };

  const busRange = signal => {
    if (!signal) return '';
    if (signal.source?.msb !== undefined && signal.source?.lsb !== undefined) return `[${signal.source.msb}:${signal.source.lsb}]`;
    return signal.width ? `[${Number(signal.width) - 1}:0]` : '';
  };

  const appendHierarchyInspector = (host, signal) => {
    if (!host || !signal) return;
    const mode = model.document.layout?.pathDisplayMode || 'signalOnly';
    if (model.view.leftPanelMode !== 'hierarchy' && mode === 'signalOnly') return;
    const source = signal.source || { instancePath: [], signalName: signal.name || signal.id };
    const full = controller.hierarchy?.getFullPath?.(signal) || signal.name || signal.id;
    const relative = controller.hierarchy?.getRelativePath?.(signal) || full;
    host.insertAdjacentHTML('beforeend', `<div class="section" data-hierarchy-inspector="true"><h3>Source / Hierarchy</h3><div class="prop"><span>Instance Path</span><b title="${esc(full)}">${esc((source.instancePath || []).join('.') || '(flat)')}</b></div><div class="prop"><span>Signal</span><b>${esc(source.signalName || signal.name)}</b></div><div class="prop"><span>Bus Width</span><b>${esc(busRange(signal) || '—')}</b></div><div class="prop"><span>Display Name</span><b>${esc(signal.display?.name || source.signalName || signal.name)}</b></div><div class="prop"><span>Relative</span><b title="${esc(full)}">${esc(relative)}</b></div></div>`);
  };

  const renderInspectorLight = () => {
    const host = document.querySelector('#inspectorBody');
    if (!host || model.view.tab !== 'signal') return;
    const signal = getSignal(model.selection?.id);
    const comment = !signal ? getComment(model.selection?.id) : null;
    if (comment) {
      host.innerHTML = `<div class="section"><h3>Comment Row</h3><div class="prop"><span>Title</span><b>${esc(comment.title)}</b></div><div class="prop"><span>Body</span><b>${esc(comment.body)}</b></div></div>`;
      return;
    }
    if (!signal) return;
    host.innerHTML = `<div class="section"><h3>信号プロパティ</h3><div class="prop"><span>名前</span><input value="${esc(signal.id)}"></div><div class="prop"><span>種別</span><input value="${esc(signal.type)}"></div><div class="prop"><span>可視性</span><select><option>表示</option><option>非表示</option></select></div></div><div class="section"><h3>表示</h3><label><input type="checkbox" checked> 波形を表示</label><br><label><input type="checkbox" checked> ラベルを表示</label></div>`;
    appendHierarchyInspector(host, signal);
  };

  const renderSelectionDetails = expectedGeneration => {
    detailTimer = 0;
    if (expectedGeneration !== generation) {
      metrics.cancelledDetailFrames += 1;
      return;
    }

    const started = performance.now();
    if (model.view.tab === 'signal') {
      const bottomStarted = performance.now();
      const content = document.querySelector('#bottomContent');
      if (typeof window.renderBottom === 'function') window.renderBottom(model);
      installDelegatedEditorBinding(content);
      if (content) content.dataset.renderedTab = 'signal';
      metrics.lastBottomMs = performance.now() - bottomStarted;

      const inspectorStarted = performance.now();
      renderInspectorLight();
      metrics.lastInspectorMs = performance.now() - inspectorStarted;
    }

    metrics.detailFrames += 1;
    metrics.lastDetailsMs = performance.now() - started;
    document.dispatchEvent(new CustomEvent('timingchart:selection-details-rendered', {
      detail: {
        id: model.selection?.id,
        durationMs: metrics.lastDetailsMs,
        bottomMs: metrics.lastBottomMs,
        inspectorMs: metrics.lastInspectorMs
      }
    }));
  };

  const scheduleDetails = () => {
    generation += 1;
    const expectedGeneration = generation;
    if (detailRaf) cancelAnimationFrame(detailRaf);
    if (detailTimer) clearTimeout(detailTimer);

    // One rAF is enough to let the immediate row highlight reach the next
    // paint. Heavy detail DOM work then runs as a separate task immediately
    // after that paint instead of waiting for a second animation frame.
    detailRaf = requestAnimationFrame(() => {
      detailRaf = 0;
      detailTimer = window.setTimeout(() => renderSelectionDetails(expectedGeneration), 0);
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
    renderHighlight(row instanceof Element ? row : null);
    scheduleDetails();
    document.dispatchEvent(new CustomEvent('timingchart:selection-highlighted', {
      detail: { id, durationMs: metrics.lastHighlightMs }
    }));
    return true;
  };

  controller.renderSelectionFast = () => {
    renderHighlight();
    scheduleDetails();
  };
})();
