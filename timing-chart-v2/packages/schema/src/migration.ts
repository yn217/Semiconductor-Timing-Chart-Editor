import { allocateMigrationId, deterministicId } from "./stable-id.js";
import type {
  AnchorPoint,
  Annotation,
  CanonicalDocument,
  ClockSignal,
  Constraint,
  JsonObject,
  Layout,
  MigrationWarning,
  Signal,
  SignalGroup,
  SignalId,
  SignalValueChange,
  TimeGroup,
  Transaction,
} from "./types.js";

type MutableRecord = Record<string, unknown>;

function record(value: unknown): MutableRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as MutableRecord : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectExplicitIds(value: unknown, usedIds: Set<string>): void {
  if (Array.isArray(value)) { for (const entry of value) collectExplicitIds(entry, usedIds); return; }
  if (value === null || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (typeof object.id === "string") usedIds.add(object.id);
  for (const entry of Object.values(object)) collectExplicitIds(entry, usedIds);
}

function migrationId(source: MutableRecord, prefix: string, index: number, usedIds: Set<string>): string {
  return typeof source.id === "string" ? source.id : allocateMigrationId(prefix, index, usedIds);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function jsonObject(value: unknown): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return structuredJson(value) as JsonObject;
}

function structuredJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuredJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, structuredJson(entry)]));
  }
  return value;
}

function optionalNumber(target: MutableRecord, key: string, source: unknown): void {
  if (typeof source === "number") target[key] = source;
}

// V1 permitted fractional cycle positions (e.g. a half-cycle glitch pulse); V2's AnchorPoint/
// WaveDrom/geometry contract is integer-cycle only. Migration deterministically rounds to the
// nearest cycle and records a warning rather than silently truncating or rejecting the document.
function roundCycle(value: unknown, fallback: number, warnings: MigrationWarning[], path: string): number {
  const raw = number(value, fallback);
  const rounded = Math.round(raw);
  if (raw !== rounded) warnings.push({ code: "MIGRATION_FRACTIONAL_CYCLE_ROUNDED", path, message: `Fractional cycle position ${raw} was rounded to ${rounded}; V2 requires integer-cycle timing.` });
  return rounded;
}

function roundHalfCycle(value: unknown, fallback: number, warnings: MigrationWarning[], path: string): number {
  const raw = number(value, fallback);
  const rounded = Math.round(raw * 2) / 2;
  if (raw !== rounded) warnings.push({ code: "MIGRATION_SUB_HALF_CYCLE_ROUNDED", path, message: `Sub-half-cycle value ${raw} was rounded to ${rounded}; V2 geometry supports half-cycle clock phase.` });
  return rounded;
}

function normalizeChanges(value: unknown, fallback: string | number, warnings: MigrationWarning[], basePath: string, usedIds: Set<string>, claimedIds: Set<string>): SignalValueChange[] {
  const changes = list(value).map((entry, index) => {
    const source = record(entry);
    const explicitId = typeof source.id === "string" && source.id.length > 0 ? source.id : undefined;
    const id = explicitId !== undefined && !claimedIds.has(explicitId)
      ? (claimedIds.add(explicitId), explicitId)
      : allocateMigrationId(`${basePath.replace(/[^a-zA-Z0-9]+/g, "_")}_value`, index, usedIds);
    if (explicitId !== undefined && id !== explicitId) warnings.push({ code: "MIGRATION_DUPLICATE_CHANGE_ID_REPAIRED", path: `${basePath}[${index}].id`, message: `Duplicate change-point ID '${explicitId}' was replaced with '${id}'.` });
    const result: MutableRecord = {
      id,
      start: roundCycle(source.start, index === 0 ? 0 : index, warnings, `${basePath}[${index}].start`),
      value: typeof source.value === "string" || typeof source.value === "number" ? source.value : fallback,
    };
    if (typeof source.displayLabel === "string") result.displayLabel = source.displayLabel;
    if (typeof source.comment === "string") result.comment = source.comment;
    return result as unknown as SignalValueChange;
  });
  // Rounding two distinct fractional-cycle change points can collapse them onto the same integer
  // cycle (e.g. a sub-cycle pulse at 13.5 rounds onto an already-present change at 14). Keep the
  // chronologically later value deterministically rather than leaving a duplicate start that fails
  // strict-sort validation, and record what was discarded.
  const merged: SignalValueChange[] = [];
  for (const change of changes) {
    const last = merged.at(-1);
    if (last && last.start === change.start) {
      warnings.push({ code: "MIGRATION_SUB_CYCLE_CHANGE_MERGED", path: basePath, message: `A sub-cycle value change collapsed onto cycle ${change.start} after integer-cycle rounding; the earlier value at that cycle was discarded.` });
      merged[merged.length - 1] = change;
    } else {
      merged.push(change);
    }
  }
  return merged.length > 0 ? merged : [{ start: 0, value: fallback }];
}

