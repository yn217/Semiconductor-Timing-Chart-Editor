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
  style.textContent = `
    #cycleCanvas .wave{transform:none!important;transform-origin:left top!important}
    #cycleCanvas .trace > svg{transform-box:border-box}
    #cycleCanvas .comment-body[data-zoom-cycle0],
    #cycleCanvas .latency[data-zoom-cycle0]{transform:translateX(var(--comment-cycle0-offset,0px))!important}
    #cycleCanvas .comment-body[data-zoom-label-host],
    #cycleCanvas .latency[data-zoom-label-host]{position:relative;justify-content:flex-start}
    #cycleCanvas [data-zoom-comment-label]{position:absolute;top:50%;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;color:inherit;font:inherit;line-height:inherit;z-index:2}
  `;
  document.head.appendChild(style);

  const metrics = controller.zoomMetrics = controller.zoomMetrics || {
    requests: 0,
    frames: 0,
    geometryRefreshes: 0,
    fullWaveDromRenders: 0
  };

  let raf = 0;
  let applying = false;
  let labelRaf = 0;

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

  const ensureTimedBandLabel = band => {
    let label = band.querySelector(':scope > [data-zoom-comment-label]');
    if (label) return label;

    const textNodes = [...band.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const text = textNodes.map(node => node.textContent).join('').trim();
    if (!text) return null;
    textNodes.forEach(node => node.remove());

    label = document.createElement('span');
    label.dataset.zoomCommentLabel = 'true';
    label.textContent = text;
    band.appendChild(label);
    band.dataset.zoomLabelHost = 'true';
    return label;
  };

  const positionTimedBandLabels = () => {
    labelRaf = 0;
    const canvas = document.querySelector('#cycleCanvas');
    const referenceClock = controller.selectors?.getReferenceClock?.();
    const boundary = controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: 0, coordinateSpace: 'canvas' });
    if (!canvas || !boundary) return;

    const canvasRect = canvas.getBoundingClientRect();
    const viewportLeft = Math.max(canvasRect.left, boundary.canvasX);
    const viewportRight = canvasRect.right - 8;

    document.querySelectorAll('#cycleCanvas .comment-body, #cycleCanvas .latency').forEach(band => {
      const label = ensureTimedBandLabel(band);
      if (!label) return;
      const rect = band.getBoundingClientRect();
      const visibleLeft = Math.max(rect.left, viewportLeft);
      const visibleRight = Math.min(rect.right, viewportRight);
      if (visibleRight <= visibleLeft) {
        label.style.visibility = 'hidden';
        return;
      }
      label.style.visibility = '';
      const visibleCenter = (visibleLeft + visibleRight) / 2;
      label.style.left = `${visibleCenter - rect.left}px`;
      label.dataset.positionSource = 'visible-timed-band';
    });
  };

  const scheduleTimedBandLabels = () => {
    if (labelRaf) return;
    labelRaf = requestAnimationFrame(positionTimedBandLabels);
  };

  const alignTimedBandsToCycleZero = () => {
    const referenceClock = controller.selectors?.getReferenceClock?.();
    const boundary = controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: 0, coordinateSpace: 'canvas' });
    if (!boundary || boundary.source !== 'wavedrom-svg') return;

    document.querySelectorAll('#cycleCanvas .wave-row').forEach(row => {
      if (row.querySelector('.trace')) return;
      const band = row.querySelector('.comment-body, .latency');
      if (!band) return;

      // offsetLeft is layout geometry and is not affected by an existing CSS
      // transform. This prevents repeated transient renders from toggling the
      // band between aligned and unaligned positions.
      const parent = band.offsetParent;
      const parentLeft = parent?.getBoundingClientRect?.().left ?? row.getBoundingClientRect().left;
      const baseLeft = parentLeft + Number(band.offsetLeft || 0);
      const delta = boundary.canvasX - baseLeft;
      band.style.setProperty('--comment-cycle0-offset', `${delta}px`);
      band.dataset.zoomCycle0 = 'true';
      band.dataset.cycle0Aligned = 'wavedrom-svg';
      band.dataset.cycle0ErrorPx = '0';
    });
  };

  const applyTimingOnlyZoom = () => {
    controller.profileMark?.('zoom:start');
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

        // SVG transform-origin has different defaults from HTML. Force the
        // border-box coordinate system, then anchor scaleX at the measured
        // Cycle-0 pixel inside the canonical WaveDrom SVG.
        svg.style.width = `${base.baseWidth}px`;
        svg.style.transformBox = 'border-box';
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

      // Timed Comment Row bands follow the time-axis scale. Their text is
      // detached into an unscaled overlay label and positioned within the
      // currently visible portion of the band so zoom never pushes the text
      // off-screen merely because the timing range became wider.
      document.querySelectorAll('#cycleCanvas .comment-body, #cycleCanvas .latency').forEach(band => {
        ensureTimedBandLabel(band);
        band.style.width = zoom === 1 ? '' : `${zoom * 100}%`;
        band.dataset.viewZoom = String(zoom);
      });

      refreshGeometryCanvasPositions();
      alignTimedBandsToCycleZero();
      controller.renderTransient?.(model);
      // renderTransient may perform its legacy alignment pass; the important
      // CSS rule above keeps the stable layout-derived Cycle-0 offset.
      alignTimedBandsToCycleZero();
      window.TimingChartProductionAnnotations?.render?.(model);
      positionTimedBandLabels();
      updateStatus();
      metrics.frames += 1;
      controller.profileMark?.('zoom:end');
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
  const getTimingViewport = () => window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
  const pointBounds = points => {
    const finite = points.filter(point => Number.isFinite(Number(point?.x))).map(point => Number(point.x));
    if (!finite.length) return null;
    return { left: Math.min(...finite), right: Math.max(...finite) };
  };
  const boundaryBounds = (start, end) => {
    const clock = controller.selectors?.getReferenceClock?.();
    if (!clock || !controller.getCycleBoundary) return null;
    const cycleCount = Number(model.document.timeline.cycleCount || 0);
    let rangeStart = Number(start); let rangeEnd = Number(end);
    if (rangeEnd <= rangeStart) { if (rangeStart < cycleCount) rangeEnd = rangeStart + 1; else rangeStart = Math.max(0, rangeStart - 1); }
    const points = [controller.getCycleBoundary({ signal: clock.id, cycle: rangeStart, coordinateSpace: 'canvas' }), controller.getCycleBoundary({ signal: clock.id, cycle: rangeEnd, coordinateSpace: 'canvas' })];
    return pointBounds(points.map(point => ({ x: point?.canvasX })));
  };
  const signalBounds = signalId => {
    const entry = model.waveGeometry?.signals?.[signalId];
    if (!entry) return null;
    const points = Object.values(entry).flatMap(value => Array.isArray(value) ? value : []).map(point => ({ x: point?.canvasX }));
    return pointBounds(points);
  };
  const anchorPoint = anchor => {
    if (!anchor) return null;
    if (anchor.point === 'cycle-boundary' || anchor.anchor === 'cycle-boundary') return controller.getCycleBoundary?.({ signal: controller.selectors?.getReferenceClock?.()?.id, cycle: Number(anchor.cycle), coordinateSpace: 'canvas' });
    return controller.getAnchor?.({ signal: anchor.signal, cycle: Number(anchor.cycle), edge: anchor.anchor || anchor.point, coordinateSpace: 'canvas' }) || controller.getCycleBoundary?.({ signal: anchor.signal || controller.selectors?.getReferenceClock?.()?.id, cycle: Number(anchor.cycle), coordinateSpace: 'canvas' });
  };
  const selectedBounds = () => {
    const selection = model.selection || {};
    const time = model.timeSelection;
    const hasExplicitRange = Number.isFinite(Number(time?.rangeStart)) && Number.isFinite(Number(time?.rangeEnd));
    if (hasExplicitRange) return boundaryBounds(Number(time.rangeStart), Number(time.rangeEnd));
    if (selection.kind === 'signal') return signalBounds(selection.id) || boundaryBounds(0, model.document.timeline.cycleCount);
    if (selection.kind === 'annotation') {
      const annotation = (model.document.annotations || []).find(item => item.id === selection.id);
      const anchors = annotation ? [annotation.start || annotation.anchor || annotation.from, annotation.end || annotation.to, annotation.to] : [];
      return pointBounds(anchors.map(anchorPoint).map(point => ({ x: point?.canvasX })));
    }
    if (selection.kind === 'transaction') {
      const transaction = (model.document.transactions || []).find(item => item.id === selection.id);
      if (transaction) return boundaryBounds(Number(transaction.start || 0), Number(transaction.end ?? transaction.start ?? 0));
    }
    if (selection.kind === 'time' && time?.cycle !== undefined) return boundaryBounds(Number(time.cycle), Number(time.cycle));
    return boundaryBounds(0, model.document.timeline.cycleCount);
  };
  const fitZoomForBounds = bounds => {
    const viewport = getTimingViewport();
    if (!viewport || !bounds || bounds.right <= bounds.left) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const available = Math.max(80, viewportRect.right - bounds.left - 12);
    const current = Number(model.view.zoom || 1);
    // Fit is a geometry operation, not a manual zoom command.  A long
    // timeline may require a value below the normal 25% manual minimum.
    // Keep a small positive floor only to avoid zero-sized timing geometry.
    return Math.max(0.01, Math.min(4, current * available / Math.max(1, bounds.right - bounds.left)));
  };
  const applyFitZoom = zoom => {
    if (!Number.isFinite(Number(zoom)) || zoom < 0.01 || zoom > 4) return false;
    model.view.zoom = Number(zoom);
    metrics.requests += 1;
    updateStatus();
    scheduleZoom();
    return true;
  };
  const revealBounds = bounds => {
    const viewport = getTimingViewport();
    if (!viewport || !bounds) return;
    const rect = viewport.getBoundingClientRect();
    const center = (bounds.left + bounds.right) / 2;
    const target = viewport.scrollLeft + center - (rect.left + rect.width / 2);
    viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, target));
    controller.renderTransient?.(model);
  };
  const fitTo = (bounds, { resetScroll = false, recompute } = {}) => {
    const viewport = getTimingViewport();
    if (resetScroll && viewport) { viewport.scrollLeft = 0; controller.renderTransient?.(model); bounds = recompute?.() || bounds; }
    const zoom = fitZoomForBounds(bounds);
    if (zoom === null) return false;
    if (!applyFitZoom(zoom)) return false;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (resetScroll && viewport) { viewport.scrollLeft = 0; controller.renderTransient?.(model); } else revealBounds(recompute?.() || bounds); }));
    return true;
  };
  controller.actions.fitAll = () => fitTo(null, { resetScroll: true, recompute: () => boundaryBounds(0, model.document.timeline.cycleCount) });
  controller.actions.fitSelection = () => fitTo(selectedBounds(), { recompute: selectedBounds });

  // Semantic/document renders may replace WaveDrom SVG nodes. Re-apply the
  // lightweight view-only zoom after that replacement, but ignore ruler and
  // comment mutations created by this zoom path itself.
  const canvas = document.querySelector('#cycleCanvas');
  if (canvas && window.MutationObserver) {
    new MutationObserver(mutations => {
      const traceChanged = mutations.some(mutation => mutation.type === 'childList' && mutation.target?.closest?.('.trace'));
      if (traceChanged && controller.timelineRenderActive) return;
      if (traceChanged && controller.skipTimingZoomUntil && performance.now() < controller.skipTimingZoomUntil) { controller.skipTimingZoomUntil = 0; return; }
      if (traceChanged) scheduleZoom();
    }).observe(canvas, { subtree: true, childList: true });
    canvas.addEventListener('scroll', scheduleTimedBandLabels, { passive: true });
  }

  window.addEventListener('resize', () => {
    scheduleZoom();
    scheduleTimedBandLabels();
  });
  controller.applyTimingOnlyZoom = scheduleZoom;
  controller.scheduleTimedBandLabels = scheduleTimedBandLabels;
  scheduleZoom();
})();
