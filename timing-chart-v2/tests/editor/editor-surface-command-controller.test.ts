import { describe, expect, it, vi } from "vitest";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { createEditorSurfaceCommandController } from "../../apps/editor/src/application/editor-surface-command-controller.js";

describe("editor surface command controller", () => {
  it("owns clock command construction and command IDs outside the editor surface", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, nextCommandId: (operation) => `test_${operation}` as never });

    controller.updateClockGenerator("signal_1" as never, { kind: "periodic", period: 4, duty: 0.5, phase: 0, start: 0, repeat: "infinite" });
    controller.updateEdgeCounter("signal_1" as never, { show: true, mode: "rising", startNumber: 0, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: 0 } });
    controller.move("transaction_1" as never, 3);

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_clock", type: "signal.updateClockGenerator", signalId: "signal_1" }),
      expect.objectContaining({ id: "test_edge_counter", type: "signal.updateEdgeCounter", signalId: "signal_1" }),
      expect.objectContaining({ id: "test_transaction_snap_move", type: "transaction.move", transactionId: "transaction_1", start: 3 }),
    ]);
  });

  it("owns inspector command construction for grouped and annotated surfaces", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, nextCommandId: (operation) => `test_${operation}` as never });

    controller.updateGroupProperties({ groupId: "group_1" as never, name: "Group", spacingBefore: 0, spacingAfter: 0, style: { showBackground: false, background: "#fff", opacity: 1, extend: "both", showHeader: true } });
    controller.createSpacer({ id: "spacer_1" as never, height: 24 }, "group_1" as never, 0);
    controller.updateTransaction({ transactionId: "transaction_1" as never, name: "Read", start: 1, end: 3 });
    controller.updateAnnotationProperties({ annotationId: "annotation_1" as never, label: "A", visible: true });
    controller.setAnnotationAnchor("annotation_1" as never, "anchor", { cycle: 1, point: "cycle-start" });

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_group_properties", type: "group.updateProperties" }),
      expect.objectContaining({ id: "test_spacer_create", type: "spacer.create" }),
      expect.objectContaining({ id: "test_transaction_update", type: "transaction.update" }),
      expect.objectContaining({ id: "test_inspector_annotation_properties", type: "annotation.updateProperties" }),
      expect.objectContaining({ id: "test_inspector_annotation_anchor", type: "annotation.setAnchor" }),
    ]);
  });
});
