import { describe, expect, it } from "vitest";
import WaveDrom from "wavedrom";
import {
  ProductionWaveDromAdapter,
  WAVEDROM_STATE_TOKENS,
  WAVEDROM_UNSUPPORTED_CAPABILITIES,
  WAVEDROM_VERSION,
  WaveDromAdapterError,
  renderWaveJsonMarkup,
  toWaveJson,
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

  it("rejects unsupported conversion instead of approximating", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const duty = { ...base, generator: { ...base.generator, duty: 0.25 } } as ClockSignal;
    expect(() => toWaveJson({ signal: duty, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_DUTY" }));
    const fractional = logicSignal([{ start: 0, value: 0 }, { start: 1.5, value: 1 }]);
    expect(() => toWaveJson({ signal: fractional, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CHANGE_POINT" }));
    expect(() => toWaveJson({ signal: logicSignal([{ start: 0, value: "maybe" }]), cycleCount: 8 })).toThrowError(WaveDromAdapterError);
  });

  it("pins the production and test renderer to one WaveDrom version", () => {
    expect(WaveDrom.version).toBe(WAVEDROM_VERSION);
    expect(new ProductionWaveDromAdapter().metrics()).toEqual({ renderCalls: 0, activeOwners: 0 });
  });

  it("records an explicit reason for every intentionally unsupported capability", () => {
    expect(WAVEDROM_UNSUPPORTED_CAPABILITIES.length).toBe(4);
    for (const item of WAVEDROM_UNSUPPORTED_CAPABILITIES) expect(item.reason.length).toBeGreaterThan(20);
  });
});
