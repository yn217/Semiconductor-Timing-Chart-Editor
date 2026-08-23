(() => {
  'use strict';

  const prefix = 'waveDromTrace_';
  const waveCache = new Map();
  const renderMetrics = () => {
    const controller = window.TimingChartProductionController;
    const metrics = controller.renderMetrics ||= { appFullRenders: 0, rowMoves: 0, cycleRowCreates: 0, cycleRowRemoves: 0, cycleRowMoves: 0, wavePayloadBuilds: 0, waveCacheLookups: 0, waveDromRenders: 0, geometryBuilds: 0, geometryScreenRefreshes: 0, geometryCacheHits: 0, waveCacheHits: 0, screenMatrixReads: 0, boundingRectReads: 0, geometryPointsTransformed: 0, annotationFullRenders: 0, annotationNodeCreates: 0, annotationNodeRemoves: 0, inspectorInnerHtmlRebuilds: 0, signalStyleFullScans: 0, layoutRowLookups: 0, minimapRowRectReads: 0, transactionRenders: 0, bottomRenders: 0, inspectorRenders: 0, minimapOverviewRebuilds: 0, minimapViewportUpdates: 0 };
    metrics.geometryScreenRefreshes ??= 0;
    return metrics;
  };
  const traceRows = () => [...document.querySelectorAll('#cycleCanvas .wave-row')]
    .filter(row => row.querySelector('.trace'));

  function renderSurface() {
    const wave = document.querySelector('#cycleCanvas .timing-scroll-pane > .wave') || document.querySelector('#cycleCanvas .wave');
    if (!wave) return null;
    const owner = wave.parentElement?.classList.contains('timing-scroll-pane') ? wave.parentElement : wave;
    let surface = owner.querySelector(':scope > .waveform-render-surface') || wave.querySelector(':scope > .waveform-render-surface');
    if (!surface) {
      surface = document.createElement('div');
      surface.className = 'waveform-render-surface';
      surface.dataset.rendererSurface = 'wavedrom';
      surface.setAttribute('aria-hidden', 'true');
      surface.style.cssText = 'position:absolute;left:0;top:0;z-index:1;pointer-events:none;overflow:visible;contain:layout style paint;';
    }
    if (surface.parentElement !== owner) owner.appendChild(surface);
    if (getComputedStyle(owner).position === 'static') owner.style.position = 'relative';
    surface.style.width = `${wave.scrollWidth}px`;
    surface.style.height = `${wave.scrollHeight}px`;
    return surface;
  }

  const waveForSurface = surface => surface?.parentElement?.classList.contains('timing-scroll-pane')
    ? surface.parentElement.querySelector(':scope > .wave')
    : surface?.parentElement;

  function laneFor(signal, row) {
    const surface = renderSurface();
    if (!surface || !signal || !row) return null;
    let lane = [...surface.children].find(node => node.dataset.signal === signal.id);
    if (!lane) {
      lane = document.createElement('div');
      lane.className = 'waveform-surface-row';
      lane.dataset.signal = signal.id;
      lane.dataset.signalId = signal.id;
      lane.style.cssText = 'position:absolute;left:0;top:0;height:28px;pointer-events:none;content-visibility:auto;contain-intrinsic-size:28px 100%;';
      const host = document.createElement('span');
      host.className = 'trace';
      host.dataset.surfaceTrace = 'true';
      host.style.display = 'block';
      host.style.height = '28px';
      lane.appendChild(host);
      surface.appendChild(lane);
    }
    return lane;
  }

  function positionLane(row, lane) {
    const placeholder = row?.querySelector(':scope > .trace');
    if (!row || !lane || !placeholder) return false;
    const wave = waveForSurface(lane.parentElement);
    const waveRect = wave?.getBoundingClientRect();
    const placeholderRect = placeholder.getBoundingClientRect();
    if (!waveRect) return false;
    const top = placeholderRect.top - waveRect.top;
    const left = placeholderRect.left - waveRect.left;
    const width = placeholderRect.width;
    const hidden = row.hidden || row.style.display === 'none';
    if (lane.style.top !== `${top}px`) lane.style.top = `${top}px`;
    if (lane.style.left !== `${left}px`) lane.style.left = `${left}px`;
    if (lane.style.width !== `${width}px`) lane.style.width = `${width}px`;
    if (lane.hidden !== hidden) lane.hidden = hidden;
    return true;
  }

  function syncSurface(model, rows = traceRows(), { removeStale = true } = {}) {
    const surface = renderSurface();
    if (!surface) return [];
    const waveRect = waveForSurface(surface)?.getBoundingClientRect();
    const layoutRows = [...document.querySelectorAll('#cycleCanvas .wave-row')];
    const slots = layoutRows.map(row => {
      const trace = row.querySelector(':scope > .trace, :scope > .comment-body, :scope > .latency');
      const rowRect = row.getBoundingClientRect();
      const traceRect = trace?.getBoundingClientRect?.() || rowRect;
      return { row, rowTop: rowRect.top - waveRect.top, traceTop: traceRect.top - waveRect.top, rowHeight: rowRect.height };
    });
    slots.forEach((slot, index) => {
      const next = slots[index + 1];
      slot.row.dataset.surfaceRowTop = String(slot.rowTop);
      slot.row.dataset.surfaceTraceTop = String(slot.traceTop);
      slot.row.dataset.surfaceFootprint = String(next ? next.rowTop - slot.rowTop : slot.rowHeight);
    });
    const mounted = [];
    const used = new Set();
    for (const row of rows) {
      const signal = signalForRow(model, row);
      if (!signal || signal.type === 'commentRow') continue;
      const lane = laneFor(signal, row);
      positionLane(row, lane);
      used.add(signal.id);
      mounted.push({ signal, row, lane, host: lane.querySelector(':scope > .trace'), svg: lane.querySelector(':scope > .trace svg') });
    }
    if (removeStale) for (const lane of surface.querySelectorAll(':scope > .waveform-surface-row')) if (!used.has(lane.dataset.signal)) lane.remove();
    surface.dataset.rowCount = String(used.size);
    return mounted;
  }

  function captureRowReorder(signalIds = []) {
    const ids = new Set(signalIds);
    const rows = traceRows().filter(row => ids.has(row.dataset.signalId || row.dataset.signal));
    if (rows.length !== ids.size || rows.some(row => row.hidden || row.style.display === 'none')) return null;
    const entries = rows.map(row => ({
      id: row.dataset.signalId || row.dataset.signal,
      rowTop: Number(row.dataset.surfaceRowTop),
      traceTop: Number(row.dataset.surfaceTraceTop),
      footprint: Number(row.dataset.surfaceFootprint)
    }));
    return entries.every(entry => Object.values(entry).slice(1).every(Number.isFinite)) ? { entries } : null;
  }

  function applyCapturedRowReorder(model, capture) {
    if (!capture?.entries?.length || !model?.waveGeometry) return false;
    const byId = new Map(capture.entries.map(entry => [entry.id, entry]));
    const ordered = traceRows().filter(row => byId.has(row.dataset.signalId || row.dataset.signal));
    if (ordered.length !== capture.entries.length) return false;
    let rowTop = Math.min(...capture.entries.map(entry => entry.rowTop));
    const deltas = new Map();
    for (const row of ordered) {
      const id = row.dataset.signalId || row.dataset.signal;
      const old = byId.get(id);
      const traceTop = rowTop + (old.traceTop - old.rowTop);
      const lane = document.querySelector(`#cycleCanvas .waveform-surface-row[data-signal="${CSS.escape(id)}"]`);
      if (lane) lane.style.top = `${traceTop}px`;
      row.dataset.surfaceRowTop = String(rowTop);
      row.dataset.surfaceTraceTop = String(traceTop);
      row.dataset.surfaceFootprint = String(old.footprint);
      deltas.set(id, traceTop - old.traceTop);
      rowTop += old.footprint;
    }
    const arrays = ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition'];
    for (const [id, deltaY] of deltas) {
      const entry = model.waveGeometry.signals?.[id];
      if (!entry || !deltaY) continue;
      for (const key of arrays) for (const point of entry[key] || []) {
        point.canvasY += deltaY; point.y += deltaY;
        if (point.svgRect) point.svgRect = { ...point.svgRect, top: point.svgRect.top + deltaY };
      }
      if (Number.isFinite(Number(entry.rowRectTop))) entry.rowRectTop += deltaY;
      if (id === model.document.timeline.referenceClock) for (const point of model.waveGeometry.cycleBoundary || []) {
        point.canvasY += deltaY; point.y += deltaY;
        if (point.svgRect) point.svgRect = { ...point.svgRect, top: point.svgRect.top + deltaY };
      }
    }
    model.waveGeometry.screenGeometryStale = false;
    return true;
  }

  function applyVisibilityLayout(model, signalId) {
    const rows = [...document.querySelectorAll('#cycleCanvas .wave-row')];
    const surface = document.querySelector('#cycleCanvas .waveform-render-surface');
    if (!rows.length || !surface || !model?.waveGeometry) return false;
    const entries = rows.map(row => ({
      row,
      id: row.dataset.signalId || row.dataset.signal,
      rowTop: Number(row.dataset.surfaceRowTop),
      traceTop: Number(row.dataset.surfaceTraceTop),
      footprint: Number(row.dataset.surfaceFootprint)
    }));
    if (entries.some(entry => !entry.id || !Number.isFinite(entry.rowTop) || !Number.isFinite(entry.traceTop) || !Number.isFinite(entry.footprint))) return false;
    if (!entries.some(entry => entry.id === signalId)) return false;
    let nextRowTop = Math.min(...entries.map(entry => entry.rowTop));
    const deltas = new Map();
    for (const entry of entries) {
      const traceTop = nextRowTop + (entry.traceTop - entry.rowTop);
      const lane = surface.querySelector(`:scope > .waveform-surface-row[data-signal="${CSS.escape(entry.id)}"]`);
      const hidden = entry.row.hidden || entry.row.style.display === 'none';
      if (lane) {
        lane.hidden = hidden;
        if (lane.style.top !== `${traceTop}px`) lane.style.top = `${traceTop}px`;
      }
      entry.row.dataset.surfaceRowTop = String(nextRowTop);
      entry.row.dataset.surfaceTraceTop = String(traceTop);
      deltas.set(entry.id, traceTop - entry.traceTop);
      if (!hidden) nextRowTop += entry.footprint;
    }
    const arrays = ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition'];
    for (const [id, deltaY] of deltas) {
      const geometry = model.waveGeometry.signals?.[id];
      if (!geometry || !deltaY) continue;
      for (const key of arrays) for (const point of geometry[key] || []) {
        point.canvasY += deltaY; point.y += deltaY;
        if (point.svgRect) point.svgRect = { ...point.svgRect, top: point.svgRect.top + deltaY };
      }
      if (Number.isFinite(Number(geometry.rowRectTop))) geometry.rowRectTop += deltaY;
      if (id === model.document.timeline.referenceClock) for (const point of model.waveGeometry.cycleBoundary || []) {
        point.canvasY += deltaY; point.y += deltaY;
        if (point.svgRect) point.svgRect = { ...point.svgRect, top: point.svgRect.top + deltaY };
      }
    }
    model.waveGeometry.screenGeometryStale = false;
    return true;
  }

  function signalForRow(model, row) {
    const id = row.dataset.signalId || row.dataset.signal;
    if (id) return window.TimingChartProductionController?.selectors?.getSignal?.(id) || null;
    const label = row.querySelector('.signal-label')?.textContent?.trim();
    return window.TimingChartProductionController?.selectors?.getSignal?.(label) || null;
  }

  function wavePayload(model, signal) {
    renderMetrics().wavePayloadBuilds += 1;
    const subcycleFactor = window.TimingWaveDromAdapter.subcycleFactor?.(model.document) || 1;
    const wave = window.TimingWaveDromAdapter.waveFor(signal, model.document.timeline?.cycleCount ?? model.document.cycleCount, { subcycleFactor });
    const waveJson = {
      signal: [{ name: '', wave: wave.wave, ...(wave.data ? { data: wave.data } : {}) }],
      config: { hscale: 3.7 }
    };
    if (signal.type === 'clock' && !wave.binaryClock) {
      waveJson.signal[0].period = wave.period;
      waveJson.signal[0].phase = wave.phase;
      waveJson.signal[0].polarity = signal.generator?.polarity || 'positive';
    }
    const key = JSON.stringify({ version: '3.6.2', id: signal.id, waveJson });
    return { wave, waveJson, key, subcycleFactor };
  }

  // Build a cheap semantic cache key without invoking the adapter.  The adapter
  // is only called when this key changes (signal waveform data or timeline
  // semantics changed), so presentation-only renders do not regenerate every
  // signal just to discover an SVG cache hit.
  function semanticKey(model, signal) {
    const timeline = model.document.timeline || {};
    return JSON.stringify({
      id: signal.id, type: signal.type, values: signal.values || [],
      generator: signal.generator || null, period: signal.period,
      phase: signal.phase, polarity: signal.polarity || signal.generator?.polarity,
      cycleCount: timeline.cycleCount ?? model.document.cycleCount,
      subcycleFactor: window.TimingWaveDromAdapter.subcycleFactor?.(model.document) || 1
    });
  }

  function mountSignal(model, signal, row, index, mountPrefix = prefix) {
    const lane = row?.matches?.('.wave-row') ? laneFor(signal, row) : null;
    if (lane) positionLane(row, lane);
    const host = lane?.querySelector(':scope > .trace') || row.querySelector('.trace');
    if (!host || !signal) return null;
    host.id = `${mountPrefix}${index}`;
    host.dataset.renderer = 'wavedrom';
    host.dataset.staticMock = 'removed';
    renderMetrics().waveCacheLookups += 1;
    const cached = waveCache.get(signal.id);
    const semantic = semanticKey(model, signal);
    const payload = cached?.semantic === semantic && cached.payload ? cached.payload : wavePayload(model, signal);
    let cacheHit = false;
    if (cached?.key === payload.key) {
      const current = host.querySelector('svg');
      if (!current) host.replaceChildren(cached.svg.cloneNode(true));
      cacheHit = Boolean(host.querySelector('svg'));
      if (cacheHit) renderMetrics().waveCacheHits += 1;
    }
    if (!cacheHit) {
      host.innerHTML = '';
      window.WaveDrom.RenderWaveForm(index, payload.waveJson, mountPrefix, false);
      renderMetrics().waveDromRenders += 1;
    }
    const axisMetrics = window.TimingChartProductionController?.timeAxisMetrics;
    if (axisMetrics && !cacheHit) axisMetrics.waveDromRenders += 1;
    const svg = host.querySelector('svg');
    if (!svg) throw new Error(`WaveDrom SVG was not mounted for ${signal.id}`);

    // Keep WaveDrom's generated geometry dimensions. No CSS transform or
    // post-render shape scaling is applied; hscale above controls cycle pitch.
    const width = Number(svg.getAttribute('width')) || svg.viewBox?.baseVal?.width || 0;
    const height = Number(svg.getAttribute('height')) || svg.viewBox?.baseVal?.height || 0;
    if (width) svg.style.width = `${width}px`;
    if (height) svg.style.height = `${height}px`;
    svg.dataset.renderer = 'wavedrom';
    svg.dataset.waveKey = payload.key;
    if (!cacheHit) waveCache.set(signal.id, { semantic, key: payload.key, payload, svg: svg.cloneNode(true) });
    else if (cached && cached.semantic !== semantic) waveCache.set(signal.id, { semantic, key: payload.key, payload, svg: svg.cloneNode(true) });
    return { host, svg, lane, width, height, subcycleFactor: payload.subcycleFactor || 1, key: payload.key, cacheHit };
  }

  function matrixPoint(matrix, point) {
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: transformed.x, y: transformed.y };
  }

  const sampledPathCache = new WeakMap();
  const definitionPathCache = new Map();

  function rootMatrix(svg, node) {
    const local = localTransform(svg, node);
    if (local) return local;
    const svgMatrix = svg.getCTM?.();
    const nodeMatrix = node.getCTM?.();
    if (svgMatrix && nodeMatrix) return svgMatrix.inverse().multiply(nodeMatrix);
    return svg.getScreenCTM().inverse().multiply(node.getScreenCTM());
  }

  function localTransform(svg, node) {
    if (!svg || !node) return null;
    let current = node;
    let matrix = new DOMMatrix();
    let found = false;
    while (current && current !== svg) {
      const value = current.getAttribute?.('transform');
      if (value) { matrix = parseSvgTransform(value).multiply(matrix); found = true; }
      current = current.parentElement;
    }
    return current === svg && found ? matrix : null;
  }

  function parseSvgTransform(value) {
    let matrix = new DOMMatrix();
    for (const match of String(value).matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)) {
      const name = match[1].toLowerCase();
      const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (name === 'translate') matrix = matrix.translate(values[0] || 0, values[1] || 0);
      else if (name === 'scale') matrix = matrix.scale(values[0] ?? 1, values[1] ?? values[0] ?? 1);
      else if (name === 'rotate') matrix = matrix.rotate(values[0] || 0, values[1] || 0, values[2] || 0);
      else if (name === 'matrix' && values.length >= 6) matrix = matrix.multiply(new DOMMatrix(values));
    }
    return matrix;
  }

  function hrefOf(use) {
    return use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
  }

  function sampledSegments(path, matrix) {
    // WaveDrom's transition/clock primitives are short piecewise-linear paths.
    // Keep sampling on the actual SVG path, but avoid the previous 161 path
    // queries per primitive; 5 points capture the endpoints, quarter points,
    // and midpoint used by WaveDrom's piecewise-linear primitives.
    const sampleCount = 5;
    let localSamples = sampledPathCache.get(path);
    if (!localSamples) {
      const length = path.getTotalLength();
      if (!length) return [];
      localSamples = Array.from({ length: sampleCount }, (_, index) => path.getPointAtLength(length * index / (sampleCount - 1))).map(point => ({ x: point.x, y: point.y }));
      sampledPathCache.set(path, localSamples);
    }
    const samples = localSamples.map(point => matrixPoint(matrix, point));
    const changing = [];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (Math.abs(current.y - previous.y) > 0.2) changing.push(previous, current);
    }
    if (!changing.length) return [];
    return [{ start: changing[0], end: changing.at(-1), center: changing[Math.floor(changing.length / 2)] }];
  }

  function actualBoundaries(svg) {
    const lines = [...svg.querySelectorAll('[id^="gmarks_"] line[id^="gmark_"]')];
    const markMatrix = localTransform(svg, lines[0]);
    return lines.map(line => {
      const matrix = markMatrix || rootMatrix(svg, line);
      return matrixPoint(matrix, { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) });
    }).filter((point, index, all) => index === 0 || Math.abs(point.x - all[index - 1].x) > 0.1);
  }

  function cycleForX(boundaries, x) {
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      if (x < boundaries[index + 1].x - 0.1) {
        const width = boundaries[index + 1].x - boundaries[index].x;
        return { cycle: index, phase: width ? (x - boundaries[index].x) / width : 0 };
      }
    }
    return { cycle: boundaries.length - 2, phase: 1 };
  }

  function anchor(signal, cycleInfo, point, anchorType, svg, coordinate) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const canvas = {
      x: rect.left + (point.x - viewBox.x) * rect.width / viewBox.width,
      y: rect.top + (point.y - viewBox.y) * rect.height / viewBox.height
    };
    return {
      x: coordinate === 'canvas' ? canvas.x : point.x,
      y: coordinate === 'canvas' ? canvas.y : point.y,
      localX: point.x,
      localY: point.y,
      canvasX: canvas.x,
      canvasY: canvas.y,
      source: 'wavedrom-svg', signal: signal.id, cycle: cycleInfo.cycle, phase: cycleInfo.phase, anchorType
    };
  }

  function boundaryRecord(signal, cycle, point, svg, transform) {
    const rect = transform?.rect || svg.getBoundingClientRect();
    const viewBox = transform?.viewBox || svg.viewBox.baseVal;
    const screen = transform?.matrix ? matrixPoint(transform.matrix, point) : new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM());
    const canvasX = screen.x;
    const canvasY = screen.y;
    return {
      x: canvasX,
      y: canvasY,
      localX: point.x,
      localY: point.y,
      canvasX,
      canvasY,
      source: 'wavedrom-svg',
      signal: signal.id,
      cycle,
      anchorType: 'cycle-boundary',
      traceId: svg.parentElement?.id || null,
      svgRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      viewBox: { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
    };
  }

  function buildGeometry(model, mounted) {
    const geometry = { cycleCount: model.document.timeline.cycleCount, signals: {}, cycleBoundary: [] };
    const profile = { boundaryMs: 0, symbolMs: 0, rowRectMs: 0, signalMs: 0 };
    for (const item of mounted) {
      if (!item) continue;
      const signalStarted = performance.now();
      const { signal, svg } = item;
      const screenMatrix = svg.getScreenCTM?.();
      const screenRect = svg.getBoundingClientRect?.();
      const viewBox = svg.viewBox?.baseVal;
      const transform = {
        matrix: screenMatrix,
        rect: screenRect && { left: screenRect.left, top: screenRect.top, width: screenRect.width, height: screenRect.height },
        viewBox: viewBox && { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
      };
      const boundaryStarted = performance.now();
      const rawBoundaries = actualBoundaries(svg);
      const boundaries = item.subcycleFactor > 1 ? rawBoundaries.filter((point, index) => index % item.subcycleFactor === 0 || index === rawBoundaries.length - 1) : rawBoundaries;
      if (!geometry.cycleBoundary.length) geometry.cycleBoundary = boundaries.map((point, cycle) => boundaryRecord(signal, cycle, point, svg, transform));
      const lane = svg.querySelector('[id^="wavelane_draw_"]');
      const symbols = [...(lane?.querySelectorAll(':scope > use') || [])];
      profile.boundaryMs += performance.now() - boundaryStarted;
      const rowRect = item.row?.getBoundingClientRect?.();
      const entry = { cycleBoundary: boundaries.map((point, cycle) => boundaryRecord(signal, cycle, point, svg, transform)), risingEdge: [], fallingEdge: [], transitionStart: [], transitionCenter: [], transitionEnd: [], transition: [], svgViewBox: svg.getAttribute('viewBox'), traceId: svg.parentElement?.id || null, rowRectTop: rowRect?.top ?? null };
      const symbolStarted = performance.now();
      symbols.forEach(use => {
        const href = hrefOf(use);
        let path = definitionPathCache.get(href);
        if (path === undefined) {
          const definition = document.getElementById(href.slice(1));
          path = definition?.querySelector('path') || null;
          definitionPathCache.set(href, path);
        }
        if (!path) return;
        const matrix = rootMatrix(svg, use);
        const origin = matrixPoint(matrix, { x: 0, y: 0 });
        const cycleInfo = cycleForX(boundaries, origin.x);
        const segments = sampledSegments(path, matrix);
        if (href === '#pclk' || href === '#nclk') {
          const segment = segments[0];
          if (!segment) return;
          const point = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
          const item = anchor(signal, cycleInfo, point, href === '#pclk' ? 'rising-edge' : 'falling-edge', svg);
          item.index = (href === '#pclk' ? entry.risingEdge : entry.fallingEdge).length + 1;
          (href === '#pclk' ? entry.risingEdge : entry.fallingEdge).push(item);
          return;
        }
        if (!segments.length || !/^#(?:0m1|1m0|vmv|dmv|umv|zmv)/.test(href)) return;
        const segment = segments[0];
        const start = anchor(signal, cycleInfo, segment.start, 'transition-start', svg);
        const center = anchor(signal, cycleInfo, segment.center, 'transition-center', svg);
        const end = anchor(signal, cycleInfo, segment.end, 'transition-end', svg);
        entry.transitionStart.push(start);
        entry.transitionCenter.push(center);
        entry.transitionEnd.push(end);
        entry.transition.push(center);
        if (href === '#0m1') entry.risingEdge.push({ ...center, anchorType: 'rising-transition-center' });
        if (href === '#1m0') entry.fallingEdge.push({ ...center, anchorType: 'falling-transition-center' });
      });
      profile.symbolMs += performance.now() - symbolStarted;
      geometry.signals[signal.id] = entry;
      profile.signalMs += performance.now() - signalStarted;
    }
    geometry.profile = profile;
    return geometry;
  }

  function refreshPointScreenCoordinates(item, svg, transform) {
    if (!item || !svg || !transform?.matrix || !Number.isFinite(Number(item.localX)) || !Number.isFinite(Number(item.localY))) return;
    const screen = matrixPoint(transform.matrix, { x: Number(item.localX), y: Number(item.localY) });
    renderMetrics().geometryPointsTransformed += 1;
    item.canvasX = screen.x;
    item.canvasY = screen.y;
    item.x = screen.x;
    item.y = screen.y;
    if (transform.rect && transform.viewBox) {
      item.svgRect = transform.rect;
      item.viewBox = transform.viewBox;
    }
  }

  function refreshScreenGeometry(geometry, mounted) {
    const svgBySignal = new Map(mounted.filter(Boolean).map(item => [item.signal.id, item.svg]));
    const arrays = ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition'];
    const transforms = new Map();
    const transformFor = svg => {
      if (transforms.has(svg)) return transforms.get(svg);
      const matrix = svg?.getScreenCTM?.();
      const rectValue = svg?.getBoundingClientRect?.();
      renderMetrics().screenMatrixReads += matrix ? 1 : 0;
      renderMetrics().boundingRectReads += rectValue ? 1 : 0;
      const viewBoxValue = svg?.viewBox?.baseVal;
      const transform = {
        matrix,
        rect: rectValue && { left: rectValue.left, top: rectValue.top, width: rectValue.width, height: rectValue.height },
        viewBox: viewBoxValue && { x: viewBoxValue.x, y: viewBoxValue.y, width: viewBoxValue.width, height: viewBoxValue.height }
      };
      transforms.set(svg, transform);
      return transform;
    };
    for (const [signalId, entry] of Object.entries(geometry.signals || {})) {
      const svg = svgBySignal.get(signalId);
      if (!svg) continue;
      const transform = transformFor(svg);
      for (const key of arrays) for (const item of entry[key] || []) refreshPointScreenCoordinates(item, svg, transform);
      const mountedItem = mounted.find(item => item?.signal.id === signalId);
      const rowTop = mountedItem?.row?.getBoundingClientRect?.().top;
      if (Number.isFinite(rowTop)) entry.rowRectTop = rowTop;
    }
    const reference = geometry.cycleBoundary?.[0]?.signal;
    const referenceSvg = svgBySignal.get(reference) || mounted.find(Boolean)?.svg;
    if (referenceSvg) {
      const transform = transformFor(referenceSvg);
      for (const item of geometry.cycleBoundary || []) refreshPointScreenCoordinates(item, referenceSvg, transform);
    }
  }

  function shiftScreenGeometryAfterRowReorder(geometry, mounted) {
    if (!geometry) return false;
    const arrays = ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd', 'transition'];
    const shifts = new Map();
    const parentRects = new Map();
    for (const item of mounted.filter(Boolean)) {
      const entry = geometry.signals?.[item.signal.id];
      const reference = entry?.cycleBoundary?.[0] || entry?.transition?.[0];
      const previous = reference?.svgRect;
      if (!entry || !previous) continue;
      const parent = item.row?.offsetParent || item.row?.parentElement;
      let parentRect = parentRects.get(parent);
      if (!parentRect && parent?.getBoundingClientRect) { parentRect = parent.getBoundingClientRect(); parentRects.set(parent, parentRect); }
      const rowTop = parentRect && item.row ? parentRect.top + item.row.offsetTop : undefined;
      const previousRowTop = Number(entry.rowRectTop);
      if (!Number.isFinite(rowTop) || !Number.isFinite(previousRowTop)) continue;
      const deltaY = rowTop - previousRowTop;
      shifts.set(item.signal.id, { x: 0, y: deltaY, rowTop, rect: { ...previous, top: previous.top + deltaY } });
    }
    for (const [signalId, entry] of Object.entries(geometry.signals || {})) {
      const shift = shifts.get(signalId);
      if (!shift) continue;
      for (const key of arrays) for (const point of entry[key] || []) {
        point.canvasX += shift.x; point.x += shift.x;
        point.canvasY += shift.y; point.y += shift.y;
        point.svgRect = shift.rect;
      }
      entry.rowRectTop = shift.rowTop;
    }
    const reference = geometry.cycleBoundary?.[0]?.signal;
    const shift = shifts.get(reference);
    if (shift) for (const point of geometry.cycleBoundary || []) {
      point.canvasX += shift.x; point.x += shift.x;
      point.canvasY += shift.y; point.y += shift.y;
      point.svgRect = shift.rect;
    }
    return true;
  }

  function renderSignal(model, signalId) {
    const row = document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(signalId)}"]`);
    const signal = signalForRow(model, row);
    if (!row || !signal || signal.type === 'commentRow') return false;
    const localPrefix = `${prefix}local_${String(signal.id).replace(/[^A-Za-z0-9_-]/g, '_')}_`;
    let mounted;
    try { mounted = mountSignal(model, signal, row, 0, localPrefix); } catch { return false; }
    if (!mounted) return false;
    const partial = buildGeometry(model, [{ ...mounted, signal, row }]);
    const renderedId = signal.id;
    const renderedGeometry = partial.signals[renderedId];
    if (!renderedGeometry) { renderMetrics().renderSignalGeometryMisses = (renderMetrics().renderSignalGeometryMisses || 0) + 1; return false; }
    model.waveGeometry ||= { cycleCount: model.document.timeline.cycleCount, signals: {}, cycleBoundary: [] };
    model.waveGeometry.signals[renderedId] = renderedGeometry;
    if (signal.id === model.document.timeline.referenceClock) model.waveGeometry.cycleBoundary = partial.cycleBoundary;
    model.waveGeometry.cycleCount = model.document.timeline.cycleCount;
    renderMetrics().geometryBuilds += 1;
    renderMetrics().renderSignalGeometryUpdates = (renderMetrics().renderSignalGeometryUpdates || 0) + 1;
    window.TimingChartProductionController.waveGeometry = model.waveGeometry;
    return true;
  }

  let timelineRenderGeneration = 0;
  function renderTimeline(model, { batchSize = 10 } = {}) {
    if (!window.WaveDrom?.RenderWaveForm || !window.TimingWaveDromAdapter) return Promise.resolve(false);
    const generation = ++timelineRenderGeneration;
    const controller = window.TimingChartProductionController;
    controller.timelineRenderActive = true;
    const rows = traceRows();
    syncSurface(model, rows);
    const mounted = [];
    const started = performance.now();
    let mountMs = 0;
    return new Promise(resolve => {
      let index = 0;
      const step = () => {
        if (generation !== timelineRenderGeneration) { resolve(false); return; }
        const end = Math.min(rows.length, index + Math.max(1, batchSize));
        const mountStarted = performance.now();
        for (; index < end; index += 1) {
          const row = rows[index];
          const signal = signalForRow(model, row);
          const result = mountSignal(model, signal, row, index);
          if (result && signal) mounted.push({ ...result, signal, row });
        }
        mountMs += performance.now() - mountStarted;
        if (index < rows.length) { requestAnimationFrame(step); return; }
        const geometryStarted = performance.now();
        model.waveGeometry = buildGeometry(model, mounted);
        const geometryMs = performance.now() - geometryStarted;
        bridge.waveSignature = JSON.stringify({
          cycleCount: model.document.timeline?.cycleCount ?? model.document.cycleCount,
          rows: mounted.map(item => [item.signal.id, item.key]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        });
        bridge.screenSignature = null;
        renderMetrics().geometryBuilds += 1;
        controller.waveGeometry = model.waveGeometry;
        controller.timelineRenderActive = false;
        controller.applyTimingOnlyZoom?.();
        controller.lastWaveformTimelineProfile = { mountMs, geometryMs, totalMs: performance.now() - started, rows: mounted.length, geometry: model.waveGeometry.profile || null };
        resolve({ durationMs: performance.now() - started, rows: mounted.length });
      };
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(step, 0)));
    });
  }

  const bridge = {
    refreshScreenGeometry(model) {
      if (!model?.waveGeometry) return false;
      const mounted = syncSurface(model).filter(item => item.svg);
      refreshScreenGeometry(model.waveGeometry, mounted);
      renderMetrics().geometryScreenRefreshes += 1;
      window.TimingChartProductionController.waveGeometry = model.waveGeometry;
      return true;
    },
    shiftScreenGeometryAfterRowReorder(model, signalIds = []) {
      if (!model?.waveGeometry) return false;
      const ids = new Set(signalIds || []);
      const rows = ids.size ? traceRows().filter(row => ids.has(row.dataset.signalId || row.dataset.signal)) : traceRows();
      const mounted = syncSurface(model, rows, { removeStale: false }).filter(item => item.svg);
      shiftScreenGeometryAfterRowReorder(model.waveGeometry, mounted);
      model.waveGeometry.screenGeometryStale = false;
      window.TimingChartProductionController.waveGeometry = model.waveGeometry;
      return true;
    },
    syncSurface(model, signalIds = []) {
      const ids = new Set(signalIds || []);
      const rows = ids.size ? traceRows().filter(row => ids.has(row.dataset.signalId || row.dataset.signal)) : traceRows();
      return syncSurface(model, rows, { removeStale: !ids.size });
    },
    captureRowReorder,
    applyCapturedRowReorder,
    applyVisibilityLayout,
    renderSignal,
    renderTimeline,
    render(model) {
      if (!window.WaveDrom?.RenderWaveForm || !window.TimingWaveDromAdapter) return;
      const rows = traceRows();
      syncSurface(model, rows);
      const mounted = rows.map((row, index) => {
        const signal = signalForRow(model, row);
        const result = mountSignal(model, signal, row, index);
        return result && { ...result, signal, row };
      });
      const canvas = document.querySelector('#cycleCanvas');
      const waveSignature = JSON.stringify({
        cycleCount: model.document.timeline?.cycleCount ?? model.document.cycleCount,
        rows: mounted.filter(Boolean).map(item => [item.signal.id, item.key]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      });
      const screenSignature = JSON.stringify({
        layout: {
          signalNameWidth: model.document.layout?.signalNameWidth,
          rowHeight: model.document.layout?.rowHeight,
          signalSpacing: model.document.layout?.signalSpacing,
          hiddenSignals: model.view?.hiddenSignals || [],
          groups: (model.document.signalGroups || []).map(group => [group.id, group.collapsed, group.rows || []])
        },
        scroll: [canvas?.scrollLeft || 0, canvas?.scrollTop || 0],
        rows: mounted.filter(Boolean).map(item => [item.signal.id, item.key])
      });
      if (model.waveGeometry && bridge.waveSignature === waveSignature) {
        if (bridge.screenSignature !== screenSignature) {
          refreshScreenGeometry(model.waveGeometry, mounted);
          renderMetrics().geometryScreenRefreshes += 1;
          bridge.screenSignature = screenSignature;
        }
        renderMetrics().geometryCacheHits += 1;
        window.TimingChartProductionController.waveGeometry = model.waveGeometry;
        return;
      }
      model.waveGeometry = buildGeometry(model, mounted);
      bridge.waveSignature = waveSignature;
      bridge.screenSignature = screenSignature;
      renderMetrics().geometryBuilds += 1;
      window.TimingChartProductionController.waveGeometry = model.waveGeometry;
    },
    renderTestDocument(testDocument) {
      const stage = document.createElement('div');
      stage.style.cssText = 'position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:visible;';
      document.body.appendChild(stage);
      const mountPrefix = `${prefix}test_${Date.now()}_`;
      const mounted = testDocument.signals.map((signal, index) => {
        const host = document.createElement('span');
        host.className = 'trace';
        stage.appendChild(host);
        const subcycleFactor = window.TimingWaveDromAdapter.subcycleFactor?.(testDocument) || 1;
        return { ...mountSignal({ document: testDocument }, signal, { querySelector: () => host }, index, mountPrefix), signal, subcycleFactor };
      });
      const geometry = buildGeometry({ document: { timeline: { cycleCount: testDocument.timeline?.cycleCount ?? testDocument.cycleCount } } }, mounted);
      stage.remove();
      return { geometry, waveJson: testDocument.signals.map(signal => {
        const subcycleFactor = window.TimingWaveDromAdapter.subcycleFactor?.(testDocument) || 1;
        const wave = window.TimingWaveDromAdapter.waveFor(signal, testDocument.timeline?.cycleCount ?? testDocument.cycleCount, { subcycleFactor });
        return { id: signal.id, wave: wave.wave, period: wave.period, phase: wave.phase, polarity: signal.generator?.polarity || signal.polarity };
      }) };
    },
    getAnchor({ signal, cycle, edge, coordinateSpace = 'local' }) {
      const geometry = window.TimingChartProductionController?.model?.waveGeometry?.signals?.[signal];
      const list = edge === 'rising' ? geometry?.risingEdge : edge === 'falling' ? geometry?.fallingEdge : edge === 'transition-start' ? geometry?.transitionStart : edge === 'transition-end' ? geometry?.transitionEnd : edge === 'transition-center' ? geometry?.transitionCenter : undefined;
      const match = list?.find(item => item.cycle === cycle);
      if (!match) return undefined;
      const svg = match.traceId ? document.getElementById(match.traceId)?.querySelector('svg') : null;
      const screen = svg?.getScreenCTM ? new DOMPoint(match.localX, match.localY).matrixTransform(svg.getScreenCTM()) : null;
      const canvasX = screen?.x ?? match.canvasX;
      const canvasY = screen?.y ?? match.canvasY;
      return { ...match, canvasX, canvasY, x: coordinateSpace === 'canvas' ? canvasX : match.localX, y: coordinateSpace === 'canvas' ? canvasY : match.localY };
    },
    getCycleBoundary({ signal, cycle, coordinateSpace = 'canvas' }) {
      const item = window.TimingChartProductionController?.model?.waveGeometry?.signals?.[signal]?.cycleBoundary?.[cycle];
      if (!item) return undefined;
      const svg = item.traceId ? document.getElementById(item.traceId)?.querySelector('svg') : null;
      const screen = svg?.getScreenCTM ? new DOMPoint(item.localX, item.localY).matrixTransform(svg.getScreenCTM()) : { x: item.canvasX, y: item.canvasY };
      const canvasX = screen.x; const canvasY = screen.y;
      return { ...item, canvasX, canvasY, x: coordinateSpace === 'canvas' ? canvasX : item.localX, y: coordinateSpace === 'canvas' ? canvasY : item.localY };
    }
  };
  window.TimingChartProductionWaveform = bridge;
  if (window.TimingChartProductionController) { window.TimingChartProductionController.getAnchor = bridge.getAnchor; window.TimingChartProductionController.getCycleBoundary = bridge.getCycleBoundary; }
  window.TimingChartProductionController?.model && bridge.render(window.TimingChartProductionController.model);
})();
