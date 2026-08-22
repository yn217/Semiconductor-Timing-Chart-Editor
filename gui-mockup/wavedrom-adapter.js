(function (global) {
  'use strict';
  function scalar(value) {
    if (value === 0 || value === 1) return String(value);
    if (value === 'X' || value === 'x') return 'X';
    if (value === 'Z' || value === 'z') return 'Z';
    if (value === 'u' || value === 'U') return 'u';
    if (value === 'd' || value === 'D') return 'd';
    return '=';
  }
  function waveFor(signal, cycleCount) {
    if (signal.type === 'clock') { const generator = signal.generator || signal; return { wave: `${(generator.polarity || signal.polarity) === 'negative' ? 'n' : 'p'}${'.'.repeat(Math.max(0, cycleCount - 1))}`, period: generator.period, phase: generator.phase }; }
    const changes = [...(signal.values ?? [])].sort((a, b) => a.start - b.start);
    const byStart = new Map(changes.map(change => [Number(change.start), change]));
    const isBus = signal.type === 'bus' || signal.type === 'state';
    let out = '', data = [];
    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      const change = byStart.get(cycle);
      if (!change) { out += '.'; continue; }
      const token = scalar(change.value);
      out += isBus && !['X', 'Z', 'u', 'd'].includes(token) ? '=' : token;
      if (isBus && token === '=') data.push(String(change.value));
    }
    return { wave: out, data: isBus ? data : undefined };
  }
  function toWaveJson(document) {
    const cycleCount = Number(document.timeline?.cycleCount ?? document.document?.cycleCount ?? document.document?.timebase?.cycleCount ?? 0);
    const signals = (document.signals ?? document.cycleView?.signals ?? []).filter(signal => signal.type !== 'commentRow');
    return { signal: signals.map(signal => { const result = waveFor(signal, cycleCount); return { name: signal.name, wave: result.wave, ...(result.data ? { data: result.data } : {}), ...(signal.type === 'clock' ? { ...(result.period ? { period: result.period } : {}), ...(result.phase !== undefined ? { phase: result.phase } : {}) } : {}) }; }) };
  }
  global.TimingWaveDromAdapter = { toWaveJson, waveFor };
})(window);
