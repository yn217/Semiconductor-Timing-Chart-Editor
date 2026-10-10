import { describe, expect, it } from "vitest";
import { planAnnotationUpdateBatch, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, CanonicalDocument, CommandId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { createEditorSurfaceCommandController } from "../../apps/editor/src/application/editor-surface-command-controller.js";

const annotation: Annotation = {
  id: "annotation_offset" as AnnotationId,
  type: "text",
  label: "Label",
  visible: true,
  labelOffset: { x: 5, y: 8 },
  anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" },
} as Annotation;

const documentWithAnnotation = (): CanonicalDocument => ({ ...canonicalFixture(), annotations: [annotation] });
const signalName = (document: CanonicalDocument, signalId: string): string | undefined => document.signals.find((signal) => signal.id === signalId)?.name;
const commandId = (value: string) => value as CommandId;

// Signals of the shared fixture, chosen by ID so the tests do not depend on fixture ordering.
const primarySignal = "sig_data";
const otherSignal = (document: CanonicalDocument): string => document.signals.find((signal) => signal.id !== primarySignal && signal.type !== "commentRow")!.id;

describe("atomic batches skip no-op members", () => {
  it("applies the real member and skips a no-op member as one undo step", () => {
    const document = documentWithAnnotation();
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const result = session.executeBatch(commandId("mixed"), [
      { id: commandId("rename"), type: "signal.rename", signalId: primarySignal as SignalId, name: "Renamed" },
      { id: commandId("offset_noop"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 5, y: 8 } },
    ]);
    expect(result.ok).toBe(true);
    expect(signalName(session.getSnapshot().document, primarySignal)).toBe("Renamed");
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before.document);
  });

  it("returns a no-op when every member is a no-op", () => {
    const document = documentWithAnnotation();
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const history = session.historyState();
    const result = session.executeBatch(commandId("all_noop"), [
      { id: commandId("rename_same"), type: "signal.rename", signalId: primarySignal as SignalId, name: signalName(document, primarySignal)! },
      { id: commandId("offset_noop"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 5, y: 8 } },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(history);
  });

  it("applies the other rename when one bulk rename member already has its name", () => {
    const document = documentWithAnnotation();
    const other = otherSignal(document);
    const session = new CommandHistorySession(document);
    const result = session.executeBatch(commandId("bulk_rename"), [
      { id: commandId("rename_a"), type: "signal.rename", signalId: primarySignal as SignalId, name: "Renamed" },
      { id: commandId("rename_b"), type: "signal.rename", signalId: other as SignalId, name: signalName(document, other)! },
    ]);
    expect(result.ok).toBe(true);
    expect(signalName(session.getSnapshot().document, primarySignal)).toBe("Renamed");
    expect(signalName(session.getSnapshot().document, other)).toBe(signalName(document, other));
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("still aborts atomically when a member is invalid", () => {
    const session = new CommandHistorySession(documentWithAnnotation());
    const before = session.getSnapshot();
    const history = session.historyState();
    const result = session.executeBatch(commandId("invalid_member"), [
      { id: commandId("rename"), type: "signal.rename", signalId: primarySignal as SignalId, name: "Renamed" },
      { id: commandId("offset_noop"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 5, y: 8 } },
      { id: commandId("missing"), type: "signal.rename", signalId: "sig_missing" as SignalId, name: "X" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(history);
  });

  it("treats a net-zero batch (change then restore) as a no-op with no history entry", () => {
    const document = documentWithAnnotation();
    const original = signalName(document, primarySignal)!;
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const result = session.executeBatch(commandId("net_zero"), [
      { id: commandId("to_temp"), type: "signal.rename", signalId: primarySignal as SignalId, name: "Temporary" },
      { id: commandId("back"), type: "signal.rename", signalId: primarySignal as SignalId, name: original },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ canUndo: false, dirty: false });
  });
});

describe("Document Properties apply with a key-order-only header change", () => {
  it("still applies the legend change in one batch", () => {
    const fixture = canonicalFixture();
    const header = fixture.document.header;
    const reversed = Object.fromEntries(Object.entries(header).reverse()) as typeof header;
    expect(Object.keys(header).length).toBeGreaterThan(1);
    expect(JSON.stringify(reversed)).not.toBe(JSON.stringify(header));
    const session = new CommandHistorySession(fixture);
    let sequence = 0;
    const controller = createEditorSurfaceCommandController({
      execute: (command) => session.execute(command),
      executeBatch: (id, commands) => session.executeBatch(id, commands),
      nextCommandId: (operation) => commandId(`${operation}_${++sequence}`),
    });
    const result = controller.updateDocumentProperties(fixture, {
      title: fixture.document.title,
      header: reversed,
      footer: fixture.document.footer,
      legend: { ...fixture.legend, show: !fixture.legend.show },
    });
    expect(result?.ok).toBe(true);
    expect(session.getSnapshot().document.legend.show).toBe(!fixture.legend.show);
    expect(session.getSnapshot().document.document.header).toEqual(header);
    expect(session.historyState().undoDepth).toBe(1);
  });
});

describe("annotation update batch no-op members", () => {
  it("skips a no-op update while applying the real one", () => {
    const document = documentWithAnnotation();
    const commands: SemanticCommand[] = [
      { id: commandId("offset_noop"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 5, y: 8 } },
      { id: commandId("rotate"), type: "annotation.setRotation", annotationId: annotation.id, rotation: 45 },
    ];
    const plan = planAnnotationUpdateBatch(document, commands);
    expect(plan?.ok).toBe(true);
    if (plan?.ok) expect(plan.document.annotations[0]).toMatchObject({ rotation: 45, labelOffset: { x: 5, y: 8 } });
  });

  it("returns a no-op when every annotation update is a no-op", () => {
    const document = documentWithAnnotation();
    const commands: SemanticCommand[] = [
      { id: commandId("offset_noop"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 5, y: 8 } },
      { id: commandId("offset_noop_2"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 5, y: 8 } },
    ];
    expect(planAnnotationUpdateBatch(document, commands)).toMatchObject({ ok: false, reason: "no-op" });
    const session = new CommandHistorySession(document);
    expect(session.executeBatch(commandId("annotation_noop"), commands)).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.historyState().undoDepth).toBe(0);
  });
});
