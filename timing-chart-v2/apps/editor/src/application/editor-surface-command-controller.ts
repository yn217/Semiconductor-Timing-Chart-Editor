import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { ClockGenerator, EdgeCounterSettings, SignalId, TransactionId, CommandId } from "@timing-chart-v2/schema";

type CommandOf<T extends SemanticCommand["type"]> = Extract<SemanticCommand, { readonly type: T }>;

export interface SignalEditorCommandActions {
  readonly updateClockGenerator: (signalId: SignalId, generator: ClockGenerator) => CommandResult;
  readonly updateEdgeCounter: (signalId: SignalId, edgeCounter: EdgeCounterSettings) => CommandResult;
}

export interface TransactionLaneCommandActions {
  readonly move: (transactionId: TransactionId, start: number) => CommandResult;
  readonly resize: (transactionId: TransactionId, edge: "start" | "end", value: number) => CommandResult;
}

export interface EditorSurfaceCommandController extends SignalEditorCommandActions, TransactionLaneCommandActions {}

export function createEditorSurfaceCommandController(input: {
  readonly execute: (command: SemanticCommand) => CommandResult;
  readonly nextCommandId: (operation: string) => CommandId;
}): EditorSurfaceCommandController {
  const dispatch = <T extends SemanticCommand["type"]>(operation: string, command: Omit<CommandOf<T>, "id">): CommandResult => input.execute({ id: input.nextCommandId(operation), ...command } as SemanticCommand);
  return {
    updateClockGenerator: (signalId, generator) => dispatch<"signal.updateClockGenerator">("clock", { type: "signal.updateClockGenerator", signalId, generator }),
    updateEdgeCounter: (signalId, edgeCounter) => dispatch<"signal.updateEdgeCounter">("edge_counter", { type: "signal.updateEdgeCounter", signalId, edgeCounter }),
    move: (transactionId, start) => dispatch<"transaction.move">("transaction_snap_move", { type: "transaction.move", transactionId, start }),
    resize: (transactionId, edge, value) => dispatch<"transaction.resize">("transaction_snap_resize", { type: "transaction.resize", transactionId, edge, value }),
  };
}
