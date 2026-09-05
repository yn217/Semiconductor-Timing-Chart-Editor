import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DocumentSession } from "@timing-chart-v2/core";
import { DOCUMENT_RESOURCE_BUDGET, validateCanonicalDocument, type Annotation, type Bookmark, type CanonicalDocument, type CommandId, type GroupId, type Signal, type SignalId, type SpacerId, type TimeGroup, type Transaction } from "@timing-chart-v2/schema";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (value: string) => value as CommandId;
const ACTIONS_PER_SEED = 320;

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function generatedSignal(id: SignalId, index: number): Signal {
  return {
    id,
    name: `GEN_${index}`,
    type: "binary",
    role: "internal",
    source: { instancePath: ["generated"], signalName: `GEN_${index}` },
    display: { name: `GEN_${index}` },
    values: [{ start: 0, value: "0" }, { start: 4, value: "1" }],
  };
}

function variedPropertyFixture(): CanonicalDocument {
  const base = canonicalFixture();
  const commentId = "sig_comment_property" as SignalId;
  const spacerId = "spacer_property" as SpacerId;
  const auxiliaryGroupId = "grp_aux_property" as GroupId;
  const annotationId = "annotation_property" as Annotation["id"];
  const bookmarkId = "bookmark_property" as Bookmark["id"];
  const timeGroupId = "time_property" as TimeGroup["id"];
  const transactionId = "transaction_property" as Transaction["id"];
  const comment: Signal = { id: commentId, name: "NOTE", type: "commentRow", role: "internal", source: { instancePath: ["generated"], signalName: "NOTE" }, display: { name: "NOTE" }, title: "Generated note", body: "Generated property fixture" };
  const annotation: Annotation = { id: annotationId, type: "marker", label: "MARK", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 2, point: "cycle-center" } };
  const bookmark: Bookmark = { id: bookmarkId, name: "MARK", start: 2 };
  const timeGroup: TimeGroup = { id: timeGroupId, name: "WINDOW", start: 1, end: 3 };
  const transaction: Transaction = { id: transactionId, name: "TRANSACTION", start: 1, end: 3, laneId: "lane_0", linkedSignals: ["sig_data" as SignalId], phases: [{ name: "phase", start: 1, end: 2 }] };
  return {
    ...base,
    signalGroups: [...base.signalGroups, { id: auxiliaryGroupId, name: "Auxiliary", rows: [commentId, spacerId], spacers: [{ id: spacerId, height: 12 }] }],
    signals: [...base.signals, comment],
    annotations: [...base.annotations, annotation],
    bookmarks: [...base.bookmarks, bookmark],
    timeGroups: [...base.timeGroups, timeGroup],
    transactions: [...base.transactions, transaction],
  };
}

function assertRejectedWithoutMutation(session: CommandHistorySession, command: SemanticCommand) {
  const before = session.getSnapshot();
  const beforeHistory = session.historyState();
  const result = session.execute(command);
  expect(result).toMatchObject({ ok: false, reason: "invalid" });
  expect(session.getSnapshot()).toBe(before);
  expect(session.historyState()).toEqual(beforeHistory);
}

function assertSaveOpenRoundTrip(document: CanonicalDocument, seed: number, step: number): void {
  const checkpoint = new DocumentSession(document);
  const saved = checkpoint.save();
  expect(saved, `seed=${seed} step=${step} save`).toMatchObject({ ok: true });
  if (!saved.ok) return;
  const opened = checkpoint.open(saved.text);
  expect(opened, `seed=${seed} step=${step} open`).toMatchObject({ ok: true });
  if (!opened.ok) return;
  expect(opened.snapshot.document, `seed=${seed} step=${step} round-trip`).toEqual(document);
}