function normalizeSignal(value: unknown, index: number, warnings: MigrationWarning[], usedIds: Set<string>, claimedChangeIds: Set<string>): Signal {
  const source = record(value);
  const id = (typeof source.id === "string" ? source.id : allocateMigrationId("signal", index, usedIds)) as SignalId;
  const type = ["binary", "bus", "state", "logic", "event", "pulse", "clock", "commentRow"].includes(text(source.type))
    ? text(source.type)
    : "binary";
  const name = text(source.name, id);
  const sourceInfo = record(source.source);
  const display = record(source.display);
  const labelLayout = record(source.labelLayout);
  const legacyLayout = record(source.layout);
  const common: MutableRecord = {
    id,
    name,
    type,
    role: ["input", "output", "internal"].includes(text(source.role)) ? source.role : "internal",
    source: {
      instancePath: list(sourceInfo.instancePath).filter((item): item is string => typeof item === "string"),
      signalName: text(sourceInfo.signalName, name),
      ...(typeof sourceInfo.msb === "number" ? { msb: sourceInfo.msb } : {}),
      ...(typeof sourceInfo.lsb === "number" ? { lsb: sourceInfo.lsb } : {}),
    },
    display: {
      name: text(display.name, name),
      ...(display.visible === false ? { visible: false } : {}),
      ...(jsonObject(display.style) ? { style: jsonObject(display.style) } : {}),
      ...(["left", "center", "right"].includes(text(display.align, text(labelLayout.align))) ? { align: text(display.align, text(labelLayout.align)) } : {}),
      ...(["expand", "ellipsis", "wrap"].includes(text(display.overflow, text(labelLayout.overflow))) ? { overflow: text(display.overflow, text(labelLayout.overflow)) } : {}),
    },
  };
  optionalNumber(common, "spacingBefore", source.spacingBefore ?? legacyLayout.spacingBefore);
  optionalNumber(common, "spacingAfter", source.spacingAfter ?? legacyLayout.spacingAfter);

  if (type === "commentRow") {
    common.role = "internal";
    common.title = text(source.title, name);
    common.body = text(source.body);
    return common as unknown as Signal;
  }

  if (type === "clock") {
    const generator = record(source.generator);
    const edgeCounter = record(source.edgeCounter);
    const rawPeriod = number(generator.period, 1);
    const normalizedPeriod = Math.max(1, Math.round(rawPeriod));
    common.generator = {
      start: roundCycle(generator.start, 0, warnings, `$.signals[${index}].generator.start`),
      period: normalizedPeriod,
      duty: number(generator.duty, 0.5),
      phase: roundHalfCycle(generator.phase, 0, warnings, `$.signals[${index}].generator.phase`),
      initial: generator.initial === 1 ? 1 : 0,
      polarity: generator.polarity === "negative" ? "negative" : "positive",
      ...(Array.isArray(generator.suppressedPeriods) ? { suppressedPeriods: [...generator.suppressedPeriods] } : {}),
    };
    if (rawPeriod !== normalizedPeriod) warnings.push({ code: "MIGRATION_FRACTIONAL_CLOCK_PERIOD_ROUNDED", path: `$.signals[${index}].generator.period`, message: `Fractional clock period ${rawPeriod} was rounded to ${normalizedPeriod}; V2 WaveDrom geometry requires a positive integer period.` });
    const edgeOffset = record(edgeCounter.offset);
    common.edgeCounter = {
      show: bool(edgeCounter.show, false),
      mode: ["rising", "falling", "both"].includes(text(edgeCounter.mode)) ? edgeCounter.mode : "rising",
      startNumber: number(edgeCounter.startNumber, 1),
      countFrom: ["signal-start", "selected-edge", "marker", "visible-range-start"].includes(text(edgeCounter.countFrom)) ? edgeCounter.countFrom : "signal-start",
      labelEvery: number(edgeCounter.labelEvery, 1),
      position: edgeCounter.position === "below" ? "below" : "above",
      offset: { x: number(edgeOffset.x, 0), y: number(edgeOffset.y, -6) },
      ...(typeof edgeCounter.anchorId === "string" ? { anchorId: edgeCounter.anchorId } : {}),
    };
    if (Array.isArray(source.enable)) common.enable = normalizeChanges(source.enable, 1, warnings, `$.signals[${index}].enable`, usedIds, claimedChangeIds);
    return common as unknown as ClockSignal;
  }

  common.values = normalizeChanges(source.values, type === "state" ? "IDLE" : type === "bus" ? "X" : 0, warnings, `$.signals[${index}].values`, usedIds, claimedChangeIds);
  optionalNumber(common, "width", source.width);
  if (["hex", "binary", "decimal", "signed", "unsigned", "symbolic"].includes(text(source.displayFormat))) common.displayFormat = source.displayFormat;
  // Newer fields already present in a v1-tagged file are carried verbatim; canonical validation
  // (INVALID_ENUM_DEFINITION / INVALID_RESET_SEMANTICS) judges them exactly as on the v2 path.
  if (typeof source.enumId === "string") common.enumId = source.enumId;
  if (jsonObject(source.resetSemantics)) common.resetSemantics = jsonObject(source.resetSemantics);
  return common as unknown as Signal;
}

