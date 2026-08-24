import type { CanonicalSnapshot, ValidationProblem } from "@timing-chart-v2/core";
import type { AnnotationId, CommandId, GroupId, RowId, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

export type SignalValue = 0 | 1 | "X" | "Z" | string | bigint;

export type SemanticCommand =
  | Readonly<{ id: CommandId; type: "signal.delete"; signalId: SignalId }>
  | Readonly<{ id: CommandId; type: "signal.move"; signalId: SignalId; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "signal.updateValue"; signalId: SignalId; start: number; value: SignalValue }>
  | Readonly<{ id: CommandId; type: "timeline.insert"; at: number; count: number }>
  | Readonly<{ id: CommandId; type: "timeline.delete"; start: number; end: number }>
  | Readonly<{ id: CommandId; type: "annotation.updateAnchor"; annotationId: AnnotationId; anchor: SemanticAnchor }>;

export interface ChangeSet {
  readonly fullDocumentReplace?: boolean;
  readonly rowOrder?: readonly RowId[];
  readonly rowPresentation?: readonly RowId[];
  readonly waveSemantics?: readonly SignalId[];
  readonly timelineSemantics?: boolean;
  readonly geometryScreenX?: boolean;
  readonly geometryScreenY?: readonly SignalId[];
  readonly annotationPosition?: readonly AnnotationId[];
  readonly annotationStyle?: readonly AnnotationId[];
  readonly minimapOverview?: boolean;
}

export type CommandResult =
  | Readonly<{ ok: true; snapshot: CanonicalSnapshot; changeSet: ChangeSet }>
  | Readonly<{ ok: false; reason: "invalid" | "stale" | "no-op"; problems: readonly ValidationProblem[] }>;

export interface SemanticCommandDispatcher {
  execute(command: SemanticCommand): CommandResult;
}
