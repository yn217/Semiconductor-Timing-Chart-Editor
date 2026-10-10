import { describe, expect, it } from "vitest";
import {
  assertSafeWaveDromMarkup,
  renderWaveJsonMarkup,
  toWaveJson,
  toWaveJsonWindow,
  semanticValuesForWindow,
  type WaveJsonSignal,
} from "@timing-chart-v2/wavedrom-adapter";
import type { SignalId, ValueSignal } from "@timing-chart-v2/schema";

const signalId = (value: string) => value as SignalId;

/** Two data slots, 70 cycles apart: wide enough that the early-return path in
 * applyValueLabelLayout (waves over 128 cells with every label fitting) applies. */
const LONG_WAVE = `=${".".repeat(69)}=${".".repeat(69)}`;

describe("label text escaping on every render path", () => {
  // WaveDrom's tspan parser XML-escapes plain label text, so injected markup
  // in labels stays inert text on the long-wave early-return path too.
  it("keeps markup-like label text inert on the long-wave early-return path", () => {
    const hostile = ['<style>x</style>', '<set attributeName="href" to="javascript:alert(1)"/>'];
    const markup = renderWaveJsonMarkup({ wave: LONG_WAVE, data: hostile } as WaveJsonSignal, 0, hostile);
    expect(markup).toContain("&lt;set attributeName=&quot;href&quot;");
    expect(markup).not.toContain("<set ");
    expect(markup).not.toContain("<style>x");
  });

  it("keeps markup-like label text inert on the laid-out (short wave) path", () => {
    const markup = renderWaveJsonMarkup({ wave: "=.=.", data: ["<style>", "x"] } as WaveJsonSignal, 0, ["<style>", "x"]);
    expect(markup).toContain("&lt;style&gt;");
    expect(markup).not.toMatch(/<style>[^<]*<\/tspan>/);
  });

  it("renders legitimate &, <, > and quotes as visible text escaped exactly once", () => {
    for (const wave of [LONG_WAVE, "=.=."]) {
      const markup = renderWaveJsonMarkup({ wave, data: ["A&B", "<x>"] } as WaveJsonSignal, 0, ["A&B", "<x>"]);
      expect(markup).toContain(">A&amp;B<");
      expect(markup).toContain("&lt;x&gt;");
      expect(markup).not.toContain("&amp;amp;");
      expect(markup).not.toContain("&amp;lt;");
    }
  });
});

describe("assertSafeWaveDromMarkup blocklist", () => {
  it.each([
    ["user style element", '<svg><style>text{fill:url(https://x)}</style></svg>'],
    ["set element", '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>'],
    ["animate element", '<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>'],
    ["animateMotion element", '<svg><animateMotion path="M0 0"/></svg>'],
    ["animateTransform element", '<svg><animateTransform attributeName="transform" type="scale"/></svg>'],
    ["feImage element", '<svg><filter><feImage href="https://x/y.svg"/></filter></svg>'],
  ])("rejects %s", (_name, markup) => {
    expect(() => assertSafeWaveDromMarkup(markup)).toThrow(/UNSAFE_WAVEDROM_SVG|executable|unsafe/i);
  });

  it("still accepts WaveDrom's own pinned skin stylesheet", () => {
    const markup = renderWaveJsonMarkup({ wave: "=.=." , data: ["a", "b"] } as WaveJsonSignal, 0, ["a", "b"]);
    expect(markup).toContain("<style");
    expect(() => assertSafeWaveDromMarkup(markup)).not.toThrow();
  });
});

describe("windowed value conversion matches the full-document conversion", () => {
  const busSignal = (values: ValueSignal["values"]): ValueSignal => ({
    id: signalId("sig_bus"), name: "BUS", type: "bus", role: "internal", width: 8,
    source: { instancePath: [], signalName: "BUS" }, display: { name: "BUS" }, values,
  } as ValueSignal);

  it("does not duplicate the first change or drop the leading X when the window starts before it", () => {
    const signal = busSignal([{ start: 5, value: 10 }]);
    const full = toWaveJson({ signal, cycleCount: 10 });
    const windowed = toWaveJsonWindow({ signal, cycleCount: 10 }, 0, 10);
    expect(full.wave).toBe("x....=....");
    expect(windowed.wave).toBe(full.wave);
    expect(windowed.data).toEqual(full.data);
  });

  it("renders an entirely pre-first-change window as X, as the full document does", () => {
    const signal = busSignal([{ start: 5, value: 10 }]);
    const windowed = toWaveJsonWindow({ signal, cycleCount: 10 }, 0, 3);
    expect(windowed.wave).toBe("x..");
    expect(windowed.data).toBeUndefined();
    expect(semanticValuesForWindow([{ start: 5, value: 10 }], 0, 3, "bus")).toEqual([]);
  });

  it("still carries the value in effect at the window left edge", () => {
    const signal = busSignal([{ start: 0, value: 3 }, { start: 5, value: 10 }]);
    const windowed = toWaveJsonWindow({ signal, cycleCount: 10 }, 3, 8);
    expect(windowed.wave).toBe("=.=..");
    expect(windowed.data).toEqual(["3", "10"]);
    expect(semanticValuesForWindow([{ start: 0, value: 3 }, { start: 5, value: 10 }], 3, 8, "bus")).toEqual(["3", "10"]);
  });
});