const POINT_MAP: Readonly<Record<string, AnchorPoint>> = {
  "cycle-boundary": "cycle-start",
  "cycle-start": "cycle-start",
  "cycle-center": "cycle-center",
  "cycle-end": "cycle-end",
  rising: "rising-edge",
  "rising-edge": "rising-edge",
  falling: "falling-edge",
  "falling-edge": "falling-edge",
  "value-start": "value-start",
  "value-center": "value-center",
  // V2's AnchorPoint has no "value-end": the end of a value region is, by definition, the start
  // of the next transition, so "value-end" deterministically maps to "transition-end" rather than
  // being silently dropped or misclassified as a mid-value point.
  "value-end": "transition-end",
  "transition-start": "transition-start",
  "transition-center": "transition-center",
  "transition-end": "transition-end",
};

function normalizeAnchor(value: unknown, fallbackSignal: SignalId | undefined, externalOffset: unknown, warnings: MigrationWarning[], path: string): MutableRecord {
  const source = record(value);
  const sourceOffset = record(source.offset ?? externalOffset);
  const signalId = text(source.signalId, text(source.signal, fallbackSignal));
  return {
    ...(signalId ? { signalId } : {}),
    cycle: roundCycle(source.cycle, 0, warnings, `${path}.cycle`),
    point: POINT_MAP[text(source.point, text(source.anchor, text(source.edge, "cycle-start")))] ?? "cycle-start",
    offset: { x: number(sourceOffset.x, 0), y: number(sourceOffset.y, 0) },
    ...(typeof source.threshold === "number" ? { threshold: source.threshold } : {}),
    ...(jsonObject(source.transition) ? { transition: jsonObject(source.transition) } : {}),
  };
}

