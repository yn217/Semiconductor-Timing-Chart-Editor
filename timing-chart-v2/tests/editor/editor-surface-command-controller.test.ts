import { describe, expect, it, vi } from "vitest";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { createEditorSurfaceCommandController } from "../../apps/editor/src/application/editor-surface-command-controller.js";

describe("editor surface command controller", () => {
  it("owns clock command construction and command IDs outside the editor surface", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, executeBatch: (id, commands) => execute(commands[0]!) as never, nextCommandId: (operation) => `test_${operation}` as never });

    controller.updateClockGenerator("signal_1" as never, { kind: "periodic", period: 4, duty: 0.5, phase: 0, start: 0, repeat: "infinite" });
    controller.updateEdgeCounter("signal_1" as never, { show: true, mode: "rising", startNumber: 0, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: 0 } });
    controller.move("transaction_1" as never, 3);
    controller.createTransaction({ id: "transaction_2" as never, name: "Write", start: 4, end: 6, laneId: "lane_0" });
    controller.duplicateTransaction({ id: "transaction_3" as never, name: "Write Copy", start: 4, end: 6, laneId: "lane_0" });
    controller.renameSignals([{ signalId: "signal_1" as never, name: "Renamed" }, { signalId: "signal_2" as never, name: "Renamed 2" }]);
    controller.setTransactionTimeScale({ clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1 });
    controller.normalizeLayout({ rowHeight: 24, signalSpacing: 2 } as never);

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_clock", type: "signal.updateClockGenerator", signalId: "signal_1" }),
      expect.objectContaining({ id: "test_edge_counter", type: "signal.updateEdgeCounter", signalId: "signal_1" }),
      expect.objectContaining({ id: "test_transaction_snap_move", type: "transaction.move", transactionId: "transaction_1", start: 3 }),
      expect.objectContaining({ id: "test_home_transaction_create", type: "transaction.create", transaction: expect.objectContaining({ id: "transaction_2" }) }),
      expect.objectContaining({ id: "test_home_transaction_duplicate", type: "transaction.create", transaction: expect.objectContaining({ id: "transaction_3" }) }),
      expect.objectContaining({ id: "test_find_replace_rename", type: "signal.rename", signalId: "signal_1", name: "Renamed" }),
      expect.objectContaining({ id: "test_transaction_time_scale_set", type: "transaction.setTimeScale", scale: { clockCyclesPerTransactionCycle: 2, majorInterval: 5, minorInterval: 1 } }),
      expect.objectContaining({ id: "test_home_auto_layout", type: "document.updateLayout" }),
    ]);
  });

  it("owns inspector command construction for grouped and annotated surfaces", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, executeBatch: (id, commands) => execute(commands[0]!) as never, nextCommandId: (operation) => `test_${operation}` as never });

    controller.updateGroupProperties({ groupId: "group_1" as never, name: "Group", spacingBefore: 0, spacingAfter: 0, style: { showBackground: false, background: "#fff", opacity: 1, extend: "both", showHeader: true } });
    controller.createSpacer({ id: "spacer_1" as never, height: 24 }, "group_1" as never, 0);
    controller.updateTransaction({ transactionId: "transaction_1" as never, name: "Read", start: 1, end: 3 });
    controller.updateAnnotationProperties({ annotationId: "annotation_1" as never, label: "A", visible: true });
    controller.setAnnotationAnchor("annotation_1" as never, "anchor", { cycle: 1, point: "cycle-start" });
    controller.updateAnnotationLabelOffset("annotation_1" as never, { x: 4, y: -8 });
    controller.resetAnnotationOffsets("annotation_1" as never);
    controller.updateAnnotationMeasurement({ annotationId: "annotation_1" as never, profile: "custom", anchorKind: "ratio", start: 0.2, end: 0.8, layout: { startMarker: "bar", endMarker: "arrow", arrowLayout: "inward", extensionLines: "both" } });

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_group_properties", type: "group.updateProperties" }),
      expect.objectContaining({ id: "test_spacer_create", type: "spacer.create" }),
      expect.objectContaining({ id: "test_transaction_update", type: "transaction.update" }),
      expect.objectContaining({ id: "test_inspector_annotation_properties", type: "annotation.updateProperties" }),
      expect.objectContaining({ id: "test_inspector_annotation_anchor", type: "annotation.setAnchor" }),
      expect.objectContaining({ id: "test_annotation_label_offset", type: "annotation.updateLabelOffset" }),
      expect.objectContaining({ id: "test_annotation_reset_offsets", type: "annotation.resetOffsets" }),
      expect.objectContaining({ id: "test_annotation_measurement", type: "annotation.updateMeasurement" }),
    ]);
  });

  it("owns Document Properties command construction and keeps metadata/legend changes batched", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const executeBatch = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, executeBatch, nextCommandId: (operation) => `test_${operation}` as never });
    const document = {
      document: { title: "Before", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "", text: "" } },
      legend: { show: true, orientation: "horizontal", usedRolesOnly: false, position: { x: 0, y: 0 }, items: [] },
    } as never;

    expect(controller.updateDocumentProperties(document, {
      title: "After",
      header: document.document.header,
      footer: document.document.footer,
      legend: { ...document.legend, show: false },
    })).toEqual({ ok: true });
    expect(execute).not.toHaveBeenCalled();
    expect(executeBatch).toHaveBeenCalledWith("test_document_properties", [
      expect.objectContaining({ id: "test_document_metadata", type: "document.updateMetadata", title: "After" }),
      expect.objectContaining({ id: "test_legend_update", type: "legend.update", legend: expect.objectContaining({ show: false }) }),
    ]);
    expect(controller.updateDocumentProperties(document, {
      title: document.document.title,
      header: document.document.header,
      footer: document.document.footer,
      legend: document.legend,
    })).toBeUndefined();
  });

  it("owns Bottom Transaction Editor command construction and batch routing", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const executeBatch = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, executeBatch, nextCommandId: (operation) => `test_${operation}` as never });

    controller.createTransactionFromBottom({ id: "transaction_1" as never, name: "Read", start: 1, end: 3, laneId: "lane_0" });
    controller.duplicateTransactionById("transaction_1" as never, "transaction_2" as never, "Read Copy");
    controller.updateTransactionFromBottom({ transactionId: "transaction_1" as never, name: "Read", start: 2, end: 4 });
    controller.moveTransactionToGroup("transaction_1" as never, "group_1" as never);
    controller.bulkMoveTransactionsToGroup([{ transactionId: "transaction_1" as never }, { transactionId: "transaction_2" as never, groupId: "group_1" as never }]);
    controller.bulkUpdateTransactions([{ transactionId: "transaction_1" as never, name: "Read", start: 2, end: 4, color: "#123456" }]);
    controller.bulkDeleteTransactions(["transaction_1" as never, "transaction_2" as never]);

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_transaction_create", type: "transaction.create" }),
      expect.objectContaining({ id: "test_bottom_transaction_duplicate", type: "transaction.duplicate" }),
      expect.objectContaining({ id: "test_bottom_transaction_update", type: "transaction.update" }),
      expect.objectContaining({ id: "test_bottom_transaction_group", type: "transaction.moveToGroup" }),
    ]);
    expect(executeBatch).toHaveBeenNthCalledWith(1, "test_bottom_transaction_bulk", [expect.objectContaining({ id: "test_bottom_transaction_bulk_group", type: "transaction.moveToGroup" }), expect.objectContaining({ id: "test_bottom_transaction_bulk_group", type: "transaction.moveToGroup" })]);
    expect(executeBatch).toHaveBeenNthCalledWith(2, "test_bottom_transaction_bulk", [expect.objectContaining({ id: "test_bottom_transaction_bulk_color", type: "transaction.update" })]);
    expect(executeBatch).toHaveBeenNthCalledWith(3, "test_bottom_transaction_bulk", [expect.objectContaining({ id: "test_bottom_transaction_bulk_delete", type: "transaction.delete" }), expect.objectContaining({ id: "test_bottom_transaction_bulk_delete", type: "transaction.delete" })]);
  });

  it("owns Timeline command construction and keeps range edits batched", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const executeBatch = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, executeBatch, nextCommandId: (operation) => `test_${operation}` as never });

    controller.insertTimeline(4, 2);
    controller.duplicateTimeline(1, 3, 8);
    controller.moveTimeline(1, 3, 6);
    controller.createBookmark({ id: "bookmark_1" as never, name: "Marker 1", start: 1 });
    controller.createLabelAnchor({ id: "anchor_1" as never, source: 2, display: 10 });
    controller.updateLabelAnchor("anchor_1" as never, 3, 11);
    controller.deleteLabelAnchor("anchor_1" as never);
    controller.createTimeGroup({ id: "time_1" as never, name: "Group", start: 1, end: 3, presentation: { collapsed: false, foldStyle: "none" } });
    controller.updateTimeGroupPresentation("time_1" as never, { collapsed: true, foldStyle: "axis-break", foldLabel: "Group" });
    controller.expandAllTimeGroups([{ id: "time_1" as never, name: "Group", start: 1, end: 3, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "Group" } }]);
    controller.deleteTimeGroup("time_1" as never);

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_timeline_insert_many", type: "timeline.insert", at: 4, count: 2 }),
      expect.objectContaining({ id: "test_timeline_duplicate", type: "timeline.duplicateRange", start: 1, end: 3, at: 8 }),
      expect.objectContaining({ id: "test_timeline_move", type: "timeline.moveRange", start: 1, end: 3, to: 6 }),
      expect.objectContaining({ id: "test_marker", type: "bookmark.create" }),
      expect.objectContaining({ id: "test_label_anchor_create", type: "labelAnchor.create" }),
      expect.objectContaining({ id: "test_label_anchor_update", type: "labelAnchor.update" }),
      expect.objectContaining({ id: "test_label_anchor_delete", type: "labelAnchor.delete" }),
      expect.objectContaining({ id: "test_home_time_group", type: "timeGroup.create" }),
      expect.objectContaining({ id: "test_time_group_collapse", type: "timeGroup.updatePresentation" }),
      expect.objectContaining({ id: "test_gap_delete", type: "timeGroup.delete" }),
    ]);
    expect(executeBatch).toHaveBeenCalledWith("test_time_group_expand_all", [expect.objectContaining({ id: "test_time_group_expand_all", type: "timeGroup.updatePresentation", timeGroupId: "time_1" })]);
  });
});
