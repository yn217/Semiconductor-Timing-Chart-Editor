import { describe, expect, it } from "vitest";
import { buildHardwareHierarchyEntries, buildHardwareHierarchyRowIndex, deriveHardwareHierarchyEntries, filterHardwareHierarchyEntries, hardwareHierarchyScopes, hardwareHierarchyScopeBreadcrumbs, DefaultProjectionService, calculateRowLayout, getRowLayoutSourceIndex, rowsIntersectingVerticalViewport } from "@timing-chart-v2/projection";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { BookmarkId, CanonicalDocument, GroupId, RowId, SignalId, SpacerId } from "@timing-chart-v2/schema";
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
  it("finds viewport-intersecting rows without scanning the full ordered layout", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => ({ rowId: `row-${index}`, visible: index !== 5_001, y: index * 20, height: index === 4_999 ? 35 : 18 }));
    let indexedReads = 0;
    const observedRows = new Proxy(rows, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const actual = rowsIntersectingVerticalViewport(observedRows, 100_000, 100_040);

    expect(actual.map((row) => row.rowId)).toEqual(["row-4999", "row-5000", "row-5002"]);
    expect(indexedReads).toBeLessThan(40);
  });

  it("reuses canonical Signal IDs when an unrelated document collection changes", () => {
    const document = canonicalFixture();
    const service = new DefaultProjectionService();
    const viewport = { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] } as const;
    const before = service.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport });
    const bookmarkId = "bookmark_projection_cache" as BookmarkId;
    const afterDocument = { ...document, bookmarks: [...document.bookmarks, { id: bookmarkId, name: "Review", start: 1 }] };
    const after = service.project({ snapshot: { revision: 1, document: afterDocument } as CanonicalSnapshot, changeSet: { bookmarkPosition: [bookmarkId] }, viewport, previous: before });

    expect(after.canonicalSignalIds).toBe(before.canonicalSignalIds);
  });

  it("builds shared canonical row indexes once for visible and navigation layouts", () => {
    const source = canonicalFixture();
    let signalMapBuilds = 0;
    let canonicalRowEnumerations = 0;
    const signals = new Proxy(source.signals, {
      get(target, property, receiver) {
        if (property === "map") signalMapBuilds += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const signalGroups = new Proxy(source.signalGroups, {
      get(target, property, receiver) {
        if (property === "flatMap") canonicalRowEnumerations += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const document = { ...source, signals, signalGroups };
    const service = new DefaultProjectionService();

    service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });

    expect(signalMapBuilds).toBe(1);
    expect(canonicalRowEnumerations).toBe(1);
    expect(service.diagnostics().rowLayoutSourceIndexBuilds).toBe(1);
  });

  it("reuses the immutable row-domain index across projection services sharing canonical collections", () => {
    const source = canonicalFixture();
    let signalMapBuilds = 0;
    let canonicalRowEnumerations = 0;
    const signals = new Proxy(source.signals, {
      get(target, property, receiver) {
        if (property === "map") signalMapBuilds += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const signalGroups = new Proxy(source.signalGroups, {
      get(target, property, receiver) {
        if (property === "flatMap") canonicalRowEnumerations += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const document = { ...source, signals, signalGroups };
    const request = {
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    } as const;

    const upperProjection = new DefaultProjectionService({ pane: "upper" });
    const lowerProjection = new DefaultProjectionService({ pane: "lower" });
    const upper = upperProjection.project(request);
    const lower = lowerProjection.project(request);

    expect(upper.canonicalRowIds).toBe(lower.canonicalRowIds);
    expect(signalMapBuilds).toBe(1);
    expect(canonicalRowEnumerations).toBe(1);
    expect(upperProjection.diagnostics().rowLayoutSourceIndexBuilds).toBe(1);
    expect(lowerProjection.diagnostics().rowLayoutSourceIndexBuilds).toBe(0);
    const sharedIndex = getRowLayoutSourceIndex(document).index;
    expect(getRowLayoutSourceIndex({ ...document, signals: [...signals] }).index).not.toBe(sharedIndex);
    expect(getRowLayoutSourceIndex({ ...document, signalGroups: [...signalGroups] }).index).not.toBe(sharedIndex);
  });

  it("derives stable hierarchy entries without changing group placement semantics", () => {
    const document = canonicalFixture();
    const entries = buildHardwareHierarchyEntries(document, "hierarchy");
    expect(entries.map((entry) => entry.signalId)).toEqual(["sig_clk", "sig_data"]);
    expect(entries.find((entry) => entry.signalId === "sig_data")).toMatchObject({ scope: "(root)", relativePath: "DATA", fullPath: "DATA", groupName: "Main", width: "[7:0]" });
    expect(hardwareHierarchyScopes(document)).toEqual(["(root)"]);
    const scoped = buildHardwareHierarchyEntries({ ...document, signals: document.signals.map((signal) => ({ ...signal, source: { ...signal.source, instancePath: signal.id === "sig_data" ? ["dut"] : [] } })) }, "group", "dut");
    expect(scoped.map((entry) => entry.signalId)).toEqual(["sig_data"]);
  });

  it("resolves ancestor scopes and builds paths relative to the selected scope", () => {
    const source = canonicalFixture();
    const document: CanonicalDocument = {
      ...source,
      signals: source.signals.map((signal, index) => ({
        ...signal,
        source: {
          ...signal.source,
          instancePath: index === 0 ? ["top", "u_soc", "u_dma", "u_axi"] : ["top", "u_soc", "u_dma", "u_sram"],
          signalName: index === 0 ? "arvalid" : "rdata",
        },
      })),
    };

    expect(hardwareHierarchyScopes(document)).toEqual([
      "top",
      "top.u_soc",
      "top.u_soc.u_dma",
      "top.u_soc.u_dma.u_axi",
      "top.u_soc.u_dma.u_sram",
    ]);
    expect(buildHardwareHierarchyEntries(document, "hierarchy", "top.u_soc.u_dma").map((entry) => ({ id: entry.signalId, relativePath: entry.relativePath }))).toEqual([
      { id: "sig_clk", relativePath: "u_axi.arvalid" },
      { id: "sig_data", relativePath: "u_sram.rdata" },
    ]);
    expect(buildHardwareHierarchyEntries(document, "hierarchy").map((entry) => entry.relativePath)).toEqual([
      "top.u_soc.u_dma.u_axi.arvalid",
      "top.u_soc.u_dma.u_sram.rdata",
    ]);
  });

  it("builds parent-navigation breadcrumbs without changing hierarchy scope identity", () => {
    expect(hardwareHierarchyScopeBreadcrumbs("all")).toEqual([{ value: "all", label: "All scopes" }]);
    expect(hardwareHierarchyScopeBreadcrumbs("(root)")).toEqual([
      { value: "all", label: "All scopes" },
      { value: "(root)", label: "(root)" },
    ]);
    expect(hardwareHierarchyScopeBreadcrumbs("top.u_soc.u_dma")).toEqual([
      { value: "all", label: "All scopes" },
      { value: "top", label: "top" },
      { value: "top.u_soc", label: "u_soc" },
      { value: "top.u_soc.u_dma", label: "u_dma" },
    ]);
  });

  it("filters the full path review list across canonical hierarchy and display fields", () => {
    const entries = buildHardwareHierarchyEntries({
      ...canonicalFixture(),
      signals: canonicalFixture().signals.map((signal) => signal.id === "sig_data"
        ? { ...signal, display: { ...signal.display, name: "Payload" }, source: { ...signal.source, instancePath: ["top", "u_dma"] } }
        : signal),
    }, "hierarchy");
    expect(filterHardwareHierarchyEntries(entries, " TOP.U_DMA ").map((entry) => entry.signalId)).toEqual(["sig_data"]);
    expect(filterHardwareHierarchyEntries(entries, "payload").map((entry) => entry.signalId)).toEqual(["sig_data"]);
    expect(filterHardwareHierarchyEntries(entries, "main").map((entry) => entry.signalId).sort()).toEqual(["sig_clk", "sig_data"]);
    expect(filterHardwareHierarchyEntries(entries, "missing")).toEqual([]);
  });

  it("visits canonical row ownership linearly while building hierarchy entries", () => {
    const source = canonicalFixture();
    const template = source.signals[0]!;
    const signalCount = 128;
    const signals = Array.from({ length: signalCount }, (_, index) => ({
      ...template,
      id: `sig_hierarchy_${index}` as SignalId,
      name: `Signal ${index}`,
      source: { ...template.source, signalName: `signal_${index}` },
      display: { ...template.display, name: `Signal ${index}` },
    }));
    const rowIds = signals.map((signal) => signal.id as RowId);
    let rowVisits = 0;
    const observedRows = new Proxy(rowIds, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) rowVisits += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const document: CanonicalDocument = {
      ...source,
      signals,
      signalGroups: [{ ...source.signalGroups[0]!, rows: observedRows }],
    };

    const entries = buildHardwareHierarchyEntries(document, "group");

    expect(entries).toHaveLength(signalCount);
    expect(rowVisits).toBeLessThanOrEqual(signalCount * 2);
  });

  it.each([1000, 5000, 10000])("measures linear hierarchy indexing and entry projection at %i Signals", (signalCount) => {
    const document = generatePerformanceDocument({ signalCount, cycleCount: 100 });
    const rowIndex = buildHardwareHierarchyRowIndex(document.signalGroups);
    const derivation = deriveHardwareHierarchyEntries(document, "group", undefined, rowIndex);

    expect(rowIndex.metrics).toMatchObject({ rowsVisited: signalCount, indexEntries: signalCount });
    expect(derivation.metrics).toMatchObject({ signalsVisited: signalCount, entriesCreated: signalCount });
    console.info("Hardware Hierarchy projection metrics", {
      signalCount,
      groupCount: document.signalGroups.length,
      rowIndexBuildDurationMs: rowIndex.metrics.buildDurationMs,
      entryBuildDurationMs: derivation.metrics.buildDurationMs,
      rowsVisited: rowIndex.metrics.rowsVisited,
      indexEntries: rowIndex.metrics.indexEntries,
      entriesCreated: derivation.metrics.entriesCreated,
    });
  });

  it("keeps the row ownership index immutable and preserves first-row ownership", () => {
    const document = canonicalFixture();
    const duplicate = { ...document.signalGroups[0]!, id: "grp_duplicate" as GroupId, name: "Duplicate", rows: ["sig_clk" as RowId] };
    const rowIndex = buildHardwareHierarchyRowIndex([...document.signalGroups, duplicate]);

    expect(rowIndex.locations.get("sig_clk" as SignalId)).toMatchObject({ groupId: "grp_main", groupName: "Main", groupOrder: 0, rowOrder: 0 });
    expect(() => (rowIndex.locations as Map<SignalId, unknown>).set("new" as SignalId, {})).toThrow("immutable");
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

  it("retains previously mounted rows across a full-document replacement", () => {
    const document = layoutFixture();
    const service = new DefaultProjectionService();
    const before = service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
    });
    const after = service.project({
      snapshot: { revision: 1, document: { ...document, document: { ...document.document, title: "Reopened" } } } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 0, viewportEndY: 25, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] },
      previous: before,
    });
    expect(before.mountedRowIds).toEqual(["sig_clk", spacerId, "sig_data"]);
    expect(after.mountedRowIds).toEqual(before.mountedRowIds);
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

  it("Signal Split (#200): a pane-fixed DefaultProjectionService filters rows, and setPane switches an existing instance's filter and forces a layout rebuild", () => {
    const document = layoutFixture();
    document.signals = document.signals.map((signal) => signal.id === "sig_clk" ? { ...signal, display: { ...signal.display, splitPane: "upper" } } : signal.id === "sig_data" ? { ...signal, display: { ...signal.display, splitPane: "lower" } } : signal);
    const viewport = { viewportStartY: 0, viewportEndY: 200, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] } as const;
    const upperOnly = new DefaultProjectionService({ pane: "upper" }).project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport });
    expect(upperOnly.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    const lowerOnly = new DefaultProjectionService({ pane: "lower" }).project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport });
    expect(lowerOnly.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    // A single service instance (the Upper-pane's real usage pattern: one
    // long-lived instance toggled between unfiltered and pane:"upper" as
    // Split turns on/off) must rebuild its cached layout when the pane
    // changes, not keep serving the stale unfiltered/other-pane rows.
    const toggled = new DefaultProjectionService();
    const beforeSplit = toggled.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: { fullDocumentReplace: true }, viewport });
    expect(beforeSplit.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    toggled.setPane("upper");
    const afterSplitOn = toggled.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: {}, viewport });
    expect(afterSplitOn.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    toggled.setPane(undefined);
    const afterSplitOff = toggled.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: {}, viewport });
    expect(afterSplitOff.mountedSignalIds).toEqual(["sig_clk", "sig_data"]);
    // Calling setPane with the same value must not force a needless rebuild.
    const rebuildsBefore = toggled.diagnostics().rowLayoutBuilds;
    toggled.setPane(undefined);
    toggled.project({ snapshot: { revision: 0, document } as CanonicalSnapshot, changeSet: {}, viewport });
    expect(toggled.diagnostics().rowLayoutBuilds).toBe(rebuildsBefore);
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

  it("keeps the same visible row sequence in either Signal Split pane", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      signals: [
        { ...base.signals[0]!, display: { ...base.signals[0]!.display, splitPane: "upper" } },
        { ...base.signals[1]!, display: { ...base.signals[1]!.display, splitPane: "lower" } },
      ],
    } as CanonicalDocument;

    const upper = calculateRowLayout(document, new Set(), { reserveHiddenSpace: false, pane: "upper" });
    expect(upper.visibleRows.map((row) => row.rowId)).toEqual(["sig_clk", "sig_data"]);
    expect(upper.visibleRows[0]!.y).toBe(upper.groupHeaders[0]!.y + upper.groupHeaders[0]!.height);

    const lower = calculateRowLayout(document, new Set(), { reserveHiddenSpace: false, pane: "lower" });
    expect(lower.visibleRows.map((row) => row.rowId)).toEqual(["sig_clk", "sig_data"]);

    // A "both"-assigned (unset) signal appears in every pane's visibleRows.
    const bothDocument = { ...base, signals: [{ ...base.signals[0]!, display: { ...base.signals[0]!.display, splitPane: "upper" } }, base.signals[1]!] } as CanonicalDocument;
    const bothUpper = calculateRowLayout(bothDocument, new Set(), { reserveHiddenSpace: false, pane: "upper" });
    const bothLower = calculateRowLayout(bothDocument, new Set(), { reserveHiddenSpace: false, pane: "lower" });
    expect(bothUpper.visibleRows.map((row) => row.rowId)).toEqual(["sig_clk", "sig_data"]);
    expect(bothLower.visibleRows.map((row) => row.rowId)).toEqual(["sig_clk", "sig_data"]);

    // Omitting `pane` entirely is byte-for-byte identical to pre-#200 behavior.
    const unfiltered = calculateRowLayout(document, new Set(), { reserveHiddenSpace: false });
    expect(unfiltered.visibleRows.map((row) => row.rowId)).toEqual(["sig_clk", "sig_data"]);
  });
});
