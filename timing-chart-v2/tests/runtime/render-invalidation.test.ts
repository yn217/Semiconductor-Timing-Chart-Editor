import { describe, expect, it } from "vitest";
import type { ChangeSet } from "@timing-chart-v2/commands";
import { deriveRenderInvalidation } from "../../apps/editor/src/runtime/render-invalidation.js";

describe("render invalidation owner", () => {
  it("keeps timeline/reference-wave changes on the shared refresh contract", () => {
    expect(deriveRenderInvalidation({ timelineSemantics: true } as ChangeSet, "signal_clk" as never)).toEqual({
      snapDependenciesChanged: true,
      referenceWaveChanged: true,
      refreshRuler: true,
      refreshGrid: true,
      refreshOverlays: true,
    });
  });

  it("does not schedule view refreshes for unrelated property changes", () => {
    expect(deriveRenderInvalidation({} as ChangeSet, "signal_clk" as never)).toEqual({
      snapDependenciesChanged: false,
      referenceWaveChanged: false,
      refreshRuler: false,
      refreshGrid: false,
      refreshOverlays: false,
    });
  });

  it("does not reproject overlays for label-only row presentation such as Signal rename", () => {
    expect(deriveRenderInvalidation({ rowPresentation: ["sig_a"] } as ChangeSet, "signal_clk" as never)).toEqual({
      snapDependenciesChanged: false,
      referenceWaveChanged: false,
      refreshRuler: false,
      refreshGrid: false,
      refreshOverlays: false,
    });
  });

  it("keeps the SnapIndex for annotation-style-only changes but invalidates it for anchor changes", () => {
    expect(deriveRenderInvalidation({ annotationStyle: ["ann_a"] } as ChangeSet, "signal_clk" as never).snapDependenciesChanged).toBe(false);
    expect(deriveRenderInvalidation({ annotationPosition: ["ann_a"] } as ChangeSet, "signal_clk" as never).snapDependenciesChanged).toBe(true);
  });

  it("still reprojects overlays when a Signal visibility change moves annotation rows", () => {
    expect(deriveRenderInvalidation({ rowPresentation: ["sig_a"], geometryScreenY: ["sig_b"], annotationPosition: ["ann_a"] } as ChangeSet, "signal_clk" as never)).toEqual({
      snapDependenciesChanged: true,
      referenceWaveChanged: false,
      refreshRuler: false,
      refreshGrid: false,
      refreshOverlays: true,
    });
  });
});
