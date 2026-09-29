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

  it("reprojects Annotation/Dependency overlays for any rowPresentation change (Signal Show/Hide, #898)", () => {
    expect(deriveRenderInvalidation({ rowPresentation: ["sig_a"] } as ChangeSet, "signal_clk" as never)).toEqual({
      snapDependenciesChanged: false,
      referenceWaveChanged: false,
      refreshRuler: false,
      refreshGrid: false,
      refreshOverlays: true,
    });
  });
});
