import type { ValidationProblem } from "@timing-chart-v2/core";
import type {
  Annotation,
  CanonicalDocument,
  CommandId,
  CommentRow,
  Layout,
  RowId,
  Signal,
  SignalGroup,
  SignalId,
  SignalValueChange,
  SemanticAnchor,
  TimeGroup,
  Transaction,
  TransactionPhase,
  TransactionGroupId,
  ValueSignal,
} from "@timing-chart-v2/schema";
import { canonicalDocumentsEqual, canonicalEntityIds, clockSlotCount, isStableId, opaqueDerivedId, referencesToSignal, valueSignalValueProblem, valuesCompatibleForType } from "@timing-chart-v2/schema";
import type { ChangeSet, SemanticCommand } from "./types.js";
import type { CommandPolicyCode } from "./policy.js";
import { mergeChangeSets } from "./changeset.js";
import { resolveTimeGroupRange, promoteTimeGroupChildren } from "./time-group.js";

export type CommandPlanResult =
  | Readonly<{ ok: true; document: CanonicalDocument; changeSet: ChangeSet; inverseChangeSet: ChangeSet }>
  | Readonly<{ ok: false; reason: "invalid" | "no-op"; problems: readonly ValidationProblem[] }>;

const fail = (reason: "invalid" | "no-op", code: CommandPolicyCode, path: string, message: string): CommandPlanResult => ({ ok: false, reason, problems: [{ code, path, message }] });
const timingSignalIds = (document: CanonicalDocument) => document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
const annotationIds = (document: CanonicalDocument) => document.annotations.map((annotation) => annotation.id);

// Command no-op checks must compare semantic data, not serialization order.
// Keeping this local avoids making routine metadata/layout reads pay a full
// document serialization cost and also handles equivalent object key order.
function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => semanticEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && semanticEqual(leftRecord[key], rightRecord[key]));
}

function transactionPhasesProblem(phases: readonly TransactionPhase[], start: number, end: number): string | undefined {
  const ordered = phases.slice().sort((left, right) => left.start - right.start || left.end - right.end || left.name.localeCompare(right.name));
  if (ordered.some((phase) => !phase.name.trim() || !Number.isInteger(phase.start) || !Number.isInteger(phase.end) || phase.start < start || phase.start >= phase.end || phase.end > end)) return "Phases must be named integer-cycle half-open subranges of the Transaction.";
  if (ordered.some((phase, index) => index > 0 && ordered[index - 1]!.end > phase.start)) return "Transaction phases must not overlap.";
  return undefined;
}

function replacementRowsOrEmpty(document: unknown): readonly RowId[] {
  if (document === null || typeof document !== "object") return [];
  const groups = (document as { signalGroups?: unknown }).signalGroups;
  if (!Array.isArray(groups) || !groups.every((group) => group !== null && typeof group === "object" && Array.isArray((group as { rows?: unknown }).rows))) return [];
  return groups.flatMap((group) => (group as { rows: readonly RowId[] }).rows);
}

function orderedRows(document: CanonicalDocument): readonly RowId[] {
  return document.signalGroups.flatMap((group) => group.rows);
}

function orderedVisibleTimingRows(document: CanonicalDocument): readonly SignalId[] {
  const signals = new Map(document.signals.map((signal) => [signal.id, signal]));
  return orderedRows(document).filter((id): id is SignalId => {
    const signal = signals.get(id as SignalId);
    return signal !== undefined && signal.type !== "commentRow" && signal.display.visible !== false;
  });
}

function geometryRowsFrom(document: CanonicalDocument, rowId: RowId): SignalId[] {
  const rows = orderedRows(document);
  const start = rows.indexOf(rowId);
  if (start < 0) return [];
  const signals = new Map(document.signals.map((signal) => [signal.id, signal]));
  return rows.slice(start).filter((id): id is SignalId => {
    const signal = signals.get(id as SignalId);
    return signal !== undefined && signal.type !== "commentRow" && signal.display.visible !== false;
  });
}

function changedPositions<T extends string>(before: readonly T[], after: readonly T[]): T[] {
  const beforeIndex = new Map(before.map((id, index) => [id, index]));
  const afterIndex = new Map(after.map((id, index) => [id, index]));
  return [...new Set([...before, ...after])].filter((id) => beforeIndex.get(id) !== afterIndex.get(id));
}

function annotationsForSignals(document: CanonicalDocument, signalIds: SignalId | readonly SignalId[]) {
  const affected = new Set(Array.isArray(signalIds) ? signalIds : [signalIds]);
  const annotationIds = new Set<string>();
  for (const signalId of affected) {
    for (const reference of referencesToSignal(document, signalId)) {
      if (reference.kind === "annotation.anchor" || reference.kind === "annotation.ghostTraceSource") annotationIds.add(reference.ownerId);
    }
  }
  return document.annotations.filter((annotation) => annotationIds.has(annotation.id)).map((annotation) => annotation.id);
}

function replaceSignal(document: CanonicalDocument, index: number, signal: Signal): CanonicalDocument {
  const signals = [...document.signals];
  signals[index] = signal;
  return { ...document, signals };
}

function dependentAnnotations(document: CanonicalDocument, signalId: SignalId): Annotation[] {
  const annotationIds = new Set(referencesToSignal(document, signalId)
    .filter((reference) => reference.kind === "annotation.anchor" || reference.kind === "annotation.ghostTraceSource" || reference.kind === "annotation.markerSpanStart" || reference.kind === "annotation.markerSpanEnd")
    .map((reference) => reference.ownerId));
  return document.annotations.filter((annotation) => annotationIds.has(annotation.id));
}

function moveSignal(document: CanonicalDocument, command: Extract<SemanticCommand, { type: "signal.move" }>): CommandPlanResult {
  const signal = document.signals.find((item) => item.id === command.signalId);
  if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
  const sourceGroupIndex = document.signalGroups.findIndex((group) => group.rows.includes(command.signalId));
  const targetGroupIndex = document.signalGroups.findIndex((group) => group.id === command.targetGroupId);
  if (sourceGroupIndex < 0 || targetGroupIndex < 0) return fail("invalid", "GROUP_NOT_FOUND", "$.targetGroupId", "Source or target group does not exist.");
  const sourceGroup = document.signalGroups[sourceGroupIndex];
  const targetGroup = document.signalGroups[targetGroupIndex];
  if (!sourceGroup || !targetGroup) return fail("invalid", "GROUP_NOT_FOUND", "$.targetGroupId", "Source or target group does not exist.");
  const sourceRows = sourceGroup.rows.filter((row) => row !== command.signalId);
  const targetBase = sourceGroupIndex === targetGroupIndex ? sourceRows : [...targetGroup.rows];
  if (!Number.isInteger(command.index) || command.index < 0 || command.index > targetBase.length) return fail("invalid", "INDEX_OUT_OF_RANGE", "$.index", "Move index is outside the post-removal target rows.");
  const targetRows = [...targetBase];
  targetRows.splice(command.index, 0, command.signalId);
  if (sourceGroupIndex === targetGroupIndex && targetRows.every((row, index) => row === sourceGroup.rows[index])) return fail("no-op", "NO_OP", "$", "Signal is already at the requested position.");
  const groups = document.signalGroups.map((group, index) => {
    if (index === sourceGroupIndex && index === targetGroupIndex) return { ...group, rows: targetRows };
    if (index === sourceGroupIndex) return { ...group, rows: sourceRows };
    if (index === targetGroupIndex) return { ...group, rows: targetRows };
    return group;
  });
  const nextDocument = { ...document, signalGroups: groups };
  const changedRows = changedPositions(orderedRows(document), orderedRows(nextDocument));
  const changedTimingRows = changedPositions(orderedVisibleTimingRows(document), orderedVisibleTimingRows(nextDocument));
  const changeSet: ChangeSet = { rowOrder: changedRows, geometryScreenY: changedTimingRows, annotationPosition: annotationsForSignals(document, changedTimingRows), minimapOverview: true };
  return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
}

function moveSpacer(document: CanonicalDocument, command: Extract<SemanticCommand, { type: "spacer.move" }>): CommandPlanResult {
  const sourceGroupIndex = document.signalGroups.findIndex((group) => group.rows.includes(command.spacerId));
  const targetGroupIndex = document.signalGroups.findIndex((group) => group.id === command.targetGroupId);
  const sourceGroup = document.signalGroups[sourceGroupIndex];
  const targetGroup = document.signalGroups[targetGroupIndex];
  if (!sourceGroup || !targetGroup) return fail("invalid", "GROUP_NOT_FOUND", "$.targetGroupId", "Spacer owner or target group does not exist.");
  if (sourceGroup.id !== targetGroup.id || !sourceGroup.spacers?.some((spacer) => spacer.id === command.spacerId)) return fail("invalid", "SPACER_OWNER_MISMATCH", "$.targetGroupId", "A Spacer can only move within its owning group.");
  const remaining = sourceGroup.rows.filter((row) => row !== command.spacerId);
  if (!Number.isInteger(command.index) || command.index < 0 || command.index > remaining.length) return fail("invalid", "INDEX_OUT_OF_RANGE", "$.index", "Spacer move index is outside the post-removal rows.");
  remaining.splice(command.index, 0, command.spacerId);
  if (remaining.every((row, index) => row === sourceGroup.rows[index])) return fail("no-op", "NO_OP", "$", "Spacer is already at the requested position.");
  const groups = [...document.signalGroups]; groups[sourceGroupIndex] = { ...sourceGroup, rows: remaining };
  const nextDocument = { ...document, signalGroups: groups };
  const changedRows = changedPositions(orderedRows(document), orderedRows(nextDocument));
  const changedTimingRows = changedPositions(orderedVisibleTimingRows(document), orderedVisibleTimingRows(nextDocument));
  const changeSet: ChangeSet = { rowOrder: changedRows, geometryScreenY: changedTimingRows, annotationPosition: annotationsForSignals(document, changedTimingRows), minimapOverview: true };
  return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
}

function mapInsertPoint(value: number, at: number, count: number): number {
  return value >= at ? value + count : value;
}

function insertChanges(changes: readonly SignalValueChange[], at: number, count: number): SignalValueChange[] {
  return changes.map((change) => change.start >= at ? { ...change, start: change.start + count } : change);
}

function insertRange<T extends { readonly start: number; readonly end: number }>(range: T, at: number, count: number): T {
  if (at <= range.start) return { ...range, start: range.start + count, end: range.end + count };
  if (at < range.end) return { ...range, end: range.end + count };
  return range;
}

function mapResetInsert<T extends Signal>(signal: T, at: number, count: number): T {
  if (signal.type === "clock" || signal.type === "commentRow") return signal;
  if (!signal.resetSemantics) return signal;
  const reset = signal.resetSemantics;
  return { ...signal, resetSemantics: { ...reset, ...(reset.assertCycle === undefined ? {} : { assertCycle: mapInsertPoint(reset.assertCycle, at, count) }), ...(reset.deassertCycle === undefined ? {} : { deassertCycle: mapInsertPoint(reset.deassertCycle, at, count) }) } } as T;
}

function insertTimeline(document: CanonicalDocument, at: number, count: number): CanonicalDocument {
  const signals = document.signals.map((signal): Signal => {
    if (signal.type === "commentRow") return signal;
    if (signal.type === "clock") return {
      ...signal,
      generator: { ...signal.generator, start: mapInsertPoint(signal.generator.start, at, count) },
      ...(signal.enable ? { enable: insertChanges(signal.enable, at, count) } : {}),
    };
    return mapResetInsert({ ...signal, values: insertChanges(signal.values, at, count) }, at, count);
  });
  const mapAnnotation = (annotation: Annotation): Annotation => {
    const mapped: Record<string, unknown> = { ...annotation };
    for (const key of ["anchor", "start", "end", "from", "to"] as const) if (annotation[key]) mapped[key] = { ...annotation[key], cycle: mapInsertPoint(annotation[key].cycle, at, count) };
    return mapped as unknown as Annotation;
  };
  const mapTransaction = (transaction: Transaction): Transaction => {
    const mapped = insertRange(transaction, at, count);
    return { ...mapped, ...(transaction.phases ? { phases: transaction.phases.map((phase) => insertRange(phase, at, count)) } : {}) };
  };
  return {
    ...document,
    timeline: { ...document.timeline, end: document.timeline.end + count, cycleCount: document.timeline.cycleCount + count, labelAnchors: document.timeline.labelAnchors.map((anchor) => ({ ...anchor, source: mapInsertPoint(anchor.source, at, count) })) },
    signals,
    annotations: document.annotations.map(mapAnnotation),
    bookmarks: document.bookmarks.map((bookmark) => ({ ...bookmark, start: mapInsertPoint(bookmark.start, at, count) })),
    timeGroups: document.timeGroups.map((group) => insertRange(group, at, count)),
    transactions: document.transactions.map(mapTransaction),
  };
}

function mapDeletePoint(value: number, start: number, end: number, nextCycleCount: number): number {
  const mapped = value < start ? value : value >= end ? value - (end - start) : start;
  return Math.min(mapped, nextCycleCount - 1);
}

function mapDeleteBoundary(value: number, start: number, end: number): number {
  return value <= start ? value : value >= end ? value - (end - start) : start;
}

function valueAt(changes: readonly SignalValueChange[], at: number): SignalValueChange | undefined {
  let result: SignalValueChange | undefined;
  for (const change of changes) if (change.start <= at) result = change; else break;
  return result;
}

function deleteChanges(changes: readonly SignalValueChange[], start: number, end: number, nextCycleCount: number): SignalValueChange[] {
  const mapped = changes.filter((change) => change.start < start || change.start >= end).map((change) => change.start >= end ? { ...change, start: change.start - (end - start) } : change);
  if (start < nextCycleCount && !mapped.some((change) => change.start === start)) {
    const active = valueAt(changes, end);
    if (active) mapped.push({ ...active, start });
  }
  mapped.sort((left, right) => left.start - right.start);
  const deduplicated: SignalValueChange[] = [];
  for (const change of mapped) {
    if (change.start >= nextCycleCount) continue;
    const previous = deduplicated.at(-1);
    if (previous?.start === change.start) deduplicated[deduplicated.length - 1] = change;
    else deduplicated.push(change);
  }
  return deduplicated;
}

function deleteRange<T extends { readonly start: number; readonly end: number }>(range: T, start: number, end: number): T | undefined {
  const mappedStart = mapDeleteBoundary(range.start, start, end);
  const mappedEnd = mapDeleteBoundary(range.end, start, end);
  return mappedStart < mappedEnd ? { ...range, start: mappedStart, end: mappedEnd } : undefined;
}

function mapResetDelete<T extends Signal>(signal: T, start: number, end: number, nextCycleCount: number): T {
  if (signal.type === "clock" || signal.type === "commentRow") return signal;
  if (!signal.resetSemantics) return signal;
  const reset = signal.resetSemantics;
  return { ...signal, resetSemantics: { ...reset, ...(reset.assertCycle === undefined ? {} : { assertCycle: mapDeletePoint(reset.assertCycle, start, end, nextCycleCount) }), ...(reset.deassertCycle === undefined ? {} : { deassertCycle: mapDeletePoint(reset.deassertCycle, start, end, nextCycleCount) }) } } as T;
}

/**
 * Apply the explicit Timeline Delete policy to every Annotation shape.
 * Point annotations are clamped to the deletion boundary; span and
 * endpoint-pair annotations are trimmed by the same source-time mapping and
 * are removed only when every required semantic endpoint was deleted. This
 * preserves a partially surviving span while preventing a fully deleted
 * Annotation from becoming a degenerate canonical object.
 */
