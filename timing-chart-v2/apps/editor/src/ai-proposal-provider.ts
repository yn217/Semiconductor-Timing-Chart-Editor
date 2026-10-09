import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { measurementProfilePair, valueSignalValueProblem, type AnnotationId, type AnnotationType, type CanonicalDocument, type GroupId, type JsonObject, type MeasurementProfile, type SemanticAnchor, type SignalId, type SignalRole, type TimeGroup, type TimeGroupId, type TransactionGroupId, type TransactionId, type TransactionPhase, type TransitionAnchorKind, type ValueSignal } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { canonicalEntityIds, isStableId } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";
import { createAnnotation } from "./create-annotation.js";

/** Provider output is either an executable semantic command proposal or an
 * explicit view-only intent handled by the current surface. */
export type AIProposalKind = "semantic-command" | "view-only" | "sva-spec";
export type AIViewIntent = "fit-all" | "fit-selection" | "open-timeline";

export type AIProposal = Readonly<{
  kind: AIProposalKind;
  baseRevision: number;
  commands: readonly SemanticCommand[];
  summary: string;
  viewIntent?: AIViewIntent;
}>;

export type AIProposalRequest = Readonly<{
  document: CanonicalDocument;
  revision: number;
  query: string;
  selectedSignalId: SignalId | undefined;
  selectedGroupId?: GroupId | undefined;
  selectedAnnotationId?: string | undefined;
  selectedTransactionId?: string | undefined;
  range?: Readonly<{ start: number; end: number }> | undefined;
}>;

export type AIProposalResult = Readonly<
  | { ok: true; proposal: AIProposal }
  | { ok: false; message: string }
>;

export const AI_TYPED_PROPOSAL_TOOLS = [
  "propose_create_signal", "propose_rename_signal", "propose_update_signal", "propose_move_signal",
  "propose_insert_cycles", "propose_delete_cycles", "propose_move_range", "propose_duplicate_range",
  "propose_create_signal_group", "propose_rename_signal_group", "propose_move_signal_group", "propose_delete_signal_group",
  "propose_create_transaction_group", "propose_rename_transaction_group", "propose_delete_transaction_group",
  "propose_create_time_group", "propose_update_time_group", "propose_delete_time_group",
  "propose_create_transaction", "propose_update_transaction", "propose_move_transaction", "propose_resize_transaction", "propose_delete_transaction",
  "propose_create_bookmark", "propose_move_bookmark", "propose_update_bookmark", "propose_delete_bookmark",
  "propose_create_annotation", "propose_update_annotation", "propose_delete_annotation",
  "propose_add_phase", "propose_update_phase", "propose_delete_phase", "propose_link_signal", "propose_unlink_signal",
] as const;
export type AITypedProposalTool = typeof AI_TYPED_PROPOSAL_TOOLS[number];

function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
  }
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && isJsonValue(value);
}

export function buildTypedProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  if (tool === "propose_insert_cycles" || tool === "propose_delete_cycles" || tool === "propose_move_range" || tool === "propose_duplicate_range") return buildTypedTimelineProposal(document, revision, tool, args);
  if (tool === "propose_create_signal_group" || tool === "propose_rename_signal_group" || tool === "propose_move_signal_group" || tool === "propose_delete_signal_group") return buildTypedSignalGroupProposal(document, revision, tool, args);
  if (tool === "propose_create_transaction_group" || tool === "propose_rename_transaction_group" || tool === "propose_delete_transaction_group") return buildTypedTransactionGroupProposal(document, revision, tool, args);
  if (tool === "propose_create_time_group" || tool === "propose_update_time_group" || tool === "propose_delete_time_group") return buildTypedTimeGroupProposal(document, revision, tool, args);
  if (tool === "propose_create_transaction" || tool === "propose_update_transaction" || tool === "propose_move_transaction" || tool === "propose_resize_transaction" || tool === "propose_delete_transaction" || tool === "propose_add_phase" || tool === "propose_update_phase" || tool === "propose_delete_phase" || tool === "propose_link_signal" || tool === "propose_unlink_signal") return buildTypedTransactionProposal(document, revision, tool, args);
  if (tool === "propose_create_bookmark" || tool === "propose_move_bookmark" || tool === "propose_update_bookmark" || tool === "propose_delete_bookmark") return buildTypedBookmarkProposal(document, revision, tool, args);
  if (tool === "propose_create_annotation" || tool === "propose_update_annotation" || tool === "propose_delete_annotation") return buildTypedAnnotationProposal(document, revision, tool, args);
  if ((AI_TYPED_PROPOSAL_TOOLS as readonly string[]).includes(tool)) return buildTypedSignalProposal(document, revision, tool, args);
  return { ok: false, message: `Unsupported typed proposal operation '${tool}'.` };
}

export function buildTypedProposalBatch(document: CanonicalDocument, revision: number, operations: readonly Readonly<{ tool: string; arguments: Readonly<Record<string, unknown>> }>[]): AIProposalResult {
  if (operations.length === 0 || operations.length > 50) return { ok: false, message: "submit_proposal requires between 1 and 50 typed operations." };
  const proposals: AIProposal[] = [];
  let candidate = document;
  for (const [index, operation] of operations.entries()) {
    if (!operation || typeof operation.tool !== "string" || !operation.arguments || typeof operation.arguments !== "object" || Array.isArray(operation.arguments)) return { ok: false, message: `operations[${index}] must contain a typed tool and an arguments object.` };
    if (operation.tool === "propose_edit" || !(AI_TYPED_PROPOSAL_TOOLS as readonly string[]).includes(operation.tool)) return { ok: false, message: `operations[${index}] uses unsupported proposal tool '${operation.tool}'.` };
    const result = buildTypedProposal(candidate, revision, operation.tool, operation.arguments);
    if (!result.ok) return { ok: false, message: `operations[${index}] (${operation.tool}) rejected: ${result.message}` };
    if (result.proposal.kind !== "semantic-command" || result.proposal.commands.length === 0) return { ok: false, message: `operations[${index}] must produce document SemanticCommands.` };
    for (const semanticCommand of result.proposal.commands) {
      const planned = planCommand(candidate, semanticCommand);
      if (!planned.ok) return { ok: false, message: `operations[${index}] (${operation.tool}) rejected: ${planned.problems.map((problem) => problem.message).join(" ")}` };
      candidate = planned.document;
    }
    proposals.push(result.proposal);
  }
  const commands = proposals.flatMap((item) => item.commands);
  return { ok: true, proposal: proposal(revision, `External proposal · ${operations.length} operations\n${proposals.map((item, index) => `${index + 1}. ${item.summary}`).join("\n")}`, commands) };
}

/** Build a narrow typed proposal from stable semantic identifiers. The
 * resulting command still enters the ordinary Preview/Validate/Apply path. */
