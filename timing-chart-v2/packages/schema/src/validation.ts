import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import canonicalSchema from "./canonical-document.schema.json" with { type: "json" };
import { isStableId } from "./stable-id.js";
import { CANONICAL_PROBLEM_CODES, SCHEMA_RULE_KEYWORDS, type Annotation, type CanonicalDocument, type CanonicalDocumentProblem, type CanonicalProblemCode, type CanonicalRuleDescriptor, type DocumentProblem, type SchemaProblemCode, type SchemaRuleDescriptor, type SchemaRuleKeyword, type SemanticAnchor, type Signal, type SignalValueChange, type TimeGroup } from "./types.js";
import { valueSignalValueProblem } from "./value-signal-compatibility.js";
import { validateEnumDefinition } from "./enum-semantics.js";
import { canonicalReferences } from "./reference-registry.js";
import { validateTimeGroupHierarchy } from "./time-group-hierarchy.js";
import { ANNOTATION_LABEL_MAX_WIDTH } from "./annotation-label-layout.js";
import { canonicalEntityInventory } from "./canonical-inventory.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const validateSchema = ajv.compile<CanonicalDocument>(canonicalSchema);

function problem(code: CanonicalProblemCode, path: string, message: string, entityId?: string): CanonicalDocumentProblem {
  return entityId === undefined ? { code, path, message } : { code, path, message, entityId };
}

function schemaProblem(error: ErrorObject): CanonicalDocumentProblem {
  const suffix = error.keyword === "required" ? `/${String(error.params.missingProperty)}` : "";
  const code: CanonicalProblemCode | SchemaProblemCode = error.keyword === "pattern" ? "INVALID_STABLE_ID" : `SCHEMA_${error.keyword.toUpperCase()}` as SchemaProblemCode;
  return code === "INVALID_STABLE_ID"
    ? problem(code, `$${error.instancePath}${suffix}`, error.message ?? "Schema validation failed.")
    : { code, path: `$${error.instancePath}${suffix}`, message: error.message ?? "Schema validation failed." };
}

const SCHEMA_RULE_DESCRIPTORS: readonly SchemaRuleDescriptor[] = SCHEMA_RULE_KEYWORDS.map((keyword) => ({
  code: `SCHEMA_${keyword.toUpperCase()}` as SchemaProblemCode,
  keyword: keyword as SchemaRuleKeyword,
  category: "schema",
  layer: "schema-structural",
  owner: "schema-ajv",
  severity: "error",
  ruleVersion: 1,
}));

export function schemaRuleDescriptors(): readonly SchemaRuleDescriptor[] {
  return SCHEMA_RULE_DESCRIPTORS;
}

export function schemaRuleDescriptor(keyword: SchemaRuleKeyword): SchemaRuleDescriptor | undefined {
  return SCHEMA_RULE_DESCRIPTORS.find((descriptor) => descriptor.keyword === keyword);
}

const canonicalRule = (code: CanonicalProblemCode, title: string, pathPattern: string, entityContext: CanonicalRuleDescriptor["entityContext"] = "required"): CanonicalRuleDescriptor => ({
  code, category: "canonical", owner: "canonical-validator", layer: "canonical-invariant", severity: "error", title, pathPattern, entityContext, fixability: "none", ruleVersion: 1,
});

