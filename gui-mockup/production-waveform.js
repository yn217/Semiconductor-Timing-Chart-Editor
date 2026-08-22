(() => {
  'use strict';

  const prefix = 'waveDromTrace_';
  const traceRows = () => [...document.querySelectorAll('#cycleCanvas .wave-row')]
    .filter(row => row.querySelector('.trace'));

  function signalForRow(model, row) {
    const label = row.querySelector('.signal-label')?.textContent?.trim();
    return model.document.signals.find(signal => signal.id === label || signal.name === label);
  }

  function mountSignal(model, signal, row, index) {
    const host = row.querySelector('.trace');
    if (!host || !signal) return null;
    host.id = `${prefix}${index}`;
    host.dataset.renderer = 'wavedrom';
    host.dataset.staticMock = 'removed';
    host.innerHTML = '';

    const wave = window.TimingWaveDromAdapter.waveFor(signal, model.document.cycleCount);
    const waveJson = {
      signal: [{ name: '', wave: wave.wave, ...(wave.data ? { data: wave.data } : {}) }],
      config: { hscale: 3.7 }
    };
    window.WaveDrom.RenderWaveForm(index, waveJson, prefix, false);
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

  function buildGeometry(model, mounted) {
    const geometry = { cycleCount: model.document.cycleCount, signals: {}, cycleBoundary: [] };
    const first = mounted.find(item => item);
    const width = first?.width || 0;
    const pitch = width / model.document.cycleCount;
    geometry.cycleBoundary = Array.from({ length: model.document.cycleCount + 1 }, (_, cycle) => cycle * pitch);
    for (const item of mounted) {
      if (!item) continue;
      const { signal, svg, width: svgWidth } = item;
      const boundaries = Array.from({ length: model.document.cycleCount + 1 }, (_, cycle) => cycle * (svgWidth / model.document.cycleCount));
      const transitions = [...signal.values ?? []].filter(value => Number(value.start) > 0).map(value => ({
        cycle: Number(value.start), x: boundaries[Number(value.start)] ?? 0,
        edge: value.value === 1 ? 'rising' : value.value === 0 ? 'falling' : 'transition'
      }));
      geometry.signals[signal.id] = {
        cycleBoundary: boundaries,
        risingEdge: transitions.filter(edge => edge.edge === 'rising'),
        fallingEdge: transitions.filter(edge => edge.edge === 'falling'),
        transition: transitions,
        svgViewBox: svg.getAttribute('viewBox')
      };
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
    getAnchor({ signal, cycle, edge }) {
      const geometry = window.TimingChartProductionController?.model?.waveGeometry?.signals?.[signal];
      const list = edge === 'rising' ? geometry?.risingEdge : edge === 'falling' ? geometry?.fallingEdge : geometry?.transition;
      const match = list?.find(item => item.cycle === cycle);
      return match ? { x: match.x, y: 0 } : undefined;
    }
  };
  window.TimingChartProductionWaveform = bridge;
  if (window.TimingChartProductionController) window.TimingChartProductionController.getAnchor = bridge.getAnchor;
  window.TimingChartProductionController?.model && bridge.render(window.TimingChartProductionController.model);
})();