export function buildTypedSignalProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  if (tool === "propose_create_signal") {
    const { name, type, role, groupId } = args;
    if (typeof name !== "string" || !name.trim()) return { ok: false, message: "propose_create_signal requires a non-empty name." };
    if (type !== "binary" && type !== "logic" && type !== "bus" && type !== "state" && type !== "event" && type !== "pulse") return { ok: false, message: "type must be binary, logic, bus, state, event, or pulse." };
    if (role !== "input" && role !== "output" && role !== "internal") return { ok: false, message: "role must be input, output, or internal." };
    if (typeof groupId !== "string" || !groupId) return { ok: false, message: "propose_create_signal requires a stable groupId." };
    const group = document.signalGroups.find((item) => item.id === groupId);
    if (!group) return { ok: false, message: `Signal Group '${groupId}' does not exist in the current document.` };
    const width = args.width;
    if (type === "bus" && width !== undefined && (!Number.isSafeInteger(width) || (width as number) < 1)) return { ok: false, message: "width must be a positive integer for a bus signal." };
    if (type !== "bus" && width !== undefined) return { ok: false, message: "width is supported only for bus signals." };
    const defaultValue: string | number = type === "bus" ? "00" : type === "state" ? "IDLE" : type === "event" ? "NONE" : 0;
    const initialValue = args.initialValue ?? defaultValue;
    if (typeof initialValue !== "string" && (typeof initialValue !== "number" || !Number.isFinite(initialValue))) return { ok: false, message: "initialValue must be a finite number or string." };
    const valueProblem = valueSignalValueProblem(type, initialValue);
    if (valueProblem) return { ok: false, message: `initialValue is invalid: ${valueProblem}` };
    const normalizedName = name.trim();
    const signal: ValueSignal = { id: nextEntityId("signal", document) as SignalId, name: normalizedName, type, role: role as SignalRole, source: { instancePath: [], signalName: normalizedName }, display: { name: normalizedName }, values: [{ id: nextEntityId("signalValueChange", document), start: 0, value: initialValue }], ...(type === "bus" ? { width: (width as number | undefined) ?? 8, displayFormat: "hex" as const } : {}) };
    return { ok: true, proposal: proposal(revision, `Create ${type} signal ${normalizedName} in ${group.name}`, [command({ type: "signal.create", signal, targetGroupId: group.id, index: group.rows.length }, "typed_create_signal")]) };
  }
  const signalId = args.signalId;
  if (tool !== "propose_rename_signal" && tool !== "propose_update_signal" && tool !== "propose_move_signal") return { ok: false, message: `Unsupported typed proposal '${tool}'.` };
  const name = args.name;
  if (typeof signalId !== "string" || signalId.length === 0) return { ok: false, message: `${tool} requires a stable signalId.` };
  const signal = document.signals.find((item) => item.id === signalId && item.type !== "commentRow");
  if (!signal) return { ok: false, message: `Signal '${signalId}' does not exist in the current document.` };
  if (tool === "propose_move_signal") {
    const targetGroupId = args.targetGroupId;
    if (typeof targetGroupId !== "string" || targetGroupId.length === 0) return { ok: false, message: "propose_move_signal requires a stable targetGroupId." };
    const targetGroup = document.signalGroups.find((group) => group.id === targetGroupId);
    if (!targetGroup) return { ok: false, message: `Signal Group '${targetGroupId}' does not exist in the current document.` };
    const index = args.index === undefined ? targetGroup.rows.length : args.index;
    if (!Number.isInteger(index) || (index as number) < 0) return { ok: false, message: "index must be a non-negative integer." };
    return { ok: true, proposal: proposal(revision, `Move ${signal.display.name} to ${targetGroup.name}`, [command({ type: "signal.move", signalId: signal.id, targetGroupId: targetGroup.id, index: index as number }, "typed_move_signal")]) };
  }
  if (tool === "propose_update_signal") {
    const role = args.role;
    const visible = args.visible;
    const displayStyle = args.displayStyle;
    if (role !== undefined && role !== "input" && role !== "output" && role !== "internal") return { ok: false, message: "role must be input, output, or internal." };
    if (visible !== undefined && typeof visible !== "boolean") return { ok: false, message: "visible must be a boolean." };
    if (displayStyle !== undefined && !isJsonObject(displayStyle)) return { ok: false, message: "displayStyle must be a JSON object." };
    if (role === undefined && visible === undefined && displayStyle === undefined) return { ok: false, message: "propose_update_signal requires role, visible, or displayStyle." };
    const nextRole = (role ?? signal.role) as typeof signal.role;
    const commandFields = { type: "signal.updateProperties" as const, signalId: signal.id, name: signal.name, role: nextRole, ...(visible === undefined ? {} : { visible }), ...(displayStyle === undefined ? {} : { displayStyle }) };
    const changes = [role === undefined ? undefined : `role to ${role}`, visible === undefined ? undefined : `visibility to ${visible ? "shown" : "hidden"}`, displayStyle === undefined ? undefined : "display style"].filter((item): item is string => item !== undefined);
    return { ok: true, proposal: proposal(revision, `Update ${signal.display.name} ${changes.join(" and ")}`, [command(commandFields, "typed_update_signal")]) };
  }
  if (typeof name !== "string" || name.trim().length === 0) return { ok: false, message: "propose_rename_signal requires a non-empty name." };
  const normalizedName = name.trim();
  return { ok: true, proposal: proposal(revision, `Rename ${signal.display.name} to ${normalizedName}`, [command({ type: "signal.rename", signalId: signal.id, name: normalizedName }, "typed_rename_signal")]) };
}

export function buildTypedTimelineProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  const integer = (key: string): number | undefined => Number.isSafeInteger(args[key]) ? args[key] as number : undefined;
  const commandFor = (fields: object, summary: string, scope: string): AIProposalResult => ({ ok: true, proposal: proposal(revision, summary, [command(fields, scope)]) });
  if (tool === "propose_insert_cycles") {
    const at = integer("at"); const count = integer("count");
    if (at === undefined || count === undefined || at < 0 || at > document.timeline.cycleCount || count <= 0) return { ok: false, message: "propose_insert_cycles requires integer at within the timeline and positive integer count." };
    return commandFor({ type: "timeline.insert", at, count }, `Insert ${count} cycles at ${at}`, "typed_insert_cycles");
  }
  if (tool === "propose_delete_cycles") {
    const start = integer("start"); const end = integer("end");
    if (start === undefined || end === undefined || start < 0 || end <= start || end > document.timeline.cycleCount) return { ok: false, message: "propose_delete_cycles requires integer boundaries within the timeline and end > start." };
    return commandFor({ type: "timeline.delete", start, end }, `Delete cycles ${start}–${end}`, "typed_delete_cycles");
  }
  if (tool === "propose_move_range") {
    const start = integer("start"); const end = integer("end"); const to = integer("to");
    if (start === undefined || end === undefined || to === undefined || start < 0 || end <= start || end > document.timeline.cycleCount || to < 0 || to > document.timeline.cycleCount) return { ok: false, message: "propose_move_range requires integer source/target boundaries within the timeline and end > start." };
    return commandFor({ type: "timeline.moveRange", start, end, to }, `Move cycles ${start}–${end} to ${to}`, "typed_move_range");
  }
  if (tool === "propose_duplicate_range") {
    const start = integer("start"); const end = integer("end"); const at = integer("at");
    if (start === undefined || end === undefined || at === undefined || start < 0 || end <= start || end > document.timeline.cycleCount || at < 0 || at > document.timeline.cycleCount) return { ok: false, message: "propose_duplicate_range requires an integer source range and insertion boundary within the timeline." };
    return commandFor({ type: "timeline.duplicateRange", start, end, at }, `Duplicate cycles ${start}–${end} at ${at}`, "typed_duplicate_range");
  }
  return { ok: false, message: `Unsupported typed timeline proposal '${tool}'.` };
}

export function buildTypedSignalGroupProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  if (tool === "propose_create_signal_group") {
    const name = args.name;
    if (typeof name !== "string" || name.trim().length === 0) return { ok: false, message: "propose_create_signal_group requires a non-empty name." };
    const normalizedName = name.trim();
    const id = nextEntityId("group", document) as GroupId;
    const group = { id, name: normalizedName, rows: [] };
    return { ok: true, proposal: proposal(revision, `Create Signal Group ${normalizedName}`, [command({ type: "group.create", group, index: document.signalGroups.length }, "typed_create_signal_group")]) };
  }
  if (tool === "propose_rename_signal_group") {
    const groupId = args.groupId;
    const name = args.name;
    if (typeof groupId !== "string" || groupId.length === 0) return { ok: false, message: "propose_rename_signal_group requires a stable groupId." };
    if (typeof name !== "string" || name.trim().length === 0) return { ok: false, message: "propose_rename_signal_group requires a non-empty name." };
    const group = document.signalGroups.find((item) => item.id === groupId);
    if (!group) return { ok: false, message: `Signal Group '${groupId}' does not exist in the current document.` };
    const normalizedName = name.trim();
    return { ok: true, proposal: proposal(revision, `Rename ${group.name} to ${normalizedName}`, [command({ type: "group.rename", groupId: group.id, name: normalizedName }, "typed_rename_signal_group")]) };
  }
  if (tool === "propose_move_signal_group" || tool === "propose_delete_signal_group") {
    const groupId = args.groupId;
    if (typeof groupId !== "string" || groupId.length === 0) return { ok: false, message: `${tool} requires a stable groupId.` };
    const groupIndex = document.signalGroups.findIndex((item) => item.id === groupId);
    const group = document.signalGroups[groupIndex];
    if (!group) return { ok: false, message: `Signal Group '${groupId}' does not exist in the current document.` };
    if (tool === "propose_move_signal_group") {
      const index = args.index;
      const maximumIndex = document.signalGroups.length - 1;
      if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) > maximumIndex) return { ok: false, message: `index must be an integer from 0 to ${maximumIndex} in the post-removal group list.` };
      return { ok: true, proposal: proposal(revision, `Move Signal Group ${group.name} to position ${(index as number) + 1}`, [command({ type: "group.move", groupId: group.id, index: index as number }, "typed_move_signal_group")]) };
    }
    if (group.rows.length > 0 || (group.spacers?.length ?? 0) > 0) return { ok: false, message: `Signal Group '${group.name}' is not empty; only empty Signal Groups can be deleted.` };
    return { ok: true, proposal: proposal(revision, `Delete empty Signal Group ${group.name}`, [command({ type: "group.delete", groupId: group.id }, "typed_delete_signal_group")]) };
  }
  return { ok: false, message: `Unsupported typed Signal Group proposal '${tool}'.` };
}

export function buildTypedTransactionGroupProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  const groups = document.transactionGroups ?? [];
  if (tool === "propose_create_transaction_group") {
    const name = args.name;
    const color = args.color;
    if (typeof name !== "string" || !name.trim()) return { ok: false, message: "propose_create_transaction_group requires a non-empty name." };
    if (color !== undefined && (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))) return { ok: false, message: "color must be a six-digit hexadecimal color when supplied." };
    const group = { id: nextEntityId("transactionGroup", document) as TransactionGroupId, name: name.trim(), order: groups.length, ...(typeof color === "string" ? { color } : {}) };
    return { ok: true, proposal: proposal(revision, `Create Transaction Group ${group.name}`, [command({ type: "transactionGroup.create", group }, "typed_create_transaction_group")]) };
  }
  const groupId = args.groupId;
  if (typeof groupId !== "string" || !groupId) return { ok: false, message: `${tool} requires a stable groupId.` };
  const group = groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, message: `Transaction Group '${groupId}' does not exist in the current document.` };
  if (tool === "propose_rename_transaction_group") {
    const name = args.name;
    if (typeof name !== "string" || !name.trim()) return { ok: false, message: "propose_rename_transaction_group requires a non-empty name." };
    return { ok: true, proposal: proposal(revision, `Rename Transaction Group ${group.name} to ${name.trim()}`, [command({ type: "transactionGroup.rename", groupId: group.id, name: name.trim() }, "typed_rename_transaction_group")]) };
  }
  if (tool === "propose_delete_transaction_group") {
    const affectedCount = document.transactions.filter((transaction) => transaction.groupId === group.id).length;
    return { ok: true, proposal: proposal(revision, `Delete Transaction Group ${group.name} and ungroup ${affectedCount} Transaction${affectedCount === 1 ? "" : "s"}`, [command({ type: "transactionGroup.delete", groupId: group.id }, "typed_delete_transaction_group")]) };
  }
  return { ok: false, message: `Unsupported typed Transaction Group proposal '${tool}'.` };
}

export function buildTypedTimeGroupProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  const integer = (key: string): number | undefined => Number.isSafeInteger(args[key]) ? args[key] as number : undefined;
  const validRange = (start: number | undefined, end: number | undefined) => start !== undefined && end !== undefined && start >= 0 && start < end && end <= document.timeline.cycleCount;
  if (tool === "propose_create_time_group") {
    const name = args.name;
    const start = integer("startCycle"); const end = integer("endCycle");
    if (typeof name !== "string" || !name.trim() || !validRange(start, end)) return { ok: false, message: "propose_create_time_group requires a non-empty name and integer source-cycle boundaries within the timeline with endCycle > startCycle." };
    if (args.category !== undefined && typeof args.category !== "string") return { ok: false, message: "category must be a string when supplied." };
    if (args.comment !== undefined && typeof args.comment !== "string") return { ok: false, message: "comment must be a string when supplied." };
    const timeGroup: TimeGroup = { id: nextEntityId("time", document) as TimeGroupId, name: name.trim(), start: start!, end: end!, ...(typeof args.category === "string" ? { category: args.category } : {}), ...(typeof args.comment === "string" ? { comment: args.comment } : {}), presentation: { collapsed: false, foldStyle: "none" } };
    return { ok: true, proposal: proposal(revision, `Create Time Group ${timeGroup.name} at source cycles ${start}–${end}`, [command({ type: "timeGroup.create", timeGroup }, "typed_create_time_group")]) };
  }
  const timeGroupId = args.timeGroupId;
  if (typeof timeGroupId !== "string" || !timeGroupId) return { ok: false, message: `${tool} requires a stable timeGroupId.` };
  const group = document.timeGroups.find((item) => item.id === timeGroupId);
  if (!group) return { ok: false, message: `Time Group '${timeGroupId}' does not exist in the current document.` };
  if (tool === "propose_delete_time_group") {
    const promotedChildren = document.timeGroups.filter((item) => item.parentId === group.id).length;
    const ownedAnchors = document.timeline.labelAnchors.filter((anchor) => anchor.id === group.presentation?.resumeLabelAnchorId || anchor.ownerTimeGroupId === group.id).length;
    return { ok: true, proposal: proposal(revision, `Delete Time Group ${group.name}; promote ${promotedChildren} child group${promotedChildren === 1 ? "" : "s"} and remove ${ownedAnchors} owned Label Anchor${ownedAnchors === 1 ? "" : "s"}`, [command({ type: "timeGroup.delete", timeGroupId: group.id }, "typed_delete_time_group")]) };
  }
  if (tool === "propose_update_time_group") {
    const name = args.name;
    if (name !== undefined && (typeof name !== "string" || !name.trim())) return { ok: false, message: "name must be non-empty when supplied." };
    const start = args.startCycle === undefined ? group.start : integer("startCycle");
    const end = args.endCycle === undefined ? group.end : integer("endCycle");
    if (!validRange(start, end)) return { ok: false, message: "startCycle/endCycle must be integer source-cycle boundaries within the timeline with endCycle > startCycle." };
    if (args.category !== undefined && typeof args.category !== "string") return { ok: false, message: "category must be a string when supplied." };
    if (args.comment !== undefined && typeof args.comment !== "string") return { ok: false, message: "comment must be a string when supplied." };
    if (name === undefined && args.startCycle === undefined && args.endCycle === undefined && args.category === undefined && args.comment === undefined) return { ok: false, message: "propose_update_time_group requires at least one changed field." };
    const nextName = typeof name === "string" ? name.trim() : group.name;
    const category = args.category === undefined ? group.category : args.category as string;
    const comment = args.comment === undefined ? group.comment : args.comment as string;
    const presentation = group.presentation;
    return { ok: true, proposal: proposal(revision, `Update Time Group ${group.name}`, [command({ type: "timeGroup.update", timeGroupId: group.id, name: nextName, start: start!, end: end!, ...(category === undefined ? {} : { category }), ...(comment === undefined ? {} : { comment }), ...(presentation === undefined ? {} : { presentation }) }, "typed_update_time_group")]) };
  }
  return { ok: false, message: `Unsupported typed Time Group proposal '${tool}'.` };
}

