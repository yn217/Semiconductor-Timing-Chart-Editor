import { describe, expect, it } from "vitest";
import { DefaultProjectionService, calculateRowLayout } from "@timing-chart-v2/projection";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { CanonicalDocument, RowId, SignalId, SpacerId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const spacerId = "spacer_gap" as SpacerId;

function layoutFixture(): CanonicalDocument {
  const source = canonicalFixture();
  return {
    ...source,
    layout: { ...source.layout, rowHeight: 20, signalSpacing: 4 },
    signals: [
      { ...source.signals[0]!, spacingAfter: 1 },
      { ...source.signals[1]!, spacingBefore: 2 },
    ],
    signalGroups: [{ ...source.signalGroups[0]!, rows: ["sig_clk" as RowId, spacerId, "sig_data" as RowId], spacers: [{ id: spacerId, height: 10 }], spacingBefore: 2, spacingAfter: 3 }],
  } as CanonicalDocument;
}

describe("RowLayout and projection invariants", () => {
  it("derives absolute Y from canonical spacing without persisting it", () => {
    const result = calculateRowLayout(layoutFixture());
    expect(result.canonicalRowIds).toEqual(["sig_clk", "spacer_gap", "sig_data"]);
    expect(result.visibleRows).toMatchObject([
      { rowId: "sig_clk", kind: "timing", y: 2, height: 20 },
      { rowId: "spacer_gap", kind: "spacer", y: 27, height: 10 },
      { rowId: "sig_data", kind: "timing", y: 43, height: 20 },
    ]);
    expect(result.totalHeight).toBe(66);
  });

  it("keeps canonical, Left, Frozen, and Timing visible IDs identical", () => {
    const document = layoutFixture();
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: ["sig_data" as RowId] },
    });
    expect(projection.visibleRowIds).toEqual(["sig_clk", "spacer_gap", "sig_data"]);
    expect(projection.leftRowIds).toEqual(projection.visibleRowIds);
    expect(projection.frozenLabelRowIds).toEqual(projection.visibleRowIds);
    expect(projection.timingRowIds).toEqual(projection.visibleRowIds);
    expect(projection.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    expect(projection.waveSignalIds).toEqual(["sig_clk", "sig_data"]);
  });

  it("virtualizes timing SVGs while preserving all canonical visible row shells", () => {
    const document = layoutFixture();
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: {},
      viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    expect(projection.visibleRowIds).toHaveLength(3);
    expect(projection.mountedSignalIds).toEqual(["sig_data"]);
    expect(projection.waveSignalIds).toEqual([]);
  });

  it("preserves invalidation for an unmounted Signal until it re-enters the viewport", () => {
    const document = layoutFixture();
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 1, document } as CanonicalSnapshot,
      changeSet: { waveSemantics: ["sig_data" as SignalId] },
      viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    expect(projection.mountedSignalIds).toEqual(["sig_clk"]);
    expect(projection.waveSignalIds).toEqual(["sig_data"]);
  });
});