// Keep this inventory exhaustive: every canonical problem code has one stable
// descriptor so Problems, Quick Fix, AI review, and CI can identify the same
// invariant without parsing human-readable messages.
const RULE_DESCRIPTORS: readonly CanonicalRuleDescriptor[] = [
  canonicalRule("TIME_GROUP_PARENT_NOT_FOUND", "TimeGroup parent must exist", "$.timeGroups[*].parentId"),
  canonicalRule("TIME_GROUP_PARENT_CYCLE", "TimeGroup parent graph must be acyclic", "$.timeGroups[*].parentId"),
  canonicalRule("TIME_GROUP_PARENT_CONTAINMENT", "TimeGroup parent must contain child", "$.timeGroups[*].parentId"),
  canonicalRule("ANCHOR_SIGNAL_REQUIRED", "Anchor requires a timing signal", "$.annotations[*].anchor.signalId"),
  canonicalRule("ANNOTATION_GROUP_DUPLICATE_MEMBER", "An Annotation can belong to at most one group", "$.annotationGroups[*].annotationIds[*]"),
  canonicalRule("ANNOTATION_GROUP_MEMBER_NOT_FOUND", "Annotation Group members must reference existing Annotations", "$.annotationGroups[*].annotationIds[*]"),
  canonicalRule("BUS_WIDTH_OVERFLOW", "Bus values must fit the declared width", "$.signals[*].values[*].value"),
  canonicalRule("CHANGE_POINTS_NOT_STRICTLY_SORTED", "Change points must be strictly increasing", "$.signals[*].values[*].start", "required"),
  canonicalRule("DUPLICATE_ID", "Canonical entity identifiers must be unique", "$.signals[*].id | $.signalGroups[*].id | $.annotations[*].id"),
  canonicalRule("DUPLICATE_LABEL_ANCHOR_SOURCE", "Label anchor sources must be unique", "$.timeline.labelAnchors[*].source"),
  canonicalRule("DUPLICATE_ROW_MEMBERSHIP", "Renderable rows must belong to one group", "$.signalGroups[*].rows[*]"),
  canonicalRule("INVALID_ANCHOR_POINT", "Anchor point must match signal semantics", "$.annotations[*].anchor.point"),
  canonicalRule("INVALID_ANCHOR_THRESHOLD", "Anchor threshold must be a fraction", "$.annotations[*].anchor.threshold"),
  canonicalRule("INVALID_ANCHOR_THRESHOLD_POINT", "Threshold anchor requires a transition point", "$.annotations[*].anchor.point"),
  canonicalRule("INVALID_ANNOTATION_STYLE", "Annotation style values must be valid", "$.annotations[*].opacity | $.annotations[*].traceOffsetCycles"),
  canonicalRule("INVALID_BUS_LITERAL", "Bus value must use a supported literal", "$.signals[*].values[*].value"),
  canonicalRule("INVALID_LEGEND_ENTRY", "Legend entries must have valid labels, order, and roles", "$.legend.items[*]"),
  canonicalRule("INVALID_REFERENCE_CLOCK", "Reference clock must target a clock signal", "$.timeline.referenceClock"),
  canonicalRule("INVALID_STABLE_ID", "Entity identifiers must be stable IDs", "$.signals[*].id | $.signalGroups[*].id | $.annotations[*].id"),
  canonicalRule("INVALID_TIME_GROUP_RANGE", "Time Group must use a valid half-open range", "$.timeGroups[*]"),
  canonicalRule("INVALID_TRANSACTION_PHASE", "Transaction phases must fit their parent range", "$.transactions[*].phases[*]"),
  canonicalRule("INVALID_TRANSACTION_TIME_SCALE", "Transaction time scale must use positive finite ratio and intervals", "$.transactionTimeScale"),
  canonicalRule("INVALID_ENUM_DEFINITION", "Enum definition values and labels must be unique and valid", "$.enumDefinitions[*]"),
  canonicalRule("INVALID_RESET_SEMANTICS", "Reset semantics must use valid source-time metadata", "$.signals[*].resetSemantics"),
  canonicalRule("LABEL_ANCHOR_BOUNDARY_MISMATCH", "Resume label anchor must match group boundary", "$.timeline.labelAnchors[*].source"),
  canonicalRule("LABEL_ANCHOR_OWNER_MISMATCH", "Label anchor owner must reciprocate", "$.timeline.labelAnchors[*].ownerTimeGroupId"),
  canonicalRule("MISSING_ANNOTATION_ANCHOR", "Annotation must provide its required anchor", "$.annotations[*]"),
  canonicalRule("MISSING_CROSS_REFERENCE", "Referenced canonical entity must exist", "$.timeline.referenceClock | $.signals[*].edgeCounter.anchorId | $.annotations[*] | $.transactions[*] | $.timeGroups[*]"),
  canonicalRule("NON_FINITE_NUMBER", "Canonical numbers must be finite", "$", "optional"),
  canonicalRule("NON_PERSISTENT_FIELD", "Derived or transient fields cannot be persisted", "$", "optional"),
  canonicalRule("NON_TIMING_ANCHOR_TARGET", "Annotations must target timing signals", "$.annotations[*].anchor.signalId"),
  canonicalRule("ORPHAN_ROW", "Renderable rows must belong to a group", "$.signalGroups[*].rows[*]"),
  canonicalRule("SPACER_OWNER_MISMATCH", "Spacer owner must match its containing group", "$.signalGroups[*].rows[*]"),
  canonicalRule("TIME_GROUP_RESUME_BOUNDARY_MISMATCH", "Time Group resume anchor must match its end", "$.timeGroups[*].presentation.resumeLabelAnchorId"),
  canonicalRule("TIME_GROUP_RESUME_OWNER_MISMATCH", "Resume anchor owner must reciprocate", "$.timeGroups[*].presentation.resumeLabelAnchorId"),
  canonicalRule("TIMELINE_END_MISMATCH", "Timeline end must equal cycle count", "$.timeline.end"),
  canonicalRule("TIMELINE_OUT_OF_RANGE", "Cycle coordinates must remain within the timeline", "$.signals[*] | $.annotations[*] | $.bookmarks[*] | $.transactions[*]"),
  canonicalRule("UNKNOWN_ROW", "Group rows must reference canonical renderable objects", "$.signalGroups[*].rows[*]"),
  canonicalRule("UNSUPPORTED_SIGNAL_VALUE", "Signal value must match its type contract", "$.signals[*].values[*].value"),
];

