import type { CanonicalSnapshot, ValidationProblem } from "@timing-chart-v2/core";
import type {
  CanonicalDocument,
  Layout,
  CheckSettings,
  ConstraintId,
  AnnotationId,
  Annotation,
  AnnotationGroup,
  AnnotationGroupId,
  Bookmark,
  BookmarkId,
  TimelineLabelAnchor,
  LabelAnchorId,
  CommandId,
  GroupId,
  RowId,
  SemanticAnchor,
  PixelOffset,
  Signal,
  ClockGenerator,
  EdgeCounterSettings,
  SignalGroup,
  SignalGroupStyle,
  SignalId,
  SpacerId,
  SpacerRow,
  SignalRole,
  ResetSemantics,
  TimeGroupId,
  TransactionGroupId,
  TimeGroup,
  Transaction,
  TransactionPhase,
  TransactionId,
  TransactionGroup,
  TransactionTimeScale,
  CommentRow,
  ValueSignal,
  EnumDefinition,
  PhysicalTimebase,
} from "@timing-chart-v2/schema";

export type SignalValue = string | number;

export type SemanticCommand =
  | Readonly<{ id: CommandId; type: "document.replace"; document: CanonicalDocument }>
  | Readonly<{ id: CommandId; type: "document.updateMetadata"; title: string; header: CanonicalDocument["document"]["header"]; footer: CanonicalDocument["document"]["footer"] }>
  | Readonly<{ id: CommandId; type: "document.updateLayout"; layout: Layout }>
  | Readonly<{ id: CommandId; type: "document.updateCheckSettings"; checkSettings: CheckSettings }>
  | Readonly<{ id: CommandId; type: "constraint.createLatency"; constraintId: ConstraintId; triggerSignalId: SignalId; triggerEdge: "rising" | "falling"; responseSignalId: SignalId; responseEdge: "rising" | "falling"; minCycles: number; maxCycles: number }>
  | Readonly<{ id: CommandId; type: "constraint.delete"; constraintId: ConstraintId }>
  | Readonly<{ id: CommandId; type: "legend.update"; legend: CanonicalDocument["legend"] }>
  | Readonly<{ id: CommandId; type: "enum.create"; definition: EnumDefinition }>
  | Readonly<{ id: CommandId; type: "enum.update"; enumId: string; name: string; entries: EnumDefinition["entries"] }>
  | Readonly<{ id: CommandId; type: "enum.rename"; enumId: string; name: string }>
  | Readonly<{ id: CommandId; type: "enum.delete"; enumId: string }>
  | Readonly<{ id: CommandId; type: "signal.create"; signal: Signal; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "signal.bulkCreate"; signals: readonly Signal[]; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "signal.bulkCreateAcrossGroups"; signals: readonly Signal[]; placements: readonly Readonly<{ targetGroupId: GroupId; index: number; signalIds: readonly SignalId[] }>[] }>
  | Readonly<{ id: CommandId; type: "signal.bulkDelete"; signalIds: readonly SignalId[] }>
  | Readonly<{ id: CommandId; type: "signal.delete"; signalId: SignalId }>
  | Readonly<{ id: CommandId; type: "signal.rename"; signalId: SignalId; name: string }>
  | Readonly<{ id: CommandId; type: "signal.bulkRename"; updates: readonly Readonly<{ signalId: SignalId; name: string }>[] }>
  | Readonly<{ id: CommandId; type: "signal.move"; signalId: SignalId; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "signal.setVisibility"; signalId: SignalId; visible: boolean }>
  | Readonly<{ id: CommandId; type: "signal.bulkSetVisibility"; updates: readonly Readonly<{ signalId: SignalId; visible: boolean }>[] }>
  | Readonly<{ id: CommandId; type: "signal.updateValue"; signalId: SignalId; start: number; value: SignalValue; comment?: string; displayFormat?: "hex" | "binary" | "decimal" | "signed" | "unsigned" | "symbolic" }>
  | Readonly<{ id: CommandId; type: "signal.replaceValues"; signalId: SignalId; values: readonly ValueSignal["values"][number][] }>
  | Readonly<{ id: CommandId; type: "signal.replaceValue"; signalId: SignalId; fromStart: number; start: number; value: SignalValue; comment?: string; displayFormat?: "hex" | "binary" | "decimal" | "signed" | "unsigned" | "symbolic" }>
  | Readonly<{ id: CommandId; type: "signal.moveValue"; signalId: SignalId; fromStart: number; toStart: number }>
  | Readonly<{ id: CommandId; type: "signal.removeValue"; signalId: SignalId; start: number }>
  | Readonly<{ id: CommandId; type: "signal.updateProperties"; signalId: SignalId; name: string; role: SignalRole; signalType?: ValueSignal["type"]; width?: number; displayFormat?: ValueSignal["displayFormat"]; enumId?: string; clearEnumId?: boolean; visible?: boolean; displayAlign?: Signal["display"]["align"]; displayOverflow?: Signal["display"]["overflow"]; displayStyle?: Signal["display"]["style"]; spacingBefore?: number; spacingAfter?: number }>
  | Readonly<{ id: CommandId; type: "signal.convertClock"; signalId: SignalId; targetType: "binary" | "bus" | "state" }>
  | Readonly<{ id: CommandId; type: "commentRow.create"; commentRow: CommentRow; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "commentRow.update"; signalId: SignalId; title: string; body: string; spacingBefore?: number; spacingAfter?: number; displayStyle?: CommentRow["display"]["style"] }>
  | Readonly<{ id: CommandId; type: "commentRow.delete"; signalId: SignalId }>
  | Readonly<{ id: CommandId; type: "signal.updateClockGenerator"; signalId: SignalId; generator: ClockGenerator }>
  | Readonly<{ id: CommandId; type: "signal.updateEdgeCounter"; signalId: SignalId; edgeCounter: EdgeCounterSettings }>
  | Readonly<{ id: CommandId; type: "signal.updateResetSemantics"; signalId: SignalId; resetSemantics?: ResetSemantics }>
  | Readonly<{ id: CommandId; type: "spacer.create"; spacer: SpacerRow; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "spacer.bulkDelete"; spacerIds: readonly SpacerId[] }>
  | Readonly<{ id: CommandId; type: "spacer.move"; spacerId: SpacerId; targetGroupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "spacer.update"; spacerId: SpacerId; height: number }>
  | Readonly<{ id: CommandId; type: "spacer.delete"; spacerId: SpacerId }>
  | Readonly<{ id: CommandId; type: "group.create"; group: SignalGroup; index: number }>
  | Readonly<{ id: CommandId; type: "group.createWithContents"; group: SignalGroup; signals: readonly Signal[]; index: number }>
  | Readonly<{ id: CommandId; type: "group.delete"; groupId: GroupId }>
  | Readonly<{ id: CommandId; type: "group.rename"; groupId: GroupId; name: string }>
  | Readonly<{ id: CommandId; type: "group.move"; groupId: GroupId; index: number }>
  | Readonly<{ id: CommandId; type: "group.updateLayout"; groupId: GroupId; spacingBefore?: number; spacingAfter?: number }>
  | Readonly<{ id: CommandId; type: "group.updateProperties"; groupId: GroupId; name: string; spacingBefore: number; spacingAfter: number; style: SignalGroupStyle }>
  | Readonly<{ id: CommandId; type: "timeline.insert"; at: number; count: number }>
  | Readonly<{ id: CommandId; type: "timeline.delete"; start: number; end: number }>
  | Readonly<{ id: CommandId; type: "timeline.duplicateRange"; start: number; end: number; at: number }>
  | Readonly<{ id: CommandId; type: "timeline.moveRange"; start: number; end: number; to: number }>
  | Readonly<{ id: CommandId; type: "bookmark.create"; bookmark: Bookmark }>
  | Readonly<{ id: CommandId; type: "bookmark.move"; bookmarkId: BookmarkId; start: number }>
  | Readonly<{ id: CommandId; type: "bookmark.update"; bookmarkId: BookmarkId; name: string; start: number; comment?: string }>
  | Readonly<{ id: CommandId; type: "bookmark.delete"; bookmarkId: BookmarkId }>
  // #376: a standalone ruler-number restart, independent of any Time
  // Group/Axis Break fold. Reuses the same canonical TimelineLabelAnchor
  // model a Time Group's own fold-resume anchor already uses (#202);
  // `labelAnchor.create` here always produces one with no
  // `ownerTimeGroupId`, since a Time-Group-owned anchor's lifecycle stays
  // owned by the Time Group commands instead.
  | Readonly<{ id: CommandId; type: "labelAnchor.create"; labelAnchor: TimelineLabelAnchor }>
  | Readonly<{ id: CommandId; type: "labelAnchor.update"; labelAnchorId: LabelAnchorId; source: number; display: number }>
  | Readonly<{ id: CommandId; type: "labelAnchor.delete"; labelAnchorId: LabelAnchorId }>
  | Readonly<{ id: CommandId; type: "timeGroup.create"; timeGroup: TimeGroup }>
  | Readonly<{ id: CommandId; type: "timeGroup.groupRange"; timeGroupId: TimeGroupId; start: number; end: number; name?: string; category?: string }>
  | Readonly<{ id: CommandId; type: "timeGroup.ungroup"; timeGroupId: TimeGroupId }>
  | Readonly<{ id: CommandId; type: "timeGroup.update"; timeGroupId: TimeGroupId; name: string; start: number; end: number; category?: string; comment?: string; presentation?: TimeGroup["presentation"] }>
  | Readonly<{ id: CommandId; type: "timeGroup.updatePresentation"; timeGroupId: TimeGroupId; presentation: TimeGroup["presentation"] }>
  | Readonly<{ id: CommandId; type: "timeGroup.delete"; timeGroupId: TimeGroupId }>
  | Readonly<{ id: CommandId; type: "transaction.create"; transaction: Transaction; afterTransactionId?: TransactionId }>
  | Readonly<{ id: CommandId; type: "transaction.bulkCreate"; transactions: readonly Transaction[] }>
  | Readonly<{ id: CommandId; type: "transaction.bulkDuplicate"; items: readonly Readonly<{ transactionId: TransactionId; newTransactionId: TransactionId; name?: string }>[] }>
  | Readonly<{ id: CommandId; type: "transaction.bulkDelete"; transactionIds: readonly TransactionId[] }>
  | Readonly<{ id: CommandId; type: "transaction.bulkSetVisibility"; transactionIds: readonly TransactionId[]; visible: boolean }>
  | Readonly<{ id: CommandId; type: "transaction.bulkMoveToGroup"; items: readonly Readonly<{ transactionId: TransactionId; groupId?: TransactionGroup["id"] }>[] }>
  | Readonly<{ id: CommandId; type: "transaction.bulkSetColor"; transactionIds: readonly TransactionId[]; color: string }>
  | Readonly<{ id: CommandId; type: "transaction.duplicate"; transactionId: TransactionId; newTransactionId: TransactionId; name?: string }>
  | Readonly<{ id: CommandId; type: "transaction.delete"; transactionId: TransactionId }>
  | Readonly<{ id: CommandId; type: "transaction.rename"; transactionId: TransactionId; name: string }>
  | Readonly<{ id: CommandId; type: "transaction.update"; transactionId: TransactionId; name: string; start: number; end: number; laneId?: string; phases?: readonly TransactionPhase[]; groupId?: TransactionGroup["id"]; color?: string; description?: string; visible?: boolean; clearLaneId?: boolean; clearPhases?: boolean; clearGroupId?: boolean; clearColor?: boolean; clearDescription?: boolean; clearVisible?: boolean }>
  | Readonly<{ id: CommandId; type: "transaction.phaseAdd"; transactionId: TransactionId; phase: TransactionPhase }>
  | Readonly<{ id: CommandId; type: "transaction.phaseUpdate"; transactionId: TransactionId; phaseIndex: number; phaseId?: TransactionPhase["id"]; phase: TransactionPhase }>
  | Readonly<{ id: CommandId; type: "transaction.phaseDelete"; transactionId: TransactionId; phaseIndex: number; phaseId?: TransactionPhase["id"] }>
  | Readonly<{ id: CommandId; type: "transaction.move"; transactionId: TransactionId; start: number }>
  | Readonly<{ id: CommandId; type: "transaction.resize"; transactionId: TransactionId; edge: "start" | "end"; value: number }>
  | Readonly<{ id: CommandId; type: "transaction.moveLane"; transactionId: TransactionId; laneId: string }>
  | Readonly<{ id: CommandId; type: "transaction.bulkLinkSignals"; links: readonly Readonly<{ transactionId: TransactionId; signalId: SignalId }>[] }>
  | Readonly<{ id: CommandId; type: "transaction.linkSignal"; transactionId: TransactionId; signalId: SignalId }>
  | Readonly<{ id: CommandId; type: "transaction.unlinkSignal"; transactionId: TransactionId; signalId: SignalId }>
  | Readonly<{ id: CommandId; type: "transactionGroup.create"; group: TransactionGroup }>
  | Readonly<{ id: CommandId; type: "transactionGroup.rename"; groupId: TransactionGroup["id"]; name: string }>
  | Readonly<{ id: CommandId; type: "transactionGroup.update"; groupId: TransactionGroup["id"]; name: string; color?: string; order: number }>
  | Readonly<{ id: CommandId; type: "transactionGroup.delete"; groupId: TransactionGroup["id"] }>
  | Readonly<{ id: CommandId; type: "transaction.moveToGroup"; transactionId: TransactionId; groupId?: TransactionGroup["id"] }>
  | Readonly<{ id: CommandId; type: "transaction.setTimeScale"; scale: TransactionTimeScale; clearShowSecondaryClock?: boolean }>
  | Readonly<{ id: CommandId; type: "timeline.setReferenceClock"; referenceClock?: SignalId }>
  | Readonly<{ id: CommandId; type: "timeline.setReferenceEdge"; edge: "rising" | "falling" }>
  | Readonly<{ id: CommandId; type: "timeline.setPhysicalTimebase"; physicalTimebase?: PhysicalTimebase }>
  | Readonly<{ id: CommandId; type: "annotation.updateAnchor"; annotationId: AnnotationId; anchor: SemanticAnchor }>
  | Readonly<{ id: CommandId; type: "annotation.create"; annotation: Annotation }>
  | Readonly<{ id: CommandId; type: "annotation.bulkCreate"; annotations: readonly Annotation[]; groups?: readonly AnnotationGroup[] }>
  | Readonly<{ id: CommandId; type: "annotation.bulkDelete"; annotationIds: readonly AnnotationId[] }>
  | Readonly<{ id: CommandId; type: "annotation.replaceCollection"; annotations: readonly Annotation[] }>
  | Readonly<{ id: CommandId; type: "annotation.delete"; annotationId: AnnotationId }>
  | Readonly<{ id: CommandId; type: "annotation.setAnchor"; annotationId: AnnotationId; field: "anchor" | "start" | "end" | "from" | "to"; anchor: SemanticAnchor }>
  | Readonly<{ id: CommandId; type: "annotation.translateOffsets"; annotationId: AnnotationId; delta: PixelOffset }>
  | Readonly<{ id: CommandId; type: "annotation.resetOffsets"; annotationId: AnnotationId }>
  | Readonly<{ id: CommandId; type: "annotation.updateLabelOffset"; annotationId: AnnotationId; labelOffset: PixelOffset }>
  | Readonly<{ id: CommandId; type: "annotation.updateProperties"; annotationId: AnnotationId; label: string; visible: boolean; color?: string; lineType?: Annotation["lineType"]; arrowhead?: Annotation["arrowhead"]; sourceSignalId?: SignalId; traceOffsetCycles?: number; opacity?: number; labelOffset?: Annotation["labelOffset"]; labelPlacement?: Annotation["labelPlacement"]; style?: Annotation["style"]; measurement?: Annotation["measurement"] }>
  | Readonly<{ id: CommandId; type: "annotation.updateVerticalSpan"; annotationId: AnnotationId; verticalSpan: NonNullable<Annotation["verticalSpan"]> }>
  | Readonly<{ id: CommandId; type: "annotation.setPositionMode"; annotationId: AnnotationId; positionMode: "cycle-snap" | "free" }>
  | Readonly<{ id: CommandId; type: "annotation.updateMeasurement"; annotationId: AnnotationId; profile: "cycle" | "30-70" | "10-90" | "20-80" | "50%" | "custom"; anchorKind: "threshold" | "ratio"; start: number; end: number; layout?: Annotation["measurementLayout"] }>
  | Readonly<{ id: CommandId; type: "annotation.bringToFront"; annotationId: AnnotationId }>
  | Readonly<{ id: CommandId; type: "annotation.sendToBack"; annotationId: AnnotationId }>
  | Readonly<{ id: CommandId; type: "annotation.setRotation"; annotationId: AnnotationId; rotation: number }>
  | Readonly<{ id: CommandId; type: "annotation.setAlign"; annotationId: AnnotationId; align: Annotation["align"] }>
  | Readonly<{ id: CommandId; type: "annotation.setLocked"; annotationId: AnnotationId; locked: boolean }>
  | Readonly<{ id: CommandId; type: "annotation.matchSpan"; annotationId: AnnotationId; spanCycles: number }>
  | Readonly<{ id: CommandId; type: "annotationGroup.create"; group: AnnotationGroup }>
  | Readonly<{ id: CommandId; type: "annotationGroup.delete"; groupId: AnnotationGroupId }>;

