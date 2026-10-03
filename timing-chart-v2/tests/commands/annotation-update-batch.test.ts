import { describe, expect, it } from "vitest";
import { mergeChangeSets, planAnnotationUpdateBatch, planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, CommandId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const annotation: Annotation = { id: "annotation_base" as AnnotationId, type: "text", label: "Label", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" } };

describe("indexed Annotation update batches", () => {
  it("matches sequential validation, ordered repeated-ID updates and ChangeSets", () => {
    const document = { ...canonicalFixture(), annotations: [annotation] };
    const annotationId = document.annotations[0]!.id;
    const commands: SemanticCommand[] = [
      { id: "rotate" as CommandId, type: "annotation.setRotation", annotationId, rotation: 45 },
      { id: "offset" as CommandId, type: "annotation.updateLabelOffset", annotationId, labelOffset: { x: 5, y: 8 } },
      { id: "lock" as CommandId, type: "annotation.setLocked", annotationId, locked: true },
      { id: "style" as CommandId, type: "annotation.updateProperties", annotationId, label: "Styled", visible: true, color: "#123456" },
    ];
    let candidate = document;
    const forward = [], inverse = [];
    for (const command of commands) {
      const plan = planCommand(candidate, command);
      if (!plan.ok) throw new Error("Invalid fixture");
      candidate = plan.document;
      forward.push(plan.changeSet);
      inverse.push(plan.inverseChangeSet);
    }
    expect(planAnnotationUpdateBatch(document, commands)).toEqual({ ok: true, document: candidate, changeSet: mergeChangeSets(forward), inverseChangeSet: mergeChangeSets(inverse.reverse()) });
    const session = new CommandHistorySession(document);
    expect(session.executeBatch("batch" as CommandId, commands).ok).toBe(true);
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(candidate);
    const before = session.getSnapshot();
    const history = session.historyState();
    expect(session.executeBatch("bad" as CommandId, [
      { id: "valid" as CommandId, type: "annotation.setRotation", annotationId, rotation: 90 },
      { id: "invalid" as CommandId, type: "annotation.updateLabelOffset", annotationId, labelOffset: { x: NaN, y: 0 } },
    ])).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(history);
  });

  it("reads the full Annotation collection linearly for 2k updates", () => {
    const source = canonicalFixture();
    let reads = 0;
    const annotations = new Proxy(Array.from({ length: 2_000 }, (_, index) => ({ ...annotation, id: `annotation_${index}` as AnnotationId })), {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const commands: SemanticCommand[] = annotations.map((annotation, index) => ({ id: `lock_${index}` as CommandId, type: "annotation.setLocked", annotationId: annotation.id, locked: true }));
    reads = 0;
    const result = planAnnotationUpdateBatch({ ...source, annotations }, commands);
    expect(result?.ok).toBe(true);
    expect(reads).toBeLessThanOrEqual(annotations.length * 3);
    if (result?.ok) expect(result.document.annotations.every((annotation) => annotation.locked)).toBe(true);
  });
});