export function buildTypedTransactionProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  const transactionId = args.transactionId;
  if (tool === "propose_create_transaction") {
    const name = args.name; const start = args.start; const end = args.end;
    if (typeof name !== "string" || !name.trim() || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > document.timeline.cycleCount) return { ok: false, message: "propose_create_transaction requires a name and integer source-cycle boundaries within the timeline with end > start." };
    const groupId = args.groupId;
    if (groupId !== undefined && (typeof groupId !== "string" || !document.transactionGroups?.some((group) => group.id === groupId))) return { ok: false, message: `Transaction Group '${String(groupId)}' does not exist in the current document.` };
    if (args.laneId !== undefined && (typeof args.laneId !== "string" || !args.laneId.trim())) return { ok: false, message: "laneId must be a non-empty string when supplied." };
    if (args.color !== undefined && (typeof args.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(args.color))) return { ok: false, message: "color must be a six-digit hexadecimal color." };
    if (args.description !== undefined && typeof args.description !== "string") return { ok: false, message: "description must be a string when supplied." };
    const phasesInput = args.phases;
    if (phasesInput !== undefined && !Array.isArray(phasesInput)) return { ok: false, message: "phases must be an array of name/start/end source-cycle ranges." };
    const phases: TransactionPhase[] = [];
    for (const [index, item] of (phasesInput ?? []).entries()) {
      if (typeof item !== "object" || item === null) return { ok: false, message: `phases[${index}] must contain a name, start, and end.` };
      const phase = item as Record<string, unknown>;
      if (typeof phase.name !== "string" || !phase.name.trim() || !Number.isSafeInteger(phase.start) || !Number.isSafeInteger(phase.end) || (phase.start as number) < (start as number) || (phase.end as number) > (end as number) || (phase.end as number) <= (phase.start as number)) return { ok: false, message: `phases[${index}] must be a named, non-empty source-cycle range inside the Transaction.` };
      phases.push({ id: nextEntityId("transactionPhase", document) as TransactionPhase["id"], name: phase.name.trim(), start: phase.start as number, end: phase.end as number });
    }
    const orderedPhases = [...phases].sort((a, b) => a.start - b.start || a.end - b.end);
    if (orderedPhases.some((phase, index) => index > 0 && phase.start < orderedPhases[index - 1]!.end)) return { ok: false, message: "Transaction Phases must not overlap." };
    const linkedInput = args.linkedSignalIds;
    if (linkedInput !== undefined && !Array.isArray(linkedInput)) return { ok: false, message: "linkedSignalIds must be an array of stable Signal IDs." };
    const linkedSignalIds = (linkedInput ?? []) as unknown[];
    if (linkedSignalIds.some((id) => typeof id !== "string" || !document.signals.some((signal) => signal.id === id && signal.type !== "commentRow"))) return { ok: false, message: "Every linkedSignalId must identify an existing timing Signal." };
    if (new Set(linkedSignalIds).size !== linkedSignalIds.length) return { ok: false, message: "linkedSignalIds cannot contain duplicates." };
    const createdId = nextEntityId("transaction", document) as TransactionId;
    const created = { id: createdId, name: name.trim(), start: start as number, end: end as number, laneId: typeof args.laneId === "string" && args.laneId.trim() ? args.laneId.trim() : "lane_0", ...(typeof groupId === "string" ? { groupId: groupId as never } : {}), ...(typeof args.color === "string" ? { color: args.color } : {}), ...(typeof args.description === "string" ? { description: args.description } : {}) };
    const commands: SemanticCommand[] = [command({ type: "transaction.create", transaction: created }, "typed_create_transaction")];
    for (const phase of orderedPhases) commands.push(command({ type: "transaction.phaseAdd", transactionId: createdId, phase }, "typed_add_transaction_phase"));
    for (const signalId of linkedSignalIds as SignalId[]) commands.push(command({ type: "transaction.linkSignal", transactionId: createdId, signalId }, "typed_link_transaction_signal"));
    const detail = [phases.length ? `${phases.length} Phase${phases.length === 1 ? "" : "s"}` : undefined, linkedSignalIds.length ? `${linkedSignalIds.length} linked Signal${linkedSignalIds.length === 1 ? "" : "s"}` : undefined].filter(Boolean).join(" and ");
    return { ok: true, proposal: proposal(revision, `Create Transaction ${created.name}${detail ? ` with ${detail}` : ""}`, commands) };
  }
  if (typeof transactionId !== "string" || !transactionId) return { ok: false, message: `${tool} requires a stable transactionId.` };
  const transaction = document.transactions.find((item) => item.id === transactionId);
  if (!transaction) return { ok: false, message: `Transaction '${transactionId}' does not exist in the current document.` };
  if (tool === "propose_update_transaction") {
    const name = args.name === undefined ? transaction.name : args.name;
    const start = args.startCycle === undefined ? transaction.start : args.startCycle;
    const end = args.endCycle === undefined ? transaction.end : args.endCycle;
    const laneId = args.laneId;
    const groupId = args.groupId;
    const color = args.color;
    const description = args.description;
    if (typeof name !== "string" || !name.trim() || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > document.timeline.cycleCount) return { ok: false, message: "propose_update_transaction requires a non-empty name and valid integer source-cycle boundaries." };
    if (laneId !== undefined && (typeof laneId !== "string" || !laneId.trim())) return { ok: false, message: "laneId must be a non-empty string when supplied." };
    if (groupId !== undefined && (typeof groupId !== "string" || !document.transactionGroups?.some((group) => group.id === groupId))) return { ok: false, message: `Transaction Group '${String(groupId)}' does not exist in the current document.` };
    if (color !== undefined && (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))) return { ok: false, message: "color must be a six-digit hexadecimal color." };
    if (description !== undefined && typeof description !== "string") return { ok: false, message: "description must be a string when supplied." };
    if (name === transaction.name && start === transaction.start && end === transaction.end && laneId === undefined && groupId === undefined && color === undefined && description === undefined) return { ok: false, message: "propose_update_transaction requires at least one changed field." };
    const fields = { type: "transaction.update" as const, transactionId: transaction.id, name: name.trim(), start: start as number, end: end as number, ...(laneId === undefined ? {} : { laneId: (laneId as string).trim() }), ...(groupId === undefined ? {} : { groupId: groupId as never }), ...(color === undefined ? {} : { color: color as string }), ...(description === undefined ? {} : { description: description as string }) };
    return { ok: true, proposal: proposal(revision, `Update Transaction ${transaction.name}`, [command(fields, "typed_update_transaction")]) };
  }
  if (tool === "propose_add_phase" || tool === "propose_update_phase") {
    const name = args.name;
    const start = args.startCycle;
    const end = args.endCycle;
    if (typeof name !== "string" || !name.trim() || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) < transaction.start || (end as number) > transaction.end || (end as number) <= (start as number)) return { ok: false, message: `${tool} requires a name and integer source-cycle boundaries inside the Transaction.` };
    const phaseIndex = transaction.phases?.findIndex((phase) => phase.id === args.phaseId) ?? -1;
    if (tool === "propose_update_phase" && (typeof args.phaseId !== "string" || phaseIndex < 0 || args.phaseIndex !== undefined)) return { ok: false, message: "propose_update_phase requires a stable phaseId that exists in the Transaction, not phaseIndex." };
    if (tool === "propose_add_phase" && args.phaseId !== undefined && (typeof args.phaseId !== "string" || !isStableId(args.phaseId) || canonicalEntityIds(document).has(args.phaseId))) return { ok: false, message: "propose_add_phase requires an unused stable phaseId when supplied." };
    const phase = { id: tool === "propose_update_phase" ? transaction.phases![phaseIndex]!.id : (args.phaseId ?? nextEntityId("transactionPhase", document)) as TransactionPhase["id"], name: name.trim(), start: start as number, end: end as number };
    if (tool === "propose_add_phase") return { ok: true, proposal: proposal(revision, `Add Phase ${phase.name} to ${transaction.name}`, [command({ type: "transaction.phaseAdd", transactionId: transaction.id, phase }, "typed_add_phase")]) };
    return { ok: true, proposal: proposal(revision, `Update Phase ${phase.name} in ${transaction.name}`, [command({ type: "transaction.phaseUpdate", transactionId: transaction.id, phaseIndex, phaseId: phase.id, phase }, "typed_update_phase")]) };
  }
  if (tool === "propose_delete_phase") {
    const phaseIndex = transaction.phases?.findIndex((phase) => phase.id === args.phaseId) ?? -1;
    if (typeof args.phaseId !== "string" || phaseIndex < 0 || args.phaseIndex !== undefined) return { ok: false, message: "propose_delete_phase requires a stable phaseId that exists in the Transaction, not phaseIndex." };
    const phase = transaction.phases![phaseIndex]!;
    return { ok: true, proposal: proposal(revision, `Delete Phase ${phase.name} from ${transaction.name}`, [command({ type: "transaction.phaseDelete", transactionId: transaction.id, phaseIndex, phaseId: phase.id }, "typed_delete_phase")]) };
  }
  if (tool === "propose_link_signal" || tool === "propose_unlink_signal") {
    const signalId = args.signalId;
    if (typeof signalId !== "string" || !document.signals.some((signal) => signal.id === signalId && signal.type !== "commentRow")) return { ok: false, message: `Signal '${String(signalId ?? "")}' does not exist in the current document.` };
    const linked = (transaction.linkedSignals ?? []).includes(signalId as SignalId);
    if (tool === "propose_link_signal" && linked) return { ok: false, message: `Signal '${signalId}' is already linked to this Transaction.` };
    if (tool === "propose_unlink_signal" && !linked) return { ok: false, message: `Signal '${signalId}' is not linked to this Transaction.` };
    const signal = document.signals.find((item) => item.id === signalId)!;
    return { ok: true, proposal: proposal(revision, `${tool === "propose_link_signal" ? "Link" : "Unlink"} ${signal.display.name} ${tool === "propose_link_signal" ? "to" : "from"} ${transaction.name}`, [command({ type: tool === "propose_link_signal" ? "transaction.linkSignal" : "transaction.unlinkSignal", transactionId: transaction.id, signalId: signal.id }, tool === "propose_link_signal" ? "typed_link_signal" : "typed_unlink_signal")]) };
  }
  if (tool === "propose_move_transaction") {
    const start = args.start;
    if (!Number.isSafeInteger(start) || (start as number) < 0 || (start as number) + transaction.end - transaction.start > document.timeline.cycleCount) return { ok: false, message: "propose_move_transaction requires an integer source-cycle start that keeps the Transaction inside the timeline." };
    return { ok: true, proposal: proposal(revision, `Move ${transaction.name} to cycle ${start}`, [command({ type: "transaction.move", transactionId: transaction.id, start: start as number }, "typed_move_transaction")]) };
  }
  if (tool === "propose_resize_transaction") {
    const edge = args.edge; const value = args.value;
    if ((edge !== "start" && edge !== "end") || !Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > document.timeline.cycleCount) return { ok: false, message: "propose_resize_transaction requires edge start/end and an integer source-cycle boundary within the timeline." };
    return { ok: true, proposal: proposal(revision, `Resize ${transaction.name} ${edge} to ${value}`, [command({ type: "transaction.resize", transactionId: transaction.id, edge, value: value as number }, "typed_resize_transaction")]) };
  }
  if (tool === "propose_delete_transaction") return { ok: true, proposal: proposal(revision, `Delete ${transaction.name}`, [command({ type: "transaction.delete", transactionId: transaction.id }, "typed_delete_transaction")]) };
  return { ok: false, message: `Unsupported typed Transaction proposal '${tool}'.` };
}

