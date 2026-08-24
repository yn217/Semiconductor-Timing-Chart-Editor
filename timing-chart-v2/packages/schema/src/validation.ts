import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import canonicalSchema from "./canonical-document.schema.json" with { type: "json" };
import { isStableId } from "./stable-id.js";
import type { Annotation, CanonicalDocument, DocumentProblem, SemanticAnchor, Signal, SignalValueChange } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const validateSchema = ajv.compile<CanonicalDocument>(canonicalSchema);

function problem(code: string, path: string, message: string, entityId?: string): DocumentProblem {
  return entityId === undefined ? { code, path, message } : { code, path, message, entityId };
}

function schemaProblem(error: ErrorObject): DocumentProblem {
  const suffix = error.keyword === "required" ? `/${String(error.params.missingProperty)}` : "";
  const code = error.keyword === "pattern" ? "INVALID_STABLE_ID" : `SCHEMA_${error.keyword.toUpperCase()}`;
  return problem(code, `$${error.instancePath}${suffix}`, error.message ?? "Schema validation failed.");
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
    if (!Number.isFinite(change.start) || change.start < 0 || change.start >= cycleCount) {
      problems.push(problem("TIMELINE_OUT_OF_RANGE", `${changePath}.start`, `Change point must satisfy 0 <= start < ${cycleCount}.`, signal.id));
    }
    if (change.start <= previous) problems.push(problem("CHANGE_POINTS_NOT_STRICTLY_SORTED", `${changePath}.start`, "Change points must be strictly increasing with no duplicate start.", signal.id));
    previous = change.start;
    if (signal.type === "bus" && signal.width !== undefined) {
      const bits = requiredBits(change.value, signal.displayFormat);
      if (Number.isNaN(bits)) problems.push(problem("INVALID_BUS_LITERAL", `${changePath}.value`, "Bus value is neither a supported literal nor a symbolic identifier.", signal.id));
      else if (bits !== undefined && bits > signal.width) problems.push(problem("BUS_WIDTH_OVERFLOW", `${changePath}.value`, `Value requires ${bits} bits but signal width is ${signal.width}.`, signal.id));
    }
  });
}

function validateAnchor(anchor: SemanticAnchor, path: string, annotation: Annotation, signals: ReadonlyMap<string, Signal>, cycleCount: number, problems: DocumentProblem[]): void {
  if (!Number.isFinite(anchor.cycle) || anchor.cycle < 0 || anchor.cycle >= cycleCount) {
    problems.push(problem("TIMELINE_OUT_OF_RANGE", `${path}.cycle`, `Annotation anchor must satisfy 0 <= cycle < ${cycleCount}.`, annotation.id));
  }
  if (anchor.signalId !== undefined) {
    const target = signals.get(anchor.signalId);
    if (!target) problems.push(problem("MISSING_CROSS_REFERENCE", `${path}.signalId`, `Signal '${anchor.signalId}' does not exist.`, annotation.id));
    else if (target.type === "commentRow") problems.push(problem("NON_TIMING_ANCHOR_TARGET", `${path}.signalId`, "Annotations cannot target a non-timing comment row.", annotation.id));
    else {
      const valueOnly = anchor.point === "value-start" || anchor.point === "value-center";
      if (valueOnly && target.type === "clock") problems.push(problem("INVALID_ANCHOR_POINT", `${path}.point`, `Point '${anchor.point}' requires a value signal.`, annotation.id));
    }
  } else if (["rising-edge", "falling-edge", "value-start", "value-center", "row-center"].includes(anchor.point)) {
    problems.push(problem("ANCHOR_SIGNAL_REQUIRED", `${path}.signalId`, `Point '${anchor.point}' requires signalId.`, annotation.id));
  }
}