export interface ChangeSet {
  readonly fullDocumentReplace?: boolean;
  /** The command changes presentation only and leaves derived timing Problems unchanged. */
  readonly timingDiagnosticsUnchanged?: true;
  readonly rowOrder?: readonly RowId[];
  readonly rowPresentation?: readonly RowId[];
  readonly edgeCounter?: readonly SignalId[];
  readonly addedSignals?: readonly SignalId[];
  readonly removedSignals?: readonly SignalId[];
  readonly addedGroups?: readonly GroupId[];
  readonly removedGroups?: readonly GroupId[];
  readonly waveSemantics?: readonly SignalId[];
  readonly geometryLocal?: readonly SignalId[];
  readonly timelineSemantics?: boolean;
  /** Transaction cycles-per-TC presentation scale changed (#750): ruler/grid labels rebuild; canonical cycles do not move. */
  readonly transactionTimeScale?: boolean;
  readonly geometryScreenX?: boolean;
  readonly geometryScreenY?: readonly SignalId[];
  readonly annotationPosition?: readonly AnnotationId[];
  readonly annotationStyle?: readonly AnnotationId[];
  readonly annotationOrder?: readonly AnnotationId[];
  readonly annotationGroups?: readonly AnnotationGroupId[];
  readonly bookmarkPosition?: readonly BookmarkId[];
  readonly timeGroupSemantics?: readonly TimeGroupId[];
  readonly transactionSemantics?: readonly TransactionId[];
  readonly transactionGroupSemantics?: readonly TransactionGroupId[];
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