function normalizeAnnotation(value: unknown, index: number, fallbackSignal: SignalId | undefined, warnings: MigrationWarning[], usedIds: Set<string>): Annotation {
  const source = record(value);
  const typeMap: Readonly<Record<string, string>> = { dependencyArrow: "dependency", vline: "verticalLine", "vertical-line": "verticalLine" };
  const sourceType = text(source.type, "text");
  const type = typeMap[sourceType] ?? sourceType;
  const result: MutableRecord = {
    id: migrationId(source, "annotation", index, usedIds),
    type,
    label: text(source.label, text(source.text)),
    visible: source.visible !== false,
  };
  if (typeof source.color === "string") result.color = source.color;
  if (typeof source.comment === "string") result.comment = source.comment;
  const offsets: Readonly<Record<string, unknown>> = { anchor: source.offset, start: source.startOffset ?? source.offset, end: source.endOffset ?? source.offset, from: source.startOffset, to: source.endOffset };
  for (const key of ["anchor", "start", "end", "from", "to"] as const) {
    if (source[key] !== undefined) result[key] = normalizeAnchor(source[key], fallbackSignal, offsets[key], warnings, `$.annotations[${index}].${key}`);
  }
  if (source.labelOffset !== undefined) {
    const offset = record(source.labelOffset);
    result.labelOffset = { x: number(offset.x, 0), y: number(offset.y, 0) };
  }
  if (["start", "center", "end", "above", "below"].includes(text(source.labelPlacement))) result.labelPlacement = text(source.labelPlacement);
  if (source.positionMode === "cycle-snap" || source.positionMode === "free") result.positionMode = source.positionMode;
  const span = record(source.verticalSpan);
  if (["auto", "rows", "custom"].includes(text(span.mode))) {
    result.verticalSpan = {
      mode: text(span.mode) || "auto",
      ...(typeof span.startRowId === "string" ? { startRowId: span.startRowId } : {}),
      ...(typeof span.endRowId === "string" ? { endRowId: span.endRowId } : {}),
      ...(typeof span.startOffset === "number" ? { startOffset: span.startOffset } : {}),
      ...(typeof span.endOffset === "number" ? { endOffset: span.endOffset } : {}),
    };
  }
  const style = { ...record(source.style) };
  // Timing Region / Ghost Trace own a canonical top-level opacity; only legacy kinds fold it into style.
  const overlayOpacity = type === "timingRegion" || type === "ghostTrace";
  if (typeof source.opacity === "number") {
    if (overlayOpacity) result.opacity = source.opacity;
    else style.opacity = source.opacity;
  }
  if (typeof source.sourceSignalId === "string") result.sourceSignalId = source.sourceSignalId;
  if (typeof source.traceOffsetCycles === "number") result.traceOffsetCycles = source.traceOffsetCycles;
  if (typeof source.rotation === "number") result.rotation = source.rotation;
  if (["left", "center", "right"].includes(text(source.align))) result.align = source.align;
  if (typeof source.locked === "boolean") result.locked = source.locked;
  if (jsonObject(source.measurement)) result.measurement = jsonObject(source.measurement);
  if (jsonObject(source.measurementLayout)) result.measurementLayout = jsonObject(source.measurementLayout);
  if (typeof source.side === "string") style.side = source.side;
  if (Object.keys(style).length > 0) result.style = structuredJson(style);
  if (["straight", "orthogonal", "curve", "diagonal"].includes(text(source.lineType, text(source.line)))) result.lineType = text(source.lineType, text(source.line));
  const arrowhead = text(source.arrowhead, text(source.arrow));
  if (arrowhead === "both") result.arrowhead = "bidirectional";
  else if (["end", "start", "bidirectional", "none"].includes(arrowhead)) result.arrowhead = arrowhead;
  return result as unknown as Annotation;
}

function normalizeTransaction(value: unknown, index: number, warnings: MigrationWarning[], usedIds: Set<string>): Transaction {
  const source = record(value);
  const phases = list(source.phases).map((phase, phaseIndex) => {
    const item = record(phase);
    return { name: text(item.name), start: roundCycle(item.start, 0, warnings, `$.transactions[${index}].phases[${phaseIndex}].start`), end: roundCycle(item.end, 0, warnings, `$.transactions[${index}].phases[${phaseIndex}].end`) };
  });
  const result: MutableRecord = {
    id: migrationId(source, "transaction", index, usedIds),
    name: text(source.name, `Transaction ${index + 1}`),
    start: roundCycle(source.start, 0, warnings, `$.transactions[${index}].start`),
    end: roundCycle(source.end, 0, warnings, `$.transactions[${index}].end`),
  };
  if (typeof (source.source ?? source.from) === "string") result.source = source.source ?? source.from;
  if (typeof (source.destination ?? source.to) === "string") result.destination = source.destination ?? source.to;
  if (phases.length > 0) result.phases = phases;
  if (typeof source.laneId === "string") result.laneId = source.laneId;
  if (typeof source.groupId === "string") result.groupId = source.groupId;
  if (typeof source.color === "string") result.color = source.color;
  if (typeof source.description === "string") result.description = source.description;
  if (typeof source.visible === "boolean") result.visible = source.visible;
  const linkedSignals = list(source.linkedSignals).filter((id): id is string => typeof id === "string");
  if (linkedSignals.length > 0) result.linkedSignals = linkedSignals;
  if (typeof source.category === "string") result.category = source.category;
  if (jsonObject(source.style)) result.style = jsonObject(source.style);
  if (jsonObject(source.metadata)) result.metadata = jsonObject(source.metadata);
  if (jsonObject(source.links)) result.links = jsonObject(source.links);
  return result as unknown as Transaction;
}

