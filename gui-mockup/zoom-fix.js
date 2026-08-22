(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller?.model) return;
  const model = controller.model;

  // Keep the mixed label/timing container itself unscaled. Zoom is applied
  // only to timing-owned geometry and is anchored at the actual WaveDrom
  // Cycle-0 position so WaveDrom's internal left margin never drifts.
  const style = document.createElement('style');
  style.dataset.timingOnlyZoom = 'true';
  style.textContent = '#cycleCanvas .wave{transform:none!important;transform-origin:left top!important}';
  document.head.appendChild(style);

  const metrics = controller.zoomMetrics = controller.zoomMetrics || {
    requests: 0,
    frames: 0,
    geometryRefreshes: 0,
    fullWaveDromRenders: 0
  };

  let raf = 0;
  let applying = false;

  const updateStatus = () => {
    const status = document.querySelector('.status');
    if (!status) return;
    const zoom = [...status.querySelectorAll('span')].find(span => span.textContent.includes('Zoom'));
    if (zoom) zoom.textContent = `Zoom: ${Math.round(Number(model.view.zoom || 1) * 100)}%`;
  };

  const geometryEntryForSvg = svg => {
    const traceId = svg.parentElement?.id;
    if (!traceId) return null;
    return Object.values(model.waveGeometry?.signals || {}).find(entry => entry?.traceId === traceId) || null;
  };

  const baseMetricsForSvg = (svg, entry) => {
    if (!svg.dataset.zoomBaseWidth) {
      const baseWidth = Number.parseFloat(svg.style.width) || Number(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
      if (baseWidth > 0) svg.dataset.zoomBaseWidth = String(baseWidth);
    }
    const baseWidth = Number(svg.dataset.zoomBaseWidth || 0);
    const viewBox = svg.viewBox?.baseVal;
    const cycle0 = entry?.cycleBoundary?.[0];
    if (!baseWidth || !viewBox || !viewBox.width || !cycle0) return null;
    const cycle0Px = (Number(cycle0.localX) - viewBox.x) * baseWidth / viewBox.width;
    return { baseWidth, cycle0Px };
  };

  const refreshGeometryCanvasPositions = () => {
    const geometry = model.waveGeometry?.signals;
    if (!geometry) return;
    for (const entry of Object.values(geometry)) {
      const svg = entry?.traceId ? document.getElementById(entry.traceId)?.querySelector('svg') : null;
      if (!svg?.getScreenCTM) continue;
      const matrix = svg.getScreenCTM();
      for (const key of ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition']) {
        for (const item of entry[key] || []) {
          if (!Number.isFinite(Number(item.localX)) || !Number.isFinite(Number(item.localY))) continue;
          const screen = new DOMPoint(Number(item.localX), Number(item.localY)).matrixTransform(matrix);
          item.canvasX = screen.x;
          item.canvasY = screen.y;
        }
      }
    }
    metrics.geometryRefreshes += 1;
  };

  const applyTimingOnlyZoom = () => {
    raf = 0;
    if (applying) return;
    applying = true;
    try {
      const zoom = Number(model.view.zoom || 1);
      const wave = document.querySelector('#cycleCanvas .wave');
      if (!wave) return;

      wave.style.removeProperty('transform');
      wave.dataset.zoomScope = 'timing-only';
      wave.dataset.zoom = String(zoom);

      const waveRect = wave.getBoundingClientRect();
      let requiredRight = 0;

      document.querySelectorAll('#cycleCanvas .trace > svg').forEach(svg => {
        const entry = geometryEntryForSvg(svg);
        const base = baseMetricsForSvg(svg, entry);
        if (!base) return;

        // Preserve the canonical WaveDrom SVG width. Scale around Cycle 0,
        // not around the SVG's x=0, otherwise WaveDrom's own left gutter is
        // also scaled and Cycle 0 visibly moves when Zoom changes.
        svg.style.width = `${base.baseWidth}px`;
        svg.style.transformOrigin = `${base.cycle0Px}px 0px`;
        svg.style.transform = zoom === 1 ? '' : `scaleX(${zoom})`;
        svg.style.willChange = 'transform';
        svg.dataset.viewZoom = String(zoom);
        svg.dataset.zoomOrigin = 'cycle-0';

        const host = svg.parentElement;
        const hostLeft = host ? host.getBoundingClientRect().left - waveRect.left : 0;
        const scaledRight = base.cycle0Px + (base.baseWidth - base.cycle0Px) * zoom;
        requiredRight = Math.max(requiredRight, hostLeft + scaledRight + 24);
      });

      // Ensure transformed timing content contributes enough horizontal
      // scrollable extent without scaling any label/UI columns.
      if (requiredRight > 0) wave.style.minWidth = `${Math.max(920, Math.ceil(requiredRight))}px`;

      // Timed Comment Row bands follow the time-axis scale, but their text
      // remains normal UI text. Cycle-0 alignment is re-resolved below from
      // the actual WaveDrom geometry.
      document.querySelectorAll('#cycleCanvas .comment-body, #cycleCanvas .latency').forEach(band => {
        band.style.width = zoom === 1 ? '' : `${zoom * 100}%`;
        band.dataset.viewZoom = String(zoom);
      });

      refreshGeometryCanvasPositions();
      controller.renderTransient?.(model);
      window.TimingChartProductionAnnotations?.render?.(model);
      updateStatus();
      metrics.frames += 1;
    } finally {
      applying = false;
    }
  };

  const scheduleZoom = () => {
    if (raf) return;
    raf = requestAnimationFrame(applyTimingOnlyZoom);
  };

  controller.actions.setZoom = percentValue => {
    const percent = Number(percentValue);
    if (!Number.isFinite(percent) || percent < 25 || percent > 400) return false;
    model.view.zoom = percent / 100;
    metrics.requests += 1;
    updateStatus();
    scheduleZoom();
    return true;
  };
  controller.actions.fitAll = () => controller.actions.setZoom(100);
  controller.actions.fitSelection = () => controller.actions.setZoom(125);

  // Semantic/document renders may replace WaveDrom SVG nodes. Re-apply the
  // lightweight view-only zoom after that replacement, but ignore ruler and
  // comment mutations created by this zoom path itself.
  const canvas = document.querySelector('#cycleCanvas');
  if (canvas && window.MutationObserver) {
    new MutationObserver(mutations => {
      const traceChanged = mutations.some(mutation => mutation.type === 'childList' && mutation.target?.closest?.('.trace'));
      if (traceChanged) scheduleZoom();
    }).observe(canvas, { subtree: true, childList: true });
  }

  window.addEventListener('resize', scheduleZoom);
  controller.applyTimingOnlyZoom = scheduleZoom;
  scheduleZoom();
})();
