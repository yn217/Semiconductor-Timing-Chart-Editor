(() => {
  'use strict';

  const canvas = document.querySelector('#cycleCanvas');
  const wave = canvas?.querySelector(':scope > .wave');
  if (!canvas || !wave || canvas.dataset.frozenLabelsReady) return;

  const style = document.createElement('style');
  style.dataset.frozenLabels = 'true';
  style.textContent = `
    #cycleCanvas[data-frozen-labels] { position:relative; overflow:hidden; }
    #cycleCanvas[data-frozen-labels] > .timing-scroll-pane { position:absolute; inset:34px 0 0; overflow:auto; min-width:0; }
    #cycleCanvas[data-frozen-labels] > .timing-scroll-pane > .wave { min-width:920px; }
    #cycleCanvas[data-frozen-labels] .canvas-icon,
    #cycleCanvas[data-frozen-labels] .signal-label { position:sticky; }
    #cycleCanvas[data-frozen-labels] .canvas-icon { left:14px; z-index:6; background:inherit; }
    #cycleCanvas[data-frozen-labels] .signal-label { left:42px; z-index:5; background:inherit; }
    #cycleCanvas[data-frozen-labels] .ruler .cycle-title { position:sticky; left:14px; z-index:6; background:#fff; }
  `;
  document.head.appendChild(style);

  const timingPane = document.createElement('div');
  timingPane.className = 'timing-scroll-pane';
  timingPane.dataset.scrollOwner = 'timing';
  timingPane.dataset.frozenLabels = 'true';
  timingPane.appendChild(wave);
  const playhead = canvas.querySelector(':scope > .playhead');
  if (playhead) timingPane.appendChild(playhead);
  const annotationOverlay = canvas.querySelector(':scope > svg[data-production-overlay="annotations"]');
  if (annotationOverlay) timingPane.appendChild(annotationOverlay);
  canvas.appendChild(timingPane);
  canvas.dataset.frozenLabels = 'true';
  canvas.dataset.frozenLabelsReady = 'true';

  window.TimingChartTimingViewport = {
    canvas,
    timingPane,
    getScrollHost: () => timingPane,
    getScrollLeft: () => timingPane.scrollLeft,
    getScrollTop: () => timingPane.scrollTop,
    getViewportRect: () => timingPane.getBoundingClientRect()
  };

  timingPane.addEventListener('scroll', () => {
    window.TimingChartProductionTimeAxis?.renderScrollTransient?.(window.TimingChartProductionController?.model);
    window.TimingChartProductionController?.scheduleTimedBandLabels?.();
  }, { passive: true });

  window.TimingChartProductionController?.applyTimingOnlyZoom?.();
})();
