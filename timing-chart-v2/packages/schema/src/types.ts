export type StableId<Kind extends string> = string & { readonly __kind: Kind };

export type SignalId = StableId<"signal">;
export type GroupId = StableId<"group">;
export type SpacerId = StableId<"spacer">;
export type RowId = SignalId | SpacerId;
export type AnnotationId = StableId<"annotation">;
export type AnnotationGroupId = StableId<"annotationGroup">;
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

export type { MeasurementArrowLayout, MeasurementExtensionLines, MeasurementLayout, MeasurementMarker, MeasurementProfile, TransitionAnchorKind } from "./annotation-semantics.js";

export interface TransitionAnchor {
  readonly kind: "threshold" | "ratio";
  readonly value: number;
}

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
  /** Explicit transition meaning. `threshold` remains accepted for legacy documents. */
  readonly transition?: TransitionAnchor;
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
  /** Optional presentation label; semantic value remains authoritative. */
  readonly displayLabel?: string;
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
  /** Signal Split View (#200) pane assignment. Absent means "both" -- a
   * Signal with no assignment renders identically to today's single-pane
   * behavior, so existing documents need no migration bump. */
  readonly splitPane?: "upper" | "lower" | "both";
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

export type AnnotationType = "text" | "callout" | "verticalLine" | "range" | "bracket" | "highlight" | "marker" | "measurement" | "arrow" | "dependency" | "timingRegion" | "ghostTrace" | "rectangle" | "ellipse" | "connector" | "textbox";

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
  /** Degrees, additive on top of any anchor-derived angle (line-shaped types
   * already auto-orient from their two anchors -- this rotates further on
   * top of that, it never replaces it). Meaningful for every AnnotationType. */
  readonly rotation?: number;
  /** Label text alignment, same vocabulary as Signal.display.align. */
  readonly align?: "left" | "center" | "right";
  /** When true, drag/nudge/anchor-edit interactions are blocked (see
   * AnnotationInteractionOwner.onPointerDown). Selection and visibility are
   * unaffected -- only position/shape edits are locked. */
  readonly locked?: boolean;
  /** Explicit datasheet measurement semantics; anchors contain the resolved endpoints. */
  readonly measurement?: {
    readonly profile: "cycle" | "30-70" | "10-90" | "20-80" | "50%" | "custom";
    readonly anchorKind: "threshold" | "ratio";
  };
  readonly measurementLayout?: import("./annotation-semantics.js").MeasurementLayout;
  /** Semantic vertical span for Markers; row identity is stable, never screen geometry. */
  readonly verticalSpan?: {
    readonly mode: "auto" | "rows" | "custom";
    readonly startRowId?: SignalId;
    readonly endRowId?: SignalId;
    readonly startOffset?: number;
    readonly endOffset?: number;
  };
}

/** Groups Annotations for "select together / drag together" -- same shape
 * as SignalGroup/rows (a separate entity holding member ids), not a
 * groupId field on Annotation, so membership stays a single source of
 * truth and an Annotation never needs to know which group it's in. */