export function buildTypedBookmarkProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  const cycle = args.cycle;
  if (tool === "propose_create_bookmark") {
    const name = args.name;
    if (typeof name !== "string" || !name.trim() || !Number.isSafeInteger(cycle) || (cycle as number) < 0 || (cycle as number) >= document.timeline.cycleCount) return { ok: false, message: "propose_create_bookmark requires a name and integer source cycle within the timeline." };
    const bookmark = { id: nextEntityId("bookmark", document), name: name.trim(), start: cycle as number, ...(typeof args.comment === "string" && args.comment.length > 0 ? { comment: args.comment } : {}) };
    return { ok: true, proposal: proposal(revision, `Create Bookmark ${bookmark.name} at cycle ${bookmark.start}`, [command({ type: "bookmark.create", bookmark }, "typed_create_bookmark")]) };
  }
  const bookmarkId = args.bookmarkId;
  if (typeof bookmarkId !== "string" || bookmarkId.length === 0) return { ok: false, message: `${tool} requires a stable bookmarkId.` };
  const bookmark = document.bookmarks.find((item) => item.id === bookmarkId);
  if (!bookmark) return { ok: false, message: `Bookmark '${bookmarkId}' does not exist in the current document.` };
  if (tool === "propose_move_bookmark") {
    if (!Number.isSafeInteger(cycle) || (cycle as number) < 0 || (cycle as number) >= document.timeline.cycleCount) return { ok: false, message: "propose_move_bookmark requires an integer source cycle within the timeline." };
    return { ok: true, proposal: proposal(revision, `Move Bookmark ${bookmark.name} to cycle ${cycle}`, [command({ type: "bookmark.move", bookmarkId: bookmark.id, start: cycle as number }, "typed_move_bookmark")]) };
  }
  if (tool === "propose_update_bookmark") {
    const name = args.name === undefined ? bookmark.name : args.name;
    const nextCycle = args.cycle === undefined ? bookmark.start : args.cycle;
    const comment = args.comment === undefined ? bookmark.comment : args.comment;
    if (typeof name !== "string" || !name.trim()) return { ok: false, message: "name must be a non-empty string when supplied." };
    if (!Number.isSafeInteger(nextCycle) || (nextCycle as number) < 0 || (nextCycle as number) >= document.timeline.cycleCount) return { ok: false, message: "cycle must be an integer source cycle within the timeline." };
    if (comment !== undefined && typeof comment !== "string") return { ok: false, message: "comment must be a string when supplied." };
    if (name === bookmark.name && nextCycle === bookmark.start && comment === bookmark.comment) return { ok: false, message: "propose_update_bookmark requires at least one changed field." };
    return { ok: true, proposal: proposal(revision, `Update Bookmark ${bookmark.name}`, [command({ type: "bookmark.update", bookmarkId: bookmark.id, name: name.trim(), start: nextCycle as number, ...(comment === undefined ? {} : { comment }) }, "typed_update_bookmark")]) };
  }
  if (tool === "propose_delete_bookmark") return { ok: true, proposal: proposal(revision, `Delete Bookmark ${bookmark.name}`, [command({ type: "bookmark.delete", bookmarkId: bookmark.id }, "typed_delete_bookmark")]) };
  return { ok: false, message: `Unsupported typed Bookmark proposal '${tool}'.` };
}

/** Annotation edits are expressed in stable semantic IDs and source cycles;
 * they only create a Preview and still pass through the normal validator. */
