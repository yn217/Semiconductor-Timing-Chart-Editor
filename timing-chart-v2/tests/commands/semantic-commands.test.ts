import { describe, expect, it } from "vitest";
import { commandPolicyCodes, commandPolicyDescriptors, planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { deriveTimingDiagnostics, TIMING_DIAGNOSTIC_CATEGORIES } from "@timing-chart-v2/core";
import { DEFAULT_MEASUREMENT_LAYOUT, MAX_MEASUREMENT_LANE, parseDocument, serializeValidatedCanonicalDocument, type Annotation, type AnnotationId, type BookmarkId, type ClockSignal, type CommandId, type CommentRow, type GroupId, type Signal, type SignalId, type SpacerId, type TransactionGroupId, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function extraSignal(id = "sig_extra"): Signal {
  const base = clone(canonicalFixture().signals[1]!);
  return { ...base, id: id as SignalId, name: "EXTRA", source: { ...base.source, signalName: "EXTRA" }, display: { ...base.display, name: "EXTRA" } } as Signal;
}

describe("pure Semantic Command planning", () => {
  it("owns Transaction Groups and preserves group/color/description semantics atomically", () => {
    const document = canonicalFixture();
    const groupId = "txn_group_main" as TransactionGroupId;
    const transactionId = "txn_grouped" as TransactionId;
    const group = { id: groupId, name: "Transfers", color: "#123456", order: 0 } as const;
    expect(planCommand(document, { id: commandId("txn_group_create"), type: "transactionGroup.create", group }).ok).toBe(true);
    const grouped = planCommand({ ...document, transactionGroups: [group] }, { id: commandId("txn_create_grouped"), type: "transaction.create", transaction: { id: transactionId, name: "Read", start: 1, end: 4, groupId, color: "#abcdef", description: "payload" } });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    expect(grouped.document.transactions[0]).toMatchObject({ groupId, color: "#abcdef", description: "payload" });
    const moved = planCommand(grouped.document, { id: commandId("txn_group_remove"), type: "transaction.moveToGroup", transactionId, groupId: undefined });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.document.transactions[0]).not.toHaveProperty("groupId");
    const rejected = planCommand(document, { id: commandId("txn_bad_group"), type: "transaction.create", transaction: { id: transactionId, name: "Bad", start: 1, end: 2, groupId } });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("publishes exact Transaction Group forward/inverse ChangeSets and rejects unchanged updates", () => {
    const source = canonicalFixture();
    const group = { id: "txn_group_changes" as TransactionGroupId, name: "Transfers", color: "#123456", order: 0 } as const;
    const grouped = { ...source, transactionGroups: [group], transactions: [{ ...source.transactions[0]!, id: "txn_changes" as TransactionId, groupId: group.id }] };
    const renamed = planCommand(grouped, { id: commandId("txn_group_rename_changes"), type: "transactionGroup.rename", groupId: group.id, name: "Renamed" });
    expect(renamed).toMatchObject({ ok: true, changeSet: { transactionGroupSemantics: [group.id] }, inverseChangeSet: { transactionGroupSemantics: [group.id] } });
    const unchanged = planCommand(grouped, { id: commandId("txn_group_update_noop"), type: "transactionGroup.update", groupId: group.id, name: group.name, order: group.order, color: group.color });
    expect(unchanged).toMatchObject({ ok: false, reason: "no-op" });
    const deleted = planCommand(grouped, { id: commandId("txn_group_delete_changes"), type: "transactionGroup.delete", groupId: group.id });
    expect(deleted).toMatchObject({ ok: true, changeSet: { transactionGroupSemantics: [group.id], transactionSemantics: ["txn_changes"] }, inverseChangeSet: { transactionGroupSemantics: [group.id], transactionSemantics: ["txn_changes"] } });
  });
  it("preserves Group name and order when clearing color in a composite update", () => {
    const source = canonicalFixture();
    const group = { id: "txn_group_clear_color" as TransactionGroupId, name: "Memory", color: "#123456", order: 1 } as const;
    const document = { ...source, transactionGroups: [group] };
    const updated = planCommand(document, { id: commandId("txn_group_clear_color"), type: "transactionGroup.update", groupId: group.id, name: "DRAM", order: 3, color: "" });
    expect(updated).toMatchObject({ ok: true });
    if (!updated.ok) return;
    expect(updated.document.transactionGroups?.[0]).toEqual({ id: group.id, name: "DRAM", order: 3 });
  });
  it("validates suppressed clock slots relative to a delayed generator start", () => {
    const source = canonicalFixture();
    const clock = source.signals[0] as ClockSignal;
    const document = { ...source, timeline: { ...source.timeline, end: 10, cycleCount: 10 }, signals: [{ ...clock, generator: { ...clock.generator, start: 4, period: 2, suppressedPeriods: [1] } }, ...source.signals.slice(1)] };
    const valid = planCommand(document, { id: commandId("cmd_delayed_suppression_valid"), type: "signal.updateClockGenerator", signalId: clock.id, generator: { ...clock.generator, start: 4, period: 2, suppressedPeriods: [0, 2] } });
    expect(valid.ok).toBe(true);
    const invalid = planCommand(document, { id: commandId("cmd_delayed_suppression_invalid"), type: "signal.updateClockGenerator", signalId: clock.id, generator: { ...clock.generator, start: 4, period: 2, suppressedPeriods: [3] } });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_SUPPRESSED_PERIODS" }] });
  });

  it("exposes an exhaustive, typed command-policy code inventory", () => {
    expect(commandPolicyDescriptors()).toHaveLength(commandPolicyCodes().length);
    expect(new Set(commandPolicyDescriptors().map((descriptor) => descriptor.code)).size).toBe(commandPolicyCodes().length);
    expect(commandPolicyDescriptors().every((descriptor) => descriptor.layer === "command-policy" && descriptor.ruleVersion === 1)).toBe(true);
    expect(commandPolicyDescriptors().find((descriptor) => descriptor.code === "NO_OP")?.outcome).toBe("no-op");
  });

  it("replaces a validated JSON document as one canonical operation", () => {
    const source = canonicalFixture();
    const next = { ...source, document: { ...source.document, title: "JSON Edited" } };
    const plan = planCommand(source, { id: commandId("cmd_json_replace"), type: "document.replace", document: next });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changeSet).toMatchObject({ fullDocumentReplace: true, timelineSemantics: true });
    const session = new CommandHistorySession(source);
    expect(session.execute({ id: commandId("cmd_json_replace_execute"), type: "document.replace", document: next }).ok).toBe(true);
    expect(session.getSnapshot().document.document.title).toBe("JSON Edited");
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.document.title).toBe(source.document.title);
  });

  it("treats property-order-only document replacement as a semantic no-op", () => {
    const source = canonicalFixture();
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, entry]) => [key, reorder(entry)]));
      }
      return value;
    };
    const session = new CommandHistorySession(source);
    const before = session.getSnapshot();
    const metrics = session.metrics();
    const result = session.execute({ id: commandId("cmd_json_property_order_noop"), type: "document.replace", document: reorder(source) as ReturnType<typeof canonicalFixture> });
    expect(result).toMatchObject({ ok: false, reason: "no-op", problems: [{ code: "NO_OP" }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual(metrics);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0, dirty: false });
  });

  it("validates a document replacement only at the authoritative commit boundary", () => {
    const source = canonicalFixture();
    const next = { ...source, document: { ...source.document, title: "Validated at commit" } };
    const session = new CommandHistorySession(source);
    const before = session.metrics();
    expect(session.execute({ id: commandId("cmd_json_single_validation"), type: "document.replace", document: next }).ok).toBe(true);
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
  });

  it("rejects an invalid replacement atomically with one validation result", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const before = session.getSnapshot();
    const metrics = session.metrics();
    const invalid = { ...source, signalGroups: [] };
    const result = session.execute({ id: commandId("cmd_json_invalid_replace"), type: "document.replace", document: invalid });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: expect.any(Array) });
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual({ validationRuns: metrics.validationRuns + 1, commits: metrics.commits });
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0, dirty: false });
  });

  it("does not dereference malformed replacement rows before validation", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const before = session.getSnapshot();
    const result = session.execute({ id: commandId("cmd_json_malformed_replace"), type: "document.replace", document: { ...source, signalGroups: undefined } as never });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: expect.any(Array) });
    expect(session.getSnapshot()).toBe(before);
  });

  it("updates Header and Footer metadata as one non-waveform operation", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_metadata"), type: "document.updateMetadata", title: "Timing Review", header: { ...source.document.header, subtitle: "Reviewed timing", constraints: ["Setup must hold"] }, footer: { ...source.document.footer, figureNumber: "Fig. 2", revision: "R3", text: "Internal review" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toEqual({});
    expect(session.getSnapshot().document.document).toMatchObject({ title: "Timing Review", header: { subtitle: "Reviewed timing", constraints: ["Setup must hold"] }, footer: { figureNumber: "Fig. 2", revision: "R3", text: "Internal review" } });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.document).toEqual(source.document);
  });

  it("updates global row layout with targeted screen-Y invalidation and exact Undo", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const layout = { ...source.layout, roleColumnWidth: 74, signalNameWidth: 224, signalNameAlign: "center" as const, overflow: "wrap" as const, rowHeight: 36, signalSpacing: 8 };
    const result = session.execute({ id: commandId("cmd_layout"), type: "document.updateLayout", layout });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toMatchObject({ geometryScreenY: ["sig_clk", "sig_data"], minimapOverview: true });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
    expect(session.getSnapshot().document.layout).toEqual(layout);
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.layout).toEqual(source.layout);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.layout).toEqual(layout);
  });

  it("updates timing check categories through one undoable document command", () => {
    const source = canonicalFixture();
    const data = source.signals[1]!;
    if (data.type !== "bus") throw new Error("fixture DATA must be a bus");
    const document = { ...source, signals: source.signals.map((signal) => signal.id === data.id ? { ...data, values: [{ start: 1, value: "X" }] } : signal) };
    const session = new CommandHistorySession(document);
    expect(deriveTimingDiagnostics(session.getSnapshot().document).some((item) => item.category === "unknown-value")).toBe(true);

    const result = session.execute({ id: commandId("cmd_check_settings"), type: "document.updateCheckSettings", checkSettings: { enabledCategories: ["protocol"] } });
    expect(result).toMatchObject({ ok: true, changeSet: {} });
    expect(session.getSnapshot().document.checkSettings).toEqual({ enabledCategories: ["protocol"] });
    expect(deriveTimingDiagnostics(session.getSnapshot().document).some((item) => item.category === "unknown-value")).toBe(false);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0, dirty: true });
    const reopened = parseDocument(serializeValidatedCanonicalDocument(session.getSnapshot().document));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document.checkSettings).toEqual({ enabledCategories: ["protocol"] });

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.checkSettings).toEqual(document.checkSettings);
    expect(deriveTimingDiagnostics(session.getSnapshot().document).some((item) => item.category === "unknown-value")).toBe(true);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.checkSettings).toEqual({ enabledCategories: ["protocol"] });
  });

  it("rejects unsupported or duplicate check categories and canonicalizes all-enabled defaults", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const invalidUnknown = session.execute({ id: commandId("cmd_check_unknown"), type: "document.updateCheckSettings", checkSettings: { enabledCategories: ["made-up"] } });
    expect(invalidUnknown).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_CHECK_SETTINGS" }] });
    const invalidDuplicate = session.execute({ id: commandId("cmd_check_duplicate"), type: "document.updateCheckSettings", checkSettings: { enabledCategories: ["protocol", "protocol"] } });
    expect(invalidDuplicate).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_CHECK_SETTINGS" }] });
    const invalidMissingSettings = session.execute({ id: commandId("cmd_check_missing"), type: "document.updateCheckSettings" } as never);
    expect(invalidMissingSettings).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_CHECK_SETTINGS" }] });
    const allEnabled = session.execute({ id: commandId("cmd_check_all"), type: "document.updateCheckSettings", checkSettings: { enabledCategories: [...TIMING_DIAGNOSTIC_CATEGORIES] } });
    expect(allEnabled).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.getSnapshot().document.checkSettings).toEqual(source.checkSettings);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("updates Legend presentation without touching waveform domains", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_legend"), type: "legend.update", legend: { ...source.legend, show: true, orientation: "vertical", usedRolesOnly: false } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toEqual({});
    expect(session.getSnapshot().document.legend).toMatchObject({ show: true, orientation: "vertical", usedRolesOnly: false });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.legend).toEqual(source.legend);
  });

  it("edits a Transaction through semantic commands and one-entry History", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const transactionId = "txn_read" as TransactionId;
    expect(session.execute({ id: commandId("cmd_txn_create"), type: "transaction.create", transaction: { id: transactionId, name: "DMA Read", start: 1, end: 4, laneId: "lane_0", linkedSignals: ["sig_data" as SignalId] } }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_move"), type: "transaction.move", transactionId, start: 2 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_resize"), type: "transaction.resize", transactionId, edge: "end", value: 7 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_lane"), type: "transaction.moveLane", transactionId, laneId: "lane_1" }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_txn_unlink"), type: "transaction.unlinkSignal", transactionId, signalId: "sig_data" as SignalId }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ start: 2, end: 7, laneId: "lane_1", linkedSignals: [] });
    expect(session.historyState().undoDepth).toBe(5);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]?.linkedSignals).toEqual(["sig_data"]);
  });

  it("updates all Transaction inspector fields atomically", () => {
    const document = canonicalFixture();
    document.transactions = [{ id: "txn_atomic" as TransactionId, name: "Old", start: 1, end: 3, laneId: "lane_0" }];
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: commandId("cmd_txn_atomic"), type: "transaction.update", transactionId: "txn_atomic" as TransactionId, name: "Updated", start: 2, end: 6, laneId: "lane_2" });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ name: "Updated", start: 2, end: 6, laneId: "lane_2" });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toEqual(document.transactions[0]);
  });
  it("rejects Transaction resize that would clip or remove a Phase", () => {
    const document = canonicalFixture();
    document.timeline = { ...document.timeline, end: 20, cycleCount: 20 };
    document.transactions = [{ id: "txn_phase_resize" as TransactionId, name: "Read", start: 0, end: 20, laneId: "lane_0", phases: [{ name: "Address", start: 0, end: 5 }, { name: "Data", start: 5, end: 15 }, { name: "Response", start: 15, end: 20 }] }];
    const session = new CommandHistorySession(document);
    const rejected = session.execute({ id: commandId("cmd_resize_phase_reject"), type: "transaction.resize", transactionId: "txn_phase_resize" as TransactionId, edge: "start", value: 8 });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_TRANSACTION_PHASE" }] });
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.historyState().undoDepth).toBe(0);
  });

  it("follows an edge-attached Phase and keeps the resize as one undoable change", () => {
    const document = canonicalFixture();
    document.timeline = { ...document.timeline, end: 20, cycleCount: 20 };
    document.transactions = [{ id: "txn_phase_resize_end" as TransactionId, name: "Read", start: 2, end: 18, laneId: "lane_0", phases: [{ name: "Address", start: 2, end: 5 }, { name: "Data", start: 5, end: 15 }, { name: "Response", start: 15, end: 18 }] }];
    const session = new CommandHistorySession(document);
    const acceptedEnd = session.execute({ id: commandId("cmd_resize_phase_end_follow"), type: "transaction.resize", transactionId: "txn_phase_resize_end" as TransactionId, edge: "end", value: 16 });
    expect(acceptedEnd.ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ end: 16, phases: [{ name: "Address", start: 2, end: 5 }, { name: "Data", start: 5, end: 15 }, { name: "Response", start: 15, end: 16 }] });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    const accepted = session.execute({ id: commandId("cmd_resize_phase_expand"), type: "transaction.resize", transactionId: "txn_phase_resize_end" as TransactionId, edge: "start", value: 0 });
    expect(accepted.ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ start: 0, end: 18, phases: [{ name: "Address", start: 0, end: 5 }, { name: "Data", start: 5, end: 15 }, { name: "Response", start: 15, end: 18 }] });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toEqual(document.transactions[0]);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ start: 0, end: 18 });
  });

  it("allows gap-only edge resize and rejects interior Phase boundary crossing", () => {
    const document = canonicalFixture();
    document.timeline = { ...document.timeline, end: 30, cycleCount: 30 };
    document.transactions = [{ id: "txn_phase_gaps" as TransactionId, name: "Read", start: 0, end: 25, laneId: "lane_0", phases: [{ name: "Data", start: 5, end: 10 }, { name: "Response", start: 15, end: 20 }] }];
    const session = new CommandHistorySession(document);
    expect(session.execute({ id: commandId("cmd_resize_gap_start"), type: "transaction.resize", transactionId: "txn_phase_gaps" as TransactionId, edge: "start", value: 3 }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ start: 3, end: 25, phases: document.transactions[0]!.phases });
    expect(session.execute({ id: commandId("cmd_resize_gap_end"), type: "transaction.resize", transactionId: "txn_phase_gaps" as TransactionId, edge: "end", value: 22 }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toMatchObject({ start: 3, end: 22, phases: document.transactions[0]!.phases });
    const before = session.getSnapshot().document;
    const rejected = session.execute({ id: commandId("cmd_resize_interior_boundary"), type: "transaction.resize", transactionId: "txn_phase_gaps" as TransactionId, edge: "start", value: 6 });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_TRANSACTION_PHASE" }] });
    expect(session.getSnapshot().document).toEqual(before);
  });

  it("preserves omitted Transaction fields and supports explicit clears", () => {
    const document = canonicalFixture();
    const original = {
      id: "txn_partial" as TransactionId, name: "Original", start: 1, end: 4, laneId: "lane_1",
      linkedSignals: ["sig_data" as SignalId], groupId: "txn_group_main" as never, color: "#ff0000", description: "Keep me",
      phases: [{ name: "Data", start: 1, end: 3 }], category: "read", style: { emphasis: "strong" }, metadata: { owner: "test" }, links: { ticket: "T-1" },
    } as const;
    document.transactionGroups = [{ id: original.groupId, name: "Main", color: "#112233", order: 0 }];
    document.transactions = [original];
    const session = new CommandHistorySession(document);
    expect(session.execute({ id: commandId("cmd_partial_start"), type: "transaction.update", transactionId: original.id, name: original.name, start: 1, end: 5 }).ok).toBe(true);
    const updated = session.getSnapshot().document.transactions[0]!;
    expect(updated).toEqual({ ...original, end: 5 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toEqual(original);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toEqual({ ...original, end: 5 });
    expect(session.execute({ id: commandId("cmd_partial_clear"), type: "transaction.update", transactionId: original.id, name: "Original", start: 1, end: 5, clearGroupId: true, clearColor: true, clearDescription: true, clearPhases: true }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]).toEqual({ id: original.id, name: original.name, start: 1, end: 5, laneId: original.laneId, linkedSignals: original.linkedSignals, category: original.category, style: original.style, metadata: original.metadata, links: original.links });
  });

  it("creates, edits, deletes, and restores a Comment Row through explicit commands", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const commentRow: CommentRow = { id: "comment_review" as SignalId, type: "commentRow", name: "Review", role: "internal", source: { instancePath: [], signalName: "review" }, display: { name: "Review" }, title: "Review", body: "Initial" };
    expect(session.execute({ id: commandId("cmd_comment_create"), type: "commentRow.create", commentRow, targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_comment_update"), type: "commentRow.update", signalId: commentRow.id, title: "Notes", body: "Updated body", spacingBefore: 3, spacingAfter: 5 }).ok).toBe(true);
    expect(session.getSnapshot().document.signals.at(-1)).toMatchObject({ title: "Notes", body: "Updated body", spacingBefore: 3, spacingAfter: 5, display: { name: "Notes" } });
    expect(session.execute({ id: commandId("cmd_comment_delete"), type: "commentRow.delete", signalId: commentRow.id }).ok).toBe(true);
    expect(session.historyState().undoDepth).toBe(3);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.at(-1)).toMatchObject({ id: commentRow.id, title: "Notes" });
  });

  it("rejects an empty-title Comment Row update atomically, leaving document and History untouched", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const commentRow: CommentRow = { id: "comment_atomic" as SignalId, type: "commentRow", name: "Note", role: "internal", source: { instancePath: [], signalName: "note" }, display: { name: "Note" }, title: "Note", body: "Body" };
    expect(session.execute({ id: commandId("cmd_comment_create_reject"), type: "commentRow.create", commentRow, targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    const before = session.getSnapshot();
    const result = session.execute({ id: commandId("cmd_comment_reject"), type: "commentRow.update", signalId: commentRow.id, title: "   ", body: "Changed" });
    expect(result.ok).toBe(false);
    expect(session.getSnapshot().document).toBe(before.document);
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("unlinks deleted Signals while retaining their Transactions", () => {
    const document = { ...canonicalFixture(), transactions: [{ id: "txn_link" as TransactionId, name: "Linked", start: 1, end: 3, linkedSignals: ["sig_data" as SignalId] }] };
    const plan = planCommand(document, { id: commandId("cmd_delete_linked"), type: "signal.delete", signalId: "sig_data" as SignalId });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.document.transactions).toEqual([{ id: "txn_link", name: "Linked", start: 1, end: 3, linkedSignals: [] }]);
  });

  it("converts a Clock to value signals while preserving identity and exact Undo", () => {
    const source = canonicalFixture();
    const clock = source.signals[0] as ClockSignal;
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_convert_clock"), type: "signal.convertClock", signalId: clock.id, targetType: "bus" });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.signals[0]).toMatchObject({ id: clock.id, type: "bus", role: clock.role, source: clock.source, values: [{ start: 0, value: "00" }], width: 8, displayFormat: "hex" });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[0]).toEqual(clock);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[0]).toMatchObject({ id: clock.id, type: "bus", values: [{ start: 0, value: "00" }] });
    const invalid = planCommand(source, { id: commandId("cmd_convert_non_clock"), type: "signal.convertClock", signalId: source.signals[1]!.id, targetType: "binary" });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "SIGNAL_NOT_CLOCK" }] });
  });

  it("rejects deletion of a Signal referenced only by a Ghost Trace source", () => {
    const sourceSignalId = "sig_data" as SignalId;
    const ghost: Annotation = {
      id: "ann_ghost_source_only" as AnnotationId,
      type: "ghostTrace",
      label: "Previous data",
      visible: true,
      sourceSignalId,
      traceOffsetCycles: -1,
      opacity: 0.5,
      start: { signalId: "sig_clk" as SignalId, cycle: 1, point: "cycle-start" },
      end: { signalId: "sig_clk" as SignalId, cycle: 4, point: "cycle-end" },
    };
    const source = { ...canonicalFixture(), annotations: [ghost] };
    const session = new CommandHistorySession(source);
    const before = session.getSnapshot();
    const result = session.execute({ id: commandId("cmd_delete_ghost_source"), type: "signal.delete", signalId: sourceSignalId });

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SIGNAL_HAS_DEPENDENTS", path: "$.signalId", message: "Signal has annotation dependents: ann_ghost_source_only." })]));
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 0, dirty: false });
  });

  it("allows hiding the reference Clock without changing its semantic identity", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_hide_reference"), type: "signal.setVisibility", signalId: "sig_clk" as SignalId, visible: false });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe("sig_clk");
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_clk")?.display.visible).toBe(false);
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_clk")?.display.visible).not.toBe(false);
  });

  it("deletes the current reference Clock into clockless mode as one atomic operation", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const result = session.execute({ id: commandId("cmd_delete_reference"), type: "signal.delete", signalId: "sig_clk" as SignalId });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet).toMatchObject({ timelineSemantics: true, geometryScreenX: true, removedSignals: ["sig_clk"] });
    expect(session.getSnapshot().document.timeline).not.toHaveProperty("referenceClock");
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe("sig_clk");
    expect(session.getSnapshot().document.signals.some((signal) => signal.id === "sig_clk")).toBe(true);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBeUndefined();
    expect(session.getSnapshot().document.signals.some((signal) => signal.id === "sig_clk")).toBe(false);
  });

  it("keeps the reference Clock identity when moving it between Groups", () => {
    const source = canonicalFixture();
    const targetGroupId = "grp_clock_target" as GroupId;
    const document = {
      ...source,
      signalGroups: [
        { ...source.signalGroups[0]!, rows: ["sig_clk" as SignalId, "sig_data" as SignalId] },
        { id: targetGroupId, name: "Clock Group", rows: [] },
      ],
    };
    const session = new CommandHistorySession(document);

    expect(session.execute({ id: commandId("cmd_move_reference_clock"), type: "signal.move", signalId: "sig_clk" as SignalId, targetGroupId, index: 0 }).ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe("sig_clk");
    expect(session.getSnapshot().document.signalGroups[1]?.rows).toEqual(["sig_clk"]);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0 });

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe("sig_clk");
    expect(session.getSnapshot().document.signalGroups[0]?.rows).toEqual(["sig_clk", "sig_data"]);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe("sig_clk");
    expect(session.getSnapshot().document.signalGroups[1]?.rows).toEqual(["sig_clk"]);
  });

  it("switches or clears the optional reference Clock through a semantic command", () => {
    const source = canonicalFixture();
    const second = { ...source.signals[0]!, id: "sig_clk_b" as SignalId, name: "CLK_B", source: { ...source.signals[0]!.source, signalName: "CLK_B" }, display: { name: "CLK_B" } };
    const document = { ...source, signals: [...source.signals, second], signalGroups: [{ ...source.signalGroups[0]!, rows: [...source.signalGroups[0]!.rows, second.id] }] };
    const session = new CommandHistorySession(document);
    expect(session.execute({ id: commandId("cmd_switch_reference"), type: "timeline.setReferenceClock", referenceClock: second.id }).ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe(second.id);
    expect(session.execute({ id: commandId("cmd_clear_reference"), type: "timeline.setReferenceClock" }).ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBeUndefined();
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.timeline.referenceClock).toBe(second.id);
  });
  it("plans one-signal edits without mutating the source", () => {
    const source = canonicalFixture();
    const before = JSON.stringify(source);
    const plan = planCommand(source, { id: commandId("cmd_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" });
    expect(plan.ok).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    if (!plan.ok) return;
    expect(plan.changeSet).toMatchObject({ waveSemantics: ["sig_data"], geometryLocal: ["sig_data"], geometryScreenX: true });
    expect(plan.changeSet.rowOrder).toBeUndefined();
  });

  it("allocates value-change identity independently of mutable Start", () => {
    const source = canonicalFixture();
    const created = planCommand(source, { id: commandId("cmd_create_value_identity"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const createdValues = (created.document.signals.find((signal) => signal.id === "sig_data") as ValueSignal).values;
    const createdId = createdValues.find((change) => change.start === 2)?.id;
    expect(createdId).toMatch(/^value_sig_data_/);
    const moved = planCommand(created.document, { id: commandId("cmd_move_value_identity"), type: "signal.replaceValue", signalId: "sig_data" as SignalId, fromStart: 2, start: 5, value: "1F" });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const recreated = planCommand(moved.document, { id: commandId("cmd_recreate_value_identity"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "0F" });
    expect(recreated.ok).toBe(true);
    if (!recreated.ok) return;
    const finalValues = (recreated.document.signals.find((signal) => signal.id === "sig_data") as ValueSignal).values;
    expect(finalValues.find((change) => change.start === 5)?.id).toBe(createdId);
    expect(finalValues.find((change) => change.start === 2)?.id).not.toBe(createdId);
  });

  it("allocates a value-change ID without scanning unrelated Signals", () => {
    const source = canonicalFixture();
    const target = source.signals.find((signal) => signal.id === "sig_data");
    if (!target || target.type === "clock" || target.type === "commentRow") throw new Error("Expected a target value Signal in the fixture.");
    const unrelated = { ...target, id: "sig_other" as SignalId, display: { ...target.display, name: "Other" } };
    const values = new Proxy(unrelated.values, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) throw new Error("Unrelated Signal values were scanned during ID allocation.");
        return Reflect.get(target, property, receiver);
      },
    });
    const document = {
      ...source,
      signals: [...source.signals, { ...unrelated, values }],
    } as CanonicalDocument;

    const planned = planCommand(document, { id: commandId("cmd_value_id_scope"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" });

    expect(planned.ok).toBe(true);
    if (planned.ok) {
      const data = planned.document.signals.find((signal) => signal.id === "sig_data");
      expect(data && "values" in data ? data.values.find((change) => change.start === 2)?.id : undefined).toMatch(/^value_sig_data_/);
    }

    const session = new CommandHistorySession(canonicalFixture());
    expect(session.execute({ id: commandId("cmd_value_id_roundtrip"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" }).ok).toBe(true);
    const generatedId = (session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data") as ValueSignal).values.find((change) => change.start === 2)?.id;
    expect(generatedId).toMatch(/^value_sig_data_/);
    expect(session.undo().ok).toBe(true);
    expect(session.redo().ok).toBe(true);
    const redoneId = (session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data") as ValueSignal).values.find((change) => change.start === 2)?.id;
    expect(redoneId).toBe(generatedId);
    const reopened = parseDocument(serializeValidatedCanonicalDocument(session.getSnapshot().document));
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect((reopened.document.signals.find((signal) => signal.id === "sig_data") as ValueSignal).values.find((change) => change.start === 2)?.id).toBe(generatedId);
  });

  it("keeps reorder and visibility out of WaveDrom and Local Geometry domains", () => {
    const source = canonicalFixture();
    const reorder = planCommand(source, { id: commandId("cmd_move"), type: "signal.move", signalId: "sig_data" as SignalId, targetGroupId: "grp_main" as GroupId, index: 0 });
    expect(reorder.ok).toBe(true);
    if (reorder.ok) {
      expect(reorder.document.signalGroups[0]?.rows).toEqual(["sig_data", "sig_clk"]);
      expect(reorder.changeSet.waveSemantics).toBeUndefined();
      expect(reorder.changeSet.geometryLocal).toBeUndefined();
      expect(reorder.changeSet).toMatchObject({ rowOrder: ["sig_clk", "sig_data"], geometryScreenY: ["sig_clk", "sig_data"] });
    }
    const visibility = planCommand(source, { id: commandId("cmd_hide"), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible: false });
    expect(visibility.ok).toBe(true);
    if (visibility.ok) {
      expect(visibility.changeSet.waveSemantics).toBeUndefined();
      expect(visibility.changeSet.geometryLocal).toBeUndefined();
      expect(visibility.changeSet.rowPresentation).toEqual(["sig_data"]);
    }
  });

  it("plans Signal Editor changes with precise render domains", () => {
    const source = canonicalFixture();
    const moved = planCommand(source, { id: commandId("cmd_move_value"), type: "signal.moveValue", signalId: "sig_data" as SignalId, fromStart: 4, toStart: 3 });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect((moved.document.signals[1] as Extract<Signal, { values: unknown }>).values.map((change) => change.start)).toEqual([0, 3]);
      expect(moved.changeSet).toMatchObject({ waveSemantics: ["sig_data"], geometryLocal: ["sig_data"] });
    }
    const replaced = planCommand(source, { id: commandId("cmd_replace_value"), type: "signal.replaceValue", signalId: "sig_data" as SignalId, fromStart: 4, start: 3, value: "0F", comment: "edited" });
    expect(replaced.ok).toBe(true);
    if (replaced.ok) expect((replaced.document.signals[1] as Extract<Signal, { values: unknown }>).values[1]).toMatchObject({ start: 3, value: "0F", comment: "edited", id: expect.any(String) });
    const formatted = planCommand(source, { id: commandId("cmd_format"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA_OUT", role: "output", displayFormat: "binary" });
    expect(formatted.ok).toBe(true);
    if (formatted.ok) {
      expect(formatted.document.signals[1]).toMatchObject({ name: "DATA_OUT", role: "output", displayFormat: "binary", display: { name: "DATA_OUT" } });
      expect(formatted.changeSet).toMatchObject({ rowPresentation: ["sig_data"], waveSemantics: ["sig_data"] });
    }
    const inspectorProperties = planCommand(source, { id: commandId("cmd_inspector_properties"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA_INSPECTED", role: "output", signalType: "bus", width: 16, displayFormat: "binary", visible: false, displayAlign: "center", displayOverflow: "wrap", displayStyle: { color: "#114477" } });
    expect(inspectorProperties.ok).toBe(true);
    if (inspectorProperties.ok) {
      expect(inspectorProperties.document.signals[1]).toMatchObject({ name: "DATA_INSPECTED", role: "output", type: "bus", width: 16, displayFormat: "binary", display: { name: "DATA_INSPECTED", visible: false, align: "center", overflow: "wrap", style: { color: "#114477" } } });
      expect(inspectorProperties.changeSet).toMatchObject({ rowPresentation: ["sig_data"], waveSemantics: ["sig_data"], geometryLocal: ["sig_data"] });
    }
    const spacing = planCommand(source, { id: commandId("cmd_signal_spacing"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA", role: "output", spacingBefore: 3, spacingAfter: 5 });
    expect(spacing.ok).toBe(true);
    if (spacing.ok) {
      expect(spacing.document.signals[1]).toMatchObject({ spacingBefore: 3, spacingAfter: 5 });
      expect(spacing.changeSet).toMatchObject({ rowPresentation: ["sig_data"], geometryScreenY: ["sig_data"] });
      expect(spacing.changeSet.waveSemantics).toBeUndefined();
      expect(spacing.changeSet.geometryLocal).toBeUndefined();
    }
    const retyped = planCommand(source, { id: commandId("cmd_retype"), type: "signal.updateProperties", signalId: "sig_data" as SignalId, name: "DATA", role: "internal", signalType: "binary" });
    expect(retyped.ok).toBe(false);
    if (!retyped.ok) expect(retyped.problems.some((problem) => problem.code === "UNSUPPORTED_SIGNAL_VALUE")).toBe(true);
    const removed = planCommand(source, { id: commandId("cmd_remove_value"), type: "signal.removeValue", signalId: "sig_data" as SignalId, start: 4 });
    expect(removed.ok).toBe(true);
    if (removed.ok) expect((removed.document.signals[1] as Extract<Signal, { values: unknown }>).values).toHaveLength(1);
  });

  it("imports a complete event table as one semantic operation", () => {
    const source = canonicalFixture();
    const session = new CommandHistorySession(source);
    const before = session.metrics();
    const values = [{ start: 0, value: "0" }, { start: 2, value: "1", displayLabel: "READY", comment: "imported" }, { start: 6, value: "0" }];
    const result = session.execute({ id: commandId("cmd_replace_values"), type: "signal.replaceValues", signalId: "sig_data" as SignalId, values });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")?.values).toEqual(values);
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")?.values).toEqual(source.signals.find((signal) => signal.id === "sig_data")?.values);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")?.values).toEqual(values);
  });
});

describe("command execution and atomic history", () => {
  it("performs one validation, one commit, and one history entry per accepted action", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const before = session.metrics();
    const result = session.execute({ id: commandId("cmd_create"), type: "signal.create", signal: extraSignal(), targetGroupId: "grp_main" as GroupId, index: 2 });
    expect(result.ok).toBe(true);
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
    expect(session.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0, dirty: true });
    if (result.ok) expect(result.changeSet).toMatchObject({ addedSignals: ["sig_extra"], rowOrder: ["sig_extra"], waveSemantics: ["sig_extra"] });
  });

  it("restores exact semantics and Dirty through Undo/Redo", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const baseline = JSON.stringify(session.getSnapshot().document);
    expect(session.execute({ id: commandId("cmd_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" }).ok).toBe(true);
    expect(session.historyState().dirty).toBe(true);
    const undo = session.undo();
    expect(undo.ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(baseline);
    expect(session.historyState()).toMatchObject({ canUndo: false, canRedo: true, dirty: false });
    const redo = session.redo();
    expect(redo.ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canUndo: true, canRedo: false, dirty: true });
  });

  it("atomically rejects invalid and no-op commands without changing state or Redo", () => {
    const session = new CommandHistorySession(canonicalFixture());
    expect(session.execute({ id: commandId("cmd_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "RENAMED" }).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    const before = session.getSnapshot();
    const metrics = session.metrics();
    const noOp = session.execute({ id: commandId("cmd_noop"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "DATA" });
    expect(noOp).toMatchObject({ ok: false, reason: "no-op", problems: [{ code: "NO_OP", path: "$", message: "Signal already has this name." }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.metrics()).toEqual(metrics);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
    const invalid = session.execute({ id: commandId("cmd_bad"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1FF" });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "BUS_WIDTH_OVERFLOW", path: "$.signals[1].values[1].value", message: "Value requires 9 bits but signal width is 8." }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
    const invalidId = session.execute({ id: commandId("1 invalid"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "RENAMED" });
    expect(invalidId).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_COMMAND_ID" }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
  });

  it("atomically rejects sized bus literals that exceed the Signal width", () => {
    const source = canonicalFixture();
    const bus = source.signals.find((signal) => signal.id === "sig_data");
    if (!bus || bus.type !== "bus") throw new Error("Canonical fixture must contain its Bus Signal.");
    const narrowBus = { ...bus, width: 4, values: [{ start: 0, value: "0" }, { start: 2, value: "F" }] };
    const document = { ...source, signals: source.signals.map((signal) => signal.id === bus.id ? narrowBus : signal) };
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const historyBefore = session.historyState();

    const rejected = session.execute({ id: commandId("cmd_sized_bus_overflow"), type: "signal.updateValue", signalId: bus.id, start: 0, value: "8'hFF" });

    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "BUS_WIDTH_OVERFLOW" }] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });

  it("keeps Event data values and Pulse logic values type-safe on atomic edits", () => {
    const source = canonicalFixture();
    const event: Signal = { id: "sig_event" as SignalId, name: "EVENT", type: "event", role: "internal", source: { instancePath: [], signalName: "EVENT" }, display: { name: "EVENT" }, values: [{ start: 0, value: "NONE" }] };
    const pulse: Signal = { id: "sig_pulse" as SignalId, name: "PULSE", type: "pulse", role: "internal", source: { instancePath: [], signalName: "PULSE" }, display: { name: "PULSE" }, values: [{ start: 0, value: 0 }] };
    const document = { ...source, signals: [...source.signals, event, pulse], signalGroups: source.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, event.id, pulse.id] } : group) };
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const invalidEvent = session.execute({ id: commandId("cmd_event_empty"), type: "signal.updateValue", signalId: event.id, start: 1, value: "" });
    expect(invalidEvent).toMatchObject({ ok: false, reason: "invalid" });
    const invalidPulse = session.execute({ id: commandId("cmd_pulse_invalid"), type: "signal.updateValue", signalId: pulse.id, start: 1, value: "2" });
    expect(invalidPulse).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });

  it("commits a valid batch once and rejects a failing batch as a whole", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const beforeMetrics = session.metrics();
    const commands: SemanticCommand[] = [
      { id: commandId("cmd_batch_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "RENAMED" },
      { id: commandId("cmd_batch_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1F" },
    ];
    expect(session.executeBatch(commandId("cmd_batch"), commands).ok).toBe(true);
    expect(session.metrics()).toEqual({ validationRuns: beforeMetrics.validationRuns + 1, commits: beforeMetrics.commits + 1 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signals[1]).toMatchObject({ name: "DATA", values: [{ start: 0 }, { start: 4 }] });

    const beforeRejected = session.getSnapshot();
    const rejectedMetrics = session.metrics();
    const rejected: SemanticCommand[] = [
      { id: commandId("cmd_reject_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "SHOULD_NOT_COMMIT" },
      { id: commandId("cmd_reject_value"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "1FF" },
    ];
    expect(session.executeBatch(commandId("cmd_rejected_batch"), rejected)).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot()).toBe(beforeRejected);
    expect(session.metrics()).toEqual({ validationRuns: rejectedMetrics.validationRuns + 1, commits: rejectedMetrics.commits });
  });

  it("bulk-registers signals with preserved hardware paths in one history entry", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const first = extraSignal("sig_bulk_status");
    const second = { ...extraSignal("sig_bulk_data"), source: { instancePath: ["dut", "core"], signalName: "data" } } as Signal;
    const before = session.metrics();
    expect(session.execute({ id: commandId("cmd_bulk_register"), type: "signal.bulkCreate", signals: [first, second], targetGroupId: "grp_main" as GroupId, index: 2 })).toMatchObject({ ok: true });
    expect(session.metrics()).toEqual({ validationRuns: before.validationRuns + 1, commits: before.commits + 1 });
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === second.id)?.source.instancePath).toEqual(["dut", "core"]);
    expect(session.undo()).toMatchObject({ ok: true });
    expect(session.getSnapshot().document.signals.some((signal) => signal.id === first.id)).toBe(false);
  });

  it("supports Group lifecycle without implicitly moving rows", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const group = { id: "grp_empty" as GroupId, name: "Empty", rows: [] };
    expect(session.execute({ id: commandId("cmd_group_create"), type: "group.create", group, index: 1 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_group_rename"), type: "group.rename", groupId: group.id, name: "Renamed" }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_group_move"), type: "group.move", groupId: group.id, index: 0 }).ok).toBe(true);
    expect(session.execute({ id: commandId("cmd_group_delete"), type: "group.delete", groupId: group.id }).ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups.map((item) => item.id)).toEqual(["grp_main"]);
  });

  it("preserves signal source hierarchy and role when moving its group", () => {
    const source = canonicalFixture();
    const signal = { ...source.signals[1]!, role: "output" as const, source: { instancePath: ["dut", "core"], signalName: "payload" } };
    const document = {
      ...source,
      signals: [source.signals[0]!, signal],
      signalGroups: [
        { ...source.signalGroups[0]!, rows: [signal.id] },
        { id: "grp_tail" as GroupId, name: "Tail", rows: [source.signals[0]!.id] },
      ],
    };
    const session = new CommandHistorySession(document);
    expect(session.execute({ id: commandId("cmd_move_hierarchy_group"), type: "group.move", groupId: "grp_main" as GroupId, index: 1 })).toMatchObject({ ok: true });
    expect(session.getSnapshot().document.signals.find((item) => item.id === signal.id)).toMatchObject({
      role: "output",
      source: { instancePath: ["dut", "core"], signalName: "payload" },
    });
  });

  it("supports Signal create/delete and resets the clean and Redo baselines correctly", () => {
    const session = new CommandHistorySession(canonicalFixture());
    expect(session.execute({ id: commandId("cmd_create_delete"), type: "signal.create", signal: extraSignal(), targetGroupId: "grp_main" as GroupId, index: 2 }).ok).toBe(true);
    session.markClean();
    expect(session.historyState().dirty).toBe(false);
    expect(session.execute({ id: commandId("cmd_delete"), type: "signal.delete", signalId: "sig_extra" as SignalId }).ok).toBe(true);
    expect(session.historyState().dirty).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canRedo: true, dirty: false });
    expect(session.execute({ id: commandId("cmd_hide_after_undo"), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible: false }).ok).toBe(true);
    expect(session.historyState()).toMatchObject({ canRedo: false, redoDepth: 0, dirty: true });
  });

  it("changes group spacing as Screen Y only and reprojects dependent Annotations", () => {
    const document = canonicalFixture();
    document.annotations = [{ id: "ann_spacing" as AnnotationId, type: "text", label: "Data", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 2, point: "value-start" } }];
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: commandId("cmd_group_spacing"), type: "group.updateLayout", groupId: "grp_main" as GroupId, spacingBefore: 7, spacingAfter: 11 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toMatchObject({ geometryScreenY: ["sig_clk", "sig_data"], annotationPosition: ["ann_spacing"] });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
  });

  it("applies Group presentation properties in one canonical commit", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const result = session.execute({ id: commandId("cmd_group_properties"), type: "group.updateProperties", groupId: "grp_main" as GroupId, name: "Main Signals", spacingBefore: 3, spacingAfter: 9, style: { showBackground: true, background: "#eef5fc", opacity: 0.8, extend: "both", border: "#aaccee", showHeader: true } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toMatchObject({ geometryScreenY: ["sig_clk", "sig_data"], minimapOverview: true });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
    expect(session.getSnapshot().document.signalGroups[0]).toMatchObject({ name: "Main Signals", spacingBefore: 3, spacingAfter: 9, style: { showBackground: true, opacity: 0.8 } });
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("creates, resizes, deletes and undoes a stable Spacer row with targeted Y invalidation", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const spacerId = "spacer_test" as SpacerId;
    const created = session.execute({ id: commandId("cmd_spacer_create"), type: "spacer.create", spacer: { id: spacerId, height: 18 }, targetGroupId: "grp_main" as GroupId, index: 1 });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.changeSet).toMatchObject({ rowOrder: [spacerId], geometryScreenY: ["sig_data"], minimapOverview: true });
    expect(session.getSnapshot().document.signalGroups[0]).toMatchObject({ rows: ["sig_clk", spacerId, "sig_data"], spacers: [{ id: spacerId, height: 18 }] });
    expect(session.execute({ id: commandId("cmd_spacer_update"), type: "spacer.update", spacerId, height: 42 }).ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]?.spacers?.[0]?.height).toBe(42);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]?.spacers?.[0]?.height).toBe(18);
    const historyBeforeInvalid = session.historyState().undoDepth;
    const rejectedHeight = session.execute({ id: commandId("cmd_spacer_update_invalid"), type: "spacer.update", spacerId, height: 0 });
    expect(rejectedHeight).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.historyState().undoDepth).toBe(historyBeforeInvalid);
    expect(session.getSnapshot().document.signalGroups[0]?.spacers?.[0]?.height).toBe(18);
    const moved = session.execute({ id: commandId("cmd_spacer_move"), type: "spacer.move", spacerId, targetGroupId: "grp_main" as GroupId, index: 0 });
    expect(moved.ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]?.rows).toEqual([spacerId, "sig_clk", "sig_data"]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]?.rows).toEqual(["sig_clk", spacerId, "sig_data"]);
    const rejectedMove = session.execute({ id: commandId("cmd_spacer_move_invalid"), type: "spacer.move", spacerId, targetGroupId: "grp_missing" as GroupId, index: 0 });
    expect(rejectedMove).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.execute({ id: commandId("cmd_spacer_delete"), type: "spacer.delete", spacerId }).ok).toBe(true);
    expect(session.getSnapshot().document.signalGroups[0]).toMatchObject({ rows: ["sig_clk", "sig_data"] });
    expect(session.getSnapshot().document.signalGroups[0]).not.toHaveProperty("spacers");
  });

  it("updates Transaction phases atomically and rejects phases outside the transaction", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const created = session.execute({ id: commandId("cmd_txn_phase_create"), type: "transaction.create", transaction: { id: "txn_phase" as TransactionId, name: "Transfer", start: 2, end: 8 } });
    expect(created.ok).toBe(true);
    const result = session.execute({ id: commandId("cmd_txn_phase_update"), type: "transaction.update", transactionId: "txn_phase" as TransactionId, name: "Transfer", start: 2, end: 8, phases: [{ name: "Address", start: 2, end: 4 }, { name: "Data", start: 4, end: 7 }] });
    expect(result.ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]?.phases).toEqual([{ name: "Address", start: 2, end: 4 }, { name: "Data", start: 4, end: 7 }]);
    expect(session.historyState().undoDepth).toBe(2);
    const rejected = session.execute({ id: commandId("cmd_txn_phase_invalid"), type: "transaction.update", transactionId: "txn_phase" as TransactionId, name: "Transfer", start: 2, end: 8, phases: [{ name: "Bad", start: 1, end: 3 }] });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("duplicates a Transaction with a fresh stable ID and supports atomic phase CRUD", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const transactionId = "txn_crud" as TransactionId;
    expect(session.execute({ id: commandId("txn_crud_create"), type: "transaction.create", transaction: { id: transactionId, name: "Read", start: 1, end: 8, phases: [{ name: "Address", start: 1, end: 3 }] } }).ok).toBe(true);
    expect(session.execute({ id: commandId("txn_duplicate"), type: "transaction.duplicate", transactionId, newTransactionId: "txn_copy" as TransactionId }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions.map((item) => item.id)).toEqual([transactionId, "txn_copy"]);
    expect(session.getSnapshot().document.transactions[1]?.phases).toEqual([{ name: "Address", start: 1, end: 3 }]);
    expect(session.execute({ id: commandId("txn_phase_add"), type: "transaction.phaseAdd", transactionId, phase: { name: "Data", start: 3, end: 6 } }).ok).toBe(true);
    expect(session.execute({ id: commandId("txn_phase_update"), type: "transaction.phaseUpdate", transactionId, phaseIndex: 0, phase: { name: "Setup", start: 1, end: 2 } }).ok).toBe(true);
    expect(session.execute({ id: commandId("txn_phase_delete"), type: "transaction.phaseDelete", transactionId, phaseIndex: 1 }).ok).toBe(true);
    expect(session.getSnapshot().document.transactions[0]?.phases).toEqual([{ name: "Setup", start: 1, end: 2 }]);
    const before = session.getSnapshot().document;
    expect(session.execute({ id: commandId("txn_phase_overlap"), type: "transaction.phaseAdd", transactionId, phase: { name: "Bad", start: 1, end: 4 } })).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.historyState().undoDepth).toBe(5);
  });

  it("rejects invalid Transaction links and overlapping phases atomically at command planning", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const before = session.getSnapshot().document;
    expect(session.execute({ id: commandId("txn_invalid_link"), type: "transaction.create", transaction: { id: "txn_invalid_link" as TransactionId, name: "Bad", start: 1, end: 5, linkedSignals: ["sig_missing" as SignalId] } })).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.execute({ id: commandId("txn_invalid_phases"), type: "transaction.create", transaction: { id: "txn_invalid_phases" as TransactionId, name: "Bad", start: 1, end: 5, phases: [{ name: "A", start: 1, end: 4 }, { name: "B", start: 3, end: 5 }] } })).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.historyState().undoDepth).toBe(0);
  });

  it("updates Clock Edge Numbers as presentation-only state", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const result = session.execute({ id: commandId("cmd_edge_numbers"), type: "signal.updateEdgeCounter", signalId: "sig_clk" as SignalId, edgeCounter: { show: true, mode: "rising", startNumber: 4, countFrom: "signal-start", labelEvery: 2, position: "above", offset: { x: 1, y: -8 } } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet).toEqual({ rowPresentation: ["sig_clk"], edgeCounter: ["sig_clk"] });
      expect(result.changeSet.waveSemantics).toBeUndefined();
      expect(result.changeSet.geometryLocal).toBeUndefined();
    }
    expect(session.getSnapshot().document.signals[0]).toMatchObject({ edgeCounter: { show: true, mode: "rising", labelEvery: 2 } });
  });

  it("atomically rejects invalid Edge Counter enums and booleans", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const before = session.getSnapshot().document;
    const rejected = session.execute({ id: commandId("cmd_edge_numbers_invalid_shape"), type: "signal.updateEdgeCounter", signalId: "sig_clk" as SignalId, edgeCounter: { ...before.signals[0]!.edgeCounter, show: "yes" as unknown as boolean, mode: "sideways" as "rising", countFrom: "unknown" as "signal-start", position: "middle" as "above" } });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.historyState().undoDepth).toBe(0);
  });

  it("requires an existing explicit Bookmark for marker count-from", () => {
    const base = canonicalFixture();
    const bookmark = { id: "bookmark_edge" as BookmarkId, name: "Edge origin", start: 4 };
    const session = new CommandHistorySession({ ...base, bookmarks: [bookmark] });
    const before = session.getSnapshot().document;
    const missing = session.execute({ id: commandId("cmd_edge_marker_missing"), type: "signal.updateEdgeCounter", signalId: "sig_clk" as SignalId, edgeCounter: { ...before.signals[0]!.edgeCounter, show: true, countFrom: "marker" } });
    expect(missing).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "MISSING_CROSS_REFERENCE", path: "$.edgeCounter.anchorId" }] });
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.historyState().undoDepth).toBe(0);

    const accepted = session.execute({ id: commandId("cmd_edge_marker_valid"), type: "signal.updateEdgeCounter", signalId: "sig_clk" as SignalId, edgeCounter: { ...before.signals[0]!.edgeCounter, show: true, countFrom: "marker", anchorId: bookmark.id } });
    expect(accepted.ok).toBe(true);
    expect(session.getSnapshot().document.signals[0]).toMatchObject({ edgeCounter: { countFrom: "marker", anchorId: bookmark.id } });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);

    const restored = session.execute({ id: commandId("cmd_edge_marker_restore"), type: "signal.updateEdgeCounter", signalId: "sig_clk" as SignalId, edgeCounter: { ...before.signals[0]!.edgeCounter, show: true, countFrom: "marker", anchorId: bookmark.id } });
    expect(restored.ok).toBe(true);
    const deleteReferenced = session.execute({ id: commandId("cmd_edge_marker_delete_referenced"), type: "bookmark.delete", bookmarkId: bookmark.id });
    expect(deleteReferenced).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "MISSING_CROSS_REFERENCE" }] });
    expect(session.getSnapshot().document.bookmarks).toEqual([bookmark]);
  });

  it("supports Annotation lifecycle, anchors, label offsets, and style domains", () => {
    const session = new CommandHistorySession(canonicalFixture());
    const annotation = { id: "ann_editor" as AnnotationId, type: "arrow" as const, label: "Dependency", visible: true, from: { signalId: "sig_data" as SignalId, cycle: 2, point: "transition-center" as const }, to: { signalId: "sig_data" as SignalId, cycle: 4, point: "value-start" as const } };
    const created = session.execute({ id: commandId("cmd_ann_create"), type: "annotation.create", annotation });
    expect(created.ok).toBe(true);
    if (created.ok) expect(created.changeSet).toMatchObject({ annotationPosition: [annotation.id], annotationStyle: [annotation.id] });
    expect(session.execute({ id: commandId("cmd_ann_anchor"), type: "annotation.setAnchor", annotationId: annotation.id, field: "to", anchor: { signalId: "sig_data" as SignalId, cycle: 5, point: "cycle-center", offset: { x: 2, y: -1 } } }).ok).toBe(true);
    const moved = session.execute({ id: commandId("cmd_ann_move"), type: "annotation.translateOffsets", annotationId: annotation.id, delta: { x: 5, y: 3 } });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.changeSet).toEqual({ annotationPosition: [annotation.id] });
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ from: { cycle: 2, offset: { x: 5, y: 3 } }, to: { cycle: 5, offset: { x: 7, y: 2 } } });
    expect(session.execute({ id: commandId("cmd_ann_label"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: 7, y: -9 } }).ok).toBe(true);
    const styled = session.execute({ id: commandId("cmd_ann_style"), type: "annotation.updateProperties", annotationId: annotation.id, label: "Ready", visible: true, color: "#cc3300", lineType: "orthogonal", arrowhead: "end" });
    expect(styled.ok).toBe(true);
    if (styled.ok) expect(styled.changeSet).toEqual({ annotationStyle: [annotation.id], minimapOverview: true });
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ label: "Ready", color: "#cc3300", labelOffset: { x: 7, y: -9 }, to: { cycle: 5 } });
    expect(session.execute({ id: commandId("cmd_ann_reset"), type: "annotation.resetOffsets", annotationId: annotation.id }).ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).not.toHaveProperty("labelOffset");
    expect(session.getSnapshot().document.annotations[0]?.from).not.toHaveProperty("offset");
    expect(session.getSnapshot().document.annotations[0]?.to).not.toHaveProperty("offset");
    expect(session.execute({ id: commandId("cmd_ann_delete"), type: "annotation.delete", annotationId: annotation.id }).ok).toBe(true);
    expect(session.getSnapshot().document.annotations).toEqual([]);
  });

  it("validates and persists annotation label layout through one undoable semantic update", () => {
    const annotation: Annotation = { id: "ann_label_layout" as AnnotationId, type: "callout", label: "A long callout label", visible: true, anchor: { cycle: 2, point: "cycle-center" } };
    const session = new CommandHistorySession({ ...canonicalFixture(), annotations: [annotation] });
    const initial = session.getSnapshot();
    const initialHistory = session.historyState().undoDepth;
    const invalid = session.execute({ id: commandId("ann_label_layout_invalid"), type: "annotation.updateProperties", annotationId: annotation.id, label: annotation.label, visible: true, style: { labelMaxWidth: 23 } });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_ANNOTATION_STYLE", path: "$.style.labelMaxWidth" }] });
    expect(session.getSnapshot()).toEqual(initial);
    const invalidLineHeight = session.execute({ id: commandId("ann_label_line_height_invalid"), type: "annotation.updateProperties", annotationId: annotation.id, label: annotation.label, visible: true, style: { lineHeight: 3.1 } });
    expect(invalidLineHeight).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_ANNOTATION_STYLE", path: "$.annotations[0].style.lineHeight" }] });
    expect(session.getSnapshot()).toEqual(initial);
    const invalidPlacement = session.execute({ id: commandId("ann_label_placement_invalid"), type: "annotation.updateProperties", annotationId: annotation.id, label: annotation.label, visible: true, labelPlacement: "diagonal" as never });
    expect(invalidPlacement).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_ANNOTATION_STYLE", path: "$.labelPlacement" }] });
    expect(session.getSnapshot()).toEqual(initial);

    const applied = session.execute({ id: commandId("ann_label_layout_apply"), type: "annotation.updateProperties", annotationId: annotation.id, label: annotation.label, visible: true, labelPlacement: "end", style: { labelWrap: true, labelMaxWidth: 48, lineHeight: 1.8 } });
    expect(applied).toMatchObject({ ok: true, changeSet: { annotationStyle: [annotation.id] } });
    expect(session.getSnapshot().document.annotations[0]?.style).toEqual({ labelWrap: true, labelMaxWidth: 48, lineHeight: 1.8 });
    expect(session.getSnapshot().document.annotations[0]?.labelPlacement).toBe("end");
    expect(session.historyState().undoDepth).toBe(initialHistory + 1);
    const serialized = serializeValidatedCanonicalDocument(session.getSnapshot().document);
    const reopened = parseDocument(serialized);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document.annotations[0]).toMatchObject({ labelPlacement: "end", style: { labelWrap: true, labelMaxWidth: 48, lineHeight: 1.8 } });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).toEqual(annotation);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ labelPlacement: "end", style: { labelWrap: true, labelMaxWidth: 48, lineHeight: 1.8 } });
  });

  it("round-trips Marker/Bracket presentation after SemanticCommand edits", () => {
    const marker: Annotation = {
      id: "ann_marker_roundtrip" as AnnotationId,
      type: "marker",
      label: "Marker",
      visible: true,
      color: "#aa2200",
      comment: "marker note",
      anchor: { signalId: "sig_data" as SignalId, cycle: 2, point: "cycle-center" },
      labelOffset: { x: 7, y: -4 },
      style: { strokeWidth: 3, strokeStyle: "dashed", fillColor: "#ffeeaa", fillOpacity: 0.4 },
      rotation: 12,
      align: "center",
      locked: false,
      verticalSpan: { mode: "rows", startRowId: "sig_clk" as SignalId, endRowId: "sig_data" as SignalId },
    };
    const bracket: Annotation = {
      id: "ann_bracket_roundtrip" as AnnotationId,
      type: "bracket",
      label: "Bracket",
      visible: true,
      color: "#004488",
      start: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" },
      end: { signalId: "sig_data" as SignalId, cycle: 5, point: "cycle-end" },
      labelOffset: { x: -3, y: 9 },
      style: { strokeWidth: 5, strokeStyle: "dotted", fillColor: "none", fillOpacity: 0 },
      rotation: -8,
      align: "right",
      locked: false,
    };
    const session = new CommandHistorySession({ ...canonicalFixture(), annotations: [marker, bracket] });

    expect(session.execute({ id: commandId("marker_presentation"), type: "annotation.updateProperties", annotationId: marker.id, label: "Marker updated", visible: false, color: "#bb3300", labelOffset: { x: 11, y: -6 }, style: { strokeWidth: 4, strokeStyle: "solid", fillColor: "#ddccaa", fillOpacity: 0.6 } }).ok).toBe(true);
    expect(session.execute({ id: commandId("marker_rotation"), type: "annotation.setRotation", annotationId: marker.id, rotation: 18 }).ok).toBe(true);
    expect(session.execute({ id: commandId("marker_align"), type: "annotation.setAlign", annotationId: marker.id, align: "left" }).ok).toBe(true);
    expect(session.execute({ id: commandId("marker_span"), type: "annotation.updateVerticalSpan", annotationId: marker.id, verticalSpan: { mode: "custom", startOffset: 2, endOffset: 5 } }).ok).toBe(true);
    expect(session.execute({ id: commandId("marker_lock"), type: "annotation.setLocked", annotationId: marker.id, locked: true }).ok).toBe(true);
    expect(session.execute({ id: commandId("bracket_presentation"), type: "annotation.updateProperties", annotationId: bracket.id, label: "Bracket updated", visible: true, color: "#005599", labelOffset: { x: 2, y: 13 }, style: { strokeWidth: 6, strokeStyle: "dashed", fillColor: "none", fillOpacity: 0.2 } }).ok).toBe(true);
    expect(session.execute({ id: commandId("bracket_rotation"), type: "annotation.setRotation", annotationId: bracket.id, rotation: 4 }).ok).toBe(true);
    expect(session.execute({ id: commandId("bracket_align"), type: "annotation.setAlign", annotationId: bracket.id, align: "center" }).ok).toBe(true);
    expect(session.execute({ id: commandId("bracket_lock"), type: "annotation.setLocked", annotationId: bracket.id, locked: true }).ok).toBe(true);

    const expected = session.getSnapshot().document;
    expect(expected.annotations).toEqual([
      expect.objectContaining({ id: marker.id, type: "marker", visible: false, color: "#bb3300", labelOffset: { x: 11, y: -6 }, style: { strokeWidth: 4, strokeStyle: "solid", fillColor: "#ddccaa", fillOpacity: 0.6 }, rotation: 18, align: "left", locked: true, verticalSpan: { mode: "custom", startOffset: 2, endOffset: 5 } }),
      expect.objectContaining({ id: bracket.id, type: "bracket", visible: true, color: "#005599", labelOffset: { x: 2, y: 13 }, style: { strokeWidth: 6, strokeStyle: "dashed", fillColor: "none", fillOpacity: 0.2 }, rotation: 4, align: "center", locked: true }),
    ]);
    const saved = serializeValidatedCanonicalDocument(expected);
    const reopened = parseDocument(saved);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.document).toEqual(expected);
    expect(serializeValidatedCanonicalDocument(reopened.document)).toBe(saved);
  });

  it("deletes a grouped Annotation and restores exact membership through Undo/Redo", () => {
    const annotation: Annotation = { id: "ann_grouped_delete" as AnnotationId, type: "marker", label: "Grouped", visible: true, anchor: { cycle: 2, point: "cycle-start" } };
    const other: Annotation = { id: "ann_grouped_keep" as AnnotationId, type: "marker", label: "Keep", visible: true, anchor: { cycle: 4, point: "cycle-start" } };
    const initial = { ...canonicalFixture(), annotations: [annotation, other], annotationGroups: [{ id: "ann_group_lifecycle" as never, name: "Lifecycle", annotationIds: [annotation.id, other.id] }] };
    const session = new CommandHistorySession(initial);
    expect(session.execute({ id: commandId("cmd_grouped_ann_delete"), type: "annotation.delete", annotationId: annotation.id }).ok).toBe(true);
    expect(session.getSnapshot().document.annotationGroups?.[0]?.annotationIds).toEqual([other.id]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.annotationGroups?.[0]?.annotationIds).toEqual([other.id]);
  });

  it("replaces an Annotation collection in one action while reconciling groups by stable ID", () => {
    const a: Annotation = { id: "ann_import_a" as AnnotationId, type: "text", label: "A", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" } };
    const b: Annotation = { id: "ann_import_b" as AnnotationId, type: "text", label: "B", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 2, point: "cycle-start" } };
    const c: Annotation = { id: "ann_import_c" as AnnotationId, type: "text", label: "C", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 3, point: "cycle-start" } };
    const groupA = { id: "ann_import_group_a" as never, name: "Primary", annotationIds: [a.id, b.id] };
    const groupC = { id: "ann_import_group_c" as never, name: "Secondary", annotationIds: [c.id] };
    const initial = { ...canonicalFixture(), annotations: [a, b, c], annotationGroups: [groupA, groupC] };
    const session = new CommandHistorySession(initial);
    const unchangedImport = session.execute({ id: commandId("annotation_collection_same"), type: "annotation.replaceCollection", annotations: [a, b, c] });
    expect(unchangedImport).toMatchObject({ ok: false, reason: "no-op" });
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.historyState().undoDepth).toBe(0);
    const importedA = { ...a, label: "A updated" };
    const importedC = c;
    const added: Annotation = { id: "ann_import_new" as AnnotationId, type: "text", label: "New", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 4, point: "cycle-start" } };

    const accepted = session.execute({ id: commandId("annotation_collection_replace"), type: "annotation.replaceCollection", annotations: [importedA, importedC, added] });
    expect(accepted.ok).toBe(true);
    expect(session.historyState().undoDepth).toBe(1);
    const replaced = session.getSnapshot().document;
    expect(replaced.annotations).toEqual([importedA, importedC, added]);
    expect(replaced.annotationGroups).toEqual([
      { ...groupA, annotationIds: [a.id] },
      groupC,
    ]);
    expect(replaced.annotationGroups?.[0]).toMatchObject({ id: groupA.id, name: groupA.name });
    const saved = serializeValidatedCanonicalDocument(replaced);
    const reopened = parseDocument(saved);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document).toEqual(replaced);

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(replaced);

    const duplicate = session.execute({ id: commandId("annotation_collection_duplicate"), type: "annotation.replaceCollection", annotations: [added, added] });
    expect(duplicate).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "DUPLICATE_ID" }] });
    expect(session.getSnapshot().document).toEqual(replaced);
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("updates Measurement profile atomically and restores it through Undo/Redo", () => {
    const source = canonicalFixture();
    const annotation: Annotation = { id: "ann_measurement_profile" as AnnotationId, type: "measurement", label: "Measurement", visible: true, start: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" }, end: { signalId: "sig_data" as SignalId, cycle: 4, point: "cycle-end" } };
    const session = new CommandHistorySession({ ...source, annotations: [annotation] });
    const before = session.getSnapshot().document;
    const updated = session.execute({ id: commandId("cmd_measurement_profile"), type: "annotation.updateMeasurement", annotationId: annotation.id, profile: "custom", anchorKind: "ratio", start: 0.17, end: 0.83 });
    expect(updated.ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]).toMatchObject({ measurement: { profile: "custom", anchorKind: "ratio" }, start: { point: "transition-center", transition: { kind: "ratio", value: 0.17 } }, end: { point: "transition-center", transition: { kind: "ratio", value: 0.83 } } });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]?.measurement).toEqual({ profile: "custom", anchorKind: "ratio" });
  });

  it("rejects out-of-range Measurement lanes without changing document or History", () => {
    const source = canonicalFixture();
    const annotation: Annotation = { id: "ann_measurement_lane" as AnnotationId, type: "measurement", label: "Measurement", visible: true, start: { signalId: "sig_data" as SignalId, cycle: 1, point: "cycle-start" }, end: { signalId: "sig_data" as SignalId, cycle: 4, point: "cycle-end" } };
    const session = new CommandHistorySession({ ...source, annotations: [annotation] });
    const before = session.getSnapshot().document;
    const accepted = session.execute({ id: commandId("cmd_measurement_lane_max"), type: "annotation.updateMeasurement", annotationId: annotation.id, profile: "cycle", anchorKind: "threshold", start: 0, end: 1, layout: { ...DEFAULT_MEASUREMENT_LAYOUT, lane: MAX_MEASUREMENT_LANE } });
    expect(accepted.ok).toBe(true);
    expect(session.getSnapshot().document.annotations[0]?.measurementLayout?.lane).toBe(MAX_MEASUREMENT_LANE);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);

    const historyBeforeReject = session.historyState();
    const rejected = session.execute({ id: commandId("cmd_measurement_lane_too_large"), type: "annotation.updateMeasurement", annotationId: annotation.id, profile: "cycle", anchorKind: "threshold", start: 0, end: 1, layout: { ...DEFAULT_MEASUREMENT_LAYOUT, lane: MAX_MEASUREMENT_LANE + 1 } });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "INVALID_LANE", path: "$.layout.lane" }] });
    expect(session.getSnapshot().document).toEqual(before);
    expect(session.historyState()).toEqual(historyBeforeReject);
  });
});
