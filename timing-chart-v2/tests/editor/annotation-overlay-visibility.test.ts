import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { projectAnnotationOverlays } from "../../apps/editor/src/runtime/annotation-overlays.js";
import { resolveAnchorPoint } from "../../apps/editor/src/resolve-anchor-point.js";

function projectionFor(signalId: SignalId, visible: boolean): RenderProjection {
  return {
    rowLayout: [{ rowId: signalId, groupId: "grp_main", groupName: "Main", kind: "timing", name: "DATA", visible, y: 120, height: 28 }],
    totalHeight: 148,
  } as unknown as RenderProjection;
}

describe("annotation visibility and semantic targets", () => {
  it("does not resolve an anchor onto a hidden Signal's retained navigation row", () => {
    const document = canonicalFixture();
    const signal = document.signals[1]!;
    const map = new ImmutableLocalGeometryMap(signal.id, [{ cycle: 1, point: "value-start", position: { x: 24, y: 0 } }]);
    const anchor = { signalId: signal.id, cycle: 1, point: "value-start" as const };
    const mapping = buildDisplayTimeMapping(document.timeline, []);

    expect(resolveAnchorPoint(anchor, document, projectionFor(signal.id, false), new Map([[signal.id, map]]), mapping)).toBeUndefined();
    expect(resolveAnchorPoint(anchor, document, projectionFor(signal.id, true), new Map([[signal.id, map]]), mapping)).toEqual({ x: 24, y: 120 });
  });

  it("omits an annotation whose semantic target is hidden", () => {
    const source = canonicalFixture();
    const signal = source.signals[1]!;
    const document = {
      ...source,
      signals: source.signals.map((item) => item.id === signal.id ? { ...item, display: { ...item.display, visible: false } } : item),
      annotations: [{ id: "ann_hidden" as never, type: "text" as const, label: "Hidden target", visible: true, anchor: { signalId: signal.id, cycle: 1, point: "value-start" as const } }],
    };
    const map = new ImmutableLocalGeometryMap(signal.id, [{ cycle: 1, point: "value-start", position: { x: 24, y: 0 } }]);

    expect(projectAnnotationOverlays(document, projectionFor(signal.id, false), new Map([[signal.id, map]]), buildDisplayTimeMapping(document.timeline, []))).toEqual([]);
  });
});
