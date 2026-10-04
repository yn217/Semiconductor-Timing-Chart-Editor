import { describe, expect, it } from "vitest";
import { cursorStatusReadout } from "../../apps/editor/src/cursor-status-readout.js";

describe("cursor status readout", () => {
  it("shows both source cursor positions and physical time only when the Document defines it", () => {
    expect(cursorStatusReadout(2, 7, { cycles: 5 }, undefined)).toBe("Cursor: A 2 · B 7 · Δ 5 cycles");
    expect(cursorStatusReadout(2, 7, { cycles: 5 }, { referenceFrequencyHz: 100_000_000, unit: "ns" })).toBe("Cursor: A 2 · B 7 · Δ 5 cycles (50 ns)");
    expect(cursorStatusReadout(2, undefined, {}, undefined)).toBe("Cursor: A 2 · B —");
    expect(cursorStatusReadout(undefined, undefined, {}, undefined)).toBeUndefined();
  });
});
