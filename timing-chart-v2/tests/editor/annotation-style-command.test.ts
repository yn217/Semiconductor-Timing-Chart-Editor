import { describe, expect, test } from "vitest";
import type { Annotation, CommandId } from "@timing-chart-v2/schema";
import { buildAnnotationStyleCommand, buildAnnotationVisibilityCommand } from "../../apps/editor/src/annotation-style-command.js";

const id = (value: string) => value as CommandId;

// #331 P1 regression: a Font-only (style) edit must never delete an
// annotation's other saved properties, regardless of its type. The bug was
// annotationPropertiesBase() gating lineType/arrowhead/opacity/
// sourceSignalId/traceOffsetCycles by `annotation.type === "arrow"` (etc),
// even though these are schema-generic optional fields any AnnotationType
// can carry -- omitting a field from `annotation.updateProperties` deletes
// it (the planner overwrites it with `undefined` then filters `undefined`
// out), so a Dependency/Connector annotation's arrowhead was silently
// destroyed by clicking Bold.
describe("buildAnnotationStyleCommand preserves non-font properties regardless of annotation.type", () => {
  test("a Dependency annotation's lineType/arrowhead survive a style-only command", () => {
    const annotation: Annotation = { id: "ann_1" as Annotation["id"], type: "dependency", label: "Dep", visible: true, lineType: "orthogonal", arrowhead: "bidirectional" };
    const command = buildAnnotationStyleCommand(annotation, { fontWeight: "bold" }, id("cmd_1"));
    expect(command).toMatchObject({ lineType: "orthogonal", arrowhead: "bidirectional", style: { fontWeight: "bold" } });
  });

  test("a Connector annotation's lineType/arrowhead survive a style-only command", () => {
    const annotation: Annotation = { id: "ann_2" as Annotation["id"], type: "connector", label: "Conn", visible: true, lineType: "curve", arrowhead: "start" };
    const command = buildAnnotationStyleCommand(annotation, { fontStyle: "italic" }, id("cmd_2"));
    expect(command).toMatchObject({ lineType: "curve", arrowhead: "start" });
  });

  test("a Ghost Trace annotation's sourceSignalId/traceOffsetCycles/opacity survive a style-only command", () => {
    const annotation: Annotation = { id: "ann_3" as Annotation["id"], type: "ghostTrace", label: "Ghost", visible: true, sourceSignalId: "sig_1" as Annotation["sourceSignalId"], traceOffsetCycles: 4, opacity: 0.4 };
    const command = buildAnnotationStyleCommand(annotation, { color: "#112233" }, id("cmd_3"));
    expect(command).toMatchObject({ sourceSignalId: "sig_1", traceOffsetCycles: 4, opacity: 0.4 });
  });

  test("a Timing Region annotation's opacity survives a visibility-only command", () => {
    const annotation: Annotation = { id: "ann_4" as Annotation["id"], type: "timingRegion", label: "Region", visible: true, opacity: 0.72, style: { color: "#334455" } };
    const command = buildAnnotationVisibilityCommand(annotation, false, id("cmd_4"));
    expect(command).toMatchObject({ opacity: 0.72, style: { color: "#334455" }, visible: false });
  });

  test("does not inject a type-based default when a field was never set", () => {
    const annotation: Annotation = { id: "ann_5" as Annotation["id"], type: "arrow", label: "Arrow", visible: true };
    const command = buildAnnotationStyleCommand(annotation, {}, id("cmd_5"));
    expect(command).not.toHaveProperty("lineType");
    expect(command).not.toHaveProperty("arrowhead");
  });
});