describe("SemanticCommand state machine foundation", () => {
  const seeds = [0x1a2b3c4d, 0x5e6f7788, 0x90abcdef];

  for (const seed of seeds) {
    it(`round-trips generated commands and rejected operations for seed ${seed}`, () => {
      const initialDocument = variedPropertyFixture();
      const session = new CommandHistorySession(initialDocument);
      const nextRandom = random(seed);
      const createdIds: SignalId[] = [];
      const sequence: SemanticCommand[] = [];

      for (let step = 0; step < ACTIONS_PER_SEED; step += 1) {
        const operation = nextRandom() % 10;
        let command: SemanticCommand;
        let createdId: SignalId | undefined;
        let deletedId: SignalId | undefined;
        if (operation === 0) {
          command = { id: commandId(`property_${seed}_${step}`), type: "signal.rename", signalId: "sig_data" as SignalId, name: `DATA_${seed}_${step}` };
        } else if (operation === 1) {
          const current = session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data");
          const visible = current?.display.visible === false;
          command = { id: commandId(`visibility_${seed}_${step}`), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible };
        } else if (operation === 2) {
          const current = session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data");
          const currentValue = current?.type === "bus" ? current.values.find((value) => value.start === 4)?.value : undefined;
          command = { id: commandId(`value_${seed}_${step}`), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 4, value: currentValue === "1F" ? "A5" : "1F" };
        } else if (operation === 3 && (createdIds.length === 0 || nextRandom() % 2 === 0)) {
          createdId = `generated_${seed}_${step}` as SignalId;
          command = { id: commandId(`create_${seed}_${step}`), type: "signal.create", signal: generatedSignal(createdId, step), targetGroupId: "grp_main", index: 2 };
        } else if (operation === 3) {
          deletedId = createdIds.at(-1);
          command = { id: commandId(`delete_${seed}_${step}`), type: "signal.delete", signalId: deletedId! };
        } else if (operation === 4) command = { id: commandId(`group_rename_${seed}_${step}`), type: "group.rename", groupId: "grp_aux_property" as GroupId, name: `Auxiliary_${seed}_${step}` };
        else if (operation === 5) {
          const spacer = session.getSnapshot().document.signalGroups.find((group) => group.id === "grp_aux_property")?.spacers?.[0];
          command = { id: commandId(`spacer_update_${seed}_${step}`), type: "spacer.update", spacerId: "spacer_property" as SpacerId, height: spacer?.height === 12 ? 16 : 12 };
        } else if (operation === 6) {
          const bookmark = session.getSnapshot().document.bookmarks.find((item) => item.id === "bookmark_property");
          command = { id: commandId(`bookmark_move_${seed}_${step}`), type: "bookmark.move", bookmarkId: "bookmark_property" as Bookmark["id"], start: bookmark?.start === 2 ? 5 : 2 };
        }
        else if (operation === 7) command = { id: commandId(`time_update_${seed}_${step}`), type: "timeGroup.update", timeGroupId: "time_property" as TimeGroup["id"], name: `WINDOW_${step}`, start: step % 2 === 0 ? 1 : 2, end: step % 2 === 0 ? 3 : 4 };
        else if (operation === 8) {
          const transaction = session.getSnapshot().document.transactions.find((item) => item.id === "transaction_property");
          command = { id: commandId(`transaction_move_${seed}_${step}`), type: "transaction.move", transactionId: "transaction_property" as Transaction["id"], start: transaction?.start === 1 ? 2 : 1 };
        }
        else command = { id: commandId(`annotation_update_${seed}_${step}`), type: "annotation.updateProperties", annotationId: "annotation_property" as Annotation["id"], label: `MARK_${step}`, visible: step % 2 === 0 };

        sequence.push(command);
        const before = session.getSnapshot().document;
        const beforeHistory = session.historyState();
        const result = session.execute(command);
        const reproduction = `seed=${seed} step=${step} initial=${JSON.stringify(initialDocument)} sequence=${JSON.stringify(sequence)}`;
        expect(result, `${reproduction} command=${command.type}`).toMatchObject({ ok: true });
        if (!result.ok) throw new Error(`Unexpected rejection for seed=${seed} step=${step}`);
        const after = result.snapshot.document;
        expect(validateCanonicalDocument(after), reproduction).toEqual([]);
        expect(session.historyState(), reproduction).toMatchObject({ undoDepth: beforeHistory.undoDepth + 1, redoDepth: 0, dirty: true });
        expect(session.undo(), reproduction).toMatchObject({ ok: true });
        expect(session.getSnapshot().document, reproduction).toEqual(before);
        expect(session.redo(), reproduction).toMatchObject({ ok: true });
        expect(session.getSnapshot().document, reproduction).toEqual(after);
        if (step % 32 === 0) assertSaveOpenRoundTrip(after, seed, step);
        if (createdId) createdIds.push(createdId);
        if (deletedId) createdIds.splice(createdIds.indexOf(deletedId), 1);
      }

      assertRejectedWithoutMutation(session, { id: commandId(`reject_rename_${seed}`), type: "signal.rename", signalId: "sig_data" as SignalId, name: "   " });
      assertRejectedWithoutMutation(session, { id: commandId(`reject_value_${seed}`), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 4, value: "1FF" });

      const final = session.getSnapshot().document;
      while (session.historyState().canUndo) expect(session.undo(), `seed=${seed} undo-all`).toMatchObject({ ok: true });
      expect(session.getSnapshot().document, `seed=${seed} undo-all`).toEqual(initialDocument);
      expect(session.historyState(), `seed=${seed} undo-all`).toMatchObject({ undoDepth: 0, redoDepth: ACTIONS_PER_SEED, dirty: false });
      while (session.historyState().canRedo) expect(session.redo(), `seed=${seed} redo-all`).toMatchObject({ ok: true });
      expect(session.getSnapshot().document, `seed=${seed} redo-all`).toEqual(final);
    });
  }

  it("executes the metamorphic invariant table for unrelated waveform semantics", () => {
    const waveformSemantics = (document: CanonicalDocument) => {
      const signal = document.signals.find((item) => item.id === "sig_data");
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return signal?.type;
      return { type: signal.type, values: signal.values, width: signal.width, displayFormat: signal.displayFormat };
    };
    const cases: readonly { readonly name: string; readonly command: SemanticCommand }[] = [
      { name: "rename", command: { id: commandId("metamorphic_rename"), type: "signal.rename", signalId: "sig_data" as SignalId, name: "DATA_RENAMED" } },
      { name: "visibility", command: { id: commandId("metamorphic_visibility"), type: "signal.setVisibility", signalId: "sig_data" as SignalId, visible: false } },
      { name: "group-rename", command: { id: commandId("metamorphic_group_rename"), type: "group.rename", groupId: "grp_main" as GroupId, name: "Main Renamed" } },
    ];
    for (const testCase of cases) {
      const session = new CommandHistorySession(canonicalFixture());
      const before = waveformSemantics(session.getSnapshot().document);
      const result = session.execute(testCase.command);
      expect(result, testCase.name).toMatchObject({ ok: true });
      expect(waveformSemantics(session.getSnapshot().document), testCase.name).toEqual(before);
    }
  });

  it("keeps a generated near-limit session atomic across the final accepted and rejected creates", () => {
    const base = canonicalFixture();
    const template = base.signals.find((signal) => signal.type === "bus")!;
    const additions = Array.from({ length: DOCUMENT_RESOURCE_BUDGET.signalCount - 1 - base.signals.length }, (_, index) => ({
      ...template,
      id: `property_budget_${index}` as SignalId,
      name: `PROPERTY_BUDGET_${index}`,
      source: { ...template.source, signalName: `PROPERTY_BUDGET_${index}` },
      display: { ...template.display, name: `PROPERTY_BUDGET_${index}` },
    }));
    const signals = [...base.signals, ...additions];
    const document = { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signals.map((signal) => signal.id) }] };
    const session = new CommandHistorySession(document);
    const accepted = session.execute({ id: commandId("property_budget_accept"), type: "signal.create", signal: { ...template, id: "property_budget_at_limit" as SignalId, name: "PROPERTY_BUDGET_AT_LIMIT", source: { ...template.source, signalName: "PROPERTY_BUDGET_AT_LIMIT" }, display: { ...template.display, name: "PROPERTY_BUDGET_AT_LIMIT" } }, targetGroupId: "grp_main", index: signals.length });
    expect(accepted).toMatchObject({ ok: true });
    expect(session.getSnapshot().document.signals).toHaveLength(DOCUMENT_RESOURCE_BUDGET.signalCount);

    const atLimit = session.getSnapshot();
    const beforeHistory = session.historyState();
    const rejected = session.execute({ id: commandId("property_budget_reject"), type: "signal.create", signal: { ...template, id: "property_budget_overflow" as SignalId, name: "PROPERTY_BUDGET_OVERFLOW", source: { ...template.source, signalName: "PROPERTY_BUDGET_OVERFLOW" }, display: { ...template.display, name: "PROPERTY_BUDGET_OVERFLOW" } }, targetGroupId: "grp_main", index: DOCUMENT_RESOURCE_BUDGET.signalCount });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.signals" })] });
    expect(session.getSnapshot()).toBe(atLimit);
    expect(session.historyState()).toEqual(beforeHistory);
  });
});
