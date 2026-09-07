import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, ClockGenerator, EdgeCounterSettings, SignalId, TransactionId, CommandId, ValueSignal } from "@timing-chart-v2/schema";

type CommandOf<T extends SemanticCommand["type"]> = Extract<SemanticCommand, { readonly type: T }>;
type CommandPayload<T extends SemanticCommand["type"]> = Omit<CommandOf<T>, "id" | "type">;

export interface SignalEditorCommandActions {
  readonly updateClockGenerator: (signalId: SignalId, generator: ClockGenerator) => CommandResult;
  readonly updateEdgeCounter: (signalId: SignalId, edgeCounter: EdgeCounterSettings) => CommandResult;
  readonly replaceValues: (signalId: SignalId, values: ValueSignal["values"]) => CommandResult;
  readonly updateValue: (signalId: SignalId, start: number, value: string | number, comment?: string) => CommandResult;
  readonly replaceValue: (signalId: SignalId, fromStart: number, start: number, value: string | number, comment?: string) => CommandResult;
  readonly removeValue: (signalId: SignalId, start: number) => CommandResult;
  readonly updateCommentRow: (signalId: SignalId, payload: Omit<CommandOf<"commentRow.update">, "id" | "type" | "signalId">) => CommandResult;
}

export interface TransactionLaneCommandActions {
  readonly move: (transactionId: TransactionId, start: number) => CommandResult;
  readonly resize: (transactionId: TransactionId, edge: "start" | "end", value: number) => CommandResult;
}

export interface InspectorCommandActions {
  readonly updateSignalProperties: (payload: CommandPayload<"signal.updateProperties">) => CommandResult;
  readonly renameSignal: (signalId: SignalId, name: string) => CommandResult;
  readonly convertClock: (signalId: SignalId, targetType: "binary" | "bus" | "state") => CommandResult;
  readonly setReferenceClock: (referenceClock: SignalId) => CommandResult;
  readonly setReferenceEdge: (edge: "rising" | "falling") => CommandResult;
  readonly updateBookmark: (payload: CommandPayload<"bookmark.update">) => CommandResult;
  readonly updateLayout: (layout: CanonicalDocument["layout"]) => CommandResult;
}

export interface EditorSurfaceCommandController extends SignalEditorCommandActions, TransactionLaneCommandActions, InspectorCommandActions {}

export function createEditorSurfaceCommandController(input: {
  readonly execute: (command: SemanticCommand) => CommandResult;
  readonly nextCommandId: (operation: string) => CommandId;
}): EditorSurfaceCommandController {
  const dispatch = <T extends SemanticCommand["type"]>(operation: string, command: Omit<CommandOf<T>, "id">): CommandResult => input.execute({ id: input.nextCommandId(operation), ...command } as SemanticCommand);
  return {
    updateClockGenerator: (signalId, generator) => dispatch<"signal.updateClockGenerator">("clock", { type: "signal.updateClockGenerator", signalId, generator }),
    updateEdgeCounter: (signalId, edgeCounter) => dispatch<"signal.updateEdgeCounter">("edge_counter", { type: "signal.updateEdgeCounter", signalId, edgeCounter }),
    replaceValues: (signalId, values) => dispatch<"signal.replaceValues">("replace_values", { type: "signal.replaceValues", signalId, values }),
    updateValue: (signalId, start, value, comment) => dispatch<"signal.updateValue">("add_value", { type: "signal.updateValue", signalId, start, value, ...(comment === undefined || comment === "" ? {} : { comment }) }),
    replaceValue: (signalId, fromStart, start, value, comment) => dispatch<"signal.replaceValue">("replace_value", { type: "signal.replaceValue", signalId, fromStart, start, value, ...(comment === undefined || comment === "" ? {} : { comment }) }),
    removeValue: (signalId, start) => dispatch<"signal.removeValue">("remove_value", { type: "signal.removeValue", signalId, start }),
    updateCommentRow: (signalId, payload) => dispatch<"commentRow.update">("comment_row_update", { type: "commentRow.update", signalId, ...payload }),
    move: (transactionId, start) => dispatch<"transaction.move">("transaction_snap_move", { type: "transaction.move", transactionId, start }),
    resize: (transactionId, edge, value) => dispatch<"transaction.resize">("transaction_snap_resize", { type: "transaction.resize", transactionId, edge, value }),
    updateSignalProperties: (payload) => dispatch<"signal.updateProperties">("inspector_signal_properties", { type: "signal.updateProperties", ...payload }),
    renameSignal: (signalId, name) => dispatch<"signal.rename">("inspector_signal_rename", { type: "signal.rename", signalId, name }),
    convertClock: (signalId, targetType) => dispatch<"signal.convertClock">("convert_clock", { type: "signal.convertClock", signalId, targetType }),
    setReferenceClock: (referenceClock) => dispatch<"timeline.setReferenceClock">("set_reference_clock", { type: "timeline.setReferenceClock", referenceClock }),
    setReferenceEdge: (edge) => dispatch<"timeline.setReferenceEdge">("set_reference_edge", { type: "timeline.setReferenceEdge", edge }),
    updateBookmark: (payload) => dispatch<"bookmark.update">("inspector_bookmark_update", { type: "bookmark.update", ...payload }),
    updateLayout: (layout) => dispatch<"document.updateLayout">("layout_properties", { type: "document.updateLayout", layout }),
  };
}
