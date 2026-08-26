import { describe, expect, it } from "vitest";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, DefaultProjectionService, calculateRowLayout } from "@timing-chart-v2/projection";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { CanonicalDocument, GroupId, RowId, SignalId, SpacerId } from "@timing-chart-v2/schema";
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
  it("derives stable hierarchy entries without changing group placement semantics", () => {
    const document = canonicalFixture();
    const entries = buildHardwareHierarchyEntries(document, "hierarchy");
    expect(entries.map((entry) => entry.signalId)).toEqual(["sig_clk", "sig_data"]);
    expect(entries.find((entry) => entry.signalId === "sig_data")).toMatchObject({ scope: "(root)", relativePath: "DATA", fullPath: "DATA", groupName: "Main", width: "[7:0]" });
    expect(hardwareHierarchyScopes(document)).toEqual(["(root)"]);
    const scoped = buildHardwareHierarchyEntries({ ...document, signals: document.signals.map((signal) => ({ ...signal, source: { ...signal.source, instancePath: signal.id === "sig_data" ? ["dut"] : [] } })) }, "group", "dut");
    expect(scoped.map((entry) => entry.signalId)).toEqual(["sig_data"]);
  });

  it.each([0, 1, 2])("does not retain spacing for a fully hidden group at index %i", (hiddenIndex) => {
    const document = canonicalFixture();
    const template = document.signals[1]!;
    document.signals = [0, 1, 2].map((index) => ({ ...template, id: `sig_${index}` as SignalId, name: `S${index}`, source: { ...template.source, signalName: `S${index}` }, display: { ...template.display, name: `S${index}`, visible: index !== hiddenIndex } }));
    document.signalGroups = [0, 1, 2].map((index) => ({ id: `grp_${index}` as GroupId, name: `G${index}`, rows: [`sig_${index}` as SignalId], spacingBefore: 10, spacingAfter: 11 }));
    const result = calculateRowLayout(document);
    expect(result.visibleRows).toHaveLength(2);
    expect(result.totalHeight).toBe(2 * (10 + document.layout.rowHeight + 11));
  });

  it("returns zero height when every group is fully hidden", () => {
    const document = canonicalFixture();
    document.signals = document.signals.map((signal) => ({ ...signal, display: { ...signal.display, visible: false } }));
    document.signalGroups = document.signalGroups.map((group) => ({ ...group, spacingBefore: 10, spacingAfter: 11 }));
    expect(calculateRowLayout(document)).toMatchObject({ visibleRows: [], totalHeight: 0 });
  });
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

  it("keeps Left, Frozen, and Timing mounted IDs identical", () => {
    const document = layoutFixture();
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: ["sig_data" as RowId] },
    });
    expect(projection.visibleRowIds).toEqual(["sig_clk", "spacer_gap", "sig_data"]);
    expect(projection.mountedRowIds).toEqual(["sig_clk", "sig_data"]);
    expect(projection.leftRowIds).toEqual(projection.mountedRowIds);
    expect(projection.frozenLabelRowIds).toEqual(projection.mountedRowIds);
    expect(projection.timingRowIds).toEqual(projection.mountedRowIds);
    expect(projection.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    expect(projection.waveSignalIds).toEqual(["sig_clk", "sig_data"]);
  });

  it("virtualizes row shells and timing SVGs while preserving canonical visible IDs", () => {
    const document = layoutFixture();
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: {},
      viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    expect(projection.visibleRowIds).toHaveLength(3);
    expect(projection.mountedRowIds).toEqual(["sig_data"]);
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

  it("reuses canonical RowLayout for view-only scroll projections", () => {
    const document = layoutFixture();
    const service = new DefaultProjectionService();
    const first = service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] } });
    service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: {}, viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] }, previous: first });
    expect(service.diagnostics()).toMatchObject({ projectionBuilds: 2, rowLayoutBuilds: 1 });
    service.project({ snapshot: { revision: 1, document } as CanonicalSnapshot, changeSet: { rowPresentation: ["sig_data" as RowId] }, viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] } });
    expect(service.diagnostics().rowLayoutBuilds).toBe(2);
  });
});
