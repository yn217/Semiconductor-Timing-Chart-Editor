import { describe, expect, it } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import { buildSnapIndex } from "../../apps/editor/src/runtime/snap-index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("buildSnapIndex row lookup", () => {
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
