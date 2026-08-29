import { describe, expect, it } from "vitest";
import { buildMiniMapOverview } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("MiniMap overview derivation", () => {
  it("uses stable row IDs and preserves signal segment tones", () => {
    const overview = buildMiniMapOverview(canonicalFixture());
    expect(overview.rows.length).toBeGreaterThan(0);
    expect(new Set(overview.rows.map((row) => row.rowId)).size).toBe(overview.rows.length);
    expect(overview.signalLookups).toBe(overview.rows.length);
    expect(overview.rows[0]?.segments.length).toBeGreaterThan(0);
    expect(Object.isFrozen(overview)).toBe(true);
    expect(Object.isFrozen(overview.rows)).toBe(true);
  });

  it("derives a large overview with one map lookup per row", () => {
    const source = canonicalFixture();
    const template = source.signals[0]!;
    const signals = Array.from({ length: 1_000 }, (_, index) => ({ ...template, id: `mini_${index}` as SignalId }));
    const document = { ...source, signals, signalGroups: [{ ...source.signalGroups[0]!, rows: signals.map((signal) => signal.id) }] };
    const overview = buildMiniMapOverview(document);
    expect(overview.rows).toHaveLength(1_000);
    expect(overview.signalLookups).toBe(1_000);
    expect(overview.rows[999]?.rowId).toBe("mini_999");
  });
});
