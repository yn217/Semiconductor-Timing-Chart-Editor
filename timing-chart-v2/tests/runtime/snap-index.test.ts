import { describe, expect, it } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import { buildSnapIndex } from "../../apps/editor/src/runtime/snap-index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("buildSnapIndex row lookup", () => {
  it("preserves a sparse geometry boundary index instead of probing the full display timeline", () => {
    const source = canonicalFixture();
    const signal = source.signals.find((item) => item.type !== "commentRow")!;
    const document = {
      ...source,
      signals: [signal],
      bookmarks: [],
      annotations: [],
      timeline: { ...source.timeline, referenceClock: signal.id, cycleCount: 10_000 },
    };
    const boundaries = [0, 5_000, 10_000].map((cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle / 10, y: 0 } }));
    let findCalls = 0;
    let boundaryIndexReads = 0;
    const boundedMap = {
      signalId: signal.id,
      cycleBoundaryEntries: () => { boundaryIndexReads += 1; return boundaries; },
      find: (anchor: { cycle: number; point: string }) => {
        findCalls += 1;
        const entry = boundaries.find((candidate) => candidate.cycle === anchor.cycle && candidate.point === anchor.point);
        return entry ? { signalId: signal.id, anchor: anchor as never, point: entry.position } : undefined;
      },
    };
    const index = buildSnapIndex(
      document,
      { rowLayout: [{ rowId: signal.id, y: 12 }] } as never,
      new Map([[signal.id, boundedMap]]),
      new DisplayTimeMappingCache().get(document.timeline, document.timeGroups),
    );

    expect(boundaryIndexReads).toBeGreaterThan(0);
    expect(index.entries().filter((candidate) => candidate.kind === "cycle-boundary").map((candidate) => candidate.anchor.cycle)).toEqual([0, 5_000, 10_000]);
    expect(findCalls).toBeLessThan(64);
  });

  it("keeps only canonical Signal rows while preserving their projected Y positions", () => {
    const document = canonicalFixture();
    const signal = document.signals.find((item) => item.type !== "commentRow")!;
    const map = new ImmutableLocalGeometryMap(signal.id, [
      { cycle: 0, point: "cycle-start", position: { x: 20, y: 0 } },
    ]);
    const projection = {
      rowLayout: [
        { rowId: signal.id, y: 72 },
        { rowId: "stale-row-id", y: 144 },
      ],
    } as never;
    const index = buildSnapIndex(
      document,
      projection,
      new Map([[signal.id, map]]),
      new DisplayTimeMappingCache().get(document.timeline, document.timeGroups),
    );

    expect(index.entries().some((candidate) => candidate.kind === "cycle-boundary" && candidate.anchor.signalId === signal.id && candidate.point.y === 72)).toBe(true);
    expect(index.entries().some((candidate) => candidate.point.y >= 144)).toBe(false);
  });

  it("uses stable Signal IDs for row membership rather than row positions", () => {
    const document = canonicalFixture();
    const signal = document.signals.find((item) => item.type !== "commentRow")!;
    const otherSignalId = "signal-not-in-document" as SignalId;
    const map = new ImmutableLocalGeometryMap(signal.id, [
      { cycle: 0, point: "cycle-start", position: { x: 20, y: 0 } },
    ]);
    const projection = {
      rowLayout: [
        { rowId: signal.id, y: 90 },
        { rowId: otherSignalId, y: 180 },
      ],
    } as never;
    const index = buildSnapIndex(
      document,
      projection,
      new Map([[signal.id, map]]),
      new DisplayTimeMappingCache().get(document.timeline, document.timeGroups),
    );

    expect(index.entries().some((candidate) => candidate.point.y === 90)).toBe(true);
    expect(index.entries().some((candidate) => candidate.point.y >= 180)).toBe(false);
  });
});