export function validateCanonicalDocument(input: unknown): readonly DocumentProblem[] {
  const problems: DocumentProblem[] = [];
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

  document.signals.forEach((signal, index) => registerId(signal.id, `$.signals[${index}].id`, "signal"));
  document.signalGroups.forEach((group, index) => {
    registerId(group.id, `$.signalGroups[${index}].id`, "group");
    group.spacers?.forEach((spacer, spacerIndex) => registerId(spacer.id, `$.signalGroups[${index}].spacers[${spacerIndex}].id`, "spacer"));
  });
  document.annotations.forEach((item, index) => registerId(item.id, `$.annotations[${index}].id`, "annotation"));
  document.transactions.forEach((item, index) => registerId(item.id, `$.transactions[${index}].id`, "transaction"));
  document.bookmarks.forEach((item, index) => registerId(item.id, `$.bookmarks[${index}].id`, "bookmark"));
  document.timeGroups.forEach((item, index) => registerId(item.id, `$.timeGroups[${index}].id`, "time-group"));
  document.timeline.labelAnchors.forEach((item, index) => registerId(item.id, `$.timeline.labelAnchors[${index}].id`, "label-anchor"));
  document.constraints.forEach((item, index) => registerId(item.id, `$.constraints[${index}].id`, "constraint"));

  if (document.timeline.end !== document.timeline.cycleCount) problems.push(problem("TIMELINE_END_MISMATCH", "$.timeline.end", "Canonical timeline end must equal cycleCount."));

  const signals = new Map(document.signals.map((signal) => [signal.id, signal]));
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
    if (!reference) problems.push(problem("MISSING_CROSS_REFERENCE", "$.timeline.referenceClock", `Reference clock '${document.timeline.referenceClock}' does not exist.`));
    else if (reference.type !== "clock") problems.push(problem("INVALID_REFERENCE_CLOCK", "$.timeline.referenceClock", "Reference clock must target a clock signal.", reference.id));
    else if (reference.display.visible === false) problems.push(problem("HIDDEN_REFERENCE_CLOCK", "$.timeline.referenceClock", "Reference clock must remain visible so ruler geometry is defined.", reference.id));
  }

  document.signals.forEach((signal, index) => {
    if (signal.type === "clock") {
      if (signal.generator.start < 0 || signal.generator.start >= document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.signals[${index}].generator.start`, "Clock generator start is outside the timeline.", signal.id));
      if (signal.enable) validateChanges(signal, signal.enable, `$.signals[${index}].enable`, document.timeline.cycleCount, problems);
    } else if (signal.type !== "commentRow") {
      validateChanges(signal, signal.values, `$.signals[${index}].values`, document.timeline.cycleCount, problems);
    }
  });

  document.annotations.forEach((annotation, index) => {
    const required = (["text", "callout", "verticalLine", "marker"] as const).includes(annotation.type as "text") ? ["anchor"]
      : (["range", "bracket", "highlight", "measurement"] as const).includes(annotation.type as "range") ? ["start", "end"]
      : ["from", "to"];
    for (const field of required) if (!annotation[field as keyof Annotation]) problems.push(problem("MISSING_ANNOTATION_ANCHOR", `$.annotations[${index}].${field}`, `Annotation type '${annotation.type}' requires '${field}'.`, annotation.id));
    for (const key of ["anchor", "start", "end", "from", "to"] as const) {
      const anchor = annotation[key];
      if (anchor) validateAnchor(anchor, `$.annotations[${index}].${key}`, annotation, signals, document.timeline.cycleCount, problems);
    }
  });

  const timeGroups = new Map(document.timeGroups.map((group) => [group.id, group]));
  const labelAnchors = new Map(document.timeline.labelAnchors.map((anchor) => [anchor.id, anchor]));
  document.bookmarks.forEach((bookmark, index) => {
    if (bookmark.start < 0 || bookmark.start >= document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.bookmarks[${index}].start`, "Bookmark is outside the source timeline.", bookmark.id));
  });
  document.timeGroups.forEach((group, index) => {
    if (group.start < 0 || group.start >= group.end || group.end > document.timeline.cycleCount) problems.push(problem("INVALID_TIME_GROUP_RANGE", `$.timeGroups[${index}]`, "Time Group must use a half-open range within the source timeline.", group.id));
    const resume = group.presentation?.resumeLabelAnchorId;
    if (resume && !labelAnchors.has(resume)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.timeGroups[${index}].presentation.resumeLabelAnchorId`, `Label anchor '${resume}' does not exist.`, group.id));
    if (resume) {
      const anchor = labelAnchors.get(resume);
      if (anchor && anchor.ownerTimeGroupId !== group.id) problems.push(problem("TIME_GROUP_RESUME_OWNER_MISMATCH", `$.timeGroups[${index}].presentation.resumeLabelAnchorId`, "Resume label anchor must reciprocally name this Time Group as owner.", group.id));
      if (anchor && anchor.source !== group.end) problems.push(problem("TIME_GROUP_RESUME_BOUNDARY_MISMATCH", `$.timeGroups[${index}].presentation.resumeLabelAnchorId`, `Resume label anchor must be at Time Group end ${group.end}.`, group.id));
    }
  });
  const labelSources = new Map<number, string>();
  document.timeline.labelAnchors.forEach((anchor, index) => {
    if (anchor.source < 0 || anchor.source > document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.timeline.labelAnchors[${index}].source`, "Ruler label anchor is outside the source timeline.", anchor.id));
    if (anchor.ownerTimeGroupId && !timeGroups.has(anchor.ownerTimeGroupId)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.timeline.labelAnchors[${index}].ownerTimeGroupId`, `Time Group '${anchor.ownerTimeGroupId}' does not exist.`, anchor.id));
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
    if (transaction.start < 0 || transaction.start >= transaction.end || transaction.end > document.timeline.cycleCount) problems.push(problem("TIMELINE_OUT_OF_RANGE", `$.transactions[${index}]`, "Transaction must use a half-open range within the source timeline.", transaction.id));
    transaction.phases?.forEach((phase, phaseIndex) => {
      if (phase.start < transaction.start || phase.start >= phase.end || phase.end > transaction.end) problems.push(problem("INVALID_TRANSACTION_PHASE", `$.transactions[${index}].phases[${phaseIndex}]`, "Phase must be a half-open subrange of its transaction.", transaction.id));
    });
    transaction.linkedSignals?.forEach((signalId, signalIndex) => {
      if (!signals.has(signalId)) problems.push(problem("MISSING_CROSS_REFERENCE", `$.transactions[${index}].linkedSignals[${signalIndex}]`, `Signal '${signalId}' does not exist.`, transaction.id));
    });
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
