import { describe, expect, it } from "vitest";
import { buildMiniMapOverview } from "@timing-chart-v2/projection";
import { canonicalFixture } from "../fixtures/canonical.js";

// #869: editing one Signal's values recomputes only that Signal's MiniMap segments.
describe("MiniMap overview segment reuse", () => {
  it("reuses unchanged Signals' segment arrays across documents and rebuilds the edited one", () => {
    const base = canonicalFixture();
    const before = buildMiniMapOverview(base);
    const index = base.signals.findIndex((signal) => signal.type === "bus");
    const edited = { ...base, signals: base.signals.map((signal, position) => position === index && signal.type === "bus" ? { ...signal, values: [...signal.values, { start: base.timeline.cycleCount - 1, value: "0x7F" }] } : signal) };
    const after = buildMiniMapOverview(edited as never);
    const editedId = base.signals[index]!.id;
    for (const row of after.rows) {
      const previous = before.rows.find((item) => item.rowId === row.rowId)!;
      if (row.rowId === editedId) expect(row.segments).not.toBe(previous.segments);
      else expect(row.segments).toBe(previous.segments);
    }
  });
});
