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
  function denominator(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    for (let candidate = 1; candidate <= 64; candidate += 1) if (Math.abs(number * candidate - Math.round(number * candidate)) < 1e-8) return candidate;
    return 64;
  }
  function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a || 1; }
  function lcm(a, b) { return Math.min(64, Math.abs(a * b) / gcd(a, b)); }
  function clockNeedsSubdivision(signal) {
    if (signal?.type !== 'clock') return false;
    const generator = signal.generator || signal;
    const start = Number(generator.start ?? 0);
    return (Number.isFinite(start) && Math.abs(start) > 1e-8)
      || Math.abs(Number(generator.duty ?? 0.5) - 0.5) > 1e-8
      || (Array.isArray(generator.suppressedPeriods) && generator.suppressedPeriods.length > 0);
  }
  function subcycleFactor(document) {
    const clocks = (document?.signals || []).filter(clockNeedsSubdivision);
    if (!clocks.length) return 1;
    return clocks.reduce((factor, signal) => {
      const generator = signal.generator || signal;
      let next = lcm(factor, denominator(generator.duty ?? 0.5));
      next = lcm(next, denominator(generator.period ?? 1));
      next = lcm(next, denominator(generator.phase ?? 0));
      return Math.max(2, next);
    }, 1);
  }
  function clockLevelAt(generator, time, suppressed) {
    const initial = Number(generator.initial) === 1 ? 1 : 0;
    const start = Number.isFinite(Number(generator.start)) ? Number(generator.start) : 0;
    const period = Number(generator.period);
    const phase = Number.isFinite(Number(generator.phase)) ? Number(generator.phase) : 0;
    const duty = Number(generator.duty);
    const positive = (generator.polarity || 'positive') !== 'negative';
    const inactive = positive ? 0 : 1;
    if (!Number.isFinite(period) || period <= 0 || !Number.isFinite(duty) || duty <= 0 || duty >= 1 || time < start) return initial;
    const relative = time - start - phase;
    if (relative < 0) return initial;
    const periodIndex = Math.floor(relative / period + 1e-9);
    if (suppressed.has(periodIndex)) return inactive;
    const local = relative - periodIndex * period;
    const active = local < period * duty - 1e-9;
    return positive ? (active ? 1 : 0) : (active ? 0 : 1);
  }
  function subdividedClockWave(signal, cycleCount, factor) {
    const generator = signal.generator || signal;
    const suppressed = new Set((Array.isArray(generator.suppressedPeriods) ? generator.suppressedPeriods : []).map(Number));
    const total = Math.max(0, Math.ceil(Number(cycleCount) * factor));
    let wave = '';
    let previous;
    for (let index = 0; index < total; index += 1) {
      const level = clockLevelAt(generator, index / factor, suppressed);
      wave += index === 0 || level !== previous ? String(level) : '.';
      previous = level;
    }
    return { wave, subcycleFactor: factor, binaryClock: true, duty: generator.duty, suppressedPeriods: [...suppressed].sort((a, b) => a - b) };
  }
  function waveFor(signal, cycleCount, options = {}) {
    const factor = Number(options.subcycleFactor) > 0 ? Number(options.subcycleFactor) : (clockNeedsSubdivision(signal) ? Math.max(2, denominator((signal.generator || signal).duty ?? 0.5)) : 1);
    if (signal.type === 'clock') {
      const generator = signal.generator || signal;
      if (clockNeedsSubdivision(signal)) return subdividedClockWave(signal, cycleCount, factor);
      const polarity = (generator.polarity || signal.polarity) === 'negative' ? 'n' : 'p';
      return { wave: `${polarity}${'.'.repeat(Math.max(0, cycleCount - 1))}`, period: generator.period, phase: generator.phase, duty: generator.duty, suppressedPeriods: [] };
    }
    const changes = [...(signal.values ?? [])].sort((a, b) => a.start - b.start);
    const byStart = new Map(changes.map(change => [Number(change.start), change]));
    const isBus = signal.type === 'bus' || signal.type === 'state';
    let out = '', data = [];
    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      const change = byStart.get(cycle);
      if (!change) { out += '.'.repeat(factor); continue; }
      const token = scalar(change.value);
      out += (isBus && !['X', 'Z', 'u', 'd'].includes(token) ? '=' : token) + '.'.repeat(Math.max(0, factor - 1));
      if (isBus && token === '=') data.push(String(change.value));
    }
    return { wave: out, data: isBus ? data : undefined, subcycleFactor: factor };
  }
  function toWaveJson(document) {
    const cycleCount = Number(document.timeline?.cycleCount ?? document.document?.cycleCount ?? document.document?.timebase?.cycleCount ?? 0);
    const factor = subcycleFactor(document);
    const signals = (document.signals ?? document.cycleView?.signals ?? []).filter(signal => signal.type !== 'commentRow');
    return { signal: signals.map(signal => { const result = waveFor(signal, cycleCount, { subcycleFactor: factor }); return { name: signal.name, wave: result.wave, ...(result.data ? { data: result.data } : {}), ...(signal.type === 'clock' && !result.binaryClock ? { ...(result.period ? { period: result.period } : {}), ...(result.phase !== undefined ? { phase: result.phase } : {}) } : {}) }; }) };
  }
  global.TimingWaveDromAdapter = { toWaveJson, waveFor, subcycleFactor };
})(window);
