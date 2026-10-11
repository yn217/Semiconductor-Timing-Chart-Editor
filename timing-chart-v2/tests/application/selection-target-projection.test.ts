import { describe, expect, it } from "vitest";
import { deriveSelectionTargetProjection } from "../../apps/editor/src/application/selection-target-projection.js";
import type { AnnotationId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("selection target projection", () => {
  it("keeps hidden selected Signals in context but chooses a visible annotation target", () => {
    const document = canonicalFixture();
    const hiddenSignal = document.signals.find((signal) => signal.id === "sig_data")!;
    hiddenSignal.display.visible = false;
    const signalById = new Map(document.signals.map((signal) => [signal.id, signal] as const));
    const annotationById = new Map<AnnotationId, (typeof document.annotations)[number]>();

    const projection = deriveSelectionTargetProjection({
      document,
      signalById,
      annotationById,
      selectedSignalId: hiddenSignal.id,
      selectedAnnotationId: undefined,
    });

    expect(projection.selectedSignal?.id).toBe(hiddenSignal.id);
    expect(projection.contextSignalId).toBe(hiddenSignal.id);
    expect(projection.referenceClockSignal?.id).toBe("sig_clk");
    expect(projection.annotationTargetSignalId).toBe("sig_clk");
  });

  it("prefers a selected visible Signal for both target and context", () => {
    const document = canonicalFixture();
    const signalById = new Map(document.signals.map((signal) => [signal.id, signal] as const));
    const annotationById = new Map<AnnotationId, (typeof document.annotations)[number]>();
    const projection = deriveSelectionTargetProjection({
      document,
      signalById,
      annotationById,
      selectedSignalId: document.signals[1]!.id,
      selectedAnnotationId: undefined,
    });

    expect(projection.annotationTargetSignalId).toBe("sig_data");
    expect(projection.contextSignalId).toBe("sig_data");
  });
});
