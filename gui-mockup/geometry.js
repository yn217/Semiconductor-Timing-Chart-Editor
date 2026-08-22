/* Deterministic semantic-to-SVG geometry adapter.
 * The editor stores semantic anchors; this module is the only place that
 * converts them to pixels. It is deliberately independent of the UI so the
 * same rules can be used by renderers and acceptance tests.
 */
(function (global) {
  'use strict';
  function nearest(values, target) {
    return values.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, values[0] ?? target);
  }
  function transitions(signal) { return (signal?.values ?? []).map(v => Number(v.start)).filter(Number.isFinite); }
  function resolveAnchor(anchor, signals, cycleCount) {
    const signal = signals.find(s => s.id === anchor?.signal);
    const requested = Math.max(0, Math.min(Number(anchor?.cycle ?? 0), cycleCount));
    if (!signal) return { signal: anchor?.signal ?? null, cycle: requested, snap: 'unresolved' };
    const kind = String(anchor.anchor ?? 'cycle-start');
    const points = transitions(signal);
    let cycle = requested;
    if (kind.includes('transition') || kind === 'value-start' || kind === 'rising-edge' || kind === 'falling-edge') {
      const candidates = points.filter(point => point >= requested);
      cycle = candidates.length ? candidates[0] : nearest(points, requested);
    }
    return { signal: signal.id, cycle, snap: kind, source: 'semantic-transition-geometry' };
  }
  function toPixel(anchor, signals, cycleCount, xAt, yAt, rows) {
    const resolved = resolveAnchor(anchor, signals, cycleCount);
    const row = rows.find(item => item.s.id === resolved.signal);
    return { ...resolved, x: xAt(resolved.cycle), y: row ? yAt(row) : 0 };
  }
  global.TimingGeometry = { resolveAnchor, toPixel };
})(window);