export function canonicalValidationCodes(): readonly CanonicalProblemCode[] {
  return CANONICAL_PROBLEM_CODES;
}

export function canonicalRuleDescriptors(): readonly CanonicalRuleDescriptor[] {
  return RULE_DESCRIPTORS;
}

export function canonicalRuleDescriptor(code: CanonicalProblemCode): CanonicalRuleDescriptor | undefined {
  return RULE_DESCRIPTORS.find((descriptor) => descriptor.code === code);
}

export type DocumentProblemRuleDescriptor = SchemaRuleDescriptor | CanonicalRuleDescriptor;

/** Resolve structured rule metadata without depending on human-readable messages. */
export function documentProblemRuleDescriptor(code: string): DocumentProblemRuleDescriptor | undefined {
  return RULE_DESCRIPTORS.find((descriptor) => descriptor.code === code)
    ?? SCHEMA_RULE_DESCRIPTORS.find((descriptor) => descriptor.code === code);
}

function walkNumbers(value: unknown, path: string, problems: DocumentProblem[]): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    problems.push(problem("NON_FINITE_NUMBER", path, "NaN and Infinity are forbidden in canonical documents."));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkNumbers(entry, `${path}[${index}]`, problems));
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => walkNumbers(entry, `${path}.${key}`, problems));
  }
}

const DERIVED_OR_TRANSIENT_KEYS = new Set([
  "wave", "waveJSON", "waveJson", "svg", "geometry", "localGeometry", "screenGeometry",
  "screenX", "screenY", "scroll", "scrollLeft", "scrollTop", "zoom", "selection", "hover",
  "problems", "minimap", "generatedEdges", "edgeList", "dragPreview",
]);

function findForbiddenState(value: unknown, path: string, problems: DocumentProblem[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenState(entry, `${path}[${index}]`, problems));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (DERIVED_OR_TRANSIENT_KEYS.has(key)) problems.push(problem("NON_PERSISTENT_FIELD", `${path}.${key}`, `Field '${key}' belongs to transient or derived state.`));
    findForbiddenState(entry, `${path}.${key}`, problems);
  }
}

function requiredBits(value: string | number, displayFormat: string | undefined): number | undefined {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return undefined;
    return value === 0 ? 1 : value.toString(2).length;
  }
  const literal = value.trim();
  const compact = literal.replaceAll("_", "");
  const validNumericSeparators = !literal.startsWith("_") && !literal.endsWith("_") && !literal.includes("__");
  if (literal.length === 0) return undefined;
  if (/^[XZ]$/i.test(literal)) return 1;
  if (validNumericSeparators && /^0b[01xz]+$/i.test(compact)) {
    const digits = compact.slice(2);
    if (/[xz]/i.test(digits)) return digits.length;
    const normalized = digits.replace(/^0+(?=.)/, "");
    return normalized === "0" ? 1 : normalized.length;
  }
  if (validNumericSeparators && /^0x[0-9a-fxz]+$/i.test(compact)) {
    const digits = compact.slice(2);
    if (/[xz]/i.test(digits)) return digits.length * 4;
    const numeric = BigInt(`0x${digits}`);
    return numeric === 0n ? 1 : numeric.toString(2).length;
  }
  if (validNumericSeparators && displayFormat === "binary" && /^[01xz]+$/i.test(compact)) {
    if (/[xz]/i.test(compact)) return compact.length;
    const normalized = compact.replace(/^0+(?=.)/, "");
    return normalized === "0" ? 1 : normalized.length;
  }
  if (validNumericSeparators && /^[0-9a-fxz]+$/i.test(compact)) {
    if (/[xz]/i.test(compact)) return compact.length * 4;
    const numeric = BigInt(`0x${compact}`);
    return numeric === 0n ? 1 : numeric.toString(2).length;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(literal)) return undefined;
  return Number.NaN;
}

