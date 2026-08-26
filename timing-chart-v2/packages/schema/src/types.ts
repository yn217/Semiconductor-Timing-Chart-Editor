export type StableId<Kind extends string> = string & { readonly __kind: Kind };

export type SignalId = StableId<"signal">;
export type GroupId = StableId<"group">;
export type SpacerId = StableId<"spacer">;
export type RowId = SignalId | SpacerId;
export type AnnotationId = StableId<"annotation">;
export type TransactionId = StableId<"transaction">;
export type BookmarkId = StableId<"bookmark">;
export type TimeGroupId = StableId<"time-group">;
export type LabelAnchorId = StableId<"label-anchor">;
export type ConstraintId = StableId<"constraint">;
export type CommandId = StableId<"command">;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface PixelOffset { readonly x: number; readonly y: number }

export type AnchorPoint =
  | "cycle-start" | "cycle-center" | "cycle-end"
  | "transition-start" | "transition-center" | "transition-end"
  | "rising-edge" | "falling-edge" | "value-start" | "value-center" | "row-center";

export interface SemanticAnchor {
  readonly signalId?: SignalId;
  readonly cycle: number;
  readonly point: AnchorPoint;
  /** Fraction along a rendered transition segment; persisted semantic intent, never screen coordinates. */
  readonly threshold?: number;
  readonly offset?: PixelOffset;
}

export interface DocumentHeader {
  readonly subtitle: string;
  readonly description: string;
  readonly notes: string;
  readonly preconditions: readonly string[];
  readonly constraints: readonly string[];
  readonly exceptions: readonly string[];
}

export interface DocumentFooter {
  readonly figureNumber: string;
  readonly revision: string;
  readonly text: string;
}

export interface DocumentMetadata {
  readonly id: string;
  readonly title: string;
  readonly header: DocumentHeader;
  readonly footer: DocumentFooter;
}

export interface TimelineLabelAnchor {
  readonly id: LabelAnchorId;
  readonly source: number;
  readonly display: number;
  readonly ownerTimeGroupId?: TimeGroupId;
}

export interface Timeline {
  readonly start: 0;
  readonly end: number;
  readonly timeBase: "cycle";
  readonly cycleCount: number;
  readonly referenceClock?: SignalId;
  readonly edge: "rising" | "falling";
  readonly labelAnchors: readonly TimelineLabelAnchor[];
}

export type SignalRole = "input" | "output" | "internal";
export type SignalType = "binary" | "bus" | "state" | "logic" | "event" | "pulse" | "clock" | "commentRow";

export interface SignalValueChange {
  readonly start: number;
  readonly value: string | number;
  readonly comment?: string;
}

export interface SignalSource {
  readonly instancePath: readonly string[];
  readonly signalName: string;
  readonly msb?: number;
  readonly lsb?: number;
}

export interface SignalDisplay {
  readonly name: string;
  readonly visible?: boolean;
  readonly style?: JsonObject;
  readonly align?: "left" | "center" | "right";
  readonly overflow?: "expand" | "ellipsis" | "wrap";
}

export interface EdgeCounterSettings {
  readonly show: boolean;
  readonly mode: "rising" | "falling" | "both";
  readonly startNumber: number;
  readonly countFrom: "signal-start" | "selected-edge" | "marker" | "visible-range-start";
  readonly labelEvery: number;
  readonly position: "above" | "below";
  readonly offset: PixelOffset;
  readonly anchorId?: string;
}

export interface ClockGenerator {
  readonly start: number;
  readonly period: number;
  readonly duty: number;
  readonly phase: number;
  readonly initial: 0 | 1;
  readonly polarity: "positive" | "negative";
  readonly suppressedPeriods?: readonly number[];
}

interface SignalBase {
  readonly id: SignalId;
  readonly name: string;
  readonly role: SignalRole;
  readonly source: SignalSource;
  readonly display: SignalDisplay;
  readonly spacingBefore?: number;
  readonly spacingAfter?: number;
}

export interface ValueSignal extends SignalBase {
  readonly type: Exclude<SignalType, "clock" | "commentRow">;
  readonly values: readonly SignalValueChange[];
  readonly width?: number;
  readonly displayFormat?: "hex" | "binary" | "symbolic";
}

export interface ClockSignal extends SignalBase {
  readonly type: "clock";
  readonly generator: ClockGenerator;
  readonly enable?: readonly SignalValueChange[];
  readonly edgeCounter: EdgeCounterSettings;
}

export interface CommentRow {
  readonly id: SignalId;
  readonly type: "commentRow";
  readonly name: string;
  readonly role: "internal";
  readonly source: SignalSource;
  readonly display: SignalDisplay;
  readonly title: string;
  readonly body: string;
  readonly spacingBefore?: number;
  readonly spacingAfter?: number;
}

export type Signal = ValueSignal | ClockSignal | CommentRow;

