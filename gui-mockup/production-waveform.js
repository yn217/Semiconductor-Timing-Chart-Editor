(() => {
  'use strict';

  const prefix = 'waveDromTrace_';
  const traceRows = () => [...document.querySelectorAll('#cycleCanvas .wave-row')]
    .filter(row => row.querySelector('.trace'));

  function signalForRow(model, row) {
    const label = row.querySelector('.signal-label')?.textContent?.trim();
    return window.TimingChartProductionController?.selectors?.getSignal?.(label) || null;
  }

  function mountSignal(model, signal, row, index, mountPrefix = prefix) {
    const host = row.querySelector('.trace');
    if (!host || !signal) return null;
    host.id = `${mountPrefix}${index}`;
    host.dataset.renderer = 'wavedrom';
    host.dataset.staticMock = 'removed';
    host.innerHTML = '';

    const wave = window.TimingWaveDromAdapter.waveFor(signal, model.document.timeline?.cycleCount ?? model.document.cycleCount);
    const waveJson = {
      signal: [{ name: '', wave: wave.wave, ...(wave.data ? { data: wave.data } : {}) }],
      config: { hscale: 3.7 }
    };
    if (signal.type === 'clock') {
      waveJson.signal[0].period = wave.period;
      waveJson.signal[0].phase = wave.phase;
      waveJson.signal[0].polarity = signal.generator?.polarity || 'positive';
    }
    window.WaveDrom.RenderWaveForm(index, waveJson, mountPrefix, false);
    const svg = host.querySelector('svg');
    if (!svg) throw new Error(`WaveDrom SVG was not mounted for ${signal.id}`);

    // Keep WaveDrom's generated geometry dimensions. No CSS transform or
    // post-render shape scaling is applied; hscale above controls cycle pitch.
    const width = Number(svg.getAttribute('width')) || svg.viewBox?.baseVal?.width || 0;
    const height = Number(svg.getAttribute('height')) || svg.viewBox?.baseVal?.height || 0;
    if (width) svg.style.width = `${width}px`;
    if (height) svg.style.height = `${height}px`;
    svg.dataset.renderer = 'wavedrom';
    return { host, svg, width, height };
  }

  function matrixPoint(matrix, point) {
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: transformed.x, y: transformed.y };
  }

  function rootMatrix(svg, node) {
    return svg.getScreenCTM().inverse().multiply(node.getScreenCTM());
  }

  function hrefOf(use) {
    return use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
  }

  function sampledSegments(path, matrix) {
    const length = path.getTotalLength();
    if (!length) return [];
    const samples = Array.from({ length: 161 }, (_, index) => matrixPoint(matrix, path.getPointAtLength(length * index / 160)));
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
    return lines.slice(0, 100).map(line => {
      const matrix = rootMatrix(svg, line);
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

  function boundaryRecord(signal, cycle, point, svg) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM());
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
    for (const item of mounted) {
      if (!item) continue;
      const { signal, svg } = item;
      const boundaries = actualBoundaries(svg);
      if (!geometry.cycleBoundary.length) geometry.cycleBoundary = boundaries.map((point, cycle) => boundaryRecord(signal, cycle, point, svg));
      const lane = svg.querySelector('[id^="wavelane_draw_"]');
      const symbols = [...(lane?.querySelectorAll(':scope > use') || [])];
      const entry = { cycleBoundary: boundaries.map((point, cycle) => boundaryRecord(signal, cycle, point, svg)), risingEdge: [], fallingEdge: [], transitionStart: [], transitionCenter: [], transitionEnd: [], transition: [], svgViewBox: svg.getAttribute('viewBox'), traceId: svg.parentElement?.id || null };
      symbols.forEach(use => {
        const href = hrefOf(use);
        const definition = document.getElementById(href.slice(1));
        const path = definition?.querySelector('path');
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
      geometry.signals[signal.id] = entry;
    }
    return geometry;
  }

  const bridge = {
    render(model) {
      if (!window.WaveDrom?.RenderWaveForm || !window.TimingWaveDromAdapter) return;
      const mounted = traceRows().map((row, index) => {
        const signal = signalForRow(model, row);
        const result = mountSignal(model, signal, row, index);
        return result && { ...result, signal };
      });
      model.waveGeometry = buildGeometry(model, mounted);
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
        return { ...mountSignal({ document: testDocument }, signal, { querySelector: () => host }, index, mountPrefix), signal };
      });
      const geometry = buildGeometry({ document: { timeline: { cycleCount: testDocument.timeline?.cycleCount ?? testDocument.cycleCount } } }, mounted);
      stage.remove();
      return { geometry, waveJson: testDocument.signals.map(signal => {
        const wave = window.TimingWaveDromAdapter.waveFor(signal, testDocument.timeline?.cycleCount ?? testDocument.cycleCount);
        return { id: signal.id, wave: wave.wave, period: wave.period, phase: wave.phase, polarity: signal.generator?.polarity || signal.polarity };
      }) };
    },
    getAnchor({ signal, cycle, edge, coordinateSpace = 'local' }) {
      const geometry = window.TimingChartProductionController?.model?.waveGeometry?.signals?.[signal];
      const list = edge === 'rising' ? geometry?.risingEdge : edge === 'falling' ? geometry?.fallingEdge : edge === 'transition-start' ? geometry?.transitionStart : edge === 'transition-end' ? geometry?.transitionEnd : edge === 'transition-center' ? geometry?.transitionCenter : undefined;
      const match = list?.find(item => item.cycle === cycle);
      if (!match) return undefined;
      return { ...match, x: coordinateSpace === 'canvas' ? match.canvasX : match.localX, y: coordinateSpace === 'canvas' ? match.canvasY : match.localY };
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