export function buildTypedAnnotationProposal(document: CanonicalDocument, revision: number, tool: string, args: Readonly<Record<string, unknown>>): AIProposalResult {
  if (tool === "propose_create_annotation") {
    const type = args.type;
    const signalId = args.signalId;
    const start = args.start;
    const end = args.end;
    const measurement = args.measurement;
    const ghostTrace = args.ghostTrace;
    const supportedTypes: readonly AnnotationType[] = ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace", "rectangle", "ellipse", "connector", "textbox"];
    if (typeof type !== "string" || !supportedTypes.includes(type as AnnotationType)) return { ok: false, message: "propose_create_annotation requires a supported Annotation type." };
    if (typeof signalId !== "string" || !document.signals.some((signal) => signal.id === signalId && signal.type !== "commentRow")) return { ok: false, message: `Signal '${String(signalId ?? "")}' does not exist in the current document.` };
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > document.timeline.cycleCount) return { ok: false, message: "propose_create_annotation requires integer source-cycle boundaries within the timeline with end > start." };
    if (measurement !== undefined && (type !== "measurement" || typeof measurement !== "object" || measurement === null || Array.isArray(measurement))) return { ok: false, message: "measurement options are only valid as an object for a Measurement Annotation." };
    if (ghostTrace !== undefined && (type !== "ghostTrace" || typeof ghostTrace !== "object" || ghostTrace === null || Array.isArray(ghostTrace))) return { ok: false, message: "ghostTrace options are only valid as an object for a Ghost Trace Annotation." };
    let thresholdSpec: Parameters<typeof createAnnotation>[4] = undefined;
    if (measurement !== undefined) {
      const options = measurement as Record<string, unknown>;
      const profile = options.profile;
      const anchorKind = options.anchorKind;
      const customStart = options.startValue;
      const customEnd = options.endValue;
      const profiles: readonly MeasurementProfile[] = ["cycle", "30-70", "10-90", "20-80", "50%", "custom"];
      if (Object.keys(options).some((key) => !["profile", "anchorKind", "startValue", "endValue"].includes(key)) || typeof profile !== "string" || !profiles.includes(profile as MeasurementProfile)) return { ok: false, message: "measurement options require a supported profile and no unknown fields." };
      if (profile === "cycle") {
        if (anchorKind !== undefined || customStart !== undefined || customEnd !== undefined) return { ok: false, message: "cycle measurement profile does not accept anchorKind or custom endpoints." };
      } else {
        if (anchorKind !== undefined && anchorKind !== "threshold" && anchorKind !== "ratio") return { ok: false, message: "measurement anchorKind must be threshold or ratio." };
        const kind = (anchorKind ?? "threshold") as TransitionAnchorKind;
        if (profile === "custom") {
          if (typeof customStart !== "number" || typeof customEnd !== "number" || !Number.isFinite(customStart) || !Number.isFinite(customEnd) || customStart < 0 || customEnd > 1 || customStart > customEnd) return { ok: false, message: "custom Measurement startValue/endValue must be finite fractions in [0,1] with startValue <= endValue." };
          thresholdSpec = { profile: "custom", anchorKind: kind, start: customStart, end: customEnd };
        } else {
          if (customStart !== undefined || customEnd !== undefined) return { ok: false, message: "standard Measurement profiles derive endpoints and do not accept custom startValue/endValue." };
          const pair = measurementProfilePair(profile as MeasurementProfile);
          if (!pair) return { ok: false, message: `Measurement profile '${profile}' does not define transition endpoints.` };
          thresholdSpec = { profile: profile as Exclude<MeasurementProfile, "cycle">, anchorKind: kind, ...pair };
        }
      }
    }
    const created = createAnnotation(type as AnnotationType, signalId as SignalId, { start: start as number, end: end as number }, document, thresholdSpec);
    let annotationWithSemanticOptions = created;
    if (ghostTrace !== undefined) {
      const options = ghostTrace as Record<string, unknown>;
      const sourceSignalId = options.sourceSignalId ?? signalId;
      const traceOffsetCycles = options.traceOffsetCycles ?? 0;
      const opacity = options.opacity ?? created.opacity;
      if (Object.keys(options).some((key) => !["sourceSignalId", "traceOffsetCycles", "opacity"].includes(key))) return { ok: false, message: "ghostTrace options contain an unsupported field." };
      if (typeof sourceSignalId !== "string" || !document.signals.some((signal) => signal.id === sourceSignalId && signal.type !== "commentRow")) return { ok: false, message: `Ghost Trace source Signal '${String(sourceSignalId)}' does not exist in the current document.` };
      if (typeof traceOffsetCycles !== "number" || !Number.isFinite(traceOffsetCycles)) return { ok: false, message: "Ghost Trace traceOffsetCycles must be finite." };
      if (opacity !== undefined && (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)) return { ok: false, message: "Ghost Trace opacity must be between 0 and 1." };
      annotationWithSemanticOptions = { ...created, sourceSignalId: sourceSignalId as SignalId, traceOffsetCycles, ...(opacity === undefined ? {} : { opacity }) };
    }
    const label = args.label;
    const annotation = typeof label === "string" && label.trim() ? { ...annotationWithSemanticOptions, label: label.trim() } : annotationWithSemanticOptions;
    return { ok: true, proposal: proposal(revision, `Create ${annotation.type} Annotation ${annotation.label}`, [command({ type: "annotation.create", annotation }, "typed_create_annotation")]) };
  }
  const annotationId = args.annotationId;
  if (typeof annotationId !== "string" || !annotationId) return { ok: false, message: `${tool} requires a stable annotationId.` };
  const annotation = document.annotations.find((item) => item.id === annotationId);
  if (!annotation) return { ok: false, message: `Annotation '${annotationId}' does not exist in the current document.` };
  if (tool === "propose_delete_annotation") return { ok: true, proposal: proposal(revision, `Delete Annotation ${annotation.label}`, [command({ type: "annotation.delete", annotationId: annotation.id }, "typed_delete_annotation")]) };
  if (tool === "propose_update_annotation") {
    const label = args.label;
    const visible = args.visible;
    const color = args.color;
    const sourceSignalId = args.sourceSignalId;
    const traceOffsetCycles = args.traceOffsetCycles;
    const opacity = args.opacity;
    const anchorField = args.anchorField;
    const anchorCycle = args.anchorCycle;
    const anchorSignalId = args.anchorSignalId;
    const anchorPoint = args.anchorPoint;
    const measurement = args.measurement;
    if (label !== undefined && (typeof label !== "string" || !label.trim())) return { ok: false, message: "label must be a non-empty string when supplied." };
    if (visible !== undefined && typeof visible !== "boolean") return { ok: false, message: "visible must be a boolean." };
    if (color !== undefined && (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))) return { ok: false, message: "color must be a six-digit hexadecimal color." };
    if (sourceSignalId !== undefined && annotation.type !== "ghostTrace") return { ok: false, message: "sourceSignalId is only valid for Ghost Trace Annotations." };
    if (sourceSignalId !== undefined && (typeof sourceSignalId !== "string" || !document.signals.some((signal) => signal.id === sourceSignalId && signal.type !== "commentRow"))) return { ok: false, message: `Ghost Trace source Signal '${String(sourceSignalId)}' does not exist in the current document.` };
    if (traceOffsetCycles !== undefined && (annotation.type !== "ghostTrace" || typeof traceOffsetCycles !== "number" || !Number.isFinite(traceOffsetCycles))) return { ok: false, message: "traceOffsetCycles is only valid as a finite number for Ghost Trace Annotations." };
    if (opacity !== undefined && (!(["ghostTrace", "timingRegion"] as const).includes(annotation.type as "ghostTrace" | "timingRegion") || typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)) return { ok: false, message: "opacity is only valid for Ghost Trace or Timing Region Annotations and must be between 0 and 1." };
    if (measurement !== undefined && (annotation.type !== "measurement" || typeof measurement !== "object" || measurement === null || Array.isArray(measurement))) return { ok: false, message: "measurement options are only valid as an object for a Measurement Annotation." };
    let measurementCommand: SemanticCommand | undefined;
    if (measurement !== undefined) {
      const options = measurement as Record<string, unknown>;
      const profile = options.profile;
      const anchorKind = options.anchorKind ?? "threshold";
      const startValue = options.startValue;
      const endValue = options.endValue;
      const profiles: readonly MeasurementProfile[] = ["cycle", "30-70", "10-90", "20-80", "50%", "custom"];
      if (Object.keys(options).some((key) => !["profile", "anchorKind", "startValue", "endValue"].includes(key)) || typeof profile !== "string" || !profiles.includes(profile as MeasurementProfile) || (anchorKind !== "threshold" && anchorKind !== "ratio")) return { ok: false, message: "measurement options require a supported profile/anchorKind and no unknown fields." };
      let pair: { readonly start: number; readonly end: number };
      if (profile === "cycle") {
        if (startValue !== undefined || endValue !== undefined) return { ok: false, message: "cycle measurement profile does not accept custom endpoints." };
        pair = { start: 0, end: 1 };
      } else if (profile === "custom") {
        if (typeof startValue !== "number" || typeof endValue !== "number" || !Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue < 0 || endValue > 1 || startValue > endValue) return { ok: false, message: "custom Measurement startValue/endValue must be finite fractions in [0,1] with startValue <= endValue." };
        pair = { start: startValue, end: endValue };
      } else {
        if (startValue !== undefined || endValue !== undefined) return { ok: false, message: "standard Measurement profiles derive endpoints and do not accept custom values." };
        const standardPair = measurementProfilePair(profile as Exclude<MeasurementProfile, "cycle">);
        if (!standardPair) return { ok: false, message: `Measurement profile '${profile}' does not define transition endpoints.` };
        pair = standardPair;
      }
      measurementCommand = command({ type: "annotation.updateMeasurement", annotationId: annotation.id, profile: profile as MeasurementProfile, anchorKind: anchorKind as TransitionAnchorKind, ...pair }, "typed_update_annotation_measurement");
    }
    const anchorFields = ["anchor", "start", "end", "from", "to"] as const;
    const hasAnchorUpdate = anchorCycle !== undefined || anchorSignalId !== undefined || anchorPoint !== undefined;
    if (hasAnchorUpdate && (typeof anchorField !== "string" || !anchorFields.includes(anchorField as typeof anchorFields[number]))) return { ok: false, message: "Semantic anchor updates require anchorField: anchor, start, end, from, or to." };
    if (!hasAnchorUpdate && anchorField !== undefined) return { ok: false, message: "anchorField requires at least one anchorCycle, anchorSignalId, or anchorPoint value." };
    let nextAnchor: SemanticAnchor | undefined;
    if (hasAnchorUpdate) {
      const currentAnchor = (annotation as Partial<Record<typeof anchorFields[number], SemanticAnchor>>)[anchorField as typeof anchorFields[number]];
      if (!currentAnchor) return { ok: false, message: `Annotation '${annotation.id}' has no '${String(anchorField)}' semantic anchor.` };
      if (anchorCycle !== undefined && (!Number.isSafeInteger(anchorCycle) || (anchorCycle as number) < 0 || (anchorCycle as number) >= document.timeline.cycleCount)) return { ok: false, message: "anchorCycle must be an integer source cycle within the timeline." };
      if (anchorSignalId !== undefined && (typeof anchorSignalId !== "string" || !document.signals.some((signal) => signal.id === anchorSignalId && signal.type !== "commentRow"))) return { ok: false, message: `Anchor Signal '${String(anchorSignalId)}' does not exist in the current document.` };
      const anchorPoints: readonly SemanticAnchor["point"][] = ["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"];
      if (anchorPoint !== undefined && (typeof anchorPoint !== "string" || !anchorPoints.includes(anchorPoint as SemanticAnchor["point"]))) return { ok: false, message: "anchorPoint must be a supported semantic anchor point." };
      const nextPoint = (anchorPoint ?? currentAnchor.point) as SemanticAnchor["point"];
      if ((currentAnchor.threshold !== undefined || currentAnchor.transition !== undefined) && !(nextPoint === "transition-start" || nextPoint === "transition-center" || nextPoint === "transition-end")) return { ok: false, message: "Threshold/ratio anchors must retain a transition anchor point." };
      nextAnchor = { ...currentAnchor, ...(anchorCycle === undefined ? {} : { cycle: anchorCycle as number }), ...(anchorSignalId === undefined ? {} : { signalId: anchorSignalId as SignalId }), ...(anchorPoint === undefined ? {} : { point: nextPoint }) };
    }
    if (label === undefined && visible === undefined && color === undefined && sourceSignalId === undefined && traceOffsetCycles === undefined && opacity === undefined && measurementCommand === undefined && !hasAnchorUpdate) return { ok: false, message: "propose_update_annotation requires at least one supported changed field." };
    const updatedLabel = typeof label === "string" ? label.trim() : annotation.label;
    const updatedVisible = typeof visible === "boolean" ? visible : annotation.visible;
    const updatedColor = typeof color === "string" ? color : annotation.color;
    const nextSourceSignalId = sourceSignalId === undefined ? annotation.sourceSignalId : sourceSignalId as SignalId;
    const nextTraceOffsetCycles = traceOffsetCycles === undefined ? annotation.traceOffsetCycles : traceOffsetCycles as number;
    const nextOpacity = opacity === undefined ? annotation.opacity : opacity as number;
    const commands: SemanticCommand[] = [];
    if (label !== undefined || visible !== undefined || color !== undefined || sourceSignalId !== undefined || traceOffsetCycles !== undefined || opacity !== undefined) {
      const fields = { type: "annotation.updateProperties" as const, annotationId: annotation.id, label: updatedLabel, visible: updatedVisible, ...(updatedColor === undefined ? {} : { color: updatedColor }), ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }), ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }), ...(nextSourceSignalId === undefined ? {} : { sourceSignalId: nextSourceSignalId }), ...(nextTraceOffsetCycles === undefined ? {} : { traceOffsetCycles: nextTraceOffsetCycles }), ...(nextOpacity === undefined ? {} : { opacity: nextOpacity }), ...(annotation.labelOffset === undefined ? {} : { labelOffset: annotation.labelOffset }), ...(annotation.labelPlacement === undefined ? {} : { labelPlacement: annotation.labelPlacement }), ...(annotation.style === undefined ? {} : { style: annotation.style }), ...(annotation.measurement === undefined ? {} : { measurement: annotation.measurement }) };
      commands.push(command(fields, "typed_update_annotation"));
    }
    if (nextAnchor && typeof anchorField === "string") commands.push(command({ type: "annotation.setAnchor", annotationId: annotation.id, field: anchorField as "anchor" | "start" | "end" | "from" | "to", anchor: nextAnchor }, "typed_update_annotation_anchor"));
    if (measurementCommand) commands.push(measurementCommand);
    return { ok: true, proposal: proposal(revision, `Update Annotation ${annotation.label}`, commands) };
  }
  return { ok: false, message: `Unsupported typed Annotation proposal '${tool}'.` };
}

/** Provider-neutral boundary. Implementations may be backed by a mock, local
 * model, or remote service, but they return proposals only; Canonical changes
 * are always applied by the editor's SemanticCommand owner. */
export interface AIProposalProvider {
  propose(request: AIProposalRequest): AIProposalResult;
}

