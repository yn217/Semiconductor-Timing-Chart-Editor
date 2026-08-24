import type { CanonicalSnapshot, ValidationProblem } from "@timing-chart-v2/core";
import type {
  AnnotationId,
  Annotation,
  Bookmark,
  BookmarkId,
  CommandId,
  GroupId,
  RowId,
  SemanticAnchor,
  PixelOffset,
  Signal,
  ClockGenerator,
  SignalGroup,
  SignalId,
  SignalRole,
  TimeGroupId,
  TimeGroup,
  TransactionId,
} from "@timing-chart-v2/schema";

export type SignalValue = string | number;

export type SemanticCommand =
  | Readonly<{ id: CommandId; type: "signal.create"; signal: Signal; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "signal.delete"; signalId: SignalId }>
  | Readonly<{ id: CommandId; type: "signal.rename"; signalId: SignalId; name: string }>
  | Readonly<{ id: CommandId; type: "signal.move"; signalId: SignalId; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "signal.setVisibility"; signalId: SignalId; visible: boolean }>
  | Readonly<{ id: CommandId; type: "signal.updateValue"; signalId: SignalId; start: number; value: SignalValue; comment?: string }>
  | Readonly<{ id: CommandId; type: "signal.replaceValue"; signalId: SignalId; fromStart: number; start: number; value: SignalValue; comment?: string }>
  | Readonly<{ id: CommandId; type: "signal.moveValue"; signalId: SignalId; fromStart: number; toStart: number }>
  | Readonly<{ id: CommandId; type: "signal.removeValue"; signalId: SignalId; start: number }>
  | Readonly<{ id: CommandId; type: "signal.updateProperties"; signalId: SignalId; name: string; role: SignalRole; displayFormat?: "hex" | "binary" | "symbolic" }>
  | Readonly<{ id: CommandId; type: "signal.updateClockGenerator"; signalId: SignalId; generator: ClockGenerator }>
  | Readonly<{ id: CommandId; type: "group.create"; group: SignalGroup; index: number }>
  | Readonly<{ id: CommandId; type: "group.delete"; groupId: GroupId }>
  | Readonly<{ id: CommandId; type: "group.rename"; groupId: GroupId; name: string }>
  | Readonly<{ id: CommandId; type: "group.move"; groupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "group.updateLayout"; groupId: GroupId; spacingBefore?: number; spacingAfter?: number }>
  | Readonly<{ id: CommandId; type: "timeline.insert"; at: number; count: number }>
  | Readonly<{ id: CommandId; type: "timeline.delete"; start: number; end: number }>
  | Readonly<{ id: CommandId; type: "timeline.duplicateRange"; start: number; end: number; at: number }>
  | Readonly<{ id: CommandId; type: "timeline.moveRange"; start: number; end: number; to: number }>
  | Readonly<{ id: CommandId; type: "bookmark.create"; bookmark: Bookmark }>
  | Readonly<{ id: CommandId; type: "bookmark.move"; bookmarkId: BookmarkId; start: number }>
  | Readonly<{ id: CommandId; type: "bookmark.delete"; bookmarkId: BookmarkId }>
  | Readonly<{ id: CommandId; type: "timeGroup.create"; timeGroup: TimeGroup }>
  | Readonly<{ id: CommandId; type: "timeGroup.updatePresentation"; timeGroupId: TimeGroupId; presentation: TimeGroup["presentation"] }>
  | Readonly<{ id: CommandId; type: "timeGroup.delete"; timeGroupId: TimeGroupId }>
  | Readonly<{ id: CommandId; type: "annotation.updateAnchor"; annotationId: AnnotationId; anchor: SemanticAnchor }>
  | Readonly<{ id: CommandId; type: "annotation.create"; annotation: Annotation }>
  | Readonly<{ id: CommandId; type: "annotation.delete"; annotationId: AnnotationId }>
  | Readonly<{ id: CommandId; type: "annotation.setAnchor"; annotationId: AnnotationId; field: "anchor" | "start" | "end" | "from" | "to"; anchor: SemanticAnchor }>
  | Readonly<{ id: CommandId; type: "annotation.translateOffsets"; annotationId: AnnotationId; delta: PixelOffset }>
  | Readonly<{ id: CommandId; type: "annotation.resetOffsets"; annotationId: AnnotationId }>
  | Readonly<{ id: CommandId; type: "annotation.updateLabelOffset"; annotationId: AnnotationId; labelOffset: PixelOffset }>
  | Readonly<{ id: CommandId; type: "annotation.updateProperties"; annotationId: AnnotationId; label: string; visible: boolean; color?: string; lineType?: Annotation["lineType"]; arrowhead?: Annotation["arrowhead"] }>;

export interface ChangeSet {
  readonly fullDocumentReplace?: boolean;
  readonly rowOrder?: readonly RowId[];
  readonly rowPresentation?: readonly RowId[];
  readonly addedSignals?: readonly SignalId[];
  readonly removedSignals?: readonly SignalId[];
  readonly addedGroups?: readonly GroupId[];
  readonly removedGroups?: readonly GroupId[];
  readonly waveSemantics?: readonly SignalId[];
  readonly geometryLocal?: readonly SignalId[];
  readonly timelineSemantics?: boolean;
  readonly geometryScreenX?: boolean;
  readonly geometryScreenY?: readonly SignalId[];
  readonly annotationPosition?: readonly AnnotationId[];
  readonly annotationStyle?: readonly AnnotationId[];
  readonly bookmarkPosition?: readonly BookmarkId[];
  readonly timeGroupSemantics?: readonly TimeGroupId[];
  readonly transactionSemantics?: readonly TransactionId[];
  readonly minimapOverview?: boolean;
}

export type CommandResult =
  | Readonly<{ ok: true; snapshot: CanonicalSnapshot; changeSet: ChangeSet }>
  | Readonly<{ ok: false; reason: "invalid" | "stale" | "no-op"; problems: readonly ValidationProblem[] }>;

export interface SemanticCommandDispatcher {
  execute(command: SemanticCommand): CommandResult;
}

export interface SemanticBatchDispatcher {
  executeBatch(id: CommandId, commands: readonly SemanticCommand[]): CommandResult;
}
