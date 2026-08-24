import type { ValidationProblem } from "@timing-chart-v2/core";
import type {
  Annotation,
  CanonicalDocument,
  Signal,
  SignalGroup,
  SignalId,
  SignalValueChange,
  TimeGroup,
  Transaction,
} from "@timing-chart-v2/schema";
import { isStableId } from "@timing-chart-v2/schema";
import type { ChangeSet, SemanticCommand } from "./types.js";

export type CommandPlanResult =
  | Readonly<{ ok: true; document: CanonicalDocument; changeSet: ChangeSet; inverseChangeSet: ChangeSet }>
  | Readonly<{ ok: false; reason: "invalid" | "no-op"; problems: readonly ValidationProblem[] }>;

const fail = (reason: "invalid" | "no-op", code: string, path: string, message: string): CommandPlanResult => ({ ok: false, reason, problems: [{ code, path, message }] });
const timingSignalIds = (document: CanonicalDocument) => document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
const annotationIds = (document: CanonicalDocument) => document.annotations.map((annotation) => annotation.id);

function replaceSignal(document: CanonicalDocument, index: number, signal: Signal): CanonicalDocument {
  const signals = [...document.signals];
  signals[index] = signal;
  return { ...document, signals };
}

function dependentAnnotations(document: CanonicalDocument, signalId: SignalId): Annotation[] {
  return document.annotations.filter((annotation) => [annotation.anchor, annotation.start, annotation.end, annotation.from, annotation.to].some((anchor) => anchor?.signalId === signalId));
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
  const changeSet: ChangeSet = { rowOrder: [command.signalId], geometryScreenY: [command.signalId], minimapOverview: true };
  return { ok: true, document: { ...document, signalGroups: groups }, changeSet, inverseChangeSet: changeSet };
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

function insertTimeline(document: CanonicalDocument, at: number, count: number): CanonicalDocument {
  const signals = document.signals.map((signal): Signal => {
    if (signal.type === "commentRow") return signal;
    if (signal.type === "clock") return {
      ...signal,
      generator: { ...signal.generator, start: mapInsertPoint(signal.generator.start, at, count) },
      ...(signal.enable ? { enable: insertChanges(signal.enable, at, count) } : {}),
    };
    return { ...signal, values: insertChanges(signal.values, at, count) };
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

function deleteTimeline(document: CanonicalDocument, start: number, end: number): CanonicalDocument {
  const nextCycleCount = document.timeline.cycleCount - (end - start);
  const signals = document.signals.map((signal): Signal => {
    if (signal.type === "commentRow") return signal;
    if (signal.type === "clock") return {
      ...signal,
      generator: { ...signal.generator, start: mapDeletePoint(signal.generator.start, start, end, nextCycleCount) },
      ...(signal.enable ? { enable: deleteChanges(signal.enable, start, end, nextCycleCount) } : {}),
    };
    return { ...signal, values: deleteChanges(signal.values, start, end, nextCycleCount) };
  });
  const annotations = document.annotations.map((annotation): Annotation => {
    const mapped: Record<string, unknown> = { ...annotation };
    for (const key of ["anchor", "start", "end", "from", "to"] as const) if (annotation[key]) mapped[key] = { ...annotation[key], cycle: mapDeletePoint(annotation[key].cycle, start, end, nextCycleCount) };
    return mapped as unknown as Annotation;
  });
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
    bookmarks: document.bookmarks.map((bookmark) => ({ ...bookmark, start: mapDeletePoint(bookmark.start, start, end, nextCycleCount) })),
    timeGroups,
    transactions,
  };
}

function timelineChangeSet(...documents: readonly CanonicalDocument[]): ChangeSet {
  const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
  const signalIds = unique(documents.flatMap(timingSignalIds));
  return {
    waveSemantics: signalIds,
    geometryLocal: signalIds,
    timelineSemantics: true,
    geometryScreenX: true,
    annotationPosition: unique(documents.flatMap(annotationIds)),
    bookmarkPosition: unique(documents.flatMap((document) => document.bookmarks.map((item) => item.id))),
    timeGroupSemantics: unique(documents.flatMap((document) => document.timeGroups.map((item) => item.id))),
    transactionSemantics: unique(documents.flatMap((document) => document.transactions.map((item) => item.id))),
    minimapOverview: true,
  };
}

export function planCommand(document: CanonicalDocument, command: SemanticCommand): CommandPlanResult {
  if (!isStableId(command.id)) return fail("invalid", "INVALID_COMMAND_ID", "$.id", "Command ID must be a stable ID.");
  switch (command.type) {
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
    case "signal.delete": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      if (index < 0) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", `Signal '${command.signalId}' does not exist.`);
      if (document.timeline.referenceClock === command.signalId) return fail("invalid", "SIGNAL_HAS_DEPENDENTS", "$.signalId", "Reference clock cannot be deleted.");
      if (dependentAnnotations(document, command.signalId).length > 0) return fail("invalid", "SIGNAL_HAS_DEPENDENTS", "$.signalId", "Signal has annotation dependents.");
      const signal = document.signals[index];
      if (!signal) return fail("invalid", "SIGNAL_NOT_FOUND", "$.signalId", "Signal does not exist.");
      const groups = document.signalGroups.map((group) => ({ ...group, rows: group.rows.filter((row) => row !== command.signalId) }));
      const changeSet: ChangeSet = { removedSignals: [command.signalId], rowOrder: [command.signalId], minimapOverview: true };
      const inverseChangeSet: ChangeSet = { addedSignals: [command.signalId], rowOrder: [command.signalId], waveSemantics: signal.type === "commentRow" ? [] : [command.signalId], geometryLocal: signal.type === "commentRow" ? [] : [command.signalId], minimapOverview: true };
      return { ok: true, document: { ...document, signals: document.signals.filter((item) => item.id !== command.signalId), signalGroups: groups }, changeSet, inverseChangeSet };
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
      const changeSet: ChangeSet = { rowPresentation: [signal.id], minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, display: { ...signal.display, visible: command.visible } }), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.updateValue": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type === "clock" || signal.type === "commentRow") return fail("invalid", "SIGNAL_NOT_EDITABLE", "$.signalId", "Value changes require a non-clock timing signal.");
      if (!Number.isFinite(command.start) || command.start < 0 || command.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.start", "Change point is outside the timeline.");
      const existing = signal.values.find((change) => change.start === command.start);
      if (existing?.value === command.value && existing.comment === command.comment) return fail("no-op", "NO_OP", "$", "Signal value is unchanged.");
      const change = { start: command.start, value: command.value, ...(command.comment === undefined ? {} : { comment: command.comment }) };
      const values = [...signal.values.filter((item) => item.start !== command.start), change].sort((left, right) => left.start - right.start);
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
      if (!name) return fail("invalid", "INVALID_NAME", "$.name", "Signal name cannot be empty.");
      if (command.displayFormat !== undefined && signal.type !== "bus") return fail("invalid", "DISPLAY_FORMAT_NOT_SUPPORTED", "$.displayFormat", "Display format applies only to bus signals.");
      const currentFormat = signal.type === "bus" ? signal.displayFormat : undefined;
      if (signal.name === name && signal.role === command.role && currentFormat === command.displayFormat) return fail("no-op", "NO_OP", "$", "Signal properties are unchanged.");
      const next = signal.type === "bus"
        ? (() => {
            const { displayFormat: _displayFormat, ...base } = signal;
            return { ...base, name, role: command.role, display: { ...signal.display, name }, ...(command.displayFormat === undefined ? {} : { displayFormat: command.displayFormat }) } as Signal;
          })()
        : { ...signal, name, role: command.role, display: { ...signal.display, name } } as Signal;
      const formatChanged = signal.type === "bus" && currentFormat !== command.displayFormat;
      const changeSet: ChangeSet = {
        rowPresentation: [signal.id],
        ...(formatChanged ? { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true } : {}),
      };
      return { ok: true, document: replaceSignal(document, index, next), changeSet, inverseChangeSet: changeSet };
    }
    case "signal.updateClockGenerator": {
      const index = document.signals.findIndex((signal) => signal.id === command.signalId);
      const signal = document.signals[index];
      if (!signal || signal.type !== "clock") return fail("invalid", "SIGNAL_NOT_CLOCK", "$.signalId", "Clock Generator requires a clock signal.");
      const generator = command.generator;
      if (!Number.isInteger(generator.start) || generator.start < 0 || generator.start >= document.timeline.cycleCount) return fail("invalid", "TIMELINE_OUT_OF_RANGE", "$.generator.start", "Clock start is outside the timeline.");
      if (!Number.isFinite(generator.period) || generator.period <= 0 || !Number.isFinite(generator.duty) || generator.duty <= 0 || generator.duty > 1 || !Number.isFinite(generator.phase)) return fail("invalid", "INVALID_CLOCK_GENERATOR", "$.generator", "Clock period, duty, and phase are invalid.");
      if (JSON.stringify(signal.generator) === JSON.stringify(generator)) return fail("no-op", "NO_OP", "$", "Clock Generator is unchanged.");
      const affectedAnnotations = dependentAnnotations(document, signal.id).map((annotation) => annotation.id);
      const changeSet: ChangeSet = { waveSemantics: [signal.id], geometryLocal: [signal.id], geometryScreenX: true, annotationPosition: affectedAnnotations, minimapOverview: true };
      return { ok: true, document: replaceSignal(document, index, { ...signal, generator }), changeSet, inverseChangeSet: changeSet };
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
      const timingRows = group.rows.filter((row): row is SignalId => document.signals.some((signal) => signal.id === row && signal.type !== "commentRow"));
      const changeSet: ChangeSet = { rowOrder: group.rows, geometryScreenY: timingRows, minimapOverview: true };
      return { ok: true, document: { ...document, signalGroups: remaining }, changeSet, inverseChangeSet: changeSet };
    }
    case "annotation.updateAnchor": {
      const index = document.annotations.findIndex((annotation) => annotation.id === command.annotationId);
      const annotation = document.annotations[index];
      if (!annotation) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationId", `Annotation '${command.annotationId}' does not exist.`);
      if (JSON.stringify(annotation.anchor) === JSON.stringify(command.anchor)) return fail("no-op", "NO_OP", "$", "Annotation anchor is unchanged.");
      const annotations = [...document.annotations]; annotations[index] = { ...annotation, anchor: command.anchor };
      const changeSet: ChangeSet = { annotationPosition: [annotation.id] };
      return { ok: true, document: { ...document, annotations }, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.insert": {
      if (!Number.isInteger(command.at) || command.at < 0 || command.at > document.timeline.cycleCount || !Number.isInteger(command.count) || command.count < 1) return fail("invalid", "INVALID_TIMELINE_INSERT", "$", "Insert requires an integer boundary and positive integer count.");
      if (document.constraints.length > 0) return fail("invalid", "UNTYPED_CONSTRAINT_RIPPLE", "$.constraints", "Timeline ripple is blocked while untyped constraints exist.");
      const next = insertTimeline(document, command.at, command.count);
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
    case "timeline.delete": {
      if (!Number.isInteger(command.start) || !Number.isInteger(command.end) || command.start < 0 || command.start >= command.end || command.end > document.timeline.cycleCount || document.timeline.cycleCount - (command.end - command.start) < 1) return fail("invalid", "INVALID_TIMELINE_DELETE", "$", "Delete requires a non-empty integer half-open range and must retain at least one cycle.");
      if (document.constraints.length > 0) return fail("invalid", "UNTYPED_CONSTRAINT_RIPPLE", "$.constraints", "Timeline ripple is blocked while untyped constraints exist.");
      const next = deleteTimeline(document, command.start, command.end);
      const changeSet = timelineChangeSet(document, next);
      return { ok: true, document: next, changeSet, inverseChangeSet: changeSet };
    }
  }
}