const command = (value: object, scope: string): SemanticCommand => ({ ...value, id: nextCommandId(`ai_${scope}`) } as SemanticCommand);
const proposal = (revision: number, summary: string, commands: readonly SemanticCommand[], kind: AIProposalKind = "semantic-command", viewIntent?: AIViewIntent): AIProposal => ({ kind, baseRevision: revision, commands, summary, ...(viewIntent === undefined ? {} : { viewIntent }) });
const selectedGroup = (document: CanonicalDocument, selectedGroupId: GroupId | undefined, selectedSignalId: SignalId | undefined) => document.signalGroups.find((group) => group.id === selectedGroupId) ?? document.signalGroups.find((group) => selectedSignalId !== undefined && group.rows.includes(selectedSignalId));
const selectedEntityMessage = (label: string) => `Select a ${label} first.`;
const parseRange = (request: AIProposalRequest): Readonly<{ start: number; end: number }> => ({ start: request.range?.start ?? 0, end: request.range?.end ?? Math.min(1, request.document.timeline.cycleCount) });
const findNamed = <T extends { readonly name: string }>(items: readonly T[], name: string): T | undefined => {
  const normalized = name.trim().toLocaleLowerCase();
  return items.filter((item) => item.name.toLocaleLowerCase() === normalized).length === 1
    ? items.find((item) => item.name.toLocaleLowerCase() === normalized)
    : undefined;
};
const ambiguousOrMissing = (kind: string, name: string) => `Select exactly one ${kind} named '${name.trim()}'.`;

function buildExtendedProposal(request: AIProposalRequest): AIProposalResult {
  const { document, revision, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId } = request;
  const text = request.query.trim();
  const range = parseRange(request);
  const selected = document.signals.find((signal) => signal.id === selectedSignalId && signal.type !== "commentRow");
  const group = selectedGroup(document, selectedGroupId, selectedSignalId);
  const annotation = document.annotations.find((item) => item.id === selectedAnnotationId);
  const transaction = document.transactions.find((item) => item.id === selectedTransactionId);

  const createSignal = /^(?:create|add)(?: a)?\s+(binary|logic|bus|state|event|pulse)?\s*signal(?: named| called)?\s+(.+)$/i.exec(text);
  if (createSignal) {
    if (!group) return { ok: false, message: "A Signal Group is required." };
    const type = (createSignal[1]?.toLowerCase() || "binary") as ValueSignal["type"];
    const name = createSignal[2]!.trim();
    const id = nextEntityId("signal", document) as SignalId;
    const values = [{ id: nextEntityId("signalValueChange", document), start: 0, value: type === "state" ? "IDLE" : type === "event" ? "NONE" : type === "bus" ? "00" : 0 }] as ValueSignal["values"];
    const signal = { id, name, type, role: "internal" as const, source: { instancePath: [], signalName: name }, display: { name }, values, ...(type === "bus" ? { width: 8, displayFormat: "hex" as const } : {}) } as ValueSignal;
    return { ok: true, proposal: proposal(revision, `Create ${type} signal ${name} in ${group.name}`, [command({ type: "signal.create", signal, targetGroupId: group.id, index: group.rows.length }, "create_signal")]) };
  }
  const createGroup = /^(?:create|add)(?: a)? group(?: named| called)?\s+(.+)$/i.exec(text);
  if (createGroup) {
    const id = nextEntityId("group", document) as GroupId;
    const created = { id, name: createGroup[1]!.trim(), rows: [] };
    return { ok: true, proposal: proposal(revision, `Create group ${created.name}`, [command({ type: "group.create", group: created, index: document.signalGroups.length }, "create_group")]) };
  }
  const moveGroup = /^(?:move|reorder) selected group to position (\d+)$/i.exec(text);
  if (moveGroup) {
    if (!group || selectedGroupId === undefined) return { ok: false, message: selectedEntityMessage("Group") };
    return { ok: true, proposal: proposal(revision, `Move ${group.name} to position ${moveGroup[1]}`, [command({ type: "group.move", groupId: group.id, index: Number(moveGroup[1]) - 1 }, "move_group")]) };
  }
  const renameGroup = /^rename selected group to (.+)$/i.exec(text);
  if (renameGroup) {
    if (!group || selectedGroupId === undefined) return { ok: false, message: selectedEntityMessage("Group") };
    return { ok: true, proposal: proposal(revision, `Rename ${group.name} to ${renameGroup[1]!.trim()}`, [command({ type: "group.rename", groupId: group.id, name: renameGroup[1]!.trim() }, "rename_group")]) };
  }
  const insert = /^insert (\d+) cycles? at (\d+)$/i.exec(text);
  if (insert) return { ok: true, proposal: proposal(revision, `Insert ${insert[1]} cycles at ${insert[2]}`, [command({ type: "timeline.insert", at: Number(insert[2]), count: Number(insert[1]) }, "insert_cycles")]) };
  const remove = /^(?:delete|remove) cycles? (\d+)\s*(?:-|to|through)\s*(\d+)$/i.exec(text);
  if (remove) return { ok: true, proposal: proposal(revision, `Delete cycles ${remove[1]}–${remove[2]}`, [command({ type: "timeline.delete", start: Number(remove[1]), end: Number(remove[2]) }, "delete_cycles")]) };
  const duplicate = /^(?:duplicate|copy) cycles? (\d+)\s*(?:-|to|through)\s*(\d+) at (\d+)$/i.exec(text);
  if (duplicate) return { ok: true, proposal: proposal(revision, `Duplicate cycles ${duplicate[1]}–${duplicate[2]} at ${duplicate[3]}`, [command({ type: "timeline.duplicateRange", start: Number(duplicate[1]), end: Number(duplicate[2]), at: Number(duplicate[3]) }, "duplicate_cycles")]) };
  const move = /^move cycles? (\d+)\s*(?:-|to|through)\s*(\d+) to (\d+)$/i.exec(text);
  if (move) return { ok: true, proposal: proposal(revision, `Move cycles ${move[1]}–${move[2]} to ${move[3]}`, [command({ type: "timeline.moveRange", start: Number(move[1]), end: Number(move[2]), to: Number(move[3]) }, "move_cycles")]) };
  const bookmark = /^(?:add|create) bookmark at (\d+)$/i.exec(text);
  if (bookmark) {
    const start = Number(bookmark[1]);
    const created = { id: nextEntityId("bookmark", document), name: `Bookmark ${start}`, start };
    return { ok: true, proposal: proposal(revision, `Add ${created.name}`, [command({ type: "bookmark.create", bookmark: created }, "create_bookmark")]) };
  }
  const moveBookmark = /^(?:move|set) bookmark (.+) to (\d+)$/i.exec(text);
  if (moveBookmark) {
    const target = findNamed(document.bookmarks, moveBookmark[1]!);
    if (!target) return { ok: false, message: ambiguousOrMissing("Bookmark", moveBookmark[1]!) };
    return { ok: true, proposal: proposal(revision, `Move ${target.name} to cycle ${moveBookmark[2]}`, [command({ type: "bookmark.move", bookmarkId: target.id, start: Number(moveBookmark[2]) }, "move_bookmark")]) };
  }
  const renameBookmark = /^rename bookmark (.+) to (.+)$/i.exec(text);
  if (renameBookmark) {
    const target = findNamed(document.bookmarks, renameBookmark[1]!);
    if (!target) return { ok: false, message: ambiguousOrMissing("Bookmark", renameBookmark[1]!) };
    return { ok: true, proposal: proposal(revision, `Rename ${target.name} to ${renameBookmark[2]!.trim()}`, [command({ type: "bookmark.update", bookmarkId: target.id, name: renameBookmark[2]!.trim(), start: target.start, ...(target.comment === undefined ? {} : { comment: target.comment }) }, "rename_bookmark")]) };
  }
  const deleteBookmark = /^(?:delete|remove) bookmark (.+)$/i.exec(text);
  if (deleteBookmark) {
    const target = findNamed(document.bookmarks, deleteBookmark[1]!);
    if (!target) return { ok: false, message: ambiguousOrMissing("Bookmark", deleteBookmark[1]!) };
    return { ok: true, proposal: proposal(revision, `Delete ${target.name}`, [command({ type: "bookmark.delete", bookmarkId: target.id }, "delete_bookmark")]) };
  }
  const timeGroup = /^(?:create|add) time group (.+) from (\d+) to (\d+)$/i.exec(text);
  if (timeGroup) {
    const created = { id: nextEntityId("time", document), name: timeGroup[1]!.trim(), start: Number(timeGroup[2]), end: Number(timeGroup[3]) };
    return { ok: true, proposal: proposal(revision, `Create Time Group ${created.name}`, [command({ type: "timeGroup.create", timeGroup: created }, "create_time_group")]) };
  }
  const updateTimeGroup = /^update time group (.+) from (\d+) to (\d+)$/i.exec(text);
  if (updateTimeGroup) {
    const target = findNamed(document.timeGroups, updateTimeGroup[1]!);
    if (!target) return { ok: false, message: ambiguousOrMissing("Time Group", updateTimeGroup[1]!) };
    return { ok: true, proposal: proposal(revision, `Update Time Group ${target.name}`, [command({ type: "timeGroup.update", timeGroupId: target.id, name: target.name, start: Number(updateTimeGroup[2]), end: Number(updateTimeGroup[3]), ...(target.category === undefined ? {} : { category: target.category }), ...(target.comment === undefined ? {} : { comment: target.comment }), ...(target.presentation === undefined ? {} : { presentation: target.presentation }) }, "update_time_group")]) };
  }
  const deleteTimeGroup = /^(?:delete|remove) time group (.+)$/i.exec(text);
  if (deleteTimeGroup) {
    const target = findNamed(document.timeGroups, deleteTimeGroup[1]!);
    if (!target) return { ok: false, message: ambiguousOrMissing("Time Group", deleteTimeGroup[1]!) };
    return { ok: true, proposal: proposal(revision, `Delete Time Group ${target.name}`, [command({ type: "timeGroup.delete", timeGroupId: target.id }, "delete_time_group")]) };
  }
  const annotationCreate = /^(?:create|add) (text|marker|range|measurement|timingRegion|ghostTrace) annotation$/i.exec(text);
  if (annotationCreate) {
    if (!selected) return { ok: false, message: selectedEntityMessage("timing Signal") };
    const type = annotationCreate[1]!.toLowerCase() as "text" | "marker" | "range" | "measurement" | "timingregion" | "ghosttrace";
    const normalized = type === "timingregion" ? "timingRegion" : type === "ghosttrace" ? "ghostTrace" : type;
    const created = createAnnotation(normalized, selected.id, range, document);
    return { ok: true, proposal: proposal(revision, `Create ${normalized} annotation on ${selected.display.name}`, [command({ type: "annotation.create", annotation: { ...created, id: nextEntityId("annotation", document) as never } }, "create_annotation")]) };
  }
  const renameAnnotation = /^rename selected annotation to (.+)$/i.exec(text);
  if (renameAnnotation) {
    if (!annotation) return { ok: false, message: selectedEntityMessage("Annotation") };
    return { ok: true, proposal: proposal(revision, `Rename ${annotation.label} to ${renameAnnotation[1]!.trim()}`, [command({ type: "annotation.updateProperties", annotationId: annotation.id, label: renameAnnotation[1]!.trim(), visible: annotation.visible, ...(annotation.color === undefined ? {} : { color: annotation.color }), ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }), ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }), ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }), ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }), ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }), ...(annotation.labelPlacement === undefined ? {} : { labelPlacement: annotation.labelPlacement }), ...(annotation.style === undefined ? {} : { style: annotation.style }), ...(annotation.measurement === undefined ? {} : { measurement: annotation.measurement }) }, "rename_annotation")]) };
  }
  const transactionCreate = /^(?:create|add) transaction (.+) from (\d+) to (\d+)$/i.exec(text);
  if (transactionCreate) {
    const created = { id: nextEntityId("transaction", document), name: transactionCreate[1]!.trim(), start: Number(transactionCreate[2]), end: Number(transactionCreate[3]), laneId: "lane_0" };
    return { ok: true, proposal: proposal(revision, `Create transaction ${created.name}`, [command({ type: "transaction.create", transaction: created }, "create_transaction")]) };
  }
  const moveTransaction = /^move selected transaction to (\d+)$/i.exec(text);
  if (moveTransaction) {
    if (!transaction) return { ok: false, message: selectedEntityMessage("Transaction") };
    return { ok: true, proposal: proposal(revision, `Move ${transaction.name} to cycle ${moveTransaction[1]}`, [command({ type: "transaction.move", transactionId: transaction.id, start: Number(moveTransaction[1]) }, "move_transaction")]) };
  }
  const resizeTransaction = /^resize selected transaction (start|end) to (\d+)$/i.exec(text);
  if (resizeTransaction) {
    if (!transaction) return { ok: false, message: selectedEntityMessage("Transaction") };
    return { ok: true, proposal: proposal(revision, `Resize ${transaction.name} ${resizeTransaction[1]} to ${resizeTransaction[2]}`, [command({ type: "transaction.resize", transactionId: transaction.id, edge: resizeTransaction[1] as "start" | "end", value: Number(resizeTransaction[2]) }, "resize_transaction")]) };
  }
  if (/^fit all$/i.test(text)) return { ok: true, proposal: proposal(revision, "Fit the complete timeline", [], "view-only", "fit-all") };
  if (/^open timeline$/i.test(text)) return { ok: true, proposal: proposal(revision, "Open the Timeline workflow", [], "view-only", "open-timeline") };
  const role = /^set selected signal role to (input|output|internal)$/i.exec(text);
  if (role) {
    if (!selected) return { ok: false, message: selectedEntityMessage("timing Signal") };
    return { ok: true, proposal: proposal(revision, `Set ${selected.display.name} role to ${role[1]}`, [command({ type: "signal.updateProperties", signalId: selected.id, name: selected.name, role: role[1] as "input" | "output" | "internal" }, "set_signal_role")]) };
  }
  const style = /^set selected signal color to (#[0-9a-f]{6})$/i.exec(text);
  if (style) {
    if (!selected) return { ok: false, message: selectedEntityMessage("timing Signal") };
    return { ok: true, proposal: proposal(revision, `Set ${selected.display.name} color to ${style[1]}`, [command({ type: "signal.updateProperties", signalId: selected.id, name: selected.name, role: selected.role, displayStyle: { ...(selected.display.style ?? {}), color: style[1] } }, "set_signal_style")]) };
  }
  const moveSignal = /^move selected signal to group (.+)$/i.exec(text);
  if (moveSignal) {
    if (!selected) return { ok: false, message: selectedEntityMessage("timing Signal") };
    const target = findNamed(document.signalGroups, moveSignal[1]!);
    if (!target) return { ok: false, message: ambiguousOrMissing("Signal Group", moveSignal[1]!) };
    return { ok: true, proposal: proposal(revision, `Move ${selected.display.name} to ${target.name}`, [command({ type: "signal.move", signalId: selected.id, targetGroupId: target.id, index: target.rows.length }, "move_signal")]) };
  }
  if (/^rename selected signal to (.+)$/i.test(text) || /^(hide|show)(?: selected)?(?: signal)?$/i.test(text)) return { ok: false, message: "This signal intent is handled by the base deterministic provider." };
  if (annotation && /^(hide|show) selected annotation$/i.test(text)) return { ok: true, proposal: proposal(revision, `${text.toLowerCase().startsWith("show") ? "Show" : "Hide"} ${annotation.label}`, [command({ type: "annotation.updateProperties", annotationId: annotation.id, label: annotation.label, visible: text.toLowerCase().startsWith("show"), ...(annotation.color === undefined ? {} : { color: annotation.color }), ...(annotation.labelPlacement === undefined ? {} : { labelPlacement: annotation.labelPlacement }) }, "set_annotation_visibility")]) };
  const renameTransaction = /^rename selected transaction to (.+)$/i.exec(text);
  if (transaction && renameTransaction) return { ok: true, proposal: proposal(revision, `Rename ${transaction.name} to ${renameTransaction[1]!.trim()}`, [command({ type: "transaction.rename", transactionId: transaction.id, name: renameTransaction[1]!.trim() }, "rename_transaction")]) };
  return { ok: false, message: "Supported intents include signal/group/timeline/bookmark/Time Group/annotation/transaction commands and view-only 'fit all' or 'open timeline'." };
}