function deleteAnnotation(annotation: Annotation, start: number, end: number, nextCycleCount: number): Annotation | undefined {
  const fields = ["anchor", "start", "end", "from", "to"] as const;
  const requiredFields = (["text", "callout", "verticalLine", "marker", "textbox"] as const).includes(annotation.type as "text")
    ? ["anchor"] as const
    : (["range", "bracket", "highlight", "measurement", "timingRegion", "ghostTrace", "rectangle", "ellipse"] as const).includes(annotation.type as "range")
      ? ["start", "end"] as const
      : ["from", "to"] as const;
  const fullyDeleted = requiredFields.every((field) => {
    const anchor = annotation[field];
    return anchor !== undefined && anchor.cycle >= start && anchor.cycle < end;
  });
  if (requiredFields.length > 1 && fullyDeleted) return undefined;
  const mapped: Record<string, unknown> = { ...annotation };
  for (const field of fields) {
    const anchor = annotation[field];
    if (anchor) mapped[field] = { ...anchor, cycle: mapDeletePoint(anchor.cycle, start, end, nextCycleCount) };
  }
  return mapped as unknown as Annotation;
}

function deleteTimeline(document: CanonicalDocument, start: number, end: number): CanonicalDocument {
  const nextCycleCount = document.timeline.cycleCount - (end - start);
  const signals = document.signals.map((signal): Signal => {
    if (signal.type === "commentRow") return signal;
    if (signal.type === "clock") return {
      ...signal,
      generator: { ...signal.generator, start: mapDeletePoint(signal.generator.start, start, end, nextCycleCount) },
      ...(signal.enable ? { enable: deleteChanges(signal.enable, start, end, nextCycleCount) } : {}),
    };
    return mapResetDelete({ ...signal, values: deleteChanges(signal.values, start, end, nextCycleCount) }, start, end, nextCycleCount);
  });
  const annotations = document.annotations.map((annotation) => deleteAnnotation(annotation, start, end, nextCycleCount)).filter((annotation): annotation is Annotation => annotation !== undefined);
  const retainedAnnotationIds = new Set(annotations.map((annotation) => annotation.id));
  const annotationGroups = (document.annotationGroups ?? []).map((group) => ({ ...group, annotationIds: group.annotationIds.filter((annotationId) => retainedAnnotationIds.has(annotationId)) }));
  const timeGroups = document.timeGroups.map((group) => deleteRange(group, start, end)).filter((group): group is TimeGroup => group !== undefined);
  const transactions = document.transactions.map((transaction): Transaction | undefined => {
    const mapped = deleteRange(transaction, start, end);
    if (!mapped) return undefined;
    const phases = transaction.phases?.map((phase) => deleteRange(phase, start, end)).filter((phase): phase is NonNullable<typeof phase> => phase !== undefined);
    const { phases: _oldPhases, ...withoutPhases } = mapped;
    return phases && phases.length > 0 ? { ...withoutPhases, phases } : withoutPhases;
  }).filter((transaction): transaction is Transaction => transaction !== undefined);
  const retainedTimeGroups = new Set(timeGroups.map((group) => group.id));
  return {
    ...document,
    timeline: {
      ...document.timeline,
      end: nextCycleCount,
      cycleCount: nextCycleCount,
      labelAnchors: document.timeline.labelAnchors.map((anchor) => ({ ...anchor, source: mapDeleteBoundary(anchor.source, start, end), ...(anchor.ownerTimeGroupId && !retainedTimeGroups.has(anchor.ownerTimeGroupId) ? { ownerTimeGroupId: undefined } : {}) })).map((anchor) => {
        if (anchor.ownerTimeGroupId === undefined) { const { ownerTimeGroupId: _removed, ...rest } = anchor; return rest; }
        return anchor;
      }),
    },
    signals,
    annotations,
    annotationGroups,
    bookmarks: document.bookmarks.map((bookmark) => ({ ...bookmark, start: mapDeletePoint(bookmark.start, start, end, nextCycleCount) })),
    timeGroups,
    transactions,
  };
}

function timelineChangeSet(...documents: readonly CanonicalDocument[]): ChangeSet {
  const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
  const signalIds = unique(documents.flatMap(timingSignalIds));
  const annotationGroupIds = unique(documents.flatMap((document) => (document.annotationGroups ?? []).map((group) => group.id)));
  const beforeGroups = new Map((documents[0]?.annotationGroups ?? []).map((group) => [group.id, group.annotationIds]));
  const afterGroups = new Map((documents.at(-1)?.annotationGroups ?? []).map((group) => [group.id, group.annotationIds]));
  const changedAnnotationGroups = annotationGroupIds.filter((id) => !semanticEqual(beforeGroups.get(id) ?? [], afterGroups.get(id) ?? []));
  return {
    waveSemantics: signalIds,
    geometryLocal: signalIds,
    timelineSemantics: true,
    geometryScreenX: true,
    annotationPosition: unique(documents.flatMap(annotationIds)),
    bookmarkPosition: unique(documents.flatMap((document) => document.bookmarks.map((item) => item.id))),
    timeGroupSemantics: unique(documents.flatMap((document) => document.timeGroups.map((item) => item.id))),
    transactionSemantics: unique(documents.flatMap((document) => document.transactions.map((item) => item.id))),
    ...(changedAnnotationGroups.length > 0 ? { annotationGroups: changedAnnotationGroups } : {}),
    minimapOverview: true,
  };
}

/**
 * A single periodic WaveDrom generator with explicit enable/suppression slots
 * cannot represent a timeline edit that shifts only those control slots after
 * an arbitrary source-time boundary.  Keeping the old controls would silently
 * attach them to different pulses, so reject that edit until a segmented-clock
 * representation exists.  An uncontrolled generator remains the authoritative
 * periodic source across timeline length/range transforms and does not need
 * this guard.
 */
type TimelineRippleOperation =
  | Readonly<{ kind: "insert"; at: number; count: number }>
  | Readonly<{ kind: "delete"; start: number; end: number }>
  | Readonly<{ kind: "duplicate"; at: number }>
  | Readonly<{ kind: "move" }>;

function unsupportedClockRipple(document: CanonicalDocument, _operation: TimelineRippleOperation): CommandPlanResult | undefined {
  const clockIndex = document.signals.findIndex((signal) => signal.type === "clock" && (
    (signal.enable?.length ?? 0) > 0 ||
    (signal.generator.suppressedPeriods?.length ?? 0) > 0
  ));
  if (clockIndex < 0) return undefined;
  const clock = document.signals[clockIndex];
  if (clock?.type !== "clock") return undefined;
  return fail("invalid", "UNSUPPORTED_CLOCK_RIPPLE", `$.signals[${clockIndex}]`, "Timeline editing is rejected while this generated Clock needs segmented ripple semantics.");
}

/**
 * Timeline transforms must not commit a Clock generator that the production
 * WaveDrom adapter cannot render.  In particular, shifting a periodic
 * generator's start by a non-period-aligned amount is otherwise accepted by
 * the generic Canonical validator and only fails later during rendering.
 */
function transformedClockProblem(document: CanonicalDocument): CommandPlanResult | undefined {
  for (const [index, signal] of document.signals.entries()) {
    if (signal.type !== "clock") continue;
    const { generator } = signal;
    if (generator.start % generator.period !== 0) {
      return fail("invalid", "UNALIGNED_CLOCK_START", `$.signals[${index}].generator.start`, "Timeline editing would leave the Clock start unaligned with its period.");
    }
    if ((signal.enable ?? []).some((change) => change.start % generator.period !== 0)) {
      return fail("invalid", "UNALIGNED_CLOCK_ENABLE", `$.signals[${index}].enable`, "Timeline editing would leave a Clock enable change unaligned with its period.");
    }
    const slotCount = clockSlotCount(generator, document.timeline.cycleCount);
    const suppressed = generator.suppressedPeriods ?? [];
    if (suppressed.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= slotCount) || new Set(suppressed).size !== suppressed.length) {
      return fail("invalid", "INVALID_SUPPRESSED_PERIODS", `$.signals[${index}].generator.suppressedPeriods`, "Timeline editing would leave a Clock suppression slot outside the transformed timeline.");
    }
  }
  return undefined;
}

function canonicalIds(document: CanonicalDocument): Set<string> {
  return new Set(canonicalEntityIds(document));
}

function cloneStableId<T extends string>(sourceId: T, commandId: string, used: Set<string>): T {
  const candidate = opaqueDerivedId(`timeline.duplicateRange\u0000${sourceId}\u0000${commandId}`, used);
  used.add(candidate);
  return candidate as T;
}

function sameValue(left: SignalValueChange | undefined, right: SignalValueChange | undefined): boolean {
  return left?.value === right?.value && left?.comment === right?.comment;
}

function compressCycleStates(states: readonly (SignalValueChange | undefined)[]): SignalValueChange[] {
  const changes: SignalValueChange[] = [];
  let previous: SignalValueChange | undefined;
  states.forEach((state, start) => {
    if (state && !sameValue(state, previous)) changes.push({ start, value: state.value, ...(state.comment === undefined ? {} : { comment: state.comment }) });
    previous = state;
  });
  return changes;
}

function cycleStates(changes: readonly SignalValueChange[], cycleCount: number): (SignalValueChange | undefined)[] {
  return Array.from({ length: cycleCount }, (_, cycle) => valueAt(changes, cycle));
}

function duplicateChanges(changes: readonly SignalValueChange[], cycleCount: number, start: number, end: number, at: number): SignalValueChange[] {
  const states = cycleStates(changes, cycleCount);
  states.splice(at, 0, ...states.slice(start, end));
  return compressCycleStates(states);
}

function moveCycleIndex(cycle: number, start: number, end: number, to: number): number {
  const length = end - start;
  if (to < start) {
    if (cycle >= start && cycle < end) return to + (cycle - start);
    if (cycle >= to && cycle < start) return cycle + length;
    return cycle;
  }
  const originalDestination = to + length;
  if (cycle >= start && cycle < end) return to + (cycle - start);
  if (cycle >= end && cycle < originalDestination) return cycle - length;
  return cycle;
}

function moveChanges(changes: readonly SignalValueChange[], cycleCount: number, start: number, end: number, to: number): SignalValueChange[] {
  const source = cycleStates(changes, cycleCount);
  const moved = Array<SignalValueChange | undefined>(cycleCount);
  source.forEach((state, cycle) => { moved[moveCycleIndex(cycle, start, end, to)] = state; });
  return compressCycleStates(moved);
}

function duplicateAnchor(anchor: SemanticAnchor | undefined, start: number, end: number, at: number): SemanticAnchor | undefined {
  if (!anchor || anchor.cycle < start || anchor.cycle >= end) return undefined;
  return { ...anchor, cycle: at + (anchor.cycle - start) };
}

function moveAnchor(anchor: SemanticAnchor | undefined, start: number, end: number, to: number): SemanticAnchor | undefined {
  if (!anchor) return undefined;
  return { ...anchor, cycle: moveCycleIndex(anchor.cycle, start, end, to) };
}

function mappedInterval(start: number, end: number, sourceStart: number, sourceEnd: number, to: number): { readonly start: number; readonly end: number } | undefined {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return undefined;
  if (start >= end) return undefined;
  const length = sourceEnd - sourceStart;
  const cuts = [...new Set([start, end, sourceStart, sourceEnd, to, to + length].filter((cut) => cut > start && cut < end))].sort((left, right) => left - right);
  const boundaries = [start, ...cuts, end];
  const segments = boundaries.slice(0, -1).map((segmentStart, index) => {
    const segmentEnd = boundaries[index + 1]!;
    return { start: moveCycleIndex(segmentStart, sourceStart, sourceEnd, to), end: moveCycleIndex(segmentEnd - 1, sourceStart, sourceEnd, to) + 1 };
  }).sort((left, right) => left.start - right.start);
  if (segments.some((segment) => segment.start >= segment.end) || segments.some((segment, index) => index > 0 && segment.start !== segments[index - 1]!.end)) return undefined;
  return { start: segments[0]!.start, end: segments.at(-1)!.end };
}

function duplicateTimelineRange(document: CanonicalDocument, command: Extract<SemanticCommand, { type: "timeline.duplicateRange" }>): CanonicalDocument {
  const length = command.end - command.start;
  const inserted = insertTimeline(document, command.at, length);
  const usedIds = canonicalIds(document);
  const clonedIds = new Map<string, string>();
  const cloneId = <T extends string>(id: T): T => {
    const existing = clonedIds.get(id);
    if (existing) return existing as T;
    const clone = cloneStableId(id, command.id, usedIds);
    clonedIds.set(id, clone);
    return clone;
  };
  const sourceSignals = new Map(document.signals.map((item) => [item.id, item]));
  const signals = inserted.signals.map((signal): Signal => {
    const source = sourceSignals.get(signal.id)!;
    if (signal.type === "commentRow" || source.type === "commentRow") return signal;
    if (signal.type === "clock" && source.type === "clock") return source.enable
      ? { ...signal, enable: duplicateChanges(source.enable, document.timeline.cycleCount, command.start, command.end, command.at) }
      : signal;
    if (signal.type !== "clock" && source.type !== "clock") return { ...signal, values: duplicateChanges(source.values, document.timeline.cycleCount, command.start, command.end, command.at) };
    return signal;
  });
  const annotationKeys = ["anchor", "start", "end", "from", "to"] as const;
  const annotations = document.annotations.flatMap((annotation) => {
    const anchors = annotationKeys.map((key) => annotation[key]).filter((anchor): anchor is SemanticAnchor => anchor !== undefined);
    if (anchors.length === 0 || anchors.some((anchor) => anchor.cycle < command.start || anchor.cycle >= command.end)) return [];
    const clone = { ...annotation, id: cloneId(annotation.id) };
    for (const key of annotationKeys) {
      const anchor = duplicateAnchor(annotation[key], command.start, command.end, command.at);
      if (anchor) Object.assign(clone, { [key]: anchor });
    }
    return [clone];
  });
  const sourceGroups = document.timeGroups.filter((group) => group.start >= command.start && group.end <= command.end);
  const groupIds = new Map(sourceGroups.map((group) => [group.id, cloneId(group.id)]));
  const ownedResumeAnchorIds = new Set(sourceGroups.map((group) => group.presentation?.resumeLabelAnchorId).filter((id) => id !== undefined));
  const sourceLabels = document.timeline.labelAnchors.filter((anchor) => (anchor.source >= command.start && anchor.source < command.end) || (anchor.source === command.end && ownedResumeAnchorIds.has(anchor.id)));
  const labelIds = new Map(sourceLabels.map((anchor) => [anchor.id, cloneId(anchor.id)]));
  const clonedGroups = sourceGroups.map((group) => ({
    ...group,
    ...(group.parentId !== undefined && groupIds.has(group.parentId) ? { parentId: groupIds.get(group.parentId)! } : {}),
    id: groupIds.get(group.id)!,
    start: command.at + group.start - command.start,
    end: command.at + group.end - command.start,
    ...(group.presentation?.resumeLabelAnchorId && labelIds.has(group.presentation.resumeLabelAnchorId)
      ? { presentation: { ...group.presentation, resumeLabelAnchorId: labelIds.get(group.presentation.resumeLabelAnchorId)! } }
      : {}),
  }));
  const clonedLabels = sourceLabels.map((anchor) => ({ ...anchor, id: labelIds.get(anchor.id)!, source: command.at + anchor.source - command.start, ...(anchor.ownerTimeGroupId && groupIds.has(anchor.ownerTimeGroupId) ? { ownerTimeGroupId: groupIds.get(anchor.ownerTimeGroupId)! } : { ownerTimeGroupId: undefined }) })).map((anchor) => {
    if (anchor.ownerTimeGroupId !== undefined) return anchor;
    const { ownerTimeGroupId: _owner, ...rest } = anchor;
    return rest;
  });
  const clonedTransactions = document.transactions.filter((transaction) => transaction.start >= command.start && transaction.end <= command.end).map((transaction) => ({ ...transaction, id: cloneId(transaction.id), start: command.at + transaction.start - command.start, end: command.at + transaction.end - command.start, ...(transaction.phases ? { phases: transaction.phases.map((phase) => ({ ...phase, start: command.at + phase.start - command.start, end: command.at + phase.end - command.start })) } : {}) }));
  return {
    ...inserted,
    signals,
    annotations: [...inserted.annotations, ...annotations],
    bookmarks: [...inserted.bookmarks, ...document.bookmarks.filter((bookmark) => bookmark.start >= command.start && bookmark.start < command.end).map((bookmark) => ({ ...bookmark, id: cloneId(bookmark.id), start: command.at + bookmark.start - command.start }))],
    timeGroups: [...inserted.timeGroups, ...clonedGroups],
    transactions: [...inserted.transactions, ...clonedTransactions],
    timeline: { ...inserted.timeline, labelAnchors: [...inserted.timeline.labelAnchors, ...clonedLabels] },
  };
}