export function migrateV1(input: unknown): { document: CanonicalDocument; warnings: MigrationWarning[] } {
  const source = record(input);
  const usedIds = new Set<string>();
  const claimedChangeIds = new Set<string>();
  collectExplicitIds(source, usedIds);
  const warnings: MigrationWarning[] = [{ code: "MIGRATED_V1_TO_V2", path: "$.formatVersion", message: "Format version 1 was deterministically migrated to version 2." }];
  const sourceDocument = record(source.document);
  const cycleView = record(source.cycleView);
  const transactionView = record(source.transactionView);
  const sourceTimeline = record(source.timeline);
  const timebase = { ...record(sourceDocument.timebase), ...sourceTimeline };
  const cycleCount = Math.max(1, Math.trunc(number(timebase.cycleCount, number(sourceDocument.cycleCount, 10))));
  const legacySignals = list(source.signals ?? cycleView.signals);
  const signals = legacySignals.map((value, index) => normalizeSignal(value, index, warnings, usedIds, claimedChangeIds));
  const signalIds = new Set(signals.map((signal) => signal.id));
  const fallbackSignal = signals.find((signal) => signal.type === "clock")?.id ?? signals[0]?.id;
  const referenceClockSignal = signals.find((signal) => signal.type === "clock")?.id;
  const legacyReferenceClock = text(timebase.referenceClock);
  const legacyReferenceClockValid = legacyReferenceClock !== "" && signals.some((signal) => signal.id === legacyReferenceClock && signal.type === "clock");
  if (legacyReferenceClock !== "" && !legacyReferenceClockValid && referenceClockSignal) {
    warnings.push({ code: "INVALID_LEGACY_REFERENCE_CLOCK", path: "$.timebase.referenceClock", message: `Legacy referenceClock '${legacyReferenceClock}' does not identify a clock signal in this document; migrated to '${referenceClockSignal}' instead.` });
  }

  const groups = list(source.signalGroups).map((value, index) => {
    const group = record(value);
    const rows = list(group.rows ?? group.signals).filter((id): id is SignalId => typeof id === "string");
    const result: MutableRecord = {
      id: migrationId(group, "group", index, usedIds),
      name: text(group.name, `Group ${index + 1}`),
      rows,
    };
    optionalNumber(result, "spacingBefore", group.spacingBefore);
    optionalNumber(result, "spacingAfter", group.spacingAfter);
    if (jsonObject(group.style)) result.style = jsonObject(group.style);
    if (Array.isArray(group.spacers)) result.spacers = structuredJson(group.spacers);
    return result as unknown as SignalGroup;
  });
  if (groups.length === 0) {
    const defaultGroupId = usedIds.has("group_default") ? allocateMigrationId("group", 0, usedIds) : "group_default";
    usedIds.add(defaultGroupId);
    groups.push({ id: defaultGroupId as SignalGroup["id"], name: "Signals", rows: signals.map((signal) => signal.id) });
  }

  const legacyLayout = record(source.layout);
  for (const [spacerIndex, value] of list(legacyLayout.spacers).entries()) {
    const spacer = record(value);
    const afterSignal = text(spacer.afterSignal);
    const groupIndex = groups.findIndex((group) => group.rows.includes(afterSignal as SignalId));
    if (groupIndex < 0) {
      warnings.push({ code: "MIGRATION_UNRESOLVED_SPACER", path: `$.layout.spacers[${spacerIndex}]`, message: `Spacer target '${afterSignal}' does not resolve to a grouped signal.` });
      continue;
    }
    const group = groups[groupIndex];
    if (!group) continue;
    const spacerId = migrationId(spacer, "spacer", spacerIndex, usedIds);
    const rows = [...group.rows];
    rows.splice(rows.indexOf(afterSignal as SignalId) + 1, 0, spacerId as SignalGroup["rows"][number]);
    const spacers = [...(group.spacers ?? []), { id: spacerId, height: number(spacer.height, 28) }];
    groups[groupIndex] = { ...group, rows, spacers } as SignalGroup;
  }

  for (const id of signalIds) {
    if (!groups.some((group) => group.rows.includes(id))) warnings.push({ code: "MIGRATION_ORPHAN_ROW", path: "$.signalGroups", message: `Signal '${id}' remains orphaned and will be rejected by validation.` });
  }

  const annotations = list(source.annotations ?? cycleView.annotations).map((value, index) => normalizeAnnotation(value, index, fallbackSignal, warnings, usedIds));
  const transactions = list(source.transactions ?? transactionView.transactions).map((value, index) => normalizeTransaction(value, index, warnings, usedIds));
  const transactionTimeScale = record(source.transactionTimeScale);
  const transactionGroups = list(source.transactionGroups).map((value, index) => { const item = record(value); return { id: migrationId(item, "transactionGroup", index, usedIds), name: text(item.name, `Transaction Group ${index + 1}`), ...(typeof item.color === "string" ? { color: item.color } : {}), order: Number.isInteger(item.order) && Number(item.order) >= 0 ? Number(item.order) : index }; });
  if (Array.isArray(transactionView.lanes) && transactionView.lanes.length > 0) {
    warnings.push({ code: "MIGRATION_TRANSACTION_LANES", path: "$.transactionView.lanes", message: "Lane IDs remain on transaction source/destination; legacy lane display names are not canonical fields." });
  }

  const labelAnchors = list(sourceTimeline.labelAnchors).map((value, index) => {
    const anchor = record(value);
    return {
      id: migrationId(anchor, "label_anchor", index, usedIds),
      source: roundCycle(anchor.source, 0, warnings, `$.timeline.labelAnchors[${index}].source`),
      display: roundCycle(anchor.display, 0, warnings, `$.timeline.labelAnchors[${index}].display`),
      ...(typeof anchor.ownerTimeGroupId === "string" ? { ownerTimeGroupId: anchor.ownerTimeGroupId } : {}),
    };
  });
  const bookmarks = list(source.bookmarks).map((value, index) => {
    const bookmark = record(value);
    return { id: migrationId(bookmark, "bookmark", index, usedIds), name: text(bookmark.name, `Bookmark ${index + 1}`), start: roundCycle(bookmark.start, 0, warnings, `$.bookmarks[${index}].start`), ...(typeof bookmark.comment === "string" ? { comment: bookmark.comment } : {}) };
  });
  const timeGroups: MutableRecord[] = list(source.timeGroups).map((value, index) => {
    const group = record(value);
    return { ...(group.parentId !== undefined ? { parentId: group.parentId } : {}), id: migrationId(group, "time_group", index, usedIds), name: text(group.name, `Time Group ${index + 1}`), start: roundCycle(group.start, 0, warnings, `$.timeGroups[${index}].start`), end: roundCycle(group.end, cycleCount, warnings, `$.timeGroups[${index}].end`), ...(typeof group.category === "string" ? { category: group.category } : {}), ...(typeof group.comment === "string" ? { comment: group.comment } : {}), ...(jsonObject(group.presentation) ? { presentation: jsonObject(group.presentation) } : {}) };
  });
  for (const [gapIndex, value] of list(sourceTimeline.gaps).entries()) {
    const gap = record(value);
    timeGroups.push({ id: typeof gap.id === "string" ? gap.id : allocateMigrationId("time_gap", gapIndex, usedIds), name: text(gap.label, `Gap ${gapIndex + 1}`), start: roundCycle(gap.start, 0, warnings, `$.timeline.gaps[${gapIndex}].start`), end: roundCycle(gap.end, cycleCount, warnings, `$.timeline.gaps[${gapIndex}].end`), presentation: { collapsed: true, foldStyle: "axis-break", ...(typeof gap.label === "string" ? { foldLabel: gap.label } : {}) } });
  }
  for (const anchor of labelAnchors) {
    if (anchor.ownerTimeGroupId === undefined) continue;
    const owner = timeGroups.find((group) => group.id === anchor.ownerTimeGroupId);
    if (!owner || owner.end !== anchor.source) {
      delete anchor.ownerTimeGroupId;
      warnings.push({ code: "MIGRATION_LABEL_ANCHOR_OWNER", path: "$.timeline.labelAnchors", message: `Label anchor '${anchor.id}' had a missing or non-boundary owner; the invalid owner link was removed.` });
      continue;
    }
    owner.presentation = { ...record(owner.presentation), resumeLabelAnchorId: anchor.id };
  }

  const headerSource = record(sourceDocument.header);
  const footerSource = record(sourceDocument.footer);
  const legendSource = record(source.legend);
  const legendPosition = record(legendSource.position ?? legendSource.offset);
  const layout: Layout = {
    roleColumnWidth: number(legacyLayout.roleColumnWidth, 32),
    signalNameWidth: number(legacyLayout.signalNameWidth, 168),
    signalNameAlign: ["left", "center", "right"].includes(text(legacyLayout.signalNameAlign)) ? legacyLayout.signalNameAlign as Layout["signalNameAlign"] : "left",
    rowHeight: number(legacyLayout.rowHeight, 28),
    signalSpacing: number(legacyLayout.signalSpacing, 6),
    overflow: ["expand", "ellipsis", "wrap"].includes(text(legacyLayout.overflow, text(legacyLayout.signalNameOverflow))) ? text(legacyLayout.overflow, text(legacyLayout.signalNameOverflow)) as Layout["overflow"] : "ellipsis",
  };
  const constraints: Constraint[] = list(source.constraints ?? sourceDocument.constraints).map((value, index) => {
    const constraint = record(value);
    const data = jsonObject(constraint.data);
    return { id: migrationId(constraint, "constraint", index, usedIds) as Constraint["id"], type: text(constraint.type, "generic"), ...(data ? { data } : {}) };
  });

  for (const key of ["verificationCoverage", "testOperations", "viewTests", "exportTest"]) {
    if (source[key] !== undefined) warnings.push({ code: "MIGRATION_REFERENCE_METADATA", path: `$.${key}`, message: "Reference-test metadata is outside the canonical document and was not persisted." });
  }

  return {
    warnings,
    document: {
      formatVersion: 2,
      document: {
        id: text(sourceDocument.id, "document"),
        title: text(sourceDocument.title, "Untitled Timing Chart"),
        header: {
          subtitle: text(headerSource.subtitle, text(sourceDocument.subtitle)),
          description: text(headerSource.description, text(sourceDocument.description)),
          notes: text(headerSource.notes, text(headerSource.text)),
          preconditions: list(headerSource.preconditions).filter((item): item is string => typeof item === "string"),
          constraints: list(headerSource.constraints).filter((item): item is string => typeof item === "string"),
          exceptions: list(headerSource.exceptions).filter((item): item is string => typeof item === "string"),
        },
        footer: { figureNumber: text(footerSource.figureNumber), revision: text(footerSource.revision), text: text(footerSource.text, text(footerSource.notes)) },
      },
      timeline: {
        start: 0,
        end: cycleCount,
        timeBase: "cycle",
        cycleCount,
        ...(referenceClockSignal ? { referenceClock: (legacyReferenceClockValid ? legacyReferenceClock : referenceClockSignal) as SignalId } : {}),
        edge: timebase.edge === "falling" ? "falling" : "rising",
        labelAnchors: labelAnchors as unknown as CanonicalDocument["timeline"]["labelAnchors"],
      },
      signalGroups: groups,
      signals,
      bookmarks: bookmarks as unknown as CanonicalDocument["bookmarks"],
      timeGroups: timeGroups as unknown as readonly TimeGroup[],
      annotations,
      annotationGroups: list(source.annotationGroups).map(structuredJson) as unknown as CanonicalDocument["annotationGroups"],
      legend: {
        show: bool(legendSource.show, true),
        orientation: legendSource.orientation === "vertical" ? "vertical" : "horizontal",
        usedRolesOnly: bool(legendSource.usedRolesOnly, legendSource.items === undefined || legendSource.items === "usedRolesOnly"),
        position: { x: number(legendPosition.x, 0), y: number(legendPosition.y, 0) },
        ...(() => { const style = jsonObject(legendSource.style); return style ? { style } : {}; })(),
        ...(Array.isArray(legendSource.items) ? { items: structuredJson(legendSource.items) as NonNullable<CanonicalDocument["legend"]["items"]> } : {}),
      },
      layout,
      transactions,
      ...(Array.isArray(source.enumDefinitions) ? { enumDefinitions: structuredJson(source.enumDefinitions) as NonNullable<CanonicalDocument["enumDefinitions"]> } : {}),
      ...(transactionGroups.length > 0 ? { transactionGroups: transactionGroups as unknown as NonNullable<CanonicalDocument["transactionGroups"]> } : {}),
      ...(Number.isFinite(transactionTimeScale.clockCyclesPerTransactionCycle) && Number(transactionTimeScale.clockCyclesPerTransactionCycle) > 0 ? { transactionTimeScale: { clockCyclesPerTransactionCycle: Number(transactionTimeScale.clockCyclesPerTransactionCycle), majorInterval: Number.isInteger(transactionTimeScale.majorInterval) && Number(transactionTimeScale.majorInterval) > 0 ? Number(transactionTimeScale.majorInterval) : 1, minorInterval: Number.isInteger(transactionTimeScale.minorInterval) && Number(transactionTimeScale.minorInterval) > 0 ? Number(transactionTimeScale.minorInterval) : 1, ...(typeof transactionTimeScale.showSecondaryClock === "boolean" ? { showSecondaryClock: transactionTimeScale.showSecondaryClock } : {}) } } : {}),
      constraints,
      checkSettings: jsonObject(source.checkSettings) as CanonicalDocument["checkSettings"] ?? {},
    },
  };
}