export interface AnnotationGroup {
  readonly id: AnnotationGroupId;
  readonly name?: string;
  readonly annotationIds: readonly AnnotationId[];
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
  readonly parentId?: TimeGroupId;
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

export interface LegendEntry { readonly id: string; readonly role: SignalRole; readonly label: string; readonly visible: boolean; readonly order: number }

export interface Legend {
  readonly show: boolean;
  readonly orientation: "horizontal" | "vertical";
  readonly usedRolesOnly: boolean;
  readonly position: PixelOffset;
  readonly items?: readonly LegendEntry[];
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
  readonly annotationGroups: readonly AnnotationGroup[];
  readonly legend: Legend;
  readonly layout: Layout;
  readonly transactions: readonly Transaction[];
  readonly constraints: readonly Constraint[];
  readonly checkSettings: CheckSettings;
}

export const CANONICAL_PROBLEM_CODES = [
  "ANCHOR_SIGNAL_REQUIRED", "ANNOTATION_GROUP_DUPLICATE_MEMBER", "ANNOTATION_GROUP_MEMBER_NOT_FOUND",
  "BUS_WIDTH_OVERFLOW", "CHANGE_POINTS_NOT_STRICTLY_SORTED", "DUPLICATE_ID",
  "DUPLICATE_LABEL_ANCHOR_SOURCE", "DUPLICATE_ROW_MEMBERSHIP", "INVALID_ANCHOR_POINT", "INVALID_ANCHOR_THRESHOLD",
  "INVALID_ANCHOR_THRESHOLD_POINT", "INVALID_ANNOTATION_STYLE", "INVALID_BUS_LITERAL", "INVALID_LEGEND_ENTRY",
  "INVALID_REFERENCE_CLOCK", "INVALID_STABLE_ID", "INVALID_TIME_GROUP_RANGE", "INVALID_TRANSACTION_PHASE",
  "LABEL_ANCHOR_BOUNDARY_MISMATCH", "LABEL_ANCHOR_OWNER_MISMATCH", "MISSING_ANNOTATION_ANCHOR", "MISSING_CROSS_REFERENCE",
  "NON_FINITE_NUMBER", "NON_PERSISTENT_FIELD", "NON_TIMING_ANCHOR_TARGET", "ORPHAN_ROW", "SPACER_OWNER_MISMATCH",
  "TIME_GROUP_RESUME_BOUNDARY_MISMATCH", "TIME_GROUP_RESUME_OWNER_MISMATCH", "TIMELINE_END_MISMATCH", "TIMELINE_OUT_OF_RANGE",
  "UNKNOWN_ROW", "UNSUPPORTED_SIGNAL_VALUE",
  "TIME_GROUP_PARENT_NOT_FOUND", "TIME_GROUP_PARENT_CYCLE", "TIME_GROUP_PARENT_CONTAINMENT",
] as const;

export type CanonicalProblemCode = typeof CANONICAL_PROBLEM_CODES[number];
export const SCHEMA_RULE_KEYWORDS = [
  "additionalProperties", "allOf", "anyOf", "const", "enum", "items", "maximum", "minimum", "minLength", "pattern", "properties", "required", "type", "uniqueItems",
] as const;
export type SchemaRuleKeyword = typeof SCHEMA_RULE_KEYWORDS[number];
export type SchemaProblemCode = `SCHEMA_${Uppercase<SchemaRuleKeyword>}`;
export type CanonicalValidationCode = CanonicalProblemCode | SchemaProblemCode;

export interface SchemaRuleDescriptor {
  readonly code: SchemaProblemCode;
  readonly keyword: SchemaRuleKeyword;
  readonly category: "schema";
  readonly layer: "schema-structural";
  readonly owner: "schema-ajv";
  readonly severity: "error";
  readonly ruleVersion: 1;
}

export interface CanonicalRuleDescriptor {
  readonly code: CanonicalProblemCode;
  readonly category: "canonical";
  readonly owner: "canonical-validator";
  readonly layer: "canonical-invariant";
  readonly severity: "error";
  readonly title: string;
  readonly pathPattern: string;
  readonly entityContext: "optional" | "required";
  readonly fixability: "none";
  readonly ruleVersion: 1;
}

export interface CanonicalDocumentProblem {
  readonly code: CanonicalValidationCode;
  readonly path: string;
  readonly message: string;
  readonly entityId?: string;
  readonly offset?: number;
  readonly line?: number;
  readonly column?: number;
  readonly excerpt?: string;
  readonly caret?: string;
  readonly detail?: string;
}

export interface DocumentProblem {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly entityId?: string;
  readonly offset?: number;
  readonly line?: number;
  readonly column?: number;
  readonly detail?: string;
  /** Optional structured context retained by production workflows. */
  readonly severity?: "error" | "warning" | "info";
  readonly operation?: string;
  readonly operationLabel?: string;
  readonly commandId?: string;
  readonly objectType?: string;
  readonly objectId?: string;
  readonly objectLabel?: string;
  readonly field?: string;
  readonly value?: string | number | boolean;
  readonly expected?: string;
  readonly recommendation?: string;
  readonly source?: "validation" | "command" | "parser" | "save" | "open" | "export" | "clipboard" | "renderer" | "ai";
  readonly stage?: "parse" | "validate" | "serialize" | "storage" | "rasterize" | "clipboard-write" | "render" | "commit";
}

export interface MigrationWarning { readonly code: string; readonly path: string; readonly message: string }

export type ParsedCanonicalDocument = Readonly<{
  readonly ok: true;
  readonly document: CanonicalDocument;
  readonly warnings: readonly MigrationWarning[];
  readonly validated: true;
}>;

export type ParseDocumentResult =
  | ParsedCanonicalDocument
  | Readonly<{ ok: false; kind: "syntax" | "unsupported-version" | "validation"; problems: readonly DocumentProblem[]; sourceFormatVersion?: number; raw?: unknown }>;
