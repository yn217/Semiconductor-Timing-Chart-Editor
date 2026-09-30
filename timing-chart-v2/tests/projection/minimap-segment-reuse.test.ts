import { describe, expect, it } from "vitest";
import { buildMiniMapOverview, updateMiniMapOverview } from "@timing-chart-v2/projection";
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

  it("reuses unchanged row models and reports work for a one-Signal edit", () => {
    const base = canonicalFixture();
    const before = buildMiniMapOverview(base);
    const index = base.signals.findIndex((signal) => signal.type === "bus");
    const edited = { ...base, signals: base.signals.map((signal, position) => position === index && signal.type === "bus" ? { ...signal, values: [...signal.values, { start: base.timeline.cycleCount - 1, value: "0x7F" }] } : signal) };
    const after = updateMiniMapOverview(before, edited as never);
    const editedId = base.signals[index]!.id;

    for (const row of after.rows) {
      const previous = before.rows.find((item) => item.rowId === row.rowId)!;
      if (row.rowId === editedId) expect(row).not.toBe(previous);
      else expect(row).toBe(previous);
    }
    expect(after.rowsRebuilt).toBe(1);
    expect(after.rowsReused).toBe(after.rows.length - 1);
    expect(after.valueChangesVisited).toBe(edited.signals[index]!.type === "bus" ? edited.signals[index]!.values.length : -1);
  });

  it("uses changed stable Signal IDs to visit and rebuild only the edited overview row", () => {
    const base = canonicalFixture();
    const before = buildMiniMapOverview(base);
    const index = base.signals.findIndex((signal) => signal.type === "bus");
    const editedSignal = base.signals[index]!;
    const edited = { ...base, signals: base.signals.map((signal, position) => position === index && signal.type === "bus" ? { ...signal, values: [...signal.values, { start: base.timeline.cycleCount - 1, value: "0x7F" }] } : signal) };

    const after = updateMiniMapOverview(before, edited as never, [editedSignal.id]);

    expect(after.signalLookups).toBe(1);
    expect(after.rowsRebuilt).toBe(1);
    expect(after.rowsReused).toBe(after.rows.length - 1);
    expect(after.valueChangesVisited).toBe(edited.signals[index]!.type === "bus" ? edited.signals[index]!.values.length : -1);
  });
});
