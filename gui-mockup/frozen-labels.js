(() => {
  'use strict';
  const canvas = document.querySelector('#cycleCanvas');
  const wave = canvas?.querySelector(':scope > .wave');
  if (!canvas || !wave || canvas.dataset.frozenLabelsReady) return;

  // Labels must be a sibling of the scroll owner. Sticky labels inside the
  // timing scroll subtree still allow SVG/text content to paint underneath.
  const style = document.createElement('style');
  style.dataset.frozenLabels = 'true';
  style.textContent = `
    #cycleCanvas[data-frozen-labels] { position:relative; overflow:hidden; --frozen-label-width:173px; }
    #cycleCanvas[data-frozen-labels] > .frozen-label-pane { position:absolute; left:0; top:34px; bottom:0; width:var(--frozen-label-width); overflow:hidden; z-index:10; background:#fff; contain:paint; }
    #cycleCanvas[data-frozen-labels] > .timing-scroll-pane { position:absolute; left:var(--frozen-label-width); right:0; top:34px; bottom:0; overflow:auto; min-width:0; isolation:isolate; clip-path:inset(0); }
    #cycleCanvas[data-frozen-labels] > .timing-scroll-pane > .wave { min-width:920px; padding-left:0; }
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .wave-row { grid-template-columns:minmax(0,1fr); min-width:100%; }
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .canvas-icon,
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .signal-label { display:none!important; }
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .trace,
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .comment-body,
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .latency { grid-column:1; min-width:0; }
    #cycleCanvas[data-frozen-labels] .timing-scroll-pane .ruler { min-width:920px; }
    #cycleCanvas[data-frozen-labels] .frozen-label-wave { position:relative; min-width:var(--frozen-label-width); padding:44px 0 14px; transform:translateY(0); will-change:transform; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row { display:grid; grid-template-columns:28px minmax(0,1fr); min-height:35px; align-items:center; position:relative; padding:0; overflow:hidden; background:#fff; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row .canvas-icon { z-index:2; justify-self:center; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row .signal-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; z-index:2; padding-right:5px; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row.selected { background:#eef6ff; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row[hidden] { display:none!important; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row[data-kind="comment"] .signal-label { color:#7a3bb8; }
    #cycleCanvas[data-frozen-labels] .frozen-label-row .canvas-icon.role.comment { border:0; background:transparent; }
  `;
  document.head.appendChild(style);

  const timingPane = document.createElement('div');
  timingPane.className = 'timing-scroll-pane';
  timingPane.dataset.scrollOwner = 'timing';
  timingPane.dataset.frozenLabels = 'true';
  const frozenPane = document.createElement('div');
  frozenPane.className = 'frozen-label-pane';
  frozenPane.dataset.scrollOwner = 'labels';
  frozenPane.setAttribute('aria-label', 'Frozen signal labels');
  const frozenWave = document.createElement('div');
  frozenWave.className = 'frozen-label-wave';
  frozenPane.appendChild(frozenWave);
  timingPane.appendChild(wave);
  const playhead = canvas.querySelector(':scope > .playhead');
  if (playhead) timingPane.appendChild(playhead);
  const annotationOverlay = canvas.querySelector(':scope > svg[data-production-overlay="annotations"]');
  if (annotationOverlay) timingPane.appendChild(annotationOverlay);
  canvas.append(frozenPane, timingPane);
  canvas.dataset.frozenLabels = 'true';
  canvas.dataset.frozenLabelsReady = 'true';

  const initialWidth = () => {
    const row = wave.querySelector(':scope > .wave-row');
    const icon = row?.querySelector(':scope > .canvas-icon');
    const label = row?.querySelector(':scope > .signal-label');
    return Math.max(156, Math.round(icon && label ? icon.getBoundingClientRect().width + label.getBoundingClientRect().width : 173));
  };
  const configuredWidth = () => {
    const model = window.TimingChartProductionController?.model;
    const value = Number(model?.view?.previewSignalNameWidth ?? model?.document?.layout?.signalNameWidth);
    if (Number.isFinite(value) && value !== 168) return value + 5;
    return Number(canvas.dataset.frozenLabelWidth || initialWidth());
  };
  const applyPaneWidth = () => {
    const width = Math.max(156, Math.min(365, configuredWidth()));
    canvas.style.setProperty('--frozen-label-width', `${width}px`);
    canvas.dataset.frozenLabelWidth = String(width);
    frozenPane.style.width = `${width}px`;
    timingPane.style.left = `${width}px`;
    frozenWave.style.minWidth = `${width}px`;
  };

  const copyRowStyle = (target, source) => {
    target.hidden = source.hidden;
    target.style.display = source.style.display === 'none' ? 'none' : '';
    target.style.marginTop = source.style.marginTop;
    target.style.marginBottom = source.style.marginBottom;
    target.style.opacity = source.style.opacity || '';
    target.style.backgroundImage = 'none';
    target.style.backgroundColor = source.classList.contains('selected') ? '#eef6ff' : '#fff';
    const height = source.getBoundingClientRect().height;
    if (height > 0) target.style.height = `${height}px`;
  };
  const makeFrozenRow = (source, model) => {
    const row = document.createElement('div');
    row.className = `frozen-label-row ${[...source.classList].filter(name => name.startsWith('band-')).join(' ')}`;
    row.dataset.signal = source.dataset.signal || source.dataset.signalId || '';
    row.dataset.signalId = row.dataset.signal;
    row.dataset.kind = source.dataset.kind || '';
    row.dataset.groupId = source.dataset.groupId || '';
    const icon = source.querySelector(':scope > .canvas-icon')?.cloneNode(true) || document.createElement('span');
    icon.classList.add('canvas-icon');
    const label = source.querySelector(':scope > .signal-label')?.cloneNode(true) || document.createElement('span');
    label.classList.add('signal-label');
    label.dataset.signalId = row.dataset.signal;
    row.append(icon, label);
    copyRowStyle(row, source);
    row.addEventListener('click', event => {
      if (event.target.closest('button,input,select,textarea')) return;
      const controller = window.TimingChartProductionController;
      const signal = (model?.document?.signals || []).find(item => item.id === row.dataset.signal);
      if (controller && signal) controller.actions.selectObject({ dataset: { signal: signal.id, kind: signal.type === 'commentRow' ? 'comment' : signal.type } });
    });
    return row;
  };

  const syncFrozenLabels = model => {
    applyPaneWidth();
    const rows = [...wave.querySelectorAll(':scope > .wave-row')];
    const current = new Map([...frozenWave.querySelectorAll(':scope > .frozen-label-row')].map(row => [row.dataset.signal, row]));
    const used = new Set();
    for (const source of rows) {
      const id = source.dataset.signal || source.dataset.signalId;
      if (!id) continue;
      let target = current.get(id);
      if (!target) target = makeFrozenRow(source, model);
      target.className = `frozen-label-row ${[...source.classList].filter(name => name.startsWith('band-')).join(' ')}`;
      target.dataset.signal = id;
      target.dataset.signalId = id;
      target.dataset.kind = source.dataset.kind || '';
      target.dataset.groupId = source.dataset.groupId || '';
      const sourceIcon = source.querySelector(':scope > .canvas-icon');
      const sourceLabel = source.querySelector(':scope > .signal-label');
      const targetIcon = target.querySelector(':scope > .canvas-icon');
      const targetLabel = target.querySelector(':scope > .signal-label');
      if (sourceIcon && targetIcon && targetIcon.innerHTML !== sourceIcon.innerHTML) targetIcon.replaceWith(sourceIcon.cloneNode(true));
      if (sourceLabel && targetLabel) {
        targetLabel.innerHTML = sourceLabel.innerHTML;
        targetLabel.className = sourceLabel.className;
        targetLabel.style.cssText = sourceLabel.style.cssText;
        targetLabel.dataset.signalId = id;
      }
      copyRowStyle(target, source);
      frozenWave.appendChild(target);
      used.add(id);
    }
    for (const target of frozenWave.querySelectorAll(':scope > .frozen-label-row')) if (!used.has(target.dataset.signal)) target.remove();
    frozenWave.style.transform = `translateY(${-timingPane.scrollTop}px)`;
    frozenWave.dataset.scrollTop = String(timingPane.scrollTop);
    frozenPane.dataset.rowCount = String(rows.length);
    frozenPane.dataset.frozen = 'true';
  };

  window.TimingChartTimingViewport = { canvas, timingPane, frozenPane, getScrollHost: () => timingPane, getScrollLeft: () => timingPane.scrollLeft, getScrollTop: () => timingPane.scrollTop, getViewportRect: () => timingPane.getBoundingClientRect() };
  window.TimingChartFrozenLabels = { canvas, timingPane, frozenPane, frozenWave, sync: syncFrozenLabels };
  timingPane.addEventListener('scroll', () => {
    frozenWave.style.transform = `translateY(${-timingPane.scrollTop}px)`;
    frozenWave.dataset.scrollTop = String(timingPane.scrollTop);
    window.TimingChartProductionTimeAxis?.renderScrollTransient?.(window.TimingChartProductionController?.model);
    window.TimingChartProductionController?.scheduleTimedBandLabels?.();
  }, { passive: true });
  window.addEventListener('resize', applyPaneWidth, { passive: true });

  const install = () => {
    const controller = window.TimingChartProductionController;
    if (!controller) return setTimeout(install, 0);
    if (!controller.renderHooks.after.has('frozen-labels')) controller.registerRenderHook('frozen-labels', syncFrozenLabels);
    syncFrozenLabels(controller.model);
    controller.applyTimingOnlyZoom?.();
  };
  install();
})();
