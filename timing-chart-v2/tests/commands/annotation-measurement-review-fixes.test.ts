import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, CommandId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;

describe("annotation.updateMeasurement cycle profile", () => {
  it("resets transition-picked endpoints to cycle-start and cycle-end when switching back to Cycle anchors", () => {
    const source = canonicalFixture();
    const annotation: Annotation = {
      id: "ann_measurement_back_to_cycle" as AnnotationId, type: "measurement", label: "Measurement", visible: true,
      measurement: { profile: "30-70", anchorKind: "threshold" },
      start: { signalId: "sig_data" as SignalId, cycle: 1, point: "transition-center", transition: { kind: "threshold", value: 0.3 } },
      end: { signalId: "sig_data" as SignalId, cycle: 4, point: "transition-center", transition: { kind: "threshold", value: 0.7 } },
    };
    const session = new CommandHistorySession({ ...source, annotations: [annotation] });
    const result = session.execute({ id: commandId("cmd_measurement_back_to_cycle"), type: "annotation.updateMeasurement", annotationId: annotation.id, profile: "cycle", anchorKind: "threshold", start: 0, end: 1 });
    expect(result.ok).toBe(true);
    const updated = session.getSnapshot().document.annotations[0]!;
    expect(updated.start).toEqual({ signalId: "sig_data", cycle: 1, point: "cycle-start" });
    expect(updated.end).toEqual({ signalId: "sig_data", cycle: 4, point: "cycle-end" });
    expect(updated.measurement).toEqual({ profile: "cycle", anchorKind: "threshold" });
  });
});
