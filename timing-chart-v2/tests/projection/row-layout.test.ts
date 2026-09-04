import { describe, expect, it } from "vitest";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, DefaultProjectionService, calculateRowLayout } from "@timing-chart-v2/projection";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { CanonicalDocument, GroupId, RowId, SignalId, SpacerId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

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

function linearMountedRowIds(layout: ReturnType<typeof calculateRowLayout>, viewport: { readonly viewportStartY: number; readonly viewportEndY: number; readonly overscanBefore: number; readonly overscanAfter: number; readonly pinnedRowIds: readonly RowId[] }): readonly RowId[] {
  const start = viewport.viewportStartY - viewport.overscanBefore;
  const end = viewport.viewportEndY + viewport.overscanAfter + (layout.groupHeaders[0]?.height ?? 0);
  const ids = new Set(layout.navigationRows.filter((row) => row.y + row.height >= start && row.y <= end).map((row) => row.rowId));
  for (const rowId of viewport.pinnedRowIds) if (layout.navigationRows.some((row) => row.rowId === rowId)) ids.add(rowId);
  return [...ids].sort((left, right) => layout.navigationRows.findIndex((row) => row.rowId === left) - layout.navigationRows.findIndex((row) => row.rowId === right));
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

  it.each([0, 1, 2])("retains hidden navigation rows and group placement at index %i", (hiddenIndex) => {
    const document = canonicalFixture();
    const template = document.signals[1]!;
    document.signals = [0, 1, 2].map((index) => ({ ...template, id: `sig_${index}` as SignalId, name: `S${index}`, source: { ...template.source, signalName: `S${index}` }, display: { ...template.display, name: `S${index}`, visible: index !== hiddenIndex } }));
    document.signalGroups = [0, 1, 2].map((index) => ({ id: `grp_${index}` as GroupId, name: `G${index}`, rows: [`sig_${index}` as SignalId], spacingBefore: 10, spacingAfter: 11 }));
    const result = calculateRowLayout(document);
    expect(result.navigationRows).toHaveLength(3);
    expect(result.visibleRows).toHaveLength(2);
    expect(result.totalHeight).toBe(3 * (10 + 32 + document.layout.rowHeight + 11));
  });

  it("retains navigation height when every signal is hidden", () => {
    const document = canonicalFixture();
    document.signals = document.signals.map((signal) => ({ ...signal, display: { ...signal.display, visible: false } }));
    document.signalGroups = document.signalGroups.map((group) => ({ ...group, spacingBefore: 10, spacingAfter: 11 }));
    const result = calculateRowLayout(document);
    expect(result.visibleRows).toEqual([]);
    expect(result.navigationRows.map((row) => row.rowId)).toEqual(["sig_clk", "sig_data"]);
    expect(result.totalHeight).toBe(115);
  });
  it("retains empty groups as first-class group headers", () => {
    const document = canonicalFixture();
    document.signalGroups = [
      { ...document.signalGroups[0]!, rows: [] },
      { id: "grp_empty_tail" as GroupId, name: "Empty Tail", rows: [] },
    ];
    const result = calculateRowLayout(document);
    expect(result.navigationRows).toEqual([]);
    expect(result.visibleRows).toEqual([]);
    expect(result.groupHeaders.map((header) => ({ id: header.groupId, name: header.groupName, y: header.y }))).toEqual([
      { id: "grp_main", name: "Main", y: 0 },
      { id: "grp_empty_tail", name: "Empty Tail", y: 32 },
    ]);
    expect(result.totalHeight).toBe(64);
  });
  it("removes the group header height when showHeader is disabled", () => {
    const document = canonicalFixture();
    document.signalGroups = document.signalGroups.map((group, index) => index === 0 ? { ...group, style: { showHeader: false } } : group);
    const result = calculateRowLayout(document);
    expect(result.groupHeaders[0]).toMatchObject({ groupId: "grp_main", y: 0, height: 0 });
    expect(result.visibleRows[0]).toMatchObject({ rowId: "sig_clk", y: 0 });
    expect(result.totalHeight).toBe(62);
  });
  it("derives collapsed groups as compact layout without changing canonical row IDs", () => {
    const document = layoutFixture();
    const expanded = calculateRowLayout(document);
    const collapsed = calculateRowLayout(document, new Set(["grp_main" as GroupId]));
    expect(collapsed.canonicalRowIds).toEqual(expanded.canonicalRowIds);
    expect(collapsed.navigationRows).toEqual([]);
    expect(collapsed.visibleRows).toEqual([]);
    expect(collapsed.groupHeaders[0]).toMatchObject({ groupId: "grp_main", collapsed: true, y: 2, height: 32 });
    expect(collapsed.totalHeight).toBe(37);
  });
  it("derives absolute Y from canonical spacing without persisting it", () => {
    const result = calculateRowLayout(layoutFixture());
    expect(result.canonicalRowIds).toEqual(["sig_clk", "spacer_gap", "sig_data"]);
    expect(result.visibleRows).toMatchObject([
      { rowId: "sig_clk", kind: "timing", y: 34, height: 20 },
      { rowId: "spacer_gap", kind: "spacer", y: 59, height: 10 },
      { rowId: "sig_data", kind: "timing", y: 75, height: 20 },
    ]);
    expect(result.groupHeaders).toMatchObject([{ rowId: "grp_main:header", groupId: "grp_main", groupName: "Main", y: 2, height: 32 }]);
    expect(result.totalHeight).toBe(98);
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

  it("mounts a newly inserted stable row during a row-order update", () => {
    const service = new DefaultProjectionService();
    const beforeDocument = canonicalFixture();
    const before = service.project({
      snapshot: { revision: 0, document: beforeDocument } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    const afterDocument = layoutFixture();
    const after = service.project({
      snapshot: { revision: 1, document: afterDocument } as CanonicalSnapshot,
      changeSet: { rowOrder: [spacerId], geometryScreenY: ["sig_data"] },
      viewport: { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
      previous: before,
    });
    expect(after.mountedRowIds).toContain(spacerId);
    expect(after.leftRowIds).toEqual(after.mountedRowIds);
    expect(after.timingRowIds).toEqual(after.mountedRowIds);
  });

  it("virtualizes row shells and timing SVGs while preserving canonical visible IDs", () => {
    const document = layoutFixture();
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: {},
      viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    expect(projection.visibleRowIds).toHaveLength(3);
    expect(projection.mountedRowIds).toEqual(["sig_clk", "spacer_gap", "sig_data"]);
    expect(projection.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
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

  it("keeps hidden signals in navigation while excluding them from timing and waveform projections", () => {
    const document = layoutFixture();
    document.signals = document.signals.map((signal) => signal.id === "sig_clk" ? { ...signal, display: { ...signal.display, visible: false } } : signal);
    const projection = new DefaultProjectionService().project({
      snapshot: { revision: 1, document } as CanonicalSnapshot,
      changeSet: { rowPresentation: ["sig_clk" as RowId] },
      viewport: { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    expect(projection.leftRowIds).toContain("sig_clk");
    expect(projection.frozenLabelRowIds).not.toContain("sig_clk");
    expect(projection.timingRowIds).not.toContain("sig_clk");
    expect(projection.mountedSignalIds).not.toContain("sig_clk");
    expect(projection.canonicalSignalIds).toContain("sig_clk");
    expect(projection.visibleRowIds).not.toContain("sig_clk");
  });

  it("reuses canonical RowLayout for view-only scroll projections", () => {
    const document = layoutFixture();
    const service = new DefaultProjectionService();
    const first = service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] } });
    service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: {}, viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] }, previous: first });
    expect(service.diagnostics()).toMatchObject({ projectionBuilds: 2, viewportOnlyBuilds: 1, fullVisibleRowScans: 3, viewportRowsVisited: expect.any(Number), viewportBinarySearchSteps: expect.any(Number), rowLayoutBuilds: 1 });
    service.project({ snapshot: { revision: 1, document } as CanonicalSnapshot, changeSet: { rowPresentation: ["sig_data" as RowId] }, viewport: { viewportStartY: 40, viewportEndY: 70, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] } });
    expect(service.diagnostics().rowLayoutBuilds).toBe(2);
  });

  it("updates only the viewport slice during pure scroll", () => {
    const document = layoutFixture();
    const service = new DefaultProjectionService();
    const first = service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    const scrolled = service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: {},
      viewport: { viewportStartY: 70, viewportEndY: 90, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
      previous: first,
    });
    expect(scrolled.mountedRowIds).toEqual(["sig_clk", "sig_data"]);
    expect(scrolled.rowLayout).toBe(first.rowLayout);
    expect(scrolled.canonicalRowIds).toBe(first.canonicalRowIds);
    expect(service.diagnostics()).toMatchObject({ projectionBuilds: 2, viewportOnlyBuilds: 1, fullVisibleRowScans: 3, viewportRowsVisited: 1, viewportBinarySearchSteps: expect.any(Number), rowLayoutBuilds: 1 });
  });

  it.each([1000, 5000, 10000])("keeps pure-scroll projection work viewport-bounded for %i rows", (signalCount) => {
    const document = generatePerformanceDocument({ signalCount, cycleCount: 100 });
    const service = new DefaultProjectionService();
    const first = service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 500, overscanBefore: 48, overscanAfter: 48, pinnedRowIds: ["sig_perf_0" as RowId] },
    });
    const before = service.diagnostics();
    const start = Math.max(0, first.totalHeight - 500);
    const last = service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: {},
      viewport: { viewportStartY: start, viewportEndY: first.totalHeight, overscanBefore: 48, overscanAfter: 48, pinnedRowIds: ["sig_perf_0" as RowId] },
      previous: first,
    });
    const after = service.diagnostics();
    expect(last.rowLayout).toBe(first.rowLayout);
    expect(after.fullVisibleRowScans).toBe(before.fullVisibleRowScans);
    expect(after.rowLayoutBuilds).toBe(before.rowLayoutBuilds);
    expect(after.viewportRowsVisited).toBeLessThan(100);
    expect(after.viewportBinarySearchSteps).toBeLessThan(100);
  });

  it("uses absolute-Y binary ranges for many small groups", () => {
    const document = generatePerformanceDocument({ signalCount: 1000, cycleCount: 100 });
    document.signalGroups = document.signals.map((signal, index) => ({ id: `grp_small_${index}` as GroupId, name: `Group ${index}`, rows: [signal.id], spacingAfter: 0 }));
    const service = new DefaultProjectionService();
    const first = service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport: { viewportStartY: 0, viewportEndY: 500, overscanBefore: 48, overscanAfter: 48, pinnedRowIds: [] } });
    const before = service.diagnostics();
    const middle = Math.floor(first.totalHeight / 2);
    service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: {}, viewport: { viewportStartY: middle, viewportEndY: middle + 500, overscanBefore: 48, overscanAfter: 48, pinnedRowIds: [] }, previous: first });
    const after = service.diagnostics();
    expect(after.fullVisibleRowScans).toBe(before.fullVisibleRowScans);
    expect(after.viewportRowsVisited - before.viewportRowsVisited).toBeLessThan(40);
    expect(after.groupHeadersVisited - before.groupHeadersVisited).toBeLessThan(40);
    expect(after.viewportBinarySearchSteps - before.viewportBinarySearchSteps).toBeLessThan(100);
  });

  it("matches a linear reference across variable rows, overscan, and pinned rows", () => {
    const base = layoutFixture();
    const comment = {
      id: "comment_row" as SignalId,
      type: "commentRow" as const,
      name: "Comment",
      role: "internal" as const,
      source: { instancePath: [], signalName: "comment" },
      display: { name: "Comment" },
      title: "Note",
      body: "Reference row",
    };
    const document = { ...base, signals: [...base.signals, comment], signalGroups: [{ ...base.signalGroups[0]!, rows: [...base.signalGroups[0]!.rows, comment.id] }] } as CanonicalDocument;
    const layout = calculateRowLayout(document);
    const viewports = [
      { viewportStartY: -20, viewportEndY: 0, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] as RowId[] },
      { viewportStartY: 48, viewportEndY: 62, overscanBefore: 7, overscanAfter: 9, pinnedRowIds: ["comment_row" as RowId] },
      { viewportStartY: 10_000, viewportEndY: 10_020, overscanBefore: 13, overscanAfter: 17, pinnedRowIds: ["sig_clk" as RowId] },
    ];
    for (const viewport of viewports) {
      const projection = new DefaultProjectionService().project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport });
      expect(projection.mountedRowIds).toEqual(linearMountedRowIds(layout, viewport));
    }
  });
});
