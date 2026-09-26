import { describe, expect, it } from "vitest";
import baselineJson from "./open-presentation-baseline.json";
import { evaluateOpenPerformanceGate, summarizeOpenPresentation, type OpenPerformanceBaseline } from "./open-performance-gate.js";

const baseline = baselineJson as OpenPerformanceBaseline;

describe("Open presentation performance gate", () => {
  it("passes a representative browser sample within the absolute and relative budgets", () => {
    const summary = summarizeOpenPresentation("showcase-48x128", [178, 185, 190, 204, 219]);
    expect(summary).toMatchObject({ medianMs: 190, p95Ms: 219 });
    expect(evaluateOpenPerformanceGate(summary, baseline)).toEqual([]);
  });

  it("fails both an absolute SLO breach and an approved-main regression", () => {
    const summary = summarizeOpenPresentation("perf-50x100", [400, 410, 420, 1_001, 1_050]);
    const failures = evaluateOpenPerformanceGate(summary, baseline);
    expect(failures).toHaveLength(3);
    expect(failures.join("\n")).toContain("must be < 1000ms");
    expect(failures.join("\n")).toContain("exceeds approved-main");
  });

  it("uses nearest-rank p95 and rejects empty or invalid samples", () => {
    expect(summarizeOpenPresentation("perf-50x100", [5, 1, 4, 2, 3])).toMatchObject({ medianMs: 3, p95Ms: 5 });
    expect(() => summarizeOpenPresentation("perf-50x100", [])).toThrow("non-empty");
    expect(() => summarizeOpenPresentation("perf-50x100", [1, Number.NaN])).toThrow("finite");
  });
});
