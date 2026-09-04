import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, GroupId, SignalId, ValueSignal } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { createAnnotation } from "./create-annotation.js";

/** Provider output is either an executable semantic command proposal or an
 * explicit view-only intent handled by the current surface. */
export type AIProposalKind = "semantic-command" | "view-only" | "sva-spec";
export type AIViewIntent = "fit-all" | "open-timeline";

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
  selectedGroupId: GroupId | undefined;
  selectedAnnotationId: string | undefined;
  selectedTransactionId: string | undefined;
  range: Readonly<{ start: number; end: number }> | undefined;
}>;

export type AIProposalResult = Readonly<
  | { ok: true; proposal: AIProposal }
  | { ok: false; message: string }
>;

/** Provider-neutral boundary. Implementations may be backed by a mock, local
 * model, or remote service, but they return proposals only; Canonical changes
 * are always applied by the editor's SemanticCommand owner. */
export interface AIProposalProvider {
  propose(request: AIProposalRequest): AIProposalResult;
}

const command = (value: object, scope: string): SemanticCommand => ({ ...value, id: nextCommandId(`ai_${scope}`) } as SemanticCommand);
const proposal = (revision: number, summary: string, commands: readonly SemanticCommand[], kind: AIProposalKind = "semantic-command", viewIntent?: AIViewIntent): AIProposal => ({ kind, baseRevision: revision, commands, summary, ...(viewIntent === undefined ? {} : { viewIntent }) });
const selectedGroup = (document: CanonicalDocument, selectedGroupId: GroupId | undefined, selectedSignalId: SignalId | undefined) => document.signalGroups.find((group) => group.id === selectedGroupId) ?? document.signalGroups.find((group) => selectedSignalId !== undefined && group.rows.includes(selectedSignalId)) ?? document.signalGroups.at(-1);
const selectedEntityMessage = (label: string) => `Select a ${label} first.`;
const parseRange = (request: AIProposalRequest): Readonly<{ start: number; end: number }> => ({ start: request.range?.start ?? 0, end: request.range?.end ?? Math.min(1, request.document.timeline.cycleCount) });

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
    const values = [{ start: 0, value: type === "state" ? "IDLE" : type === "event" ? "NONE" : type === "bus" ? "00" : 0 }] as ValueSignal["values"];
    const signal = { id, name, type, role: "internal" as const, source: { instancePath: [], signalName: name }, display: { name }, values, ...(type === "bus" ? { width: 8, displayFormat: "hex" as const } : {}) } as ValueSignal;
    return { ok: true, proposal: proposal(revision, `Create ${type} signal ${name} in ${group.name}`, [command({ type: "signal.create", signal, targetGroupId: group.id, index: group.rows.length }, "create_signal")]) };
  }
  const createGroup = /^(?:create|add)(?: a)? group(?: named| called)?\s+(.+)$/i.exec(text);
  if (createGroup) {
    const id = nextEntityId("group", document) as GroupId;
    const created = { id, name: createGroup[1]!.trim(), rows: [] };
    return { ok: true, proposal: proposal(revision, `Create group ${created.name}`, [command({ type: "group.create", group: created, index: document.signalGroups.length }, "create_group")]) };
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
  const bookmark = /^(?:add|create) bookmark at (\d+)$/i.exec(text);
  if (bookmark) {
    const start = Number(bookmark[1]);
    const created = { id: nextEntityId("bookmark", document), name: `Bookmark ${start}`, start };
    return { ok: true, proposal: proposal(revision, `Add ${created.name}`, [command({ type: "bookmark.create", bookmark: created }, "create_bookmark")]) };
  }
  const timeGroup = /^(?:create|add) time group (.+) from (\d+) to (\d+)$/i.exec(text);
  if (timeGroup) {
    const created = { id: nextEntityId("time", document), name: timeGroup[1]!.trim(), start: Number(timeGroup[2]), end: Number(timeGroup[3]) };
    return { ok: true, proposal: proposal(revision, `Create Time Group ${created.name}`, [command({ type: "timeGroup.create", timeGroup: created }, "create_time_group")]) };
  }
  const annotationCreate = /^(?:create|add) (text|marker|range|measurement|timingRegion|ghostTrace) annotation$/i.exec(text);
  if (annotationCreate) {
    if (!selected) return { ok: false, message: selectedEntityMessage("timing Signal") };
    const type = annotationCreate[1]!.toLowerCase() as "text" | "marker" | "range" | "measurement" | "timingregion" | "ghosttrace";
    const normalized = type === "timingregion" ? "timingRegion" : type === "ghosttrace" ? "ghostTrace" : type;
    const created = createAnnotation(normalized, selected.id, range, document);
    return { ok: true, proposal: proposal(revision, `Create ${normalized} annotation on ${selected.display.name}`, [command({ type: "annotation.create", annotation: { ...created, id: nextEntityId("annotation", document) as never } }, "create_annotation")]) };
  }
  const transactionCreate = /^(?:create|add) transaction (.+) from (\d+) to (\d+)$/i.exec(text);
  if (transactionCreate) {
    const created = { id: nextEntityId("transaction", document), name: transactionCreate[1]!.trim(), start: Number(transactionCreate[2]), end: Number(transactionCreate[3]), laneId: "lane_0" };
    return { ok: true, proposal: proposal(revision, `Create transaction ${created.name}`, [command({ type: "transaction.create", transaction: created }, "create_transaction")]) };
  }
  if (/^fit all$/i.test(text)) return { ok: true, proposal: proposal(revision, "Fit the complete timeline", [], "view-only", "fit-all") };
  if (/^open timeline$/i.test(text)) return { ok: true, proposal: proposal(revision, "Open the Timeline workflow", [], "view-only", "open-timeline") };
  if (/^rename selected signal to (.+)$/i.test(text) || /^(hide|show)(?: selected)?(?: signal)?$/i.test(text)) return { ok: false, message: "This signal intent is handled by the base deterministic provider." };
  if (annotation && /^hide selected annotation$/i.test(text)) return { ok: true, proposal: proposal(revision, `Hide ${annotation.label}`, [command({ type: "annotation.updateProperties", annotationId: annotation.id, label: annotation.label, visible: false, ...(annotation.color === undefined ? {} : { color: annotation.color }) }, "hide_annotation")]) };
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
    if (!selected) return { ok: false, message: "Select a timing Signal first." };
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