/** Deterministic CI-safe provider used by the production UI until a provider
 * adapter is configured. It deliberately supports only bounded intents. */
export const deterministicMockAIProposalProvider: AIProposalProvider = {
  propose: (request) => {
    const extended = buildExtendedProposal(request);
    if (extended.ok) return extended;
    const { document, revision, query, selectedSignalId } = request;
    const selected = document.signals.find((signal) => signal.id === selectedSignalId && signal.type !== "commentRow");
    const hasOtherSelection = request.selectedAnnotationId !== undefined || request.selectedTransactionId !== undefined;
    if (!selected && !hasOtherSelection) {
      return extended.ok || extended.message === "A Signal Group is required."
        ? extended
        : { ok: false, message: "Select a timing Signal first." };
    }
    if (!selected) return extended;
    const text = query.trim();
    const rename = /^rename(?: selected)?(?: signal)? to (.+)$/i.exec(text);
    const command: SemanticCommand | undefined = rename
      ? { id: nextCommandId("ai_rename"), type: "signal.rename", signalId: selected.id, name: rename[1]!.trim() }
      : /^(hide|show)(?: selected)?(?: signal)?$/i.test(text)
        ? { id: nextCommandId("ai_visibility"), type: "signal.setVisibility", signalId: selected.id, visible: text.toLowerCase().startsWith("show") }
        : undefined;
    if (!command) return extended;
    return {
      ok: true,
      proposal: {
        kind: "semantic-command",
        baseRevision: revision,
        commands: [command],
        summary: command.type === "signal.rename"
          ? `Rename ${selected.display.name} to ${(command as Extract<SemanticCommand, { type: "signal.rename" }>).name}`
          : `${(command as Extract<SemanticCommand, { type: "signal.setVisibility" }>).visible ? "Show" : "Hide"} ${selected.display.name}`,
      },
    };
  },
};
