import { describe, expect, it } from "vitest";
import { planCommand } from "../../packages/commands/src/planner.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("signal.replaceValues at import scale", () => {
  it("assigns IDs to 20,000 pasted rows without rescanning the existing changes per row", () => {
    const base = canonicalFixture();
    const existing = Array.from({ length: 20_000 }, (_, index) => ({ id: `value_sig_data_${index}`, start: index * 2, value: index % 2 ? "AA" : "55" }));
    const document = { ...base, timeline: { ...base.timeline, cycleCount: 50_000, end: 50_000 }, signals: base.signals.map((signal) => signal.id === "sig_data" ? { ...signal, values: existing } : signal) } as typeof base;
    const incoming = Array.from({ length: 20_000 }, (_, index) => ({ start: index * 2 + 1, value: index % 2 ? "11" : "22" }));
    const started = performance.now();
    const result = planCommand(document, { id: "replace_scale" as never, type: "signal.replaceValues", signalId: "sig_data" as never, values: incoming } as never);
    // Was ~170 s (quadratic); linear indexing finishes in well under a second. The bound only catches a return to quadratic behaviour.
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.document.signals.find((signal) => signal.id === "sig_data")!;
      const values = (ids as { values: readonly { id?: string }[] }).values;
      expect(new Set(values.map((change) => change.id)).size).toBe(values.length);
    }
  });
});
