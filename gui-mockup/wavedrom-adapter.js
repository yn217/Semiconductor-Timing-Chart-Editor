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
    if (signal.type === 'clock') return { wave: `${signal.polarity === 'negative' ? 'n' : 'p'}${'.'.repeat(Math.max(0, cycleCount - 1))}`, period: signal.period, phase: signal.phase };
    const changes = [...(signal.values ?? [])].sort((a, b) => a.start - b.start);
    let out = '', data = [];
    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      const change = changes.findLast?.(item => item.start <= cycle) ?? changes.filter(item => item.start <= cycle).at(-1);
      const value = change?.value ?? 0;
      if (signal.type === 'bus' || signal.type === 'state') { out += scalar(value); data.push(String(value)); }
      else out += scalar(value);
    }
    return { wave: out, data: signal.type === 'bus' || signal.type === 'state' ? data : undefined };
  }
  function toWaveJson(document) {
    const cycleCount = Number(document.document?.cycleCount ?? document.document?.timebase?.cycleCount ?? 0);
    const signals = document.signals ?? document.cycleView?.signals ?? [];
    return { signal: signals.map(signal => { const result = waveFor(signal, cycleCount); return { name: signal.name, wave: result.wave, ...(result.data ? { data: result.data } : {}), ...(signal.type === 'clock' ? { ...(result.period ? { period: result.period } : {}), ...(result.phase !== undefined ? { phase: result.phase } : {}) } : {}) }; }) };
  }
  global.TimingWaveDromAdapter = { toWaveJson, waveFor };
})(window);
