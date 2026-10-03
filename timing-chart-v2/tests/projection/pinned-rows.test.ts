import { describe, expect, it } from "vitest";
import { DefaultProjectionService, projectPinnedRows } from "@timing-chart-v2/projection";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { GroupId, RowId, SignalId } from "@timing-chart-v2/schema";
import type { RowLayoutEntry } from "@timing-chart-v2/projection";
import { canonicalFixture } from "../fixtures/canonical.js";

function row(rowId: string, y: number, visible = true): RowLayoutEntry {
  return { rowId: rowId as RowId, groupId: "g" as GroupId, groupName: "G", kind: "timing", name: rowId, visible, y, height: 30 };
}

describe("Signal pin row projection", () => {
  it("does not traverse the visible layout when there are no sticky rows", () => {
    const source = new Proxy([] as RowLayoutEntry[], {
      get(target, property, receiver) {
        if (property === "filter" || property === Symbol.iterator) throw new Error("unexpected full visible-row traversal");
        return Reflect.get(target, property, receiver);
      },
    });
    const result = projectPinnedRows({
      visibleRowLayout: source,
      rowLayout: source,
      navigationRowLayout: source,
      stickyRowIds: [],
      viewportStartY: 100,
      leadingHeaderHeight: 32,
    });
    expect(result.rowLayout).toBe(source);
    expect(result.navigationRowLayout).toBe(source);
    expect(result.pinnedRowIds).toEqual([]);
  });

  it("pins by stable ID, stacks multiple rows, and leaves source order/objects untouched", () => {
    const source = [row("signal-a", 32), row("signal-b", 66), row("signal-c", 100)];
    const original = source.map((entry) => ({ ...entry }));
    const result = projectPinnedRows({
      visibleRowLayout: source,
      rowLayout: source,
      navigationRowLayout: source,
      stickyRowIds: ["signal-c" as RowId, "signal-a" as RowId],
      viewportStartY: 180,
      leadingHeaderHeight: 32,
    });

    expect(result.pinnedRowIds).toEqual(["signal-a", "signal-c"]);
    expect(result.rowLayout.map((entry) => entry.rowId)).toEqual(["signal-a", "signal-b", "signal-c"]);
    expect(result.rowLayout.map((entry) => entry.y)).toEqual([212, 66, 242]);
    expect(result.navigationRowLayout.map((entry) => entry.y)).toEqual([212, 66, 242]);
    expect(source).toEqual(original);
  });

  it("ignores stale, hidden, and non-timing IDs and follows the viewport on each projection", () => {
    const visible = [row("visible", 32), row("hidden", 66, false), { ...row("spacer", 100), kind: "spacer" as const }];
    const first = projectPinnedRows({ visibleRowLayout: visible, rowLayout: visible, navigationRowLayout: visible, stickyRowIds: ["missing", "hidden", "spacer", "visible"] as RowId[], viewportStartY: 100, leadingHeaderHeight: 32 });
    const later = projectPinnedRows({ visibleRowLayout: visible, rowLayout: visible, navigationRowLayout: visible, stickyRowIds: ["visible"] as RowId[], viewportStartY: 300, leadingHeaderHeight: 32 });
    expect(first.pinnedRowIds).toEqual(["visible"]);
    expect(first.rowLayout[0]?.y).toBe(132);
    expect(later.rowLayout[0]?.y).toBe(332);
  });

  it("keeps a pinned waveform row and tree row at the same Y without changing canonical row IDs", () => {
    const document = canonicalFixture();
    const service = new DefaultProjectionService();
    const projection = service.project({
      snapshot: { revision: 0, document } as CanonicalSnapshot,
      changeSet: { fullDocumentReplace: true },
      viewport: { viewportStartY: 180, viewportEndY: 240, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: ["sig_clk" as SignalId], stickyRowIds: ["sig_clk" as SignalId] },
    });
    const treeRow = projection.navigationRowLayout.find((entry) => entry.rowId === "sig_clk");
    const waveformRow = projection.rowLayout.find((entry) => entry.rowId === "sig_clk");
    expect(projection.canonicalRowIds).toEqual(document.signalGroups.flatMap((group) => group.rows));
    expect(projection.mountedSignalIds).toContain("sig_clk");
    expect(treeRow?.y).toBe(212);
    expect(waveformRow?.y).toBe(treeRow?.y);
    expect(treeRow?.pinned).toBe(true);
    expect(waveformRow?.pinned).toBe(true);
  });

  it("moves the same stable-ID pin with a viewport-only scroll projection", () => {
    const document = canonicalFixture();
    const service = new DefaultProjectionService();
    const snapshot = { revision: 0, document } as CanonicalSnapshot;
    const initial = service.project({ snapshot, changeSet: { fullDocumentReplace: true }, viewport: { viewportStartY: 180, viewportEndY: 240, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: ["sig_clk" as SignalId], stickyRowIds: ["sig_clk" as SignalId] } });
    const scrolled = service.project({ snapshot, changeSet: {}, previous: initial, viewport: { viewportStartY: 300, viewportEndY: 360, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: ["sig_clk" as SignalId], stickyRowIds: ["sig_clk" as SignalId] } });
    expect(initial.rowLayout.find((entry) => entry.rowId === "sig_clk")?.y).toBe(212);
    expect(scrolled.rowLayout.find((entry) => entry.rowId === "sig_clk")?.y).toBe(332);
    expect(scrolled.revision).toBe(0);
    expect(document.signalGroups[0]?.rows).toEqual(["sig_clk", "sig_data"]);
  });
});