export interface MigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  /** A lossy step must surface its policy through warnings or explicit rejection. */
  readonly lossy: boolean;
  readonly warningPolicy: "warn" | "reject";
  readonly migrate: (input: unknown) => { value: unknown; warnings: MigrationWarning[] };
}

export interface MigrationChainResult {
  readonly value: unknown;
  readonly warnings: readonly MigrationWarning[];
  readonly appliedSteps: readonly string[];
}

/** The authoritative version transition table for persisted documents. */
export const MIGRATION_REGISTRY: readonly MigrationStep[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    lossy: true,
    warningPolicy: "warn",
    migrate: (input) => {
      const result = migrateV1(input);
      return { value: result.document, warnings: result.warnings };
    },
  },
];

export function migrateThroughRegistry(
  input: unknown,
  targetVersion: number,
  registry: readonly MigrationStep[] = MIGRATION_REGISTRY,
): MigrationChainResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  let current: unknown = input;
  let version = (input as { formatVersion?: unknown }).formatVersion;
  if (!Number.isInteger(version)) return undefined;
  if (version === targetVersion) return { value: current, warnings: [], appliedSteps: [] };

  const warnings: MigrationWarning[] = [];
  const appliedSteps: string[] = [];
  const seenVersions = new Set<number>();
  while (version !== targetVersion) {
    if (seenVersions.has(version as number)) return undefined;
    seenVersions.add(version as number);
    const step = registry.find((candidate) => candidate.fromVersion === version);
    if (!step || step.toVersion === step.fromVersion) return undefined;
    const result = step.migrate(current);
    if (step.lossy && step.warningPolicy === "reject") return undefined;
    if (step.lossy && step.warningPolicy === "warn" && result.warnings.length === 0) return undefined;
    current = result.value;
    warnings.push(...result.warnings);
    appliedSteps.push(`${step.fromVersion}->${step.toVersion}`);
    version = step.toVersion;
  }
  return { value: current, warnings, appliedSteps };
}