function moveTimelineRange(document: CanonicalDocument, start: number, end: number, to: number): CanonicalDocument | undefined {
  if (document.signals.some((signal) => signal.type === "clock" && ((signal.enable?.length ?? 0) > 0 || (signal.generator.suppressedPeriods?.length ?? 0) > 0))) return undefined;
  const mapRange = <T extends { readonly start: number; readonly end: number }>(range: T): T | undefined => {
    const mapped = mappedInterval(range.start, range.end, start, end, to);
    return mapped ? { ...range, ...mapped } : undefined;
  };
  const timeGroups = document.timeGroups.map(mapRange);
  const transactions = document.transactions.map((transaction) => {
    const mapped = mapRange(transaction);
    if (!mapped) return undefined;
    const phases = transaction.phases?.map(mapRange);
    if (phases?.some((phase) => phase === undefined)) return undefined;
    return { ...mapped, ...(phases ? { phases } : {}) } as Transaction;
  });
  if (timeGroups.some((group) => group === undefined) || transactions.some((transaction) => transaction === undefined)) return undefined;
  return {
    ...document,
    signals: document.signals.map((signal): Signal => {
      if (signal.type === "commentRow") return signal;
      if (signal.type === "clock") return { ...signal, generator: { ...signal.generator, start: moveCycleIndex(signal.generator.start, start, end, to) } };
      const moved = { ...signal, values: moveChanges(signal.values, document.timeline.cycleCount, start, end, to) };
      if (!signal.resetSemantics) return moved;
      const reset = signal.resetSemantics;
      return { ...moved, resetSemantics: { ...reset, ...(reset.assertCycle === undefined ? {} : { assertCycle: moveCycleIndex(reset.assertCycle, start, end, to) }), ...(reset.deassertCycle === undefined ? {} : { deassertCycle: moveCycleIndex(reset.deassertCycle, start, end, to) }) } };
    }),
    annotations: document.annotations.map((annotation) => ({ ...annotation, anchor: moveAnchor(annotation.anchor, start, end, to), start: moveAnchor(annotation.start, start, end, to), end: moveAnchor(annotation.end, start, end, to), from: moveAnchor(annotation.from, start, end, to), to: moveAnchor(annotation.to, start, end, to) })).map((annotation) => Object.fromEntries(Object.entries(annotation).filter(([, value]) => value !== undefined)) as unknown as Annotation),
    bookmarks: document.bookmarks.map((bookmark) => ({ ...bookmark, start: moveCycleIndex(bookmark.start, start, end, to) })),
    timeGroups: timeGroups as TimeGroup[],
    transactions: transactions as Transaction[],
    timeline: { ...document.timeline, labelAnchors: document.timeline.labelAnchors.map((anchor) => ({ ...anchor, source: moveCycleIndex(anchor.source, start, end, to) })) },
  };
}

