import { describe, expect, it } from "vitest";
import WaveDrom from "wavedrom";
import {
  ProductionWaveDromAdapter,
  WAVEDROM_STATE_TOKENS,
  WAVEDROM_UNSUPPORTED_CAPABILITIES,
  WAVEDROM_VERSION,
  assertSafeWaveDromMarkup,
  renderWaveJsonMarkup,
  toWaveJson,
  toWaveJsonWindow,
  VALUE_LABEL_LAYOUT_POLICY,
  type WaveJsonSignal,
} from "@timing-chart-v2/wavedrom-adapter";
import type { ClockSignal, SignalId, ValueSignal } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const signalId = (value: string) => value as SignalId;

function logicSignal(values: ValueSignal["values"], id = "sig_logic"): ValueSignal {
  return {
    id: signalId(id), name: "LOGIC", type: "logic", role: "internal",
    source: { instancePath: [], signalName: "LOGIC" }, display: { name: "LOGIC" }, values,
  };
}

function referenceMarkup(waveJson: WaveJsonSignal): string {
  return WaveDrom.onml.stringify(WaveDrom.renderAny(0, { signal: [waveJson] }, WaveDrom.waveSkin));
}

describe(`WaveDrom adapter ${WAVEDROM_VERSION} conversion`, () => {
  it("materializes mandatory binary and bus continuation", () => {
    const binary = logicSignal([{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]);
    expect(toWaveJson({ signal: binary, cycleCount: 10 })).toEqual({ wave: "0..1...0.." });
    const bus = { ...canonicalFixture().signals[1]!, values: [{ start: 0, value: "IDLE" }, { start: 3, value: "0x1000" }, { start: 7, value: "IDLE" }] } as ValueSignal;
    expect(toWaveJson({ signal: bus, cycleCount: 10 })).toEqual({ wave: "=..=...=..", data: ["IDLE", "0x1000", "IDLE"] });
  });

  it("covers every ordered transition in the supported non-clock token manifest", () => {
    let covered = 0;
    for (const from of WAVEDROM_STATE_TOKENS) {
      for (const to of WAVEDROM_STATE_TOKENS) {
        const waveJson = toWaveJson({ signal: logicSignal([{ start: 0, value: from }, { start: 2, value: to }], `sig_${from}_${to}`), cycleCount: 6 });
        expect(waveJson).toEqual({ wave: `${from}.${to}...` });
        expect(renderWaveJsonMarkup(waveJson)).toBe(referenceMarkup({ wave: `${from}.${to}...` }));
        covered += 1;
      }
    }
    expect(covered).toBe(WAVEDROM_STATE_TOKENS.length ** 2);
  });

  it("covers the persistence matrix for every supported non-clock token", () => {
    for (const token of WAVEDROM_STATE_TOKENS) {
      for (const hold of [1, 2, 4, 8]) {
        const next = token === "0" ? "1" : "0";
        const waveJson = toWaveJson({ signal: logicSignal([{ start: 0, value: token }, { start: hold, value: next }]), cycleCount: hold + 4 });
        const expected = `${token}${".".repeat(hold - 1)}${next}...`;
        expect(waveJson).toEqual({ wave: expected });
        expect(renderWaveJsonMarkup(waveJson)).toBe(referenceMarkup({ wave: expected }));
      }
    }
  });

  it.each([1, 2, 3, 4])("preserves clock period %i and phase transforms", (period) => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock: ClockSignal = { ...base, generator: { ...base.generator, period, phase: 0.5 } };
    const waveJson = toWaveJson({ signal: clock, cycleCount: period * 4 });
    expect(waveJson).toEqual({ wave: "p...", ...(period === 1 ? {} : { period }), phase: 0.5 });
    expect(renderWaveJsonMarkup(waveJson)).toBe(referenceMarkup(waveJson));
  });

  it("maps negative clocks, aligned gating, suppression, and gaps without inventing geometry", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock: ClockSignal = {
      ...base,
      generator: { ...base.generator, initial: 1, polarity: "negative", suppressedPeriods: [3, 5] },
      enable: [{ start: 0, value: 1 }, { start: 2, value: 0 }, { start: 4, value: 1 }],
    };
    expect(toWaveJson({ signal: clock, cycleCount: 8 })).toEqual({ wave: "n.1.n1n." });
    expect(toWaveJson({ signal: logicSignal([{ start: 0, value: 0 }, { start: 4, value: 1 }]), cycleCount: 7, gapCycles: [2] })).toEqual({ wave: "0.|.1.." });
  });

  it("expands exact half-cycle duty through standard WaveDrom clock/value tokens", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const duty25 = { ...base, generator: { ...base.generator, period: 2, duty: 0.25 } } as ClockSignal;
    const duty75 = { ...base, generator: { ...base.generator, period: 2, duty: 0.75 } } as ClockSignal;
    const negative = { ...base, generator: { ...base.generator, period: 2, duty: 0.25, initial: 1 as const, polarity: "negative" as const } } as ClockSignal;
    expect(toWaveJson({ signal: duty25, cycleCount: 8 })).toEqual({ wave: "p0p0p0p0", clock: { expanded: true, polarity: "positive", initial: 0 } });
    expect(toWaveJson({ signal: duty75, cycleCount: 8 })).toEqual({ wave: "1p1p1p1p", clock: { expanded: true, polarity: "positive", initial: 0 } });
    expect(toWaveJson({ signal: negative, cycleCount: 8 })).toEqual({ wave: "n1n1n1n1", clock: { expanded: true, polarity: "negative", initial: 1 } });
    const unsupported = { ...base, generator: { ...base.generator, duty: 0.25 } } as ClockSignal;
    expect(() => toWaveJson({ signal: unsupported, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_DUTY" }));
    const fractional = logicSignal([{ start: 0, value: 0 }, { start: 1.5, value: 1 }]);
    expect(() => toWaveJson({ signal: fractional, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CHANGE_POINT" }));
    expect(() => toWaveJson({ signal: logicSignal([{ start: 0, value: "maybe" }]), cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_LOGIC_VALUE" }));
    const badPeriod = { ...base, generator: { ...base.generator, period: 0 } } as ClockSignal;
    expect(() => toWaveJson({ signal: badPeriod, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_PERIOD" }));
    const badPhase = { ...base, generator: { ...base.generator, phase: 0.25 } } as ClockSignal;
    expect(() => toWaveJson({ signal: badPhase, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_PHASE" }));
    const badStart = { ...base, generator: { ...base.generator, period: 2, start: 1 } } as ClockSignal;
    expect(() => toWaveJson({ signal: badStart, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNALIGNED_CLOCK_START" }));
    const badEnableValue = { ...base, enable: [{ start: 0, value: "maybe" }] } as ClockSignal;
    expect(() => toWaveJson({ signal: badEnableValue, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_ENABLE" }));
    const sparseEnable = { ...base, generator: { ...base.generator, period: 2, phase: 0, duty: 0.5 }, enable: [{ start: 0, value: 1 }, { start: 4, value: 0 }, { start: 8, value: 1 }] } as ClockSignal;
    expect(toWaveJson({ signal: sparseEnable, cycleCount: 12 })).toEqual({ wave: "p.0.p.", period: 2 });
    const badEnableAlign = { ...base, generator: { ...base.generator, period: 2 }, enable: [{ start: 1, value: 1 }] } as ClockSignal;
    expect(() => toWaveJson({ signal: badEnableAlign, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNALIGNED_CLOCK_ENABLE" }));
  });

  it("pins the production and test renderer to one WaveDrom version", () => {
    expect(WaveDrom.version).toBe(WAVEDROM_VERSION);
    expect(new ProductionWaveDromAdapter().metrics()).toEqual({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 });
  });

  it("preserves the left-edge value when converting a bounded source window", () => {
    const signal = logicSignal([{ start: 0, value: 0 }, { start: 50, value: 1 }, { start: 75, value: 0 }]);
    expect(toWaveJsonWindow({ signal, cycleCount: 100 }, 60, 80)).toEqual({ wave: "1..............0....", sourceWindow: { start: 60, end: 80 }, displayWindow: { start: 60, end: 80 } });
  });

  it("reconstructs a bounded clock window from canonical phase", () => {
    const clock = canonicalFixture().signals[0] as ClockSignal;
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 100 }, 20, 40);
    expect(bounded.sourceWindow).toEqual({ start: 20, end: 40 });
    expect(bounded.wave).toHaveLength(20);
    expect(bounded.wave[0]).toBe("p");
    expect(bounded.wave.slice(1)).toMatch(/^\.*$/);
  });

  it("uses displayLabel only for WaveDrom data while retaining semantic values", () => {
    const bus = { ...canonicalFixture().signals[1]!, values: [{ start: 0, value: "0x12345678", displayLabel: "READY" }] } as ValueSignal;
    expect(bus.values[0]?.value).toBe("0x12345678");
    expect(toWaveJson({ signal: bus, cycleCount: 4 })).toEqual({ wave: "=...", data: ["READY"] });
  });

  it("defines Auto document defaults and presentation-only SignalValueChange overrides", () => {
    expect(VALUE_LABEL_LAYOUT_POLICY).toMatchObject({ documentDefault: "auto", signalOverride: "displayLabel", semanticSource: "value", minimumFontPt: 8 });
  });

  it("fits data labels to actual WaveDrom segment bounds without changing wave geometry", () => {
    const waveJson: WaveJsonSignal = { wave: "==..=.", data: ["0xDEADBEEF", "LONG_STATE_NAME", "NEXT"] };
    const markup = renderWaveJsonMarkup(waveJson, 0, ["0xDEADBEEF", "LONG_SYMBOLIC_STATE", "NEXT"]);
    expect(markup).toContain('data-value-label-segment-start="0" data-value-label-segment-end="40"');
    expect(markup).toContain('data-value-label-segment-start="40" data-value-label-segment-end="160"');
    expect(markup).toContain('data-value-label-segment-start="160" data-value-label-segment-end="240"');
    expect(markup).toContain('data-value-label-mode="ellipsis"');
    expect(markup).toContain('data-value-label-mode="shrink"');
    expect(markup).toContain('aria-label="0xDEADBEEF"');
    expect(markup).toContain("<title>LONG_SYMBOLIC_STATE</title>");
    expect(markup).toContain('textLength="32" lengthAdjust="spacingAndGlyphs"');
    expect(markup).toContain('x="20"');
    expect(markup).toContain('x="100"');
    expect(markup).toContain('x="200"');
    expect(markup).toContain('id="gmark_1_0" x1="40"');
    expect(waveJson).toEqual({ wave: "==..=.", data: ["0xDEADBEEF", "LONG_STATE_NAME", "NEXT"] });
  });

  it("applies suppressed clock slots relative to a delayed generator start", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, generator: { ...base.generator, start: 4, period: 2, suppressedPeriods: [0, 2] } } as ClockSignal;
    expect(toWaveJson({ signal: clock, cycleCount: 10 })).toMatchObject({ wave: "0..p0", period: 2 });
  });

  it("rejects executable SVG markup without stripping ordinary engineering text", () => {
    expect(() => assertSafeWaveDromMarkup('<svg><text>DATA&lt;7:0&gt; &amp; \'clk\'</text><script>alert(1)</script></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(assertSafeWaveDromMarkup('<svg><text>DATA&lt;7:0&gt; &amp; \'clk\'</text></svg>')).toContain("DATA&lt;7:0&gt;");
    expect(() => assertSafeWaveDromMarkup('<svg><a href="javascript:alert(1)">x</a></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(() => assertSafeWaveDromMarkup('<svg><a href="https://example.com/x.svg">x</a></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(() => assertSafeWaveDromMarkup('<svg><text onload="alert(1)">x</text></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    const rendered = renderWaveJsonMarkup({ wave: "=", data: ["<DATA&7:0>"] });
    expect(rendered).not.toMatch(/<script|onerror\s*=/i);
    expect(rendered).toContain("&lt;DATA&amp;7:0&gt;");
  });

  it("records an explicit reason for every intentionally unsupported capability", () => {
    expect(WAVEDROM_UNSUPPORTED_CAPABILITIES.length).toBe(5);
    for (const item of WAVEDROM_UNSUPPORTED_CAPABILITIES) expect(item.reason.length).toBeGreaterThan(20);
  });
});