export interface SpacerRow { readonly id: SpacerId; readonly height: number }

export interface SignalGroupStyle {
  readonly showBackground?: boolean;
  readonly background?: string;
  readonly opacity?: number;
  readonly extend?: "label" | "waveform" | "both";
  readonly border?: string;
  readonly showHeader?: boolean;
}

export interface SignalGroup {
  readonly id: GroupId;
  readonly name: string;
  readonly rows: readonly RowId[];
  readonly spacers?: readonly SpacerRow[];
  readonly spacingBefore?: number;
  readonly spacingAfter?: number;
  readonly style?: SignalGroupStyle;
}

export type AnnotationType = "text" | "callout" | "verticalLine" | "range" | "bracket" | "highlight" | "marker" | "measurement" | "arrow" | "dependency" | "timingRegion" | "ghostTrace";

export interface Annotation {
  readonly id: AnnotationId;
  readonly type: AnnotationType;
  readonly label: string;
  readonly visible: boolean;
  readonly color?: string;
  readonly comment?: string;
  readonly anchor?: SemanticAnchor;
  readonly start?: SemanticAnchor;
  readonly end?: SemanticAnchor;
  readonly from?: SemanticAnchor;
  readonly to?: SemanticAnchor;
  readonly labelOffset?: PixelOffset;
  readonly style?: JsonObject;
  readonly lineType?: "straight" | "orthogonal" | "curve" | "diagonal";
  readonly arrowhead?: "end" | "start" | "bidirectional" | "none";
  /** Source signal for a linked Ghost Trace; semantic identity, never a DOM or pixel reference. */
  readonly sourceSignalId?: SignalId;
  /** Source-cycle displacement used to compare a Ghost Trace with its source. */
  readonly traceOffsetCycles?: number;
  /** Overlay opacity for Timing Region/Ghost Trace, constrained by canonical validation. */
  readonly opacity?: number;
}

export interface Bookmark { readonly id: BookmarkId; readonly name: string; readonly start: number; readonly comment?: string }

export interface TimeGroupPresentation {
  readonly collapsed?: boolean;
  readonly foldStyle?: "none" | "compact" | "axis-break";
  readonly foldLabel?: string;
  readonly resumeLabelAnchorId?: LabelAnchorId;
}

export interface TimeGroup {
  readonly id: TimeGroupId;
  readonly name: string;
  readonly category?: string;
  readonly start: number;
  readonly end: number;
  readonly comment?: string;
  readonly presentation?: TimeGroupPresentation;
}

export interface TransactionPhase { readonly name: string; readonly start: number; readonly end: number }

export interface Transaction {
  readonly id: TransactionId;
  readonly name: string;
  readonly source?: string;
  readonly destination?: string;
  readonly start: number;
  readonly end: number;
  readonly phases?: readonly TransactionPhase[];
  readonly laneId?: string;
  readonly linkedSignals?: readonly SignalId[];
  readonly category?: string;
  readonly style?: JsonObject;
  readonly metadata?: JsonObject;
  readonly links?: JsonObject;
}

export interface Constraint { readonly id: ConstraintId; readonly type: string; readonly data?: JsonObject }

export interface Legend {
  readonly show: boolean;
  readonly orientation: "horizontal" | "vertical";
  readonly usedRolesOnly: boolean;
  readonly position: PixelOffset;
  readonly style?: JsonObject;
}

export interface Layout {
  readonly roleColumnWidth: number;
  readonly signalNameWidth: number;
  readonly signalNameAlign: "left" | "center" | "right";
  readonly rowHeight: number;
  readonly signalSpacing: number;
  readonly overflow: "expand" | "ellipsis" | "wrap";
}

export interface CheckSettings { readonly enabledCategories?: readonly string[] }

export interface CanonicalDocument {
  readonly formatVersion: 2;
  readonly document: DocumentMetadata;
  readonly timeline: Timeline;
  readonly signalGroups: readonly SignalGroup[];
  readonly signals: readonly Signal[];
  readonly bookmarks: readonly Bookmark[];
  readonly timeGroups: readonly TimeGroup[];
  readonly annotations: readonly Annotation[];
  readonly legend: Legend;
  readonly layout: Layout;
  readonly transactions: readonly Transaction[];
  readonly constraints: readonly Constraint[];
  readonly checkSettings: CheckSettings;
}

export interface DocumentProblem {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly entityId?: string;
}

export interface MigrationWarning { readonly code: string; readonly path: string; readonly message: string }

export type ParseDocumentResult =
  | Readonly<{ ok: true; document: CanonicalDocument; warnings: readonly MigrationWarning[] }>
  | Readonly<{ ok: false; kind: "syntax" | "unsupported-version" | "validation"; problems: readonly DocumentProblem[]; sourceFormatVersion?: number; raw?: unknown }>;
