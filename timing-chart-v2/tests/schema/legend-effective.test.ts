import { describe, expect, it } from "vitest";
import { effectiveLegendEntries } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("effectiveLegendEntries", () => {
  it("reuses role aggregation when unrelated document state changes but owning collections do not", () => {
    const source = canonicalFixture();
    const before = { ...source, legend: { ...source.legend, usedRolesOnly: true } };
    const afterUnrelatedEdit = { ...before, title: "Renamed document" };

    const initialEntries = effectiveLegendEntries(before);
    const nextEntries = effectiveLegendEntries(afterUnrelatedEdit);

    expect(nextEntries).toBe(initialEntries);
    expect(effectiveLegendEntries({ ...before, signals: [...before.signals] })).not.toBe(initialEntries);
    expect(effectiveLegendEntries({ ...before, legend: { ...before.legend, orientation: "vertical" } })).not.toBe(initialEntries);
  });

  it("filters explicit unused roles and keeps the same deterministic order for Editor and Export", () => {
    const document = { ...canonicalFixture(), legend: {
      ...canonicalFixture().legend,
      usedRolesOnly: true,
      items: [
        { id: "legend_output", role: "output" as const, label: "Outputs", visible: true, order: 0 },
        { id: "legend_input", role: "input" as const, label: "Inputs", visible: true, order: 1 },
        { id: "legend_internal", role: "internal" as const, label: "Core", visible: true, order: 2 },
      ],
    } };
    expect(effectiveLegendEntries(document)).toEqual([{ id: "legend_input", role: "input", label: "Inputs" }, { id: "legend_internal", role: "internal", label: "Core" }]);
  });
});
