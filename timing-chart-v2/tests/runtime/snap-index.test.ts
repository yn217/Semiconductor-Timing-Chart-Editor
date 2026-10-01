import { describe, expect, it } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import { buildSnapIndex } from "../../apps/editor/src/runtime/snap-index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("buildSnapIndex row lookup", () => {
  it("reuses canonical row membership and projected Y for the same immutable inputs", () => {
    const source = canonicalFixture();
    const signal = source.signals.find((item) => item.type !== "commentRow")!;
    let signalMapReads = 0;
    let rowLayoutIterations = 0;
    const signals = new Proxy(source.signals, {
      get(target, property, receiver) {
        if (property === "map") signalMapReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const rows = new Proxy([{ rowId: signal.id, y: 72 }, { rowId: "stale-row-id", y: 144 }], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) rowLayoutIterations += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const document = { ...source, signals };
    const projection = { rowLayout: rows } as never;
    const map = new ImmutableLocalGeometryMap(signal.id, [
      { cycle: 0, point: "cycle-start", position: { x: 20, y: 0 } },
    ]);
    const maps = new Map([[signal.id, map]]);
    const mapping = new DisplayTimeMappingCache().get(document.timeline, document.timeGroups);

    const first = buildSnapIndex(document, projection, maps, mapping);
    const countsAfterFirstBuild = { signalMapReads, rowLayoutIterations };
    const second = buildSnapIndex(document, projection, maps, mapping);

    expect(countsAfterFirstBuild).toEqual({ signalMapReads: 1, rowLayoutIterations: 1 });
    expect({ signalMapReads, rowLayoutIterations }).toEqual(countsAfterFirstBuild);
    expect(first.entries().some((candidate) => candidate.point.y === 72)).toBe(true);
    expect(second.entries().some((candidate) => candidate.point.y === 72)).toBe(true);
    expect(second.entries().some((candidate) => candidate.point.y >= 144)).toBe(false);
  });

  it("reuses shared cycle-boundary X values across Signal geometry adapters", () => {
    const source = canonicalFixture();
    const clock = source.signals.find((item) => item.type === "clock")!;
    const data = source.signals.find((item) => item.type !== "clock" && item.type !== "commentRow")!;
    const document = { ...source, annotations: [], bookmarks: [], timeline: { ...source.timeline, referenceClock: clock.id } };
    const boundaries = [0, 1, 2].map((cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 40, y: 0 } }));
    let referenceFindCalls = 0;
    const makeMap = (signalId: SignalId, xOffset: number, isReference = false) => ({
      signalId,
      cycleKeyDomain: "source" as const,
      cycleBoundaryEntries: () => boundaries.map((entry) => ({ ...entry, position: { ...entry.position, x: entry.position.x + xOffset } })),
      find: (anchor: { cycle: number; point: string }) => {
        if (isReference) referenceFindCalls += 1;
        const boundary = boundaries.find((entry) => entry.cycle === anchor.cycle);
        if (!boundary) return undefined;
        const x = anchor.point === "cycle-center" ? boundary.position.x + 20 : boundary.position.x;
        return { signalId, anchor: anchor as never, point: { x: x + xOffset, y: 0 } };
      },
    });
    const referenceMap = makeMap(clock.id, 0, true);
    const dataMap = makeMap(data.id, 500);
    const index = buildSnapIndex(
      document,
      { rowLayout: [{ rowId: clock.id, y: 0 }, { rowId: data.id, y: 30 }] } as never,
      new Map([[clock.id, referenceMap], [data.id, dataMap]]),
      new DisplayTimeMappingCache().get(document.timeline, document.timeGroups),
    );

    expect(referenceFindCalls).toBe(0);
    const dataBoundary = index.neighborsByX(80, "cycle-boundary").before;
    expect(dataBoundary).toMatchObject({ anchor: { signalId: data.id, cycle: 2 }, point: { x: 80, y: 30 } });
  });

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
