import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type RenderProjection } from "@timing-chart-v2/projection";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";
import { signalId } from "../../apps/editor/src/minimal-cycle-view-fixture-helpers.js";
import { TimelineGeometryOwner } from "../../apps/editor/src/runtime/timeline-geometry-owner.js";

describe("TimelineGeometryOwner", () => {
  it("owns source-boundary, presentation-scale, and screen-to-local conversion", () => {
    const clockId = signalId("sig_cycle_clock");
    const clockGeometry = new ImmutableLocalGeometryMap(clockId, [
      { cycle: 0, point: "cycle-start", position: { x: 8, y: 0 } },
      { cycle: 1, point: "cycle-start", position: { x: 28, y: 0 } },
    ]);
    const owner = new TimelineGeometryOwner({
      mappingCache: new DisplayTimeMappingCache(),
      geometryMaps: new Map([[clockId, clockGeometry]]),
      getDocument: () => cycleDocument,
      getProjection: () => ({} as RenderProjection),
      onSnapIndexBuilt: () => undefined,
    });

    expect(owner.sourceBoundaryToLocalX(cycleDocument, 0)).toBe(8);
    owner.updatePresentation({ mode: "reference-clock", ownerSignalId: clockId, geometry: clockGeometry }, 2);
    expect(owner.sourceBoundaryToLocalX(cycleDocument, 1)).toBe(56);
    expect(owner.screenToLocal({ x: 40, y: 12 }, 2)).toEqual({ x: 20, y: 6 });
  });
});
