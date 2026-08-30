import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CommandId, Signal, SignalId } from "@timing-chart-v2/schema";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (value: string) => value as CommandId;

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

function assertRejectedWithoutMutation(session: CommandHistorySession, command: SemanticCommand) {
  const before = session.getSnapshot();
  const beforeHistory = session.historyState();
  const result = session.execute(command);
  expect(result).toMatchObject({ ok: false, reason: "invalid" });
  expect(session.getSnapshot()).toBe(before);
  expect(session.historyState()).toEqual(beforeHistory);
}

describe("SemanticCommand state machine foundation", () => {
  const seeds = [0x1a2b3c4d, 0x5e6f7788, 0x90abcdef];

  for (const seed of seeds) {
    it(`round-trips generated commands and rejected operations for seed ${seed}`, () => {
      const session = new CommandHistorySession(canonicalFixture());
      const nextRandom = random(seed);
      const createdIds: SignalId[] = [];

      for (let step = 0; step < 128; step += 1) {
        const operation = nextRandom() % 4;
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
        } else if (createdIds.length === 0 || nextRandom() % 2 === 0) {
          createdId = `generated_${seed}_${step}` as SignalId;
          command = { id: commandId(`create_${seed}_${step}`), type: "signal.create", signal: generatedSignal(createdId, step), targetGroupId: "grp_main", index: 2 };
        } else {
          deletedId = createdIds.at(-1);
          command = { id: commandId(`delete_${seed}_${step}`), type: "signal.delete", signalId: deletedId! };
        }

        const before = session.getSnapshot().document;
        const beforeHistory = session.historyState();
        const result = session.execute(command);
        expect(result, `seed=${seed} step=${step} command=${command.type}`).toMatchObject({ ok: true });
        if (!result.ok) throw new Error(`Unexpected rejection for seed=${seed} step=${step}`);
        const after = result.snapshot.document;
        expect(session.historyState()).toMatchObject({ undoDepth: beforeHistory.undoDepth + 1, redoDepth: 0, dirty: true });
        expect(session.undo()).toMatchObject({ ok: true });
        expect(session.getSnapshot().document).toEqual(before);
        expect(session.redo()).toMatchObject({ ok: true });
        expect(session.getSnapshot().document).toEqual(after);
        if (createdId) createdIds.push(createdId);
        if (deletedId) createdIds.splice(createdIds.indexOf(deletedId), 1);
      }

      assertRejectedWithoutMutation(session, { id: commandId(`reject_rename_${seed}`), type: "signal.rename", signalId: "sig_data" as SignalId, name: "   " });
      assertRejectedWithoutMutation(session, { id: commandId(`reject_value_${seed}`), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 4, value: "1FF" });
    });
  }
});