function validateChanges(signal: Signal, changes: readonly SignalValueChange[], path: string, cycleCount: number, problems: DocumentProblem[]): void {
  let previous = -1;
  changes.forEach((change, index) => {
    const changePath = `${path}[${index}]`;
    if (!Number.isInteger(change.start) || change.start < 0 || change.start >= cycleCount) {
      problems.push(problem("TIMELINE_OUT_OF_RANGE", `${changePath}.start`, `Change point must be an integer cycle satisfying 0 <= start < ${cycleCount}.`, signal.id));
    }
    if (change.start <= previous) problems.push(problem("CHANGE_POINTS_NOT_STRICTLY_SORTED", `${changePath}.start`, "Change points must be strictly increasing with no duplicate start.", signal.id));
    previous = change.start;
    if (signal.type === "bus" && signal.width !== undefined) {
      const bits = requiredBits(change.value, signal.displayFormat);
      if (Number.isNaN(bits)) problems.push(problem("INVALID_BUS_LITERAL", `${changePath}.value`, "Bus value is neither a supported literal nor a symbolic identifier.", signal.id));
      else if (bits !== undefined && bits > signal.width) problems.push(problem("BUS_WIDTH_OVERFLOW", `${changePath}.value`, `Value requires ${bits} bits but signal width is ${signal.width}.`, signal.id));
    }
    if (signal.type !== "bus" && signal.type !== "state" && signal.type !== "clock" && signal.type !== "commentRow") {
      const compatibility = valueSignalValueProblem(signal.type, change.value);
      if (compatibility) problems.push(problem("UNSUPPORTED_SIGNAL_VALUE", `${changePath}.value`, compatibility, signal.id));
    }
  });
}

function validateAnchor(anchor: SemanticAnchor, path: string, annotation: Annotation, signals: ReadonlyMap<string, Signal>, cycleCount: number, problems: DocumentProblem[]): void {
  const fractionalFreeHighlight = annotation.type === "highlight" && annotation.positionMode === "free";
  if ((!fractionalFreeHighlight && !Number.isInteger(anchor.cycle)) || !Number.isFinite(anchor.cycle) || anchor.cycle < 0 || anchor.cycle >= cycleCount) {
    problems.push(problem("TIMELINE_OUT_OF_RANGE", `${path}.cycle`, `${fractionalFreeHighlight ? "Free Highlight" : "Annotation"} anchor must use a valid source cycle in the timeline.`, annotation.id));
  }
  if (anchor.threshold !== undefined) {
    if (!Number.isFinite(anchor.threshold) || anchor.threshold < 0 || anchor.threshold > 1) problems.push(problem("INVALID_ANCHOR_THRESHOLD", `${path}.threshold`, "Anchor threshold must be a finite fraction between 0 and 1.", annotation.id));
    if (!(anchor.point === "transition-start" || anchor.point === "transition-center" || anchor.point === "transition-end")) problems.push(problem("INVALID_ANCHOR_THRESHOLD_POINT", `${path}.threshold`, "Anchor threshold requires a transition point.", annotation.id));
  }
  if (anchor.transition !== undefined) {
    if (!Number.isFinite(anchor.transition.value) || anchor.transition.value < 0 || anchor.transition.value > 1) problems.push(problem("INVALID_ANCHOR_THRESHOLD", `${path}.transition.value`, "Transition anchor value must be a finite fraction between 0 and 1.", annotation.id));
    if (!(anchor.point === "transition-start" || anchor.point === "transition-center" || anchor.point === "transition-end")) problems.push(problem("INVALID_ANCHOR_THRESHOLD_POINT", `${path}.transition`, "Transition anchor requires a transition point.", annotation.id));
    if (anchor.threshold !== undefined && anchor.threshold !== anchor.transition.value) problems.push(problem("INVALID_ANCHOR_THRESHOLD", `${path}.threshold`, "Legacy threshold and explicit transition value must agree.", annotation.id));
  }
  if (anchor.signalId !== undefined) {
    const target = signals.get(anchor.signalId);
   if (target && target.type === "commentRow") problems.push(problem("NON_TIMING_ANCHOR_TARGET", `${path}.signalId`, "Annotations cannot target a non-timing comment row.", annotation.id));
   else if (target) {
      const valueOnly = anchor.point === "value-start" || anchor.point === "value-center";
      if (valueOnly && target.type === "clock") problems.push(problem("INVALID_ANCHOR_POINT", `${path}.point`, `Point '${anchor.point}' requires a value signal.`, annotation.id));
      const edgeOnly = anchor.point === "rising-edge" || anchor.point === "falling-edge";
      if (edgeOnly && (target.type === "bus" || target.type === "state" || target.type === "event")) problems.push(problem("INVALID_ANCHOR_POINT", `${path}.point`, `Point '${anchor.point}' is not defined for ${target.type} signals.`, annotation.id));
      const transitionOnly = anchor.point === "transition-start" || anchor.point === "transition-center" || anchor.point === "transition-end";
      if (transitionOnly && target.type === "clock") problems.push(problem("INVALID_ANCHOR_POINT", `${path}.point`, `Point '${anchor.point}' is not defined for clock signals.`, annotation.id));
    }
  } else if (["rising-edge", "falling-edge", "value-start", "value-center", "row-center"].includes(anchor.point)) {
    problems.push(problem("ANCHOR_SIGNAL_REQUIRED", `${path}.signalId`, `Point '${anchor.point}' requires signalId.`, annotation.id));
  }
}