export function planCommand(document: CanonicalDocument, command: SemanticCommand): CommandPlanResult {
  if (!isStableId(command.id)) return fail("invalid", "INVALID_COMMAND_ID", "$.id", "Command ID must be a stable ID.");
  switch (command.type) {
    case "document.replace": {
      if (canonicalDocumentsEqual(document, command.document)) return fail("no-op", "NO_OP", "$", "Document is unchanged.");
      const timingRows = timingSignalIds(document);
      return { ok: true, document: command.document, changeSet: { fullDocumentReplace: true, rowOrder: replacementRowsOrEmpty(command.document), waveSemantics: timingRows, geometryLocal: timingRows, geometryScreenX: true, geometryScreenY: timingRows, timelineSemantics: true, minimapOverview: true }, inverseChangeSet: { fullDocumentReplace: true, rowOrder: orderedRows(document), waveSemantics: timingRows, geometryLocal: timingRows, geometryScreenX: true, geometryScreenY: timingRows, timelineSemantics: true, minimapOverview: true } };
    }
    case "document.updateMetadata": {
      if (!command.title.trim()) return fail("invalid", "EMPTY_DOCUMENT_TITLE", "$.title", "Document title must not be empty.");
      const nextDocument = { ...document, document: { ...document.document, title: command.title, header: command.header, footer: command.footer } };
      if (semanticEqual(document.document, nextDocument.document)) return fail("no-op", "NO_OP", "$.document", "Document metadata is unchanged.");
      return { ok: true, document: nextDocument, changeSet: {}, inverseChangeSet: {} };
    }
    case "document.updateLayout": {
      const layout = command.layout;
      if (!Number.isFinite(layout.roleColumnWidth) || layout.roleColumnWidth < 16 || !Number.isFinite(layout.signalNameWidth) || layout.signalNameWidth < 40 || !Number.isFinite(layout.rowHeight) || layout.rowHeight < 12 || !Number.isFinite(layout.signalSpacing) || layout.signalSpacing < 0) return fail("invalid", "INVALID_LAYOUT", "$.layout", "Layout dimensions must be finite and within the supported range.");
      if (layout.signalNameAlign !== "left" && layout.signalNameAlign !== "center" && layout.signalNameAlign !== "right") return fail("invalid", "INVALID_LAYOUT", "$.layout.signalNameAlign", "Signal name alignment is invalid.");
      if (layout.overflow !== "expand" && layout.overflow !== "ellipsis" && layout.overflow !== "wrap") return fail("invalid", "INVALID_LAYOUT", "$.layout.overflow", "Signal overflow mode is invalid.");
      if (semanticEqual(document.layout, layout)) return fail("no-op", "NO_OP", "$.layout", "Layout is unchanged.");
      const nextDocument = { ...document, layout };
      const timingRows = orderedVisibleTimingRows(document);
      const changeSet: ChangeSet = { geometryScreenY: timingRows, annotationPosition: annotationsForSignals(document, timingRows), minimapOverview: true };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "legend.update": {
      if (semanticEqual(document.legend, command.legend)) return fail("no-op", "NO_OP", "$.legend", "Legend is unchanged.");
      return { ok: true, document: { ...document, legend: command.legend }, changeSet: {}, inverseChangeSet: {} };
    }
    case "commentRow.create":
      return planCommand(document, { id: command.id, type: "signal.create", signal: command.commentRow, targetGroupId: command.targetGroupId, index: command.index });
    case "commentRow.update": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const row = document.signals[index];
      if (!row || row.type !== "commentRow") return fail("invalid", "COMMENT_ROW_NOT_FOUND", "$.signalId", `Comment Row '${command.signalId}' does not exist.`);
      const title = command.title.trim();
      if (!title) return fail("invalid", "INVALID_TITLE", "$.title", "Comment Row title cannot be empty.");
      if ((command.spacingBefore !== undefined && (!Number.isFinite(command.spacingBefore) || command.spacingBefore < 0)) || (command.spacingAfter !== undefined && (!Number.isFinite(command.spacingAfter) || command.spacingAfter < 0))) return fail("invalid", "INVALID_COMMENT_ROW_SPACING", "$.spacing", "Comment Row spacing must be finite and non-negative.");
      const nextSpacingBefore = command.spacingBefore ?? row.spacingBefore;
      const nextSpacingAfter = command.spacingAfter ?? row.spacingAfter;
      const nextDisplayStyle = command.displayStyle ?? row.display.style;
      if (row.title === title && row.body === command.body && row.spacingBefore === nextSpacingBefore && row.spacingAfter === nextSpacingAfter && semanticEqual(row.display.style ?? {}, nextDisplayStyle ?? {})) return fail("no-op", "NO_OP", "$", "Comment Row is unchanged.");
      const next: CommentRow = { ...row, title, body: command.body, name: title, display: { ...row.display, name: title, ...(nextDisplayStyle === undefined ? {} : { style: nextDisplayStyle }) }, ...(nextSpacingBefore === undefined ? {} : { spacingBefore: nextSpacingBefore }), ...(nextSpacingAfter === undefined ? {} : { spacingAfter: nextSpacingAfter }) };
      const spacingChanged = row.spacingBefore !== nextSpacingBefore || row.spacingAfter !== nextSpacingAfter;
      const changeSet: ChangeSet = { rowPresentation: [row.id], ...(spacingChanged ? { geometryScreenY: geometryRowsFrom(document, row.id) } : {}), minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, next), changeSet, inverseChangeSet: changeSet };
    }
    case "commentRow.delete":
      return planCommand(document, { id: command.id, type: "signal.delete", signalId: command.signalId });
    case "signal.create": {
      if (document.signals.some((signal) => signal.id === command.signal.id)) return fail("invalid", "DUPLICATE_ID", "$.signal.id", `Signal '${command.signal.id}' already exists.`);
      const groupIndex = document.signalGroups.findIndex((group) => group.id === command.targetGroupId);
      const group = document.signalGroups[groupIndex];
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.targetGroupId", `Group '${command.targetGroupId}' does not exist.`);
      if (!Number.isInteger(command.index) || command.index < 0 || command.index > group.rows.length) return fail("invalid", "INDEX_OUT_OF_RANGE", "$.index", "Signal insertion index is outside the group rows.");
      const rows = [...group.rows]; rows.splice(command.index, 0, command.signal.id);
      const groups = [...document.signalGroups]; groups[groupIndex] = { ...group, rows };
      const changeSet: ChangeSet = { addedSignals: [command.signal.id], rowOrder: [command.signal.id], waveSemantics: command.signal.type === "commentRow" ? [] : [command.signal.id], geometryLocal: command.signal.type === "commentRow" ? [] : [command.signal.id], geometryScreenY: command.signal.type === "commentRow" ? [] : [command.signal.id], minimapOverview: true };
      const inverseChangeSet: ChangeSet = { removedSignals: [command.signal.id], rowOrder: [command.signal.id], minimapOverview: true };
      return { ok: true, document: { ...document, signals: [...document.signals, command.signal], signalGroups: groups }, changeSet, inverseChangeSet };
    }
    case "signal.bulkCreate": {
      if (command.signals.length === 0) return fail("no-op", "NO_OP", "$.signals", "Bulk registration requires at least one signal.");
      let candidate = document;
      const forward: ChangeSet[] = [];
      const inverse: ChangeSet[] = [];
      for (const [offset, signal] of command.signals.entries()) {
        const plan = planCommand(candidate, { id: `${command.id}_item_${offset}` as CommandId, type: "signal.create", signal, targetGroupId: command.targetGroupId, index: command.index + offset });
        if (!plan.ok) return plan;
        candidate = plan.document;
        forward.push(plan.changeSet);
        inverse.unshift(plan.inverseChangeSet);
      }
      return { ok: true, document: candidate, changeSet: mergeChangeSets(forward), inverseChangeSet: mergeChangeSets(inverse) };
    }
    case "signal.delete": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      if (index < 0) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      const annotationDependents = dependentAnnotations(document, command.signalId);
      if (annotationDependents.length > 0) {
        const dependentIds = annotationDependents.map((annotation) => annotation.id).join(", ");
        return fail("invalid", "SIGNAL_HAS_DEPENDENTS", "$.signalId", `Signal has annotation dependents: ${dependentIds}.`);
      }
      const signal = document.signals[index];
      if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", "Signal does not exist.");
      const groups = document.signalGroups.map((group) => ({ ...group, rows: group.rows.filter((row) => row !== command.signalId) }));
      const linkedTransactionIds = new Set(referencesToSignal(document, command.signalId)
        .filter((reference) => reference.kind === "transaction.linkedSignal")
        .map((reference) => reference.ownerId));
      const linkedTransactions = document.transactions.filter((transaction) => linkedTransactionIds.has(transaction.id));
      const transactions = document.transactions.map((transaction) => {
        if (!linkedTransactionIds.has(transaction.id) || transaction.linkedSignals === undefined) return transaction;
        return { ...transaction, linkedSignals: transaction.linkedSignals.filter((id) => id !== command.signalId) };
      });
      const referenceDeleted = document.timeline.referenceClock === command.signalId;
      const nextTimeline = referenceDeleted ? (() => { const { referenceClock: _removed, ...timeline } = document.timeline; return timeline; })() : document.timeline;
      const nextDocument = { ...document, timeline: nextTimeline, signals: document.signals.filter((item) => item.id !== command.signalId), signalGroups: groups, transactions };
      const changeSet: ChangeSet = { removedSignals: [command.signalId], rowOrder: [command.signalId], transactionSemantics: linkedTransactions.map((transaction) => transaction.id), minimapOverview: true, ...(referenceDeleted ? { timelineSemantics: true, geometryScreenX: true } : {}) };
      const inverseChangeSet: ChangeSet = { addedSignals: [command.signalId], rowOrder: [command.signalId], waveSemantics: signal.type === "commentRow" ? [] : [command.signalId], geometryLocal: signal.type === "commentRow" ? [] : [command.signalId], transactionSemantics: linkedTransactions.map((transaction) => transaction.id), minimapOverview: true, ...(referenceDeleted ? { timelineSemantics: true, geometryScreenX: true } : {}) };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet };
    }
    case "signal.rename": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      const name = command.name.trim();
      if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Signal name cannot be empty.");
      if (signal.name === name) return fail("no-op", "NO_OP", "$", "Signal already has this name.");
      const changeSet: ChangeSet = { rowPresentation: [signal.id] };
      return { ok: true, document: replaceSignal(document, index, { ...signal, name, display: { ...signal.display, name } }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.move": return moveSignal(document, command);
    case "signal.setVisibility": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      const visible = signal.display.visible !== false;
      if (visible === command.visible) return fail("no-op", "NO_OP", "$", "Signal visibility is unchanged.");
      const nextDocument = replaceSignal(document, index, { ...signal, display: { ...signal.display, visible: command.visible } });
      const changedTimingRows = changedPositions(orderedVisibleTimingRows(document), orderedVisibleTimingRows(nextDocument));
      const affectedForAnnotations = [...new Set([signal.id, ...changedTimingRows])];
      const changeSet: ChangeSet = { rowPresentation: [signal.id], geometryScreenY: changedTimingRows, annotationPosition: annotationsForSignals(document, affectedForAnnotations), minimapOverview: true };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "signal.updateValue": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_NOT_EDITABLE", "$.signalId", "Value changes require a non-clock timing signal.");
      if (!Number.isFinite(command.start) || command.start < 0 || command.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.start", "Change point is outside the timeline.");
      const valueProblem = valueSignalValueProblem(signal.type, command.value);
      if (valueProblem) return fail("invalid", "UNSUPPORTED_SIGNAL_VALUE", "$.value", valueProblem);
      const existing = signal.values.find((change) => change.start === command.start);
      if (existing?.value === command.value && existing.comment === command.comment) return fail("no-op", "NO_OP", "$", "Signal value is unchanged.");
      const change = { start: command.start, value: command.value, ...(command.comment === undefined ? {} : { comment: command.comment }) };
      const values = [...signal.values.filter((item) => item.start !== command.start), change].sort((left, right) => left.start - right.start);
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, values }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.replaceValues": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_NOT_EDITABLE", "$.signalId", "Value changes require a non-clock timing signal.");
      const values = [...command.values].sort((left, right) => left.start - right.start);
      if (values.length === 0) return fail("invalid", "EMPTY_VALUES", "$.values", "A value signal must retain at least one change point.");
      if (values.some((change) => !Number.isInteger(change.start) || change.start < 0 || change.start >= document.timeline.cycleCount)) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.values", "Every change point must be inside the timeline.");
      if (new Set(values.map((change) => change.start)).size !== values.length) return fail("invalid", "DUPLICATE_CHANGE_POINT", "$.values", "Change points must be unique.");
      const valueProblem = valuesCompatibleForType(signal.type, values);
      if (valueProblem) return fail("invalid", "UNSUPPORTED_SIGNAL_VALUE", "$.values", valueProblem);
      if (semanticEqual(signal.values, values)) return fail("no-op", "NO_OP", "$.values", "Signal values are unchanged.");
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, values }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.replaceValue": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_NOT_EDITABLE", "$.signalId", "Value changes require a non-clock timing signal.");
      if (!Number.isInteger(command.start) || command.start < 0 || command.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.start", "Change point is outside the timeline.");
      const source = signal.values.find((change) => change.start === command.fromStart);
      if (!source) return fail("invalid", "CHANGE_NOT_FOUND", "$.fromStart", `No change starts at cycle ${command.fromStart}.`);
      if (command.start !== command.fromStart && signal.values.some((change) => change.start === command.start)) return fail("invalid", "DUPLICATE_CHANGE_POINT", "$.start", `A change already starts at cycle ${command.start}.`);
      const valueProblem = valueSignalValueProblem(signal.type, command.value);
      if (valueProblem) return fail("invalid", "UNSUPPORTED_SIGNAL_VALUE", "$.value", valueProblem);
      if (source.start === command.start && source.value === command.value && source.comment === command.comment) return fail("no-op", "NO_OP", "$", "Value change is unchanged.");
      const replacement = { start: command.start, value: command.value, ...(command.comment === undefined ? {} : { comment: command.comment }) };
      const values = signal.values.map((change) => change === source ? replacement : change).sort((left, right) => left.start - right.start);
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, values }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.moveValue": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_NOT_EDITABLE", "$.signalId", "Value changes require a non-clock timing signal.");
      if (!Number.isInteger(command.toStart) || command.toStart < 0 || command.toStart >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.toStart", "Change point is outside the timeline.");
      const source = signal.values.find((change) => change.start === command.fromStart);
      if (!source) return fail("invalid", "CHANGE_NOT_FOUND", "$.fromStart", `No change starts at cycle ${command.fromStart}.`);
      if (command.fromStart === command.toStart) return fail("no-op", "NO_OP", "$", "Change point is already at the requested cycle.");
      if (signal.values.some((change) => change.start === command.toStart)) return fail("invalid", "DUPLICATE_CHANGE_POINT", "$.toStart", `A change already starts at cycle ${command.toStart}.`);
      const values = signal.values.map((change) => change === source ? { ...change, start: command.toStart } : change).sort((left, right) => left.start - right.start);
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, values }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.removeValue": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_NOT_EDITABLE", "$.signalId", "Value changes require a non-clock timing signal.");
      if (!signal.values.some((change) => change.start === command.start)) return fail("invalid", "CHANGE_NOT_FOUND", "$.start", `No change starts at cycle ${command.start}.`);
      if (signal.values.length === 1) return fail("invalid", "LAST_CHANGE_REQUIRED", "$.start", "A value signal must retain at least one change point.");
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, values: signal.values.filter((change) => change.start !== command.start) }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.updateProperties": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      const name = command.name.trim();
      if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      if (signal.type === "commentRow") return fail("invalid", "SIGNAL_PROPERTIES_NOT_SUPPORTED", "$.signalId", "This property command does not apply to Comment Rows.");
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Signal name cannot be empty.");
      const nextType = command.signalType ?? signal.type;
      if (signal.type !== "clock") {
        const valueProblem = valuesCompatibleForType(nextType as ValueSignal["type"], signal.values);
        if (valueProblem) return fail("invalid", "UNSUPPORTED_SIGNAL_VALUE", "$.signalType", `Cannot convert ${signal.type} to ${nextType} without changing existing values: ${valueProblem}`);
      }
      if (command.displayFormat !== undefined && nextType !== "bus") return fail("invalid", "DISPLAY_FORMAT_NOT_SUPPORTED", "$.displayFormat", "Display format applies only to bus signals.");
      if (command.width !== undefined && (nextType !== "bus" || !Number.isInteger(command.width) || command.width < 1)) return fail("invalid", "INVALID_SIGNAL_WIDTH", "$.width", "Width must be a positive integer and applies only to bus signals.");
      if (command.displayAlign !== undefined && !["left", "center", "right"].includes(command.displayAlign)) return fail("invalid", "INVALID_DISPLAY_ALIGN", "$.displayAlign", "Display alignment is invalid.");
      if (command.displayOverflow !== undefined && !["expand", "ellipsis", "wrap"].includes(command.displayOverflow)) return fail("invalid", "INVALID_DISPLAY_OVERFLOW", "$.displayOverflow", "Display overflow is invalid.");
      if (command.splitPane !== undefined && !["upper", "lower", "both"].includes(command.splitPane)) return fail("invalid", "INVALID_SPLIT_PANE", "$.splitPane", "Signal Split pane assignment is invalid.");
      if ((command.spacingBefore !== undefined && (!Number.isFinite(command.spacingBefore) || command.spacingBefore < 0)) || (command.spacingAfter !== undefined && (!Number.isFinite(command.spacingAfter) || command.spacingAfter < 0))) return fail("invalid", "INVALID_SIGNAL_SPACING", "$.spacing", "Signal spacing must be finite and non-negative.");
      const currentFormat = signal.type === "bus" ? signal.displayFormat : undefined;
      const currentWidth = signal.type === "bus" ? signal.width : undefined;
      const currentVisible = signal.display.visible !== false;
      const currentAlign = signal.display.align;
      const currentOverflow = signal.display.overflow;
      const currentStyle = signal.display.style;
      const currentSplitPane = signal.display.splitPane;
      const nextFormat = nextType === "bus" ? command.displayFormat ?? currentFormat : undefined;
      const nextWidth = nextType === "bus" ? command.width ?? currentWidth : undefined;
      const nextVisible = command.visible ?? currentVisible;
      const nextAlign = command.displayAlign ?? currentAlign;
      const nextOverflow = command.displayOverflow ?? currentOverflow;
      const nextStyle = command.displayStyle ?? currentStyle;
      const nextSplitPane = command.splitPane ?? currentSplitPane;
      const nextSpacingBefore = command.spacingBefore ?? signal.spacingBefore;
      const nextSpacingAfter = command.spacingAfter ?? signal.spacingAfter;
      if (signal.name === name && signal.role === command.role && signal.type === nextType && currentFormat === nextFormat && currentWidth === nextWidth && currentVisible === nextVisible && currentAlign === nextAlign && currentOverflow === nextOverflow && currentSplitPane === nextSplitPane && signal.spacingBefore === nextSpacingBefore && signal.spacingAfter === nextSpacingAfter && semanticEqual(currentStyle, nextStyle)) return fail("no-op", "NO_OP", "$", "Signal properties are unchanged.");
      const nextDisplay = { ...signal.display, name, visible: nextVisible, ...(nextAlign === undefined ? {} : { align: nextAlign }), ...(nextOverflow === undefined ? {} : { overflow: nextOverflow }), ...(nextStyle === undefined ? {} : { style: nextStyle }), ...(nextSplitPane === undefined ? {} : { splitPane: nextSplitPane }) };
      const next: Signal = signal.type === "clock"
        ? { ...signal, name, role: command.role, display: nextDisplay, ...(nextSpacingBefore === undefined ? {} : { spacingBefore: nextSpacingBefore }), ...(nextSpacingAfter === undefined ? {} : { spacingAfter: nextSpacingAfter }) }
        : (() => {
          const { type: _type, width: _width, displayFormat: _displayFormat, ...base } = signal;
          const valueType = (command.signalType ?? signal.type) as ValueSignal["type"];
          return { ...base, type: valueType, name, role: command.role, display: nextDisplay, ...(nextWidth === undefined ? {} : { width: nextWidth }), ...(nextFormat === undefined ? {} : { displayFormat: nextFormat }), ...(nextSpacingBefore === undefined ? {} : { spacingBefore: nextSpacingBefore }), ...(nextSpacingAfter === undefined ? {} : { spacingAfter: nextSpacingAfter }) };
        })();
      const waveformChanged = signal.type !== nextType || currentFormat !== nextFormat || currentWidth !== nextWidth;
      const spacingChanged = signal.spacingBefore !== nextSpacingBefore || signal.spacingAfter !== nextSpacingAfter;
      const changeSet: ChangeSet = {
        rowPresentation: [signal.id],
        ...(spacingChanged ? { geometryScreenY: geometryRowsFrom(document, signal.id) } : {}),
        ...(waveformChanged ? { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: dependentAnnotations(document, signal.id).map((annotation) => annotation.id) } : {}),
      };
      return { ok: true, document: replaceSignal(document, index, next), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.convertClock": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      if (signal.type !== "clock") return fail("invalid", "SIGNAL_NOT_CLOCK", "$.signalId", "Only Clock signals can use Clock conversion.");
      const values: readonly SignalValueChange[] = [{ start: 0, value: command.targetType === "state" ? "IDLE" : command.targetType === "bus" ? "00" : 0 }];
      const next: ValueSignal = command.targetType === "bus"
        ? { id: signal.id, name: signal.name, role: signal.role, type: "bus", source: signal.source, display: { ...signal.display }, values, width: 8, displayFormat: "hex", ...(signal.spacingBefore === undefined ? {} : { spacingBefore: signal.spacingBefore }), ...(signal.spacingAfter === undefined ? {} : { spacingAfter: signal.spacingAfter }) }
        : { id: signal.id, name: signal.name, role: signal.role, type: command.targetType, source: signal.source, display: { ...signal.display }, values, ...(signal.spacingBefore === undefined ? {} : { spacingBefore: signal.spacingBefore }), ...(signal.spacingAfter === undefined ? {} : { spacingAfter: signal.spacingAfter }) };
      const affectedAnnotations = annotationsForSignals(document, signal.id);
      const changeSet: ChangeSet = { rowPresentation: [signal.id], waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      const nextTimeline = document.timeline.referenceClock === signal.id
        ? (() => { const { referenceClock: _referenceClock, ...timeline } = document.timeline; return timeline; })()
        : document.timeline;
      const timelineChanged = document.timeline.referenceClock === signal.id;
      return { ok: true, document: { ...replaceSignal(document, index, next), timeline: nextTimeline }, changeSet: { ...changeSet, ...(timelineChanged ? { timelineSemantics: true } : {}) }, inverseChangeSet: { ...changeSet, ...(timelineChanged ? { timelineSemantics: true } : {}) } };
    }
    case "signal.updateClockGenerator": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type !== "clock") return fail("invalid", "SIGNAL_NOT_CLOCK", "$.signalId", "Clock Generator requires a clock signal.");
      const generator = command.generator;
      if (!Number.isInteger(generator.start) || generator.start < 0 || generator.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.generator.start", "Clock start is outside the timeline.");
      if (!Number.isInteger(generator.period) || generator.period <= 0 || !Number.isFinite(generator.duty) || generator.duty <= 0 || generator.duty > 1 || !Number.isFinite(generator.phase) || !Number.isInteger(generator.phase * 2)) return fail("invalid", "INVALID_CLOCK_GENERATOR", "$.generator", "Clock period, duty, and phase are invalid.");
      if (generator.start % generator.period !== 0) return fail("invalid", "UNALIGNED_CLOCK_START", "$.generator.start", "Clock start must align to the generator period.");
      if ((signal.enable ?? []).some((change) => !Number.isInteger(change.start) || change.start % generator.period !== 0)) return fail("invalid", "UNALIGNED_CLOCK_ENABLE", "$.generator.period", "Clock enable changes must align to the generator period.");
      const suppressedPeriods = generator.suppressedPeriods ?? [];
      const periodSlots = clockSlotCount(generator, document.timeline.cycleCount);
      if (suppressedPeriods.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= periodSlots) || new Set(suppressedPeriods).size !== suppressedPeriods.length) return fail("invalid", "INVALID_SUPPRESSED_PERIODS", "$.generator.suppressedPeriods", `Suppressed periods must be unique integer slots within the ${periodSlots}-slot timeline.`);
      if (generator.duty !== 0.5) {
        const totalHalfCycles = generator.period * 2;
        const activeHalfCycles = Math.round(totalHalfCycles * generator.duty);
        const representable = generator.period >= 2 && activeHalfCycles > 0 && activeHalfCycles < totalHalfCycles && Math.abs(activeHalfCycles / totalHalfCycles - generator.duty) <= 1e-9 && generator.initial === (generator.polarity === "positive" ? 0 : 1);
        if (!representable) return fail("invalid", "UNSUPPORTED_CLOCK_DUTY", "$.generator.duty", "This WaveDrom-backed editor supports non-50% duty only at exact half-cycle boundaries with the inactive initial level.");
      }
      if (semanticEqual(signal.generator, generator)) return fail("no-op", "NO_OP", "$", "Clock Generator is unchanged.");
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, generator }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.updateEdgeCounter": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type !== "clock") return fail("invalid", "SIGNAL_NOT_CLOCK", "$.signalId", "Edge Numbers require a clock signal.");
      const settings = command.edgeCounter;
      const validMode = settings.mode === "rising" || settings.mode === "falling" || settings.mode === "both";
      const validCountFrom = settings.countFrom === "signal-start" || settings.countFrom === "selected-edge" || settings.countFrom === "marker" || settings.countFrom === "visible-range-start";
      const validPosition = settings.position === "above" || settings.position === "below";
      const validAnchor = settings.anchorId === undefined || typeof settings.anchorId === "string";
      if (typeof settings.show !== "boolean" || !validMode || !validCountFrom || !validPosition || !validAnchor || !Number.isInteger(settings.startNumber) || !Number.isInteger(settings.labelEvery) || settings.labelEvery < 1 || !Number.isFinite(settings.offset.x) || !Number.isFinite(settings.offset.y)) return fail("invalid", "INVALID_EDGE_COUNTER", "$.edgeCounter", "Edge Number settings are invalid.");
      if (settings.countFrom === "marker" && settings.anchorId === undefined) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.edgeCounter.anchorId", "Marker count-from requires an explicit Bookmark anchor.");
      if (settings.anchorId !== undefined && !document.bookmarks.some((bookmark) => bookmark.id === settings.anchorId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.edgeCounter.anchorId", `Bookmark '${settings.anchorId}' does not exist.`);
      if (semanticEqual(signal.edgeCounter, settings)) return fail("no-op", "NO_OP", "$", "Edge Number settings are unchanged.");
      const changeSet: ChangeSet = { rowPresentation: [signal.id], edgeCounter: [signal.id] };
      return { ok: true, document: replaceSignal(document, index, { ...signal, edgeCounter: settings }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.updateResetSemantics": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_PROPERTIES_NOT_SUPPORTED", "$.signalId", "Reset semantics require a value signal.");
      const reset = command.resetSemantics;
      if (reset && (!["active-high", "active-low"].includes(reset.polarity) || !["synchronous", "asynchronous"].includes(reset.synchronization) || (reset.assertCycle !== undefined && (!Number.isInteger(reset.assertCycle) || reset.assertCycle < 0 || reset.assertCycle >= document.timeline.cycleCount)) || (reset.deassertCycle !== undefined && (!Number.isInteger(reset.deassertCycle) || reset.deassertCycle < 0 || reset.deassertCycle >= document.timeline.cycleCount)) || (reset.assertCycle !== undefined && reset.deassertCycle !== undefined && reset.assertCycle > reset.deassertCycle))) return fail("invalid", "INVALID_RESET_SEMANTICS", "$.resetSemantics", "Reset semantics must use in-range ordered source-time cycles.");
      if (semanticEqual(signal.resetSemantics, reset)) return fail("no-op", "NO_OP", "$", "Reset semantics are unchanged.");
      return { ok: true, document: replaceSignal(document, index, reset === undefined ? (() => { const { resetSemantics: _reset, ...rest } = signal; return rest; })() : { ...signal, resetSemantics: reset }), changeSet: { waveSemantics: [signal.id] }, inverseChangeSet: { waveSemantics: [signal.id] } };
    }
    case "spacer.create": {
      const groupIndex = document.signalGroups.findIndex((group) => group.id === command.targetGroupId);
      const group = document.signalGroups[groupIndex];
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.targetGroupId", `Group '${command.targetGroupId}' does not exist.`);
      if (!isStableId(command.spacer.id)) return fail("invalid", "INVALID_STABLE_ID", "$.spacer.id", "Spacer ID must be stable.");
      if (canonicalIds(document).has(command.spacer.id)) return fail("invalid", "DUPLICATE_ID", "$.spacer.id", `Spacer '${command.spacer.id}' already exists.`);
      if (!Number.isFinite(command.spacer.height) || command.spacer.height <= 0) return fail("invalid", "INVALID_SPACER_HEIGHT", "$.spacer.height", "Spacer height must be finite and positive.");
      if (!Number.isInteger(command.index) || command.index < 0 || command.index > group.rows.length) return fail("invalid", "INDEX_OUT_OF_RANGE", "$.index", "Spacer insertion index is outside the group rows.");
      const rows = [...group.rows]; rows.splice(command.index, 0, command.spacer.id);
      const nextGroup: SignalGroup = { ...group, rows, spacers: [...(group.spacers ?? []), command.spacer] };
      const groups = [...document.signalGroups]; groups[groupIndex] = nextGroup;
      const nextDocument = { ...document, signalGroups: groups };
      const affectedTimingRows = geometryRowsFrom(nextDocument, command.spacer.id);
      const changeSet: ChangeSet = { rowOrder: [command.spacer.id], geometryScreenY: affectedTimingRows, annotationPosition: annotationsForSignals(document, affectedTimingRows), minimapOverview: true };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "spacer.move": return moveSpacer(document, command);
    case "spacer.update": {
      const groupIndex = document.signalGroups.findIndex((group) => group.spacers?.some((spacer) => spacer.id === command.spacerId));
      const group = document.signalGroups[groupIndex];
      const spacer = group?.spacers?.find((item) => item.id === command.spacerId);
      if (!group || !spacer) return fail("invalid", "SPACER_NOT_FOUND", "$.spacerId", `Spacer '${command.spacerId}' does not exist.`);
      if (!Number.isFinite(command.height) || command.height <= 0) return fail("invalid", "INVALID_SPACER_HEIGHT", "$.height", "Spacer height must be finite and positive.");
      if (spacer.height === command.height) return fail("no-op", "NO_OP", "$", "Spacer height is unchanged.");
      const nextGroup: SignalGroup = { ...group, spacers: group.spacers!.map((item) => item.id === spacer.id ? { ...item, height: command.height } : item) };
      const groups = [...document.signalGroups]; groups[groupIndex] = nextGroup;
      const nextDocument = { ...document, signalGroups: groups };
      const changeSet: ChangeSet = { rowPresentation: [spacer.id], geometryScreenY: geometryRowsFrom(document, spacer.id), minimapOverview: true };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "spacer.delete": {
      const groupIndex = document.signalGroups.findIndex((group) => group.spacers?.some((spacer) => spacer.id === command.spacerId));
      const group = document.signalGroups[groupIndex];
      const spacer = group?.spacers?.find((item) => item.id === command.spacerId);
      if (!group || !spacer) return fail("invalid", "SPACER_NOT_FOUND", "$.spacerId", `Spacer '${command.spacerId}' does not exist.`);
      const rows = group.rows.filter((rowId) => rowId !== spacer.id);
      const remaining = group.spacers!.filter((item) => item.id !== spacer.id);
      const { spacers: _removedSpacers, ...groupWithoutSpacers } = group;
      const nextGroup: SignalGroup = { ...groupWithoutSpacers, rows, ...(remaining.length > 0 ? { spacers: remaining } : {}) };
      const groups = [...document.signalGroups]; groups[groupIndex] = nextGroup;
      const nextDocument = { ...document, signalGroups: groups };
      const changeSet: ChangeSet = { rowOrder: [spacer.id], geometryScreenY: geometryRowsFrom(document, spacer.id), minimapOverview: true };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "enum.rename": {
      const index = (document.enumDefinitions ?? []).findIndex((definition) => definition.id === command.enumId);
      const name = command.name.trim();
      if (index < 0) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.enumId", `Enum '${command.enumId}' does not exist.`);
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Enum name cannot be empty.");
      const current = document.enumDefinitions![index]!;
      if (current.name === name) return fail("no-op", "NO_OP", "$", "Enum already has this name.");
      const definitions = [...document.enumDefinitions!]; definitions[index] = { ...current, name };
      return { ok: true, document: { ...document, enumDefinitions: definitions }, changeSet: { fullDocumentReplace: true }, inverseChangeSet: { fullDocumentReplace: true } };
    }
    case "enum.delete": {
      const definitions = document.enumDefinitions ?? [];
      if (!definitions.some((definition) => definition.id === command.enumId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.enumId", `Enum '${command.enumId}' does not exist.`);
      const dependent = document.signals.filter((signal) => signal.type !== "clock" && signal.type !== "commentRow" && signal.enumId === command.enumId).map((signal) => signal.id);
      if (dependent.length > 0) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.enumId", `Enum '${command.enumId}' is referenced by ${dependent.length} Signal(s): ${dependent.join(", ")}.`);
      return { ok: true, document: { ...document, enumDefinitions: definitions.filter((definition) => definition.id !== command.enumId) }, changeSet: { fullDocumentReplace: true }, inverseChangeSet: { fullDocumentReplace: true } };
    }
    case "group.create": {
      if (command.group.rows.length > 0 || (command.group.spacers?.length ?? 0) > 0) return fail("invalid", "GROUP_CREATE_NOT_EMPTY", "$.group", "Group creation cannot implicitly move existing rows.");
      if (!Number.isInteger(command.index) || command.index < 0 || command.index > document.signalGroups.length) return fail("invalid", "INDEX_OUT_OF_RANGE", "$.index", "Group insertion index is outside the group list.");
      const groups = [...document.signalGroups]; groups.splice(command.index, 0, command.group);
      const changeSet: ChangeSet = { addedGroups: [command.group.id], rowOrder: [], minimapOverview: true };
      return { ok: true, document: { ...document, signalGroups: groups }, changeSet, inverseChangeSet: { removedGroups: [command.group.id], rowOrder: [], minimapOverview: true } };
    }
    case "group.delete": {
      const index = document.signalGroups.findIndex((group) => group.id === command.groupId);
      const group = document.signalGroups[index];
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.groupId", `Group '${command.groupId}' does not exist.`);
      if (group.rows.length > 0 || (group.spacers?.length ?? 0) > 0) return fail("invalid", "GROUP_NOT_EMPTY", "$.groupId", "Only empty groups can be deleted.");
      return { ok: true, document: { ...document, signalGroups: document.signalGroups.filter((item) => item.id !== group.id) }, changeSet: { removedGroups: [group.id], minimapOverview: true }, inverseChangeSet: { addedGroups: [group.id], minimapOverview: true } };
    }
    case "group.rename": {
      const index = document.signalGroups.findIndex((group) => group.id === command.groupId);
      const group = document.signalGroups[index];
      const name = command.name.trim();
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.groupId", `Group '${command.groupId}' does not exist.`);
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Group name cannot be empty.");
      if (group.name === name) return fail("no-op", "NO_OP", "$", "Group already has this name.");
      const groups = [...document.signalGroups]; groups[index] = { ...group, name };
      const rows = group.rows;
      const changeSet: ChangeSet = { rowPresentation: rows };
      return { ok: true, document: { ...document, signalGroups: groups }, changeSet, inverseChangeSet: changeSet };
    }
    case "group.move": {
      const index = document.signalGroups.findIndex((group) => group.id === command.groupId);
      const group = document.signalGroups[index];
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.groupId", `Group '${command.groupId}' does not exist.`);
      const remaining = document.signalGroups.filter((item) => item.id !== group.id);
      if (!Number.isInteger(command.index) || command.index < 0 || command.index > remaining.length) return fail("invalid", "INDEX_OUT_OF_RANGE", "$.index", "Group move index is outside the post-removal group list.");
      remaining.splice(command.index, 0, group);
      if (remaining.every((item, itemIndex) => item.id === document.signalGroups[itemIndex]?.id)) return fail("no-op", "NO_OP", "$", "Group is already at the requested position.");
      const nextDocument = { ...document, signalGroups: remaining };
      const changedRows = changedPositions(orderedRows(document), orderedRows(nextDocument));
      const changedTimingRows = changedPositions(orderedVisibleTimingRows(document), orderedVisibleTimingRows(nextDocument));
      const changeSet: ChangeSet = { rowOrder: changedRows, geometryScreenY: changedTimingRows, annotationPosition: annotationsForSignals(document, changedTimingRows), minimapOverview: true };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "group.updateLayout": {
      const index = document.signalGroups.findIndex((group) => group.id === command.groupId);
      const group = document.signalGroups[index];
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.groupId", `Group '${command.groupId}' does not exist.`);
      if ((command.spacingBefore !== undefined && (!Number.isFinite(command.spacingBefore) || command.spacingBefore < 0)) || (command.spacingAfter !== undefined && (!Number.isFinite(command.spacingAfter) || command.spacingAfter < 0))) return fail("invalid", "INVALID_GROUP_SPACING", "$", "Group spacing must be finite and non-negative.");
      if (group.spacingBefore === command.spacingBefore && group.spacingAfter === command.spacingAfter) return fail("no-op", "NO_OP", "$", "Group spacing is unchanged.");
      const next = Object.fromEntries(Object.entries({ ...group, spacingBefore: command.spacingBefore, spacingAfter: command.spacingAfter }).filter(([, value]) => value !== undefined)) as unknown as SignalGroup;
      const groups = [...document.signalGroups]; groups[index] = next;
      const affectedGroups = document.signalGroups.slice(index);
      const timingRows = new Set(orderedVisibleTimingRows({ ...document, signalGroups: affectedGroups }));
      const affectedTimingRows = orderedVisibleTimingRows(document).filter((id) => timingRows.has(id));
      const changeSet: ChangeSet = { rowPresentation: group.rows, geometryScreenY: affectedTimingRows, annotationPosition: annotationsForSignals(document, affectedTimingRows), minimapOverview: true };
      return { ok: true, document: { ...document, signalGroups: groups }, changeSet, inverseChangeSet: changeSet };
    }
    case "group.updateProperties": {
      const index = document.signalGroups.findIndex((group) => group.id === command.groupId);
      const group = document.signalGroups[index];
      const name = command.name.trim();
      if (!group) return fail("invalid", "GROUP_NOT_FOUND", "$.groupId", `Group '${command.groupId}' does not exist.`);
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Group name cannot be empty.");
      if (!Number.isFinite(command.spacingBefore) || command.spacingBefore < 0 || !Number.isFinite(command.spacingAfter) || command.spacingAfter < 0) return fail("invalid", "INVALID_GROUP_SPACING", "$.spacing", "Group spacing must be finite and non-negative.");
      const style = { ...command.style };
      if (style.opacity !== undefined && (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1)) return fail("invalid", "INVALID_GROUP_STYLE", "$.style.opacity", "Group opacity must be between 0 and 1.");
      if (group.name === name && group.spacingBefore === command.spacingBefore && group.spacingAfter === command.spacingAfter && semanticEqual(group.style ?? {}, style)) return fail("no-op", "NO_OP", "$", "Group properties are unchanged.");
      const next: SignalGroup = { ...group, name, spacingBefore: command.spacingBefore, spacingAfter: command.spacingAfter, ...(Object.keys(style).length === 0 ? {} : { style }) };
      const groups = [...document.signalGroups]; groups[index] = next;
      const affectedTimingRows = orderedVisibleTimingRows(document).filter((id) => group.rows.includes(id));
      const changeSet: ChangeSet = { rowPresentation: group.rows, geometryScreenY: affectedTimingRows, annotationPosition: annotationsForSignals(document, affectedTimingRows), minimapOverview: true };
      return { ok: true, document: { ...document, signalGroups: groups }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.create": {
      const transaction = command.transaction;
      if (!isStableId(transaction.id)) return fail("invalid", "INVALID_STABLE_ID", "$.transaction.id", "Transaction ID must be stable.");
      if (document.transactions.some((item) => item.id === transaction.id)) return fail("invalid", "DUPLICATE_ID", "$.transaction.id", `Transaction '${transaction.id}' already exists.`);
      if (!transaction.name.trim()) return fail("invalid", "INVALID_NAME", "$.transaction.name", "Transaction name cannot be empty.");
      if (!Number.isInteger(transaction.start) || !Number.isInteger(transaction.end) || transaction.start < 0 || transaction.start >= transaction.end || transaction.end > document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.transaction", "Transaction must use a half-open source-time range.");
      if (transaction.phases && transactionPhasesProblem(transaction.phases, transaction.start, transaction.end)) return fail("invalid", "INVALID_TRANSACTION_PHASE", "$.transaction.phases", transactionPhasesProblem(transaction.phases, transaction.start, transaction.end)!);
      if (transaction.linkedSignals?.some((id) => !document.signals.some((signal) => signal.id === id))) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.transaction.linkedSignals", "Transaction links must target existing Signals.");
      if (transaction.groupId !== undefined && !(document.transactionGroups ?? []).some((group) => group.id === transaction.groupId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.transaction.groupId", "Transaction Group does not exist.");
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions: [...document.transactions, transaction] }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.duplicate": {
      const source = document.transactions.find((item) => item.id === command.transactionId);
      if (!source) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      if (!isStableId(command.newTransactionId)) return fail("invalid", "INVALID_STABLE_ID", "$.newTransactionId", "Transaction ID must be stable.");
      if (document.transactions.some((item) => item.id === command.newTransactionId)) return fail("invalid", "DUPLICATE_ID", "$.newTransactionId", "Duplicate Transaction ID.");
      const name = command.name === undefined ? source.name : command.name.trim();
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Transaction name cannot be empty.");
      const duplicate: Transaction = { ...source, id: command.newTransactionId, name };
      const changeSet: ChangeSet = { transactionSemantics: [duplicate.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions: [...document.transactions, duplicate] }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.delete": {
      const transaction = document.transactions.find((item) => item.id === command.transactionId);
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions: document.transactions.filter((item) => item.id !== transaction.id) }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.rename": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      const name = command.name.trim();
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Transaction name cannot be empty.");
      if (name === transaction.name) return fail("no-op", "NO_OP", "$", "Transaction already has this name.");
      const transactions = [...document.transactions]; transactions[index] = { ...transaction, name };
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id] };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.phaseAdd":
    case "transaction.phaseUpdate":
    case "transaction.phaseDelete": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      const phases = [...(transaction.phases ?? [])];
      if (command.type === "transaction.phaseAdd") phases.push(command.phase);
      else if (command.phaseIndex < 0 || command.phaseIndex >= phases.length) return fail("invalid", "INVALID_TRANSACTION_PHASE", "$.phaseIndex", "Phase index is out of range.");
      else if (command.type === "transaction.phaseUpdate") phases[command.phaseIndex] = command.phase;
      else phases.splice(command.phaseIndex, 1);
      const sorted = phases.slice().sort((a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name));
      const phaseProblem = transactionPhasesProblem(sorted, transaction.start, transaction.end);
      if (phaseProblem) return fail("invalid", "INVALID_TRANSACTION_PHASE", "$.phase", phaseProblem);
      const next: Transaction = sorted.length ? { ...transaction, phases: sorted } : (() => { const { phases: _phases, ...rest } = transaction; return rest; })();
      const transactions = [...document.transactions]; transactions[index] = next;
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.update": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      const name = command.name.trim();
      const laneId = command.laneId?.trim();
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Transaction name cannot be empty.");
      if (!Number.isInteger(command.start) || !Number.isInteger(command.end) || command.start < 0 || command.start >= command.end || command.end > document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$", "Transaction must use a half-open source-time range.");
      const lane = command.clearLaneId ? undefined : command.laneId === undefined ? transaction.laneId : laneId || undefined;
      const phases = command.clearPhases ? undefined : command.phases === undefined ? transaction.phases : command.phases;
      if (phases && transactionPhasesProblem(phases, command.start, command.end)) return fail("invalid", "INVALID_TRANSACTION_PHASE", "$.phases", transactionPhasesProblem(phases, command.start, command.end)!);
      if (command.groupId !== undefined && !(document.transactionGroups ?? []).some((group) => group.id === command.groupId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.groupId", "Transaction Group does not exist.");
      const groupId = command.clearGroupId ? undefined : command.groupId === undefined ? transaction.groupId : command.groupId;
      const color = command.clearColor ? undefined : command.color === undefined ? transaction.color : command.color;
      const description = command.clearDescription ? undefined : command.description === undefined ? transaction.description : command.description;
      if (transaction.name === name && transaction.start === command.start && transaction.end === command.end && (transaction.laneId ?? undefined) === (lane ?? undefined) && (transaction.groupId ?? undefined) === (groupId ?? undefined) && transaction.color === color && transaction.description === description && semanticEqual(transaction.phases ?? [], phases ?? [])) return fail("no-op", "NO_OP", "$", "Transaction is unchanged.");
      const next: Transaction = { ...transaction, name, start: command.start, end: command.end, ...(lane === undefined ? {} : { laneId: lane }), ...(groupId === undefined ? {} : { groupId }), ...(color === undefined ? {} : { color }), ...(description === undefined ? {} : { description }), ...(phases && phases.length > 0 ? { phases } : {}) };
      if (lane === undefined) delete (next as { laneId?: string }).laneId;
      if (groupId === undefined) delete (next as { groupId?: string }).groupId;
      if (color === undefined) delete (next as { color?: string }).color;
      if (description === undefined) delete (next as { description?: string }).description;
      if (phases === undefined || phases.length === 0) delete (next as { phases?: readonly TransactionPhase[] }).phases;
      const transactions = [...document.transactions]; transactions[index] = next;
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.move": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      const delta = command.start - transaction.start;
      const end = transaction.end + delta;
      if (!Number.isInteger(command.start) || command.start < 0 || end > document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.start", "Moved Transaction is outside the source timeline.");
      if (delta === 0) return fail("no-op", "NO_OP", "$", "Transaction is already at the requested start.");
      const next = { ...transaction, start: command.start, end, ...(transaction.phases ? { phases: transaction.phases.map((phase) => ({ ...phase, start: phase.start + delta, end: phase.end + delta })) } : {}) };
      const transactions = [...document.transactions]; transactions[index] = next;
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.resize": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      const start = command.edge === "start" ? command.value : transaction.start;
      const end = command.edge === "end" ? command.value : transaction.end;
      if (!Number.isInteger(command.value) || start < 0 || start >= end || end > document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.value", "Resized Transaction must remain a non-empty half-open range.");
      if (start === transaction.start && end === transaction.end) return fail("no-op", "NO_OP", "$", "Transaction edge is unchanged.");
      const phases = transaction.phases?.map((phase) => ({ ...phase, start: Math.max(start, phase.start), end: Math.min(end, phase.end) })).filter((phase) => phase.start < phase.end);
      const { phases: _phases, ...base } = transaction;
      const next = phases?.length ? { ...base, start, end, phases } : { ...base, start, end };
      const transactions = [...document.transactions]; transactions[index] = next;
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id], minimapOverview: true };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.moveLane": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      const laneId = command.laneId.trim();
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      if (!laneId) return fail("invalid", "INVALID_LANE", "$.laneId", "Lane ID cannot be empty.");
      if (transaction.laneId === laneId) return fail("no-op", "NO_OP", "$", "Transaction is already in this lane.");
      const transactions = [...document.transactions]; transactions[index] = { ...transaction, laneId };
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id] };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transaction.linkSignal":
    case "transaction.unlinkSignal": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId);
      const transaction = document.transactions[index];
      if (!transaction) return fail("invalid", "TRANSACTION_NOT_FOUND", "$.transactionId", `Transaction '${command.transactionId}' does not exist.`);
      if (!document.signals.some((signal) => signal.id === command.signalId)) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      const current = transaction.linkedSignals ?? [];
      const linked = current.includes(command.signalId);
      if ((command.type === "transaction.linkSignal" && linked) || (command.type === "transaction.unlinkSignal" && !linked)) return fail("no-op", "NO_OP", "$", "Transaction Signal link is unchanged.");
      const linkedSignals = command.type === "transaction.linkSignal" ? [...current, command.signalId] : current.filter((id) => id !== command.signalId);
      const transactions = [...document.transactions]; transactions[index] = { ...transaction, linkedSignals };
      const changeSet: ChangeSet = { transactionSemantics: [transaction.id] };
      return { ok: true, document: { ...document, transactions }, changeSet, inverseChangeSet: changeSet };
    }
    case "transactionGroup.create": {
      const group = command.group;
      if (!isStableId(group.id) || !group.name.trim() || !Number.isInteger(group.order) || group.order < 0 || (document.transactionGroups ?? []).some((item) => item.id === group.id)) return fail("invalid", "INVALID_STABLE_ID", "$.group", "Transaction Group must have a unique stable ID, name, and order.");
      return { ok: true, document: { ...document, transactionGroups: [...(document.transactionGroups ?? []), group] }, changeSet: { transactionGroupSemantics: [group.id] }, inverseChangeSet: { transactionGroupSemantics: [group.id] } };
    }
    case "transactionGroup.rename": {
      const groups = [...(document.transactionGroups ?? [])]; const index = groups.findIndex((item) => item.id === command.groupId);
      if (index < 0 || !command.name.trim()) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.groupId", "Transaction Group does not exist or has an empty name.");
      if (groups[index]!.name === command.name) return fail("no-op", "NO_OP", "$", "Transaction Group is unchanged.");
      groups[index] = { ...groups[index]!, name: command.name }; return { ok: true, document: { ...document, transactionGroups: groups }, changeSet: { transactionGroupSemantics: [command.groupId] }, inverseChangeSet: { transactionGroupSemantics: [command.groupId] } };
    }
    case "transactionGroup.update": {
      const groups = [...(document.transactionGroups ?? [])]; const index = groups.findIndex((item) => item.id === command.groupId);
      if (index < 0 || !command.name.trim() || !Number.isInteger(command.order) || command.order < 0) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.groupId", "Transaction Group update is invalid.");
      const current = groups[index]!;
      const updated = { ...current, name: command.name, order: command.order };
      const next = command.color === undefined
        ? updated
        : command.color.trim() === ""
          ? (() => { const { color: _color, ...rest } = updated; return rest; })()
          : { ...updated, color: command.color };
      if (semanticEqual(current, next)) return fail("no-op", "NO_OP", "$", "Transaction Group is unchanged.");
      groups[index] = next; return { ok: true, document: { ...document, transactionGroups: groups }, changeSet: { transactionGroupSemantics: [command.groupId] }, inverseChangeSet: { transactionGroupSemantics: [command.groupId] } };
    }
    case "transactionGroup.delete": {
      const groups = document.transactionGroups ?? []; if (!groups.some((item) => item.id === command.groupId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.groupId", "Transaction Group does not exist.");
      const transactions = document.transactions.map((item) => item.groupId === command.groupId ? (({ groupId: _removed, ...rest }) => rest)(item) : item);
      const affectedTransactions = document.transactions.filter((item) => item.groupId === command.groupId).map((item) => item.id);
      return { ok: true, document: { ...document, transactionGroups: groups.filter((item) => item.id !== command.groupId), transactions }, changeSet: { transactionGroupSemantics: [command.groupId], transactionSemantics: affectedTransactions }, inverseChangeSet: { transactionGroupSemantics: [command.groupId], transactionSemantics: affectedTransactions } };
    }
    case "transaction.moveToGroup": {
      const index = document.transactions.findIndex((item) => item.id === command.transactionId); const transaction = document.transactions[index];
      if (!transaction || (command.groupId !== undefined && !(document.transactionGroups ?? []).some((group) => group.id === command.groupId))) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.groupId", "Transaction or Group does not exist.");
      if (transaction.groupId === command.groupId) return fail("no-op", "NO_OP", "$", "Transaction is already in this Group.");
      const transactions = [...document.transactions]; transactions[index] = command.groupId === undefined ? (({ groupId: _removed, ...rest }) => rest)(transaction) : { ...transaction, groupId: command.groupId };
      return { ok: true, document: { ...document, transactions }, changeSet: { transactionSemantics: [transaction.id] }, inverseChangeSet: { transactionSemantics: [transaction.id] } };
    }
    case "transaction.setTimeScale": {
      const currentScale = document.transactionTimeScale;
      const scale = command.clearShowSecondaryClock
        ? (({ showSecondaryClock: _removed, ...rest }) => rest)(
          { ...currentScale, ...command.scale },
        )
        : { ...currentScale, ...command.scale };
      if (!Number.isFinite(scale.clockCyclesPerTransactionCycle) || scale.clockCyclesPerTransactionCycle <= 0 || !Number.isInteger(scale.majorInterval) || scale.majorInterval < 1 || !Number.isInteger(scale.minorInterval) || scale.minorInterval < 1) return fail("invalid", "INVALID_TRANSACTION_TIME_SCALE", "$.scale", "Transaction time scale must use positive finite ratio and positive integer intervals.");
      if (semanticEqual(currentScale ?? {}, scale)) return fail("no-op", "NO_OP", "$", "Transaction time scale is unchanged.");
      return { ok: true, document: { ...document, transactionTimeScale: scale }, changeSet: { transactionSemantics: document.transactions.map((item) => item.id) }, inverseChangeSet: { transactionSemantics: document.transactions.map((item) => item.id) } };
    }
    case "annotation.updateAnchor": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (semanticEqual(annotation.anchor, command.anchor)) return fail("no-op", "NO_OP", "$", "Annotation anchor is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, anchor: command.anchor };
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.create": {
      if (!isStableId(command.annotation.id)) return fail("invalid", "INVALID_STABLE_ID", "$.annotation.id", "Annotation ID must be stable.");
      if (document.annotations.some((annotation) => annotation.id === command.annotation.id)) return fail("invalid", "DUPLICATE_ID", "$.annotation.id", `Annotation '${command.annotation.id}' already exists.`);
      const changeSet: ChangeSet = { annotationPosition: [command.annotation.id], annotationStyle: [command.annotation.id], minimapOverview: true };
      return { ok: true, document: { ...document, annotations: [...document.annotations, command.annotation] }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.delete": {
      const annotation = document.annotations.find((item) => item.id === command.annotationId);
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      const annotationGroups = (document.annotationGroups ?? []).map((group) => ({ ...group, annotationIds: group.annotationIds.filter((id) => id !== annotation.id) }));
      const changeSet: ChangeSet = { annotationPosition: [annotation.id], annotationStyle: [annotation.id], minimapOverview: true, ...(annotationGroups.some((group, index) => !semanticEqual(group, document.annotationGroups?.[index])) ? { annotationGroups: annotationGroups.map((group) => group.id) } : {}) };
      return { ok: true, document: { ...document, annotations: document.annotations.filter((item) => item.id !== annotation.id), annotationGroups }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.setAnchor": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (semanticEqual(annotation[command.field], command.anchor)) return fail("no-op", "NO_OP", "$", "Annotation anchor is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, [command.field]: command.anchor };
      const changeSet: ChangeSet = { annotationPosition: [annotation.id], minimapOverview: true };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.translateOffsets": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (!Number.isFinite(command.delta.x) || !Number.isFinite(command.delta.y)) return fail("invalid", "NON_FINITE_OFFSET", "$.delta", "Annotation offset delta must be finite.");
      if (command.delta.x === 0 && command.delta.y === 0) return fail("no-op", "NO_OP", "$", "Annotation offset delta is zero.");
      const next = { ...annotation } as Record<string, unknown>;
      for (const field of ["anchor", "start", "end", "from", "to"] as const) {
        const anchor = annotation[field];
        if (anchor) next[field] = { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + command.delta.x, y: (anchor.offset?.y ?? 0) + command.delta.y } };
      }
      const annotations = [...document.annotations]; annotations[index] = next as unknown as Annotation;
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.resetOffsets": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      const hasOffset = [annotation.anchor, annotation.start, annotation.end, annotation.from, annotation.to].some((anchor) => anchor?.offset && (anchor.offset.x !== 0 || anchor.offset.y !== 0)) || (annotation.labelOffset !== undefined && (annotation.labelOffset.x !== 0 || annotation.labelOffset.y !== 0));
      if (!hasOffset) return fail("no-op", "NO_OP", "$", "Annotation offsets are already reset.");
      const next = { ...annotation } as Record<string, unknown>;
      for (const field of ["anchor", "start", "end", "from", "to"] as const) {
        const anchor = annotation[field];
        if (anchor) {
          const { offset: _offset, ...semantic } = anchor;
          next[field] = semantic;
        }
      }
      delete next.labelOffset;
      const annotations = [...document.annotations]; annotations[index] = next as unknown as Annotation;
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.updateLabelOffset": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (!Number.isFinite(command.labelOffset.x) || !Number.isFinite(command.labelOffset.y)) return fail("invalid", "NON_FINITE_OFFSET", "$.labelOffset", "Label offset must be finite.");
      if (semanticEqual(annotation.labelOffset, command.labelOffset)) return fail("no-op", "NO_OP", "$", "Annotation label offset is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, labelOffset: command.labelOffset };
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.updateMeasurement": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (annotation.type !== "measurement" || !annotation.start || !annotation.end) return fail("invalid", "ANNOTATION_NO_SPAN", "$.annotationId", "Only Measurement annotations with start/end anchors support measurement semantics.");
      if (!["cycle", "30-70", "10-90", "20-80", "50%", "custom"].includes(command.profile)) return fail("invalid", "INVALID_MEASUREMENT_PROFILE", "$.profile", "Measurement profile is not supported.");
      if (!["threshold", "ratio"].includes(command.anchorKind)) return fail("invalid", "INVALID_MEASUREMENT_PROFILE", "$.anchorKind", "Measurement anchor kind is not supported.");
      if (![command.start, command.end].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || command.start > command.end) return fail("invalid", "INVALID_MEASUREMENT_ENDPOINT", "$.start", "Measurement endpoints must be finite fractions in ascending order.");
      const toCycleAnchor = (anchor: NonNullable<Annotation["start"]>, value: number): NonNullable<Annotation["start"]> => {
        const { threshold: _legacyThreshold, transition: _previousTransition, ...semantic } = anchor;
        return command.profile === "cycle" ? semantic : { ...semantic, point: "transition-center", transition: { kind: command.anchorKind, value } };
      };
      const next = { ...annotation, measurement: { profile: command.profile, anchorKind: command.anchorKind }, start: toCycleAnchor(annotation.start, command.start), end: toCycleAnchor(annotation.end, command.end), ...(command.layout === undefined ? {} : { measurementLayout: command.layout }) };
      if (semanticEqual(annotation, next)) return fail("no-op", "NO_OP", "$", "Measurement semantics are unchanged.");
      const annotations = [...document.annotations]; annotations[index] = next;
      const changeSet: ChangeSet = { annotationPosition: [annotation.id], annotationStyle: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.updateProperties": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      const label = command.label.trim();
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (!label) return fail("invalid", "INVALID_LABEL", "$.label", "Annotation label cannot be empty.");
      const next = Object.fromEntries(Object.entries({ ...annotation, label, visible: command.visible, color: command.color, lineType: command.lineType, arrowhead: command.arrowhead, sourceSignalId: command.sourceSignalId, traceOffsetCycles: command.traceOffsetCycles, opacity: command.opacity, labelOffset: command.labelOffset, style: command.style, measurement: command.measurement, measurementLayout: annotation.measurementLayout }).filter(([, value]) => value !== undefined)) as unknown as Annotation;
      if (semanticEqual(annotation, next)) return fail("no-op", "NO_OP", "$", "Annotation properties are unchanged.");
      const annotations = [...document.annotations]; annotations[index] = next;
      const changeSet: ChangeSet = { annotationStyle: [annotation.id], minimapOverview: true };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.updateVerticalSpan": {
      const index = document.annotations.findIndex((item) => item.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (annotation.type !== "marker") return fail("invalid", "INVALID_LABEL", "$.verticalSpan", "Vertical spans are only supported by Markers.");
      const span = command.verticalSpan;
      if (span.mode === "rows" && (!span.startRowId || !span.endRowId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.verticalSpan", "Rows mode requires stable start and end row IDs.");
      if (span.mode === "custom" && (!Number.isFinite(span.startOffset ?? 0) || !Number.isFinite(span.endOffset ?? 0))) return fail("invalid", "NON_FINITE_OFFSET", "$.verticalSpan", "Custom span offsets must be finite.");
      if (span.startRowId && !document.signals.some((signal) => signal.id === span.startRowId) || span.endRowId && !document.signals.some((signal) => signal.id === span.endRowId)) return fail("invalid", "MISSING_CROSS_REFERENCE", "$.verticalSpan", "Vertical span row IDs must reference existing Signals.");
      if (semanticEqual(annotation.verticalSpan ?? { mode: "auto" }, span)) return fail("no-op", "NO_OP", "$", "Marker vertical span is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, verticalSpan: span };
      const changeSet: ChangeSet = { annotationStyle: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.setPositionMode": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (annotation.type !== "highlight") return fail("invalid", "INVALID_LABEL", "$.positionMode", "Position mode is only supported by Highlights.");
      if (command.positionMode === "cycle-snap" && [annotation.anchor, annotation.start, annotation.end].some((anchor) => anchor !== undefined && !Number.isInteger(anchor.cycle))) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.positionMode", "Cycle-snap Highlights require integer source boundaries.");
      if ((annotation.positionMode ?? "cycle-snap") === command.positionMode) return fail("no-op", "NO_OP", "$", "Highlight position mode is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, positionMode: command.positionMode };
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.bringToFront": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (index === document.annotations.length - 1) return fail("no-op", "NO_OP", "$", "Annotation is already at the front.");
      const annotations = document.annotations.filter((item) => item.id !== annotation.id);
      annotations.push(annotation);
      const changeSet: ChangeSet = { annotationOrder: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.sendToBack": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (index === 0) return fail("no-op", "NO_OP", "$", "Annotation is already at the back.");
      const annotations = document.annotations.filter((item) => item.id !== annotation.id);
      annotations.unshift(annotation);
      const changeSet: ChangeSet = { annotationOrder: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.setRotation": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (!Number.isFinite(command.rotation)) return fail("invalid", "NON_FINITE_OFFSET", "$.rotation", "Annotation rotation must be finite.");
      if ((annotation.rotation ?? 0) === command.rotation) return fail("no-op", "NO_OP", "$", "Annotation rotation is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, rotation: command.rotation };
      const changeSet: ChangeSet = { annotationStyle: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.setAlign": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (annotation.align === command.align) return fail("no-op", "NO_OP", "$", "Annotation alignment is unchanged.");
      const { align: _previousAlign, ...withoutAlign } = annotation;
      const annotations = [...document.annotations]; annotations[index] = command.align === undefined ? withoutAlign : { ...withoutAlign, align: command.align };
      const changeSet: ChangeSet = { annotationStyle: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.setLocked": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if ((annotation.locked ?? false) === command.locked) return fail("no-op", "NO_OP", "$", "Annotation lock state is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, locked: command.locked };
      const changeSet: ChangeSet = { annotationStyle: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.matchSpan": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (!annotation.start || !annotation.end) return fail("invalid", "ANNOTATION_NO_SPAN", "$.annotationId", `Annotation type '${annotation.type}' has no start/end span to match.`);
      if (!Number.isFinite(command.spanCycles) || command.spanCycles <= 0) return fail("invalid", "NON_FINITE_OFFSET", "$.spanCycles", "Span must be a positive, finite cycle count.");
      const currentSpan = annotation.end.cycle - annotation.start.cycle;
      if (currentSpan === command.spanCycles) return fail("no-op", "NO_OP", "$", "Annotation span already matches.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, end: { ...annotation.end, cycle: annotation.start.cycle + command.spanCycles } };
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotationGroup.create": {
      if (!isStableId(command.group.id)) return fail("invalid", "INVALID_STABLE_ID", "$.group.id", "Annotation Group ID must be stable.");
      const existingGroups = document.annotationGroups ?? [];
      if (existingGroups.some((group) => group.id === command.group.id)) return fail("invalid", "DUPLICATE_ID", "$.group.id", `Annotation Group '${command.group.id}' already exists.`);
      if (command.group.annotationIds.length < 2) return fail("invalid", "ANNOTATION_GROUP_MEMBERS_REQUIRED", "$.group.annotationIds", "An Annotation Group needs at least 2 members.");
      const knownAnnotationIds = new Set(document.annotations.map((item) => item.id));
      const missing = command.group.annotationIds.find((memberId) => !knownAnnotationIds.has(memberId));
      if (missing) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.group.annotationIds", `Annotation '${missing}' does not exist.`);
      const alreadyGrouped = new Set(existingGroups.flatMap((group) => group.annotationIds));
      const grouped = command.group.annotationIds.find((memberId) => alreadyGrouped.has(memberId));
      if (grouped) return fail("invalid", "ANNOTATION_ALREADY_GROUPED", "$.group.annotationIds", `Annotation '${grouped}' already belongs to a group.`);
      const changeSet: ChangeSet = { annotationGroups: [command.group.id], annotationStyle: command.group.annotationIds };
      return { ok: true, document: { ...document, annotationGroups: [...existingGroups, command.group] }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotationGroup.delete": {
      const existingGroups = document.annotationGroups ?? [];
      const group = existingGroups.find((item) => item.id === command.groupId);
      if (!group) return fail("invalid", "ANNOTATION_GROUP_NOT_FOUND", "$.groupId", `Annotation Group '${command.groupId}' does not exist.`);
      const changeSet: ChangeSet = { annotationGroups: [group.id], annotationStyle: group.annotationIds };
      return { ok: true, document: { ...document, annotationGroups: existingGroups.filter((item) => item.id !== group.id) }, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.setReferenceClock": {
      const referenceClock = command.referenceClock;
      if (referenceClock !== undefined) {
        const signal = document.signals.find((item) => item.id === referenceClock);
        if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.referenceClock", `Reference clock '${referenceClock}' does not exist.`);
        if (signal.type !== "clock") return fail("invalid", "INVALID_REFERENCE_CLOCK", "$.referenceClock", "Reference clock must target a clock signal.");
      }
      if (document.timeline.referenceClock === referenceClock) return fail("no-op", "NO_OP", "$", "Reference clock is unchanged.");
      const nextTimeline = referenceClock === undefined ? (() => { const { referenceClock: _removed, ...timeline } = document.timeline; return timeline; })() : { ...document.timeline, referenceClock };
      const next = { ...document, timeline: nextTimeline };
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.setReferenceEdge": {
      if (command.edge !== "rising" && command.edge !== "falling") return fail("invalid", "INVALID_REFERENCE_EDGE", "$.edge", "Reference edge must be rising or falling.");
      if (document.timeline.edge === command.edge) return fail("no-op", "NO_OP", "$.edge", "Reference edge is unchanged.");
      const next = { ...document, timeline: { ...document.timeline, edge: command.edge } };
      const changeSet: ChangeSet = { timelineSemantics: true, geometryScreenX: true, annotationPosition: annotationsForSignals(document, timingSignalIds(document)), transactionSemantics: document.transactions.map((item) => item.id) };
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.insert": {
      if (!Number.isInteger(command.at) || command.at < 0 || command.at > document.timeline.cycleCount || !Number.isInteger(command.count) || command.count < 1) return fail("invalid", "INVALID_TIMELINE_INSERT", "$", "Insert requires an integer boundary and positive integer count.");
      if (document.constraints.length > 0) return fail("invalid", "UNTYPED_CONSTRAINT_RIPPLE", "$.constraints", "Timeline ripple is blocked while untyped constraints exist.");
      const clockPolicy = unsupportedClockRipple(document, { kind: "insert", at: command.at, count: command.count });
      if (clockPolicy) return clockPolicy;
      const next = insertTimeline(document, command.at, command.count);
      const transformedClock = transformedClockProblem(next);
      if (transformedClock) return transformedClock;
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.delete": {
      if (!Number.isInteger(command.start) || !Number.isInteger(command.end) || command.start < 0 || command.start >= command.end || command.end > document.timeline.cycleCount || document.timeline.cycleCount - (command.end - command.start) < 1) return fail("invalid", "INVALID_TIMELINE_DELETE", "$", "Delete requires a non-empty integer half-open range and must retain at least one cycle.");
      if (document.constraints.length > 0) return fail("invalid", "UNTYPED_CONSTRAINT_RIPPLE", "$.constraints", "Timeline ripple is blocked while untyped constraints exist.");
      const clockPolicy = unsupportedClockRipple(document, { kind: "delete", start: command.start, end: command.end });
      if (clockPolicy) return clockPolicy;
      const mappedLabelSources = document.timeline.labelAnchors.map((anchor) => mapDeleteBoundary(anchor.source, command.start, command.end));
      if (new Set(mappedLabelSources).size !== mappedLabelSources.length) return fail("invalid", "LABEL_ANCHOR_COLLISION", "$.timeline.labelAnchors", "Timeline delete would collapse multiple LabelAnchor sources; the deletion is rejected atomically.");
      const next = deleteTimeline(document, command.start, command.end);
      const transformedClock = transformedClockProblem(next);
      if (transformedClock) return transformedClock;
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.duplicateRange": {
      if (!Number.isInteger(command.start) || !Number.isInteger(command.end) || command.start < 0 || command.start >= command.end || command.end > document.timeline.cycleCount || !Number.isInteger(command.at) || command.at < 0 || command.at > document.timeline.cycleCount) return fail("invalid", "INVALID_TIMELINE_DUPLICATE", "$", "Duplicate requires a valid half-open source range and insertion boundary.");
      if (document.constraints.length > 0) return fail("invalid", "UNTYPED_CONSTRAINT_RIPPLE", "$.constraints", "Timeline duplicate is blocked while untyped constraints exist.");
      const clockPolicy = unsupportedClockRipple(document, { kind: "duplicate", at: command.at });
      if (clockPolicy) return clockPolicy;
      const next = duplicateTimelineRange(document, command);
      const transformedClock = transformedClockProblem(next);
      if (transformedClock) return transformedClock;
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.moveRange": {
      const length = command.end - command.start;
      if (!Number.isInteger(command.start) || !Number.isInteger(command.end) || command.start < 0 || command.start >= command.end || command.end > document.timeline.cycleCount || !Number.isInteger(command.to) || command.to < 0 || command.to > document.timeline.cycleCount - length) return fail("invalid", "INVALID_TIMELINE_MOVE", "$", "Move requires a valid half-open source range and post-removal destination boundary.");
      if (command.to === command.start) return fail("no-op", "NO_OP", "$", "Timeline range is already at the requested boundary.");
      if (document.constraints.length > 0) return fail("invalid", "UNTYPED_CONSTRAINT_RIPPLE", "$.constraints", "Timeline move is blocked while untyped constraints exist.");
      const clockPolicy = unsupportedClockRipple(document, { kind: "move" });
      if (clockPolicy) return clockPolicy;
      const next = moveTimelineRange(document, command.start, command.end, command.to);
      if (!next) return fail("invalid", "NON_CONTIGUOUS_RANGE_MOVE", "$", "Move would split a semantic range or includes non-periodic Clock controls.");
      const transformedClock = transformedClockProblem(next);
      if (transformedClock) return transformedClock;
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "bookmark.create": {
      if (!isStableId(command.bookmark.id)) return fail("invalid", "INVALID_STABLE_ID", "$.bookmark.id", "Bookmark ID must be stable.");
      if (document.bookmarks.some((bookmark) => bookmark.id === command.bookmark.id)) return fail("invalid", "DUPLICATE_ID", "$.bookmark.id", `Bookmark '${command.bookmark.id}' already exists.`);
      if (!Number.isInteger(command.bookmark.start) || command.bookmark.start < 0 || command.bookmark.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.bookmark.start", "Bookmark is outside the timeline.");
      const changeSet: ChangeSet = { bookmarkPosition: [command.bookmark.id], minimapOverview: true };
      return { ok: true, document: { ...document, bookmarks: [...document.bookmarks, command.bookmark] }, changeSet, inverseChangeSet: changeSet };
    }
    case "bookmark.move": {
      const index = document.bookmarks.findIndex((bookmark) => bookmark.id === command.bookmarkId);
      const bookmark = document.bookmarks[index];
      if (!bookmark) return fail("invalid", "BOOKMARK_NOT_FOUND", "$.bookmarkId", `Bookmark '${command.bookmarkId}' does not exist.`);
      if (!Number.isInteger(command.start) || command.start < 0 || command.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.start", "Bookmark is outside the timeline.");
      if (bookmark.start === command.start) return fail("no-op", "NO_OP", "$", "Bookmark is already at the requested cycle.");
      const bookmarks = [...document.bookmarks]; bookmarks[index] = { ...bookmark, start: command.start };
      const changeSet: ChangeSet = { bookmarkPosition: [bookmark.id], minimapOverview: true };
      return { ok: true, document: { ...document, bookmarks }, changeSet, inverseChangeSet: changeSet };
    }
    case "bookmark.update": {
      const index = document.bookmarks.findIndex((item) => item.id === command.bookmarkId);
      const bookmark = document.bookmarks[index];
      if (!bookmark) return fail("invalid", "BOOKMARK_NOT_FOUND", "$.bookmarkId", `Bookmark '${command.bookmarkId}' does not exist.`);
      if (!command.name.trim()) return fail("invalid", "EMPTY_BOOKMARK_NAME", "$.name", "Bookmark name must not be empty.");
      if (!Number.isInteger(command.start) || command.start < 0 || command.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.start", "Bookmark is outside the timeline.");
      if (bookmark.name === command.name && bookmark.start === command.start && bookmark.comment === command.comment) return fail("no-op", "NO_OP", "$", "Bookmark is unchanged.");
      const bookmarks = [...document.bookmarks]; bookmarks[index] = { id: bookmark.id, name: command.name, start: command.start, ...(command.comment === undefined ? {} : { comment: command.comment }) };
      const changeSet: ChangeSet = { bookmarkPosition: [bookmark.id], minimapOverview: true };
      return { ok: true, document: { ...document, bookmarks }, changeSet, inverseChangeSet: changeSet };
    }
    case "bookmark.delete": {
      const bookmark = document.bookmarks.find((item) => item.id === command.bookmarkId);
      if (!bookmark) return fail("invalid", "BOOKMARK_NOT_FOUND", "$.bookmarkId", `Bookmark '${command.bookmarkId}' does not exist.`);
      const changeSet: ChangeSet = { bookmarkPosition: [bookmark.id], minimapOverview: true };
      return { ok: true, document: { ...document, bookmarks: document.bookmarks.filter((item) => item.id !== bookmark.id) }, changeSet, inverseChangeSet: changeSet };
    }
    case "labelAnchor.create": {
      const anchor = command.labelAnchor;
      if (!isStableId(anchor.id)) return fail("invalid", "INVALID_STABLE_ID", "$.labelAnchor.id", "Label Anchor ID must be stable.");
      if (document.timeline.labelAnchors.some((item) => item.id === anchor.id)) return fail("invalid", "DUPLICATE_ID", "$.labelAnchor.id", `Label Anchor '${anchor.id}' already exists.`);
      // This command only ever produces a standalone anchor -- a Time
      // Group-owned fold-resume anchor is created/removed through the Time
      // Group's own lifecycle (#202), never through this one, so the two
      // ownership paths can never leave the other's anchor dangling.
      if (anchor.ownerTimeGroupId !== undefined) return fail("invalid", "LABEL_ANCHOR_OWNER_NOT_ALLOWED", "$.labelAnchor.ownerTimeGroupId", "labelAnchor.create only produces a standalone Label Anchor; a Time Group-owned resume anchor is created through the Time Group's own lifecycle.");
      if (!Number.isInteger(anchor.source) || anchor.source < 0 || anchor.source >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.labelAnchor.source", "Label Anchor source is outside the timeline.");
      if (!Number.isInteger(anchor.display)) return fail("invalid", "INVALID_LABEL_ANCHOR_DISPLAY", "$.labelAnchor.display", "Label Anchor display value must be an integer.");
      if (document.timeline.labelAnchors.some((item) => item.source === anchor.source)) return fail("invalid", "LABEL_ANCHOR_SOURCE_CONFLICT", "$.labelAnchor.source", `Another Label Anchor already restarts the ruler at source ${anchor.source}.`);
      // timelineSemantics (not just geometryScreenX) is what actually
      // triggers a ruler/grid refresh (see deriveRenderInvalidation in
      // use-editor-runtime-bridge.ts) -- it does NOT by itself request any
      // WaveDrom regeneration (that's driven only by changeSet.waveSemantics,
      // which this intentionally omits: a label-only rebase never touches
      // signal data).
      const changeSet: ChangeSet = { timelineSemantics: true, geometryScreenX: true, minimapOverview: true };
      return { ok: true, document: { ...document, timeline: { ...document.timeline, labelAnchors: [...document.timeline.labelAnchors, anchor] } }, changeSet, inverseChangeSet: changeSet };
    }
    case "labelAnchor.update": {
      const index = document.timeline.labelAnchors.findIndex((item) => item.id === command.labelAnchorId);
      const anchor = document.timeline.labelAnchors[index];
      if (!anchor) return fail("invalid", "LABEL_ANCHOR_NOT_FOUND", "$.labelAnchorId", `Label Anchor '${command.labelAnchorId}' does not exist.`);
      if (anchor.ownerTimeGroupId !== undefined) return fail("invalid", "LABEL_ANCHOR_OWNED_BY_TIME_GROUP", "$.labelAnchorId", "This Label Anchor is owned by a Time Group; edit it through the Time Group instead.");
      if (!Number.isInteger(command.source) || command.source < 0 || command.source >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.source", "Label Anchor source is outside the timeline.");
      if (!Number.isInteger(command.display)) return fail("invalid", "INVALID_LABEL_ANCHOR_DISPLAY", "$.display", "Label Anchor display value must be an integer.");
      if (anchor.source === command.source && anchor.display === command.display) return fail("no-op", "NO_OP", "$", "Label Anchor is unchanged.");
      if (document.timeline.labelAnchors.some((item) => item.id !== anchor.id && item.source === command.source)) return fail("invalid", "LABEL_ANCHOR_SOURCE_CONFLICT", "$.source", `Another Label Anchor already restarts the ruler at source ${command.source}.`);
      const labelAnchors = [...document.timeline.labelAnchors]; labelAnchors[index] = { id: anchor.id, source: command.source, display: command.display };
      const changeSet: ChangeSet = { timelineSemantics: true, geometryScreenX: true, minimapOverview: true };
      return { ok: true, document: { ...document, timeline: { ...document.timeline, labelAnchors } }, changeSet, inverseChangeSet: changeSet };
    }
    case "labelAnchor.delete": {
      const anchor = document.timeline.labelAnchors.find((item) => item.id === command.labelAnchorId);
      if (!anchor) return fail("invalid", "LABEL_ANCHOR_NOT_FOUND", "$.labelAnchorId", `Label Anchor '${command.labelAnchorId}' does not exist.`);
      if (anchor.ownerTimeGroupId !== undefined) return fail("invalid", "LABEL_ANCHOR_OWNED_BY_TIME_GROUP", "$.labelAnchorId", "This Label Anchor is owned by a Time Group; remove it by editing/deleting the Time Group instead.");
      const changeSet: ChangeSet = { timelineSemantics: true, geometryScreenX: true, minimapOverview: true };
      return { ok: true, document: { ...document, timeline: { ...document.timeline, labelAnchors: document.timeline.labelAnchors.filter((item) => item.id !== anchor.id) } }, changeSet, inverseChangeSet: changeSet };
    }
    case "timeGroup.groupRange": {
      if (!isStableId(command.timeGroupId)) return fail("invalid", "INVALID_STABLE_ID", "$.timeGroupId", "TimeGroup ID must be stable.");
      if (document.timeGroups.some(group => group.id === command.timeGroupId)) return fail("invalid", "DUPLICATE_ID", "$.timeGroupId", "TimeGroup ID already exists.");
      const resolution = resolveTimeGroupRange(document, command);
      if (!resolution.ok) return fail("invalid", resolution.code, "$.range", resolution.message);
      const name = command.name ?? "Time Group";
      if (!name.trim()) return fail("invalid", "EMPTY_TIME_GROUP_NAME", "$.name", "TimeGroup name must not be empty.");
      const group: TimeGroup = { id: command.timeGroupId, name, start: command.start, end: command.end, ...(resolution.parentId === undefined ? {} : { parentId: resolution.parentId }), ...(command.category === undefined ? {} : { category: command.category }) };
      const changed = [group.id];
      const timeGroups = document.timeGroups.map(item => {
        if (!resolution.enclosedIds.has(item.id) || (item.parentId !== undefined && resolution.enclosedIds.has(item.parentId))) return item;
        changed.push(item.id);
        return { ...item, parentId: group.id };
      });
      const changeSet: ChangeSet = { timeGroupSemantics: changed, geometryScreenX: true, minimapOverview: true };
      return { ok: true, document: { ...document, timeGroups: [...timeGroups, group] }, changeSet, inverseChangeSet: changeSet };
    }
    case "timeGroup.create": {
      const group = command.timeGroup;
      if (!isStableId(group.id)) return fail("invalid", "INVALID_STABLE_ID", "$.timeGroup.id", "Time Group ID must be stable.");
      if (document.timeGroups.some((item) => item.id === group.id)) return fail("invalid", "DUPLICATE_ID", "$.timeGroup.id", `Time Group '${group.id}' already exists.`);
      if (!Number.isInteger(group.start) || !Number.isInteger(group.end) || group.start < 0 || group.start >= group.end || group.end > document.timeline.cycleCount) return fail("invalid", "INVALID_TIME_GROUP_RANGE", "$.timeGroup", "Time Group must be a non-empty half-open range.");
      const nextDocument = { ...document, timeGroups: [...document.timeGroups, group] };
      const changeSet: ChangeSet = { timeGroupSemantics: [group.id], geometryScreenX: true, minimapOverview: true, ...(group.presentation?.collapsed ? { waveSemantics: timingSignalIds(nextDocument), geometryLocal: timingSignalIds(nextDocument) } : {}) };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "timeGroup.update": {
      const index = document.timeGroups.findIndex((item) => item.id === command.timeGroupId);
      const group = document.timeGroups[index];
      if (!group) return fail("invalid", "TIME_GROUP_NOT_FOUND", "$.timeGroupId", `Time Group '${command.timeGroupId}' does not exist.`);
      if (!command.name.trim()) return fail("invalid", "EMPTY_TIME_GROUP_NAME", "$.name", "Time Group name must not be empty.");
      const rangeChanged = command.start !== group.start || command.end !== group.end;
      const hierarchyBase = rangeChanged ? promoteTimeGroupChildren(document.timeGroups, group) : document.timeGroups.filter((item) => item.id !== group.id);
      const resolution = resolveTimeGroupRange({ ...document, timeGroups: hierarchyBase }, command);
      if (!resolution.ok) return fail("invalid", resolution.code, "$.range", resolution.message);
      if (!Number.isInteger(command.start) || !Number.isInteger(command.end) || command.start < 0 || command.start >= command.end || command.end > document.timeline.cycleCount) return fail("invalid", "INVALID_TIME_GROUP_RANGE", "$.timeGroup", "Time Group must be a non-empty half-open range.");
      if (group.name === command.name && group.start === command.start && group.end === command.end && group.category === command.category && group.comment === command.comment && semanticEqual(group.presentation, command.presentation)) return fail("no-op", "NO_OP", "$", "Time Group is unchanged.");
      const nextGroup: TimeGroup = { ...(resolution.parentId === undefined ? {} : { parentId: resolution.parentId }), id: group.id, name: command.name, start: command.start, end: command.end, ...(command.category === undefined ? {} : { category: command.category }), ...(command.comment === undefined ? {} : { comment: command.comment }), ...(command.presentation === undefined ? {} : { presentation: command.presentation }) };
      const timeGroups = hierarchyBase.map((item) => resolution.enclosedIds.has(item.id) && (item.parentId === undefined || !resolution.enclosedIds.has(item.parentId)) ? { ...item, parentId: group.id } : item);
      timeGroups.splice(index, 0, nextGroup);
      const nextDocument = { ...document, timeGroups };
      const collapseChanged = Boolean(group.presentation?.collapsed) !== Boolean(command.presentation?.collapsed);
      const changeSet: ChangeSet = { timeGroupSemantics: [group.id], geometryScreenX: true, minimapOverview: true, ...(collapseChanged || rangeChanged || Boolean(group.presentation?.collapsed) ? { waveSemantics: timingSignalIds(nextDocument), geometryLocal: timingSignalIds(nextDocument) } : {}) };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "timeGroup.updatePresentation": {
      const index = document.timeGroups.findIndex((group) => group.id === command.timeGroupId);
      const group = document.timeGroups[index];
      if (!group) return fail("invalid", "TIME_GROUP_NOT_FOUND", "$.timeGroupId", `Time Group '${command.timeGroupId}' does not exist.`);
      if (semanticEqual(group.presentation, command.presentation)) return fail("no-op", "NO_OP", "$", "Time Group presentation is unchanged.");
      const { presentation: _presentation, ...base } = group;
      const timeGroups = [...document.timeGroups]; timeGroups[index] = { ...base, ...(command.presentation === undefined ? {} : { presentation: command.presentation }) };
      const nextDocument = { ...document, timeGroups };
      const collapseChanged = Boolean(group.presentation?.collapsed) !== Boolean(command.presentation?.collapsed);
      const changeSet: ChangeSet = { timeGroupSemantics: [group.id], geometryScreenX: true, minimapOverview: true, ...(collapseChanged ? { waveSemantics: timingSignalIds(nextDocument), geometryLocal: timingSignalIds(nextDocument) } : {}) };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
    case "timeGroup.ungroup":
    case "timeGroup.delete": {
      const group = document.timeGroups.find((item) => item.id === command.timeGroupId);
      if (!group) return fail("invalid", "TIME_GROUP_NOT_FOUND", "$.timeGroupId", `Time Group '${command.timeGroupId}' does not exist.`);
      const ownedAnchorId = group.presentation?.resumeLabelAnchorId;
      const labelAnchors = document.timeline.labelAnchors.filter((anchor) => anchor.id !== ownedAnchorId && anchor.ownerTimeGroupId !== group.id);
      const nextDocument = { ...document, timeline: { ...document.timeline, labelAnchors }, timeGroups: promoteTimeGroupChildren(document.timeGroups, group) };
      const changeSet: ChangeSet = { timeGroupSemantics: [group.id, ...document.timeGroups.filter(item => item.parentId === group.id).map(item => item.id)], geometryScreenX: true, minimapOverview: true, ...(group.presentation?.collapsed ? { waveSemantics: timingSignalIds(nextDocument), geometryLocal: timingSignalIds(nextDocument) } : {}) };
      return { ok: true, document: nextDocument, changeSet, inverseChangeSet: changeSet };
    }
  }
}