export function validateCanonicalDocument(input: unknown): readonly CanonicalDocumentProblem[] {
  const problems: CanonicalDocumentProblem[] = [];
  walkNumbers(input, "$", problems);
  findForbiddenState(input, "$", problems);
  if (!validateSchema(input)) problems.push(...(validateSchema.errors ?? []).map(schemaProblem));
  if (problems.length > 0 || input === null || typeof input !== "object") return problems;

  const document = input as CanonicalDocument;
  const allIds = new Map<string, string>();
  const registerId = (id: string, path: string, kind: string): void => {
    if (!isStableId(id)) {
      problems.push(problem("INVALID_STABLE_ID", path, `'${id}' is not a valid stable ID.`, id));
      return;
    }
    const previous = allIds.get(id);
    if (previous) problems.push(problem("DUPLICATE_ID", path, `ID '${id}' is already owned by ${previous}.`, id));
    else allIds.set(id, kind);
  };

  for (const entry of canonicalEntityInventory(document)) registerId(entry.id, entry.path, entry.kind);

  if (document.timeline.end !== document.timeline.cycleCount) problems.push(problem("TIMELINE_END_MISMATCH", "$.timeline.end", "Canonical timeline end must equal cycleCount."));

  const signals = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const transactionGroups = new Map((document.transactionGroups ?? []).map((group) => [group.id, group]));
  const transactionScale = document.transactionTimeScale;
  document.signals.forEach((signal, index) => {
    if (signal.type === "clock" || signal.type === "commentRow") return;
    const reset = signal.resetSemantics;
    if (!reset) return;
    const valid = (reset.assertCycle === undefined || (Number.isInteger(reset.assertCycle) && reset.assertCycle >= 0 && reset.assertCycle < document.timeline.cycleCount)) && (reset.deassertCycle === undefined || (Number.isInteger(reset.deassertCycle) && reset.deassertCycle >= 0 && reset.deassertCycle < document.timeline.cycleCount)) && (reset.assertCycle === undefined || reset.deassertCycle === undefined || reset.assertCycle <= reset.deassertCycle);
    if (!valid) problems.push(problem("INVALID_RESET_SEMANTICS", `$.signals[${index}].resetSemantics`, "Reset assert/deassert cycles must be in range and ordered.", signal.id));
  });
  if (transactionScale !== undefined && (!Number.isFinite(transactionScale.clockCyclesPerTransactionCycle) || transactionScale.clockCyclesPerTransactionCycle <= 0 || !Number.isInteger(transactionScale.majorInterval) || transactionScale.majorInterval < 1 || !Number.isInteger(transactionScale.minorInterval) || transactionScale.minorInterval < 1)) problems.push(problem("INVALID_TRANSACTION_TIME_SCALE", "$.transactionTimeScale", "Transaction time scale is invalid."));
  const spacerOwners = new Map<string, string>(document.signalGroups.flatMap((group) => (group.spacers ?? []).map((spacer) => [spacer.id, group.id] as const)));
  const spacers = new Set(spacerOwners.keys());
  const renderableRows = new Set<string>([...signals.keys(), ...spacers]);
  const occurrences = new Map<string, number>();
  document.signalGroups.forEach((group, groupIndex) => group.rows.forEach((rowId, rowIndex) => {
    occurrences.set(rowId, (occurrences.get(rowId) ?? 0) + 1);
    if (!renderableRows.has(rowId)) problems.push(problem("UNKNOWN_ROW", `$.signalGroups[${groupIndex}].rows[${rowIndex}]`, `Row '${rowId}' has no canonical signal or spacer owner.`, rowId));
    const spacerOwner = spacerOwners.get(rowId);
    if (spacerOwner !== undefined && spacerOwner !== group.id) problems.push(problem("SPACER_OWNER_MISMATCH", `$.signalGroups[${groupIndex}].rows[${rowIndex}]`, `Spacer '${rowId}' belongs to group '${spacerOwner}', not '${group.id}'.`, rowId));
  }));
  for (const rowId of renderableRows) {
    const count = occurrences.get(rowId) ?? 0;
    if (count === 0) problems.push(problem("ORPHAN_ROW", "$.signalGroups", `Renderable row '${rowId}' does not belong to a group.`, rowId));
    else if (count > 1) problems.push(problem("DUPLICATE_ROW_MEMBERSHIP", "$.signalGroups", `Renderable row '${rowId}' occurs ${count} times.`, rowId));
  }

  if (document.timeline.referenceClock !== undefined) {
    const reference = signals.get(document.timeline.referenceClock);
    if (reference && reference.type !== "clock") problems.push(problem("INVALID_REFERENCE_CLOCK", "$.timeline.referenceClock", "Reference clock must target a clock signal.", reference.id));

  }

  document.signals.forEach((signal, index) => {
    if (signal.type === "clock") {
      if (signal.edgeCounter.countFrom === "marker" && signal.edgeCounter.anchorId === undefined) {
        problems.push(problem("MISSING_CROSS_REFERENCE", `$.signals[${index}].edgeCounter.anchorId`, "Marker count-from requires an explicit Bookmark anchor.", signal.id));
      }
      if (!Number.isInteger(signal.generator.start) || signal.generator.start < 0 || signal.generator.start >= document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.signals[${index}].generator.start`, "Clock generator start must be an integer cycle inside the timeline.", signal.id));
      if (signal.enable) validateChanges(signal, signal.enable, `$.signals[${index}].enable`, document.timeline.cycleCount, problems);
    } else if (signal.type !== "commentRow") {
      validateChanges(signal, signal.values, `$.signals[${index}].values`, document.timeline.cycleCount, problems);
    }
  });

  document.annotations.forEach((annotation, index) => {
    const required = (["text", "callout", "verticalLine", "marker", "textbox"] as const).includes(annotation.type as "text") ? ["anchor"]
      : (["range", "bracket", "highlight", "measurement", "timingRegion", "ghostTrace", "rectangle", "ellipse"] as const).includes(annotation.type as "range") ? ["start", "end"]
      : ["from", "to"];
    for (const field of required) if (!annotation[field as keyof Annotation]) problems.push(problem("MISSING_ANNOTATION_ANCHOR", `$.annotations[${index}].${field}`, `Annotation type '${annotation.type}' requires '${field}'.`, annotation.id));
    for (const key of ["anchor", "start", "end", "from", "to"] as const) {
      const anchor = annotation[key];
      if (anchor) validateAnchor(anchor, `$.annotations[${index}].${key}`, annotation, signals, document.timeline.cycleCount, problems);
    }
    if (annotation.measurement !== undefined && annotation.type !== "measurement") problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].measurement`, "Measurement semantics are only valid for Measurement annotations.", annotation.id));
    if (annotation.style?.labelWrap !== undefined && typeof annotation.style.labelWrap !== "boolean") problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].style.labelWrap`, "Annotation labelWrap must be a boolean.", annotation.id));
    if (annotation.style?.labelMaxWidth !== undefined && (typeof annotation.style.labelMaxWidth !== "number" || !Number.isFinite(annotation.style.labelMaxWidth) || annotation.style.labelMaxWidth < ANNOTATION_LABEL_MAX_WIDTH.min || annotation.style.labelMaxWidth > ANNOTATION_LABEL_MAX_WIDTH.max)) problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].style.labelMaxWidth`, `Annotation label maximum width must be between ${ANNOTATION_LABEL_MAX_WIDTH.min} and ${ANNOTATION_LABEL_MAX_WIDTH.max} px.`, annotation.id));
    if (annotation.measurementLayout !== undefined && annotation.type !== "measurement") problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].measurementLayout`, "Measurement layout is only valid for Measurement annotations.", annotation.id));
    if (annotation.verticalSpan !== undefined) {
      if (annotation.type !== "marker") problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].verticalSpan`, "Vertical span is only valid for Marker annotations.", annotation.id));
      if (annotation.verticalSpan.mode === "rows" && (!annotation.verticalSpan.startRowId || !annotation.verticalSpan.endRowId)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.annotations[${index}].verticalSpan`, "Rows mode requires stable boundary row IDs.", annotation.id));
      for (const [key, id] of [["startRowId", annotation.verticalSpan.startRowId], ["endRowId", annotation.verticalSpan.endRowId]] as const) if (id && !signals.has(id)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.annotations[${index}].verticalSpan.${key}`, "Vertical span boundary must reference an existing Signal.", annotation.id));
      for (const [key, offset] of [["startOffset", annotation.verticalSpan.startOffset], ["endOffset", annotation.verticalSpan.endOffset]] as const) if (offset !== undefined && !Number.isFinite(offset)) problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].verticalSpan.${key}`, "Vertical span offsets must be finite.", annotation.id));
    }
    if (annotation.positionMode !== undefined) {
      if (annotation.type !== "highlight") problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].positionMode`, "Position mode is only valid for Highlight annotations.", annotation.id));
      if (annotation.positionMode === "cycle-snap") {
        for (const field of ["anchor", "start", "end"] as const) if (annotation[field] && !Number.isInteger(annotation[field]!.cycle)) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.annotations[${index}].${field}.cycle`, "Cycle-snap Highlight anchors must use integer source boundaries.", annotation.id));
      }
    }
    if (annotation.type === "ghostTrace") {
      if (!annotation.sourceSignalId) problems.push(problem("MISSING_CROSS_REFERENCE", `$.annotations[${index}].sourceSignalId`, "Ghost Trace requires a source Signal.", annotation.id));

      if (annotation.traceOffsetCycles !== undefined && !Number.isFinite(annotation.traceOffsetCycles)) problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].traceOffsetCycles`, "Ghost Trace cycle offset must be finite.", annotation.id));
    }
    if ((annotation.type === "timingRegion" || annotation.type === "ghostTrace") && annotation.opacity !== undefined && (!Number.isFinite(annotation.opacity) || annotation.opacity < 0 || annotation.opacity > 1)) problems.push(problem("INVALID_ANNOTATION_STYLE", `$.annotations[${index}].opacity`, "Overlay opacity must be between 0 and 1.", annotation.id));
  });

  const annotationIds = new Set<string>(document.annotations.map((item) => item.id));
  const annotationGroupMembership = new Map<string, string>();
  (document.annotationGroups ?? []).forEach((group, groupIndex) => {
    group.annotationIds.forEach((annotationId, memberIndex) => {
      const path = `$.annotationGroups[${groupIndex}].annotationIds[${memberIndex}]`;
      if (!annotationIds.has(annotationId)) problems.push(problem("ANNOTATION_GROUP_MEMBER_NOT_FOUND", path, `Annotation '${annotationId}' does not exist.`, group.id));
      const owner = annotationGroupMembership.get(annotationId);
      if (owner) problems.push(problem("ANNOTATION_GROUP_DUPLICATE_MEMBER", path, `Annotation '${annotationId}' already belongs to group '${owner}'.`, group.id));
      else annotationGroupMembership.set(annotationId, group.id);
    });
  });

  const timeGroups = new Map<string, TimeGroup>(document.timeGroups.map((group) => [group.id, group]));
  const enumIds = new Set<string>((document.enumDefinitions ?? []).map((definition) => definition.id));
  const bookmarks = new Set<string>(document.bookmarks.map((bookmark) => bookmark.id));
  const labelAnchors = new Map(document.timeline.labelAnchors.map((anchor) => [anchor.id, anchor]));
  const groups = new Set<string>(document.signalGroups.map((group) => group.id));
  for (const reference of canonicalReferences(document)) {
    const targetExists = reference.targetType === "signal" ? signals.has(reference.targetId)
      : reference.targetType === "time-group" ? timeGroups.has(reference.targetId)
      : reference.targetType === "group" ? groups.has(reference.targetId)
      : reference.targetType === "spacer" ? spacers.has(reference.targetId) : reference.targetType === "enum" ? enumIds.has(reference.targetId) : bookmarks.has(reference.targetId);
    if (!targetExists) {
      const targetLabel = reference.targetType === "signal" ? "Signal"
        : reference.targetType === "time-group" ? "Time Group"
        : reference.targetType === "group" ? "Signal Group" : reference.targetType === "spacer" ? "Spacer" : reference.targetType === "enum" ? "Enum" : "Bookmark";
      problems.push(problem("MISSING_CROSS_REFERENCE", reference.path, targetLabel + " '" + reference.targetId + "' does not exist.", reference.ownerId));
    }
  }
  document.enumDefinitions?.forEach((definition, index) => {
    const enumProblem = validateEnumDefinition(definition);
    if (enumProblem) problems.push(problem("INVALID_ENUM_DEFINITION", `$.enumDefinitions[${index}]`, enumProblem, definition.id));
  });
  document.bookmarks.forEach((bookmark, index) => {
    if (!Number.isInteger(bookmark.start) || bookmark.start < 0 || bookmark.start >= document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.bookmarks[${index}].start`, "Bookmark must be an integer cycle within the source timeline.", bookmark.id));
  });
  document.timeGroups.forEach((group, index) => {
    if (!Number.isInteger(group.start) || !Number.isInteger(group.end) || group.start < 0 || group.start >= group.end || group.end > document.timeline.cycleCount) problems.push(problem("INVALID_TIME_GROUP_RANGE", `$.timeGroups[${index}]`, "Time Group must use an integer-cycle half-open range within the source timeline.", group.id));
    const resume = group.presentation?.resumeLabelAnchorId;
    if (resume && !labelAnchors.has(resume)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.timeGroups[${index}].presentation.resumeLabelAnchorId`, `Label anchor '${resume}' does not exist.`, group.id));
    if (resume) {
      const anchor = labelAnchors.get(resume);
      if (anchor && anchor.ownerTimeGroupId !== group.id) problems.push(problem("TIME_GROUP_RESUME_OWNER_MISMATCH", `$.timeGroups[${index}].presentation.resumeLabelAnchorId`, "Resume label anchor must reciprocally name this Time Group as owner.", group.id));
      if (anchor && anchor.source !== group.end) problems.push(problem("TIME_GROUP_RESUME_BOUNDARY_MISMATCH", `$.timeGroups[${index}].presentation.resumeLabelAnchorId`, `Resume label anchor must be at Time Group end ${group.end}.`, group.id));
    }
  });
  problems.push(...validateTimeGroupHierarchy(document.timeGroups));
  const labelSources = new Map<number, string>();
  document.timeline.labelAnchors.forEach((anchor, index) => {
    if (!Number.isInteger(anchor.source) || anchor.source < 0 || anchor.source > document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.timeline.labelAnchors[${index}].source`, "Ruler label anchor source must be an integer cycle within the source timeline.", anchor.id));
    if (!Number.isInteger(anchor.display)) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.timeline.labelAnchors[${index}].display`, "Ruler label anchor display value must be an integer cycle.", anchor.id));

    const prior = labelSources.get(anchor.source);
    if (prior !== undefined) problems.push(problem("DUPLICATE_LABEL_ANCHOR_SOURCE", `$.timeline.labelAnchors[${index}].source`, `Source ${anchor.source} is already owned by label anchor '${prior}'.`, anchor.id));
    else labelSources.set(anchor.source, anchor.id);
    if (anchor.ownerTimeGroupId) {
      const owner = timeGroups.get(anchor.ownerTimeGroupId);
      if (owner && owner.end !== anchor.source) problems.push(problem("LABEL_ANCHOR_BOUNDARY_MISMATCH", `$.timeline.labelAnchors[${index}].source`, `Resume label anchor must be at owner Time Group end ${owner.end}.`, anchor.id));
      if (owner?.presentation?.resumeLabelAnchorId !== anchor.id) problems.push(problem("LABEL_ANCHOR_OWNER_MISMATCH", `$.timeline.labelAnchors[${index}].ownerTimeGroupId`, "Owner Time Group must reciprocally reference this resume label anchor.", anchor.id));
    }
  });
  document.transactions.forEach((transaction, index) => {
    if (!Number.isInteger(transaction.start) || !Number.isInteger(transaction.end) || transaction.start < 0 || transaction.start >= transaction.end || transaction.end > document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.transactions[${index}]`, "Transaction must use an integer-cycle half-open range within the source timeline.", transaction.id));
    transaction.phases?.forEach((phase, phaseIndex) => {
      if (!phase.name.trim() || !Number.isInteger(phase.start) || !Number.isInteger(phase.end) || phase.start < transaction.start || phase.start >= phase.end || phase.end > transaction.end) problems.push(problem("INVALID_TRANSACTION_PHASE", `$.transactions[${index}].phases[${phaseIndex}]`, "Phase must be named and use an integer-cycle half-open subrange of its transaction.", transaction.id));
    });
    transaction.linkedSignals?.forEach((signalId, signalIndex) => {
      if (!signals.has(signalId)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.transactions[${index}].linkedSignals[${signalIndex}]`, `Signal '${signalId}' does not exist.`, transaction.id));
    });
    if (transaction.groupId !== undefined && !transactionGroups.has(transaction.groupId)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.transactions[${index}].groupId`, `Transaction Group '${transaction.groupId}' does not exist.`, transaction.id));
  });

  const legendEntryIds = new Set<string>();
  const legendOrders = new Set<number>();
  document.legend.items?.forEach((entry, index) => {
    if (!isStableId(entry.id)) problems.push(problem("INVALID_STABLE_ID", `$.legend.items[${index}].id`, "Legend entry ID must be stable.", entry.id));
    if (legendEntryIds.has(entry.id)) problems.push(problem("DUPLICATE_ID", `$.legend.items[${index}].id`, `Legend entry ID '${entry.id}' is duplicated.`, entry.id));
    legendEntryIds.add(entry.id);
    if (!entry.label.trim()) problems.push(problem("INVALID_LEGEND_ENTRY", `$.legend.items[${index}].label`, "Legend entry label cannot be empty.", entry.id));
    if (!Number.isInteger(entry.order) || entry.order < 0 || legendOrders.has(entry.order)) problems.push(problem("INVALID_LEGEND_ENTRY", `$.legend.items[${index}].order`, "Legend entry order must be a unique non-negative integer.", entry.id));
    legendOrders.add(entry.order);
    if (!(entry.role === "input" || entry.role === "output" || entry.role === "internal")) problems.push(problem("INVALID_LEGEND_ENTRY", `$.legend.items[${index}].role`, "Legend entry role is not supported by the canonical SignalRole contract.", entry.id));
  });

  return problems;
}

export function assertCanonicalDocument(input: unknown): asserts input is CanonicalDocument {
  const problems = validateCanonicalDocument(input);
  if (problems.length > 0) throw new CanonicalDocumentError(problems);
}

export class CanonicalDocumentError extends Error {
  readonly problems: readonly DocumentProblem[];

  constructor(problems: readonly DocumentProblem[]) {
    super(`Canonical document validation failed with ${problems.length} problem(s).`);
    this.name = "CanonicalDocumentError";
    this.problems = problems;
  }
}

export { canonicalSchema };
