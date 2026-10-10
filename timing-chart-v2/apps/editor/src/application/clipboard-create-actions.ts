import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, GroupId, Signal, SignalGroup, SignalId, SpacerId, SpacerRow } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";
import { createEntityIdAllocator } from "../entity-id.js";
import { groupId, signalId } from "../minimal-cycle-view-fixture-helpers.js";
import { remapGroupTransactionLinks, type GroupTransactionSignalLink } from "./group-clipboard-links.js";
import { createClipboardIndexes, resolveClipboardSignalGroupTarget } from "./group-clipboard-selection.js";
import { copySignalWithFreshValueChangeIds } from "./signal-clipboard-identity.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";

export type SignalClipboardItem = Readonly<{ signal: Signal; groupId: GroupId; index: number }>;
export type GroupClipboardItem = Readonly<{
  group: SignalGroup;
  rows: readonly Signal[];
  sourceIndex: number;
  cutLinks?: readonly GroupTransactionSignalLink[];
  move?: boolean;
}>;

const spacerId = (value: string) => value as SpacerId;

function reservePastedGroupRowName(taken: Set<string>, signal: Signal): Signal {
  if (!taken.has(signal.name) && !taken.has(signal.display.name)) {
    taken.add(signal.name);
    taken.add(signal.display.name);
    return signal;
  }
  const base = `${signal.display.name}_copy`;
  let name = base;
  for (let ordinal = 2; taken.has(name); ordinal += 1) name = `${base}_${ordinal}`;
  taken.add(name);
  return { ...signal, name, display: { ...signal.display, name } };
}

/** Creates copied Signals or a whole Group through the shared semantic command path. */
export function createClipboardSignals(input: readonly SignalClipboardItem[], operation: "paste" | "duplicate", placement: "current-selection" | "source-group", deps: {
  readonly application: EditorApplicationOwner;
  readonly selection: SelectionOwner;
  readonly indexResolver: ReturnType<typeof createClipboardIndexes>;
  readonly document: CanonicalDocument;
  readonly reportStatus: (message: string) => void;
}) {
  const { application, selection, document: current, reportStatus } = deps;
  if (input.length === 0) { reportStatus("No signal clipboard available"); return; }
  const allocateId = createEntityIdAllocator(current);
  const selectedSignalId = selection.refs.signalId.current;
  const signalIndexes = deps.indexResolver.signals(current);
  const selectedGroupId = operation === "paste" ? selection.refs.state.current.groupId : undefined;
  const selectedGroup = placement === "current-selection"
    ? resolveClipboardSignalGroupTarget({
      groups: current.signalGroups,
      groupsById: signalIndexes.groupsById,
      ownerBySignalId: signalIndexes.owner,
      ...(selectedGroupId === undefined ? {} : { selectedGroupId }),
      ...(selectedSignalId === undefined ? {} : { selectedSignalId }),
      fallbackToLast: false,
    })
    : undefined;
  const createdByGroup = new Map<GroupId, { target: SignalGroup; signals: Signal[] }>();
  const created: Signal[] = [];
  for (const source of input) {
    const targetGroup = selectedGroup ?? signalIndexes.groupsById.get(source.groupId) ?? current.signalGroups.at(-1);
    if (!targetGroup) continue;
    const id = signalId(allocateId(source.signal.type === "commentRow" ? "commentRow" : "signal"));
    const copyOrdinal = created.length + 1;
    const name = `${source.signal.display.name}_${operation === "duplicate" ? "duplicate" : "copy"}${input.length > 1 ? `_${copyOrdinal}` : ""}`;
    const copied = copySignalWithFreshValueChangeIds(source.signal, id, () => allocateId("signalValueChange"));
    const signal: Signal = { ...copied, name, display: { ...source.signal.display, name } };
    created.push(signal);
    const bucket = createdByGroup.get(targetGroup.id) ?? { target: targetGroup, signals: [] };
    bucket.signals.push(signal);
    createdByGroup.set(targetGroup.id, bucket);
  }
  if (created.length === 0) { reportStatus("No Signal Group to insert into"); return; }
  const placements = [...createdByGroup.values()].map(({ target: targetGroup, signals }) => ({
    targetGroupId: targetGroup.id,
    index: targetGroup.rows.length,
    signalIds: signals.map((signal) => signal.id),
  }));
  const command: SemanticCommand = {
    id: nextCommandId(`${operation}_signals`),
    type: "signal.bulkCreateAcrossGroups",
    signals: created,
    placements,
  };
  const result = application.execute(command);
  if (result.ok) {
    const ids = created.map((signal) => signal.id);
    selection.selectSignals(new Set(ids), ids[0]);
    reportStatus(operation === "paste" ? `Pasted ${created.length} signal${created.length === 1 ? "" : "s"}` : `Duplicated ${created.length} signal${created.length === 1 ? "" : "s"}`);
  } else reportStatus(`${operation === "paste" ? "Paste" : "Duplicate"} rejected: ${result.problems[0]?.message ?? result.reason}`);
}

export function createClipboardGroup(input: GroupClipboardItem, operation: "paste" | "duplicate", deps: {
  readonly application: EditorApplicationOwner;
  readonly selection: SelectionOwner;
  readonly document: CanonicalDocument;
  readonly reportStatus: (message: string) => void;
  readonly onCutGroupPasted: (input: GroupClipboardItem) => void;
}) {
  const { application, selection, document: current, reportStatus, onCutGroupPasted } = deps;
  const allocateId = createEntityIdAllocator(current);
  const newGroupId = groupId(allocateId("group"));
  const moving = operation === "paste" && input.move === true;
  const takenNames = operation === "paste"
    ? new Set(current.signals.flatMap((signal) => [signal.name, signal.display.name]))
    : undefined;
  const sourceSignalsById = new Map(input.rows.map((signal) => [signal.id, signal]));
  const sourceSpacers = new Map<string, SpacerRow>((input.group.spacers ?? []).map((item) => [item.id, item]));
  const newIdByOldId = new Map<string, string>();
  const newSignalIdByOldId = new Map<SignalId, SignalId>();
  const createdSignals: Signal[] = [];
  const createdSpacers: SpacerRow[] = [];
  for (const rowId of input.group.rows) {
    const source = sourceSignalsById.get(rowId as SignalId);
    if (source) {
      const id = moving ? source.id : signalId(allocateId(source.type === "commentRow" ? "commentRow" : "signal"));
      const namedSource = takenNames === undefined ? source : reservePastedGroupRowName(takenNames, source);
      const signal = moving ? namedSource : copySignalWithFreshValueChangeIds(namedSource, id, () => allocateId("signalValueChange"));
      createdSignals.push(signal);
      newIdByOldId.set(rowId, id);
      newSignalIdByOldId.set(rowId as SignalId, id);
    } else {
      const sourceSpacer = sourceSpacers.get(rowId);
      if (!sourceSpacer) { reportStatus(`Cannot ${operation} Group: a source row is missing.`); return; }
      const id = moving ? sourceSpacer.id : spacerId(allocateId("spacer"));
      createdSpacers.push(moving ? sourceSpacer : { ...sourceSpacer, id });
      newIdByOldId.set(rowId, id);
    }
  }
  const group: SignalGroup = {
    ...input.group,
    id: newGroupId,
    rows: input.group.rows.map((rowId) => newIdByOldId.get(rowId) as SignalGroup["rows"][number]),
    ...(input.group.spacers === undefined ? {} : { spacers: createdSpacers }),
  };
  const groupCommand: SemanticCommand = {
    id: nextCommandId(`${operation}_group`),
    type: "group.createWithContents",
    group,
    signals: createdSignals,
    // A cut Group was removed, so its previous slot is free; a copied Group goes after its source.
    index: Math.min(current.signalGroups.length, moving ? input.sourceIndex : input.sourceIndex + 1),
  };
  const commands: SemanticCommand[] = [groupCommand];
  if (operation === "paste" && input.cutLinks && input.cutLinks.length > 0) {
    const mapped = remapGroupTransactionLinks(input.cutLinks, newSignalIdByOldId);
    if (!mapped.ok) {
      reportStatus(`Cannot paste Group: a linked source row is missing (${mapped.missingSignalIds.join(", ")}).`);
      return;
    }
    commands.push({ id: nextCommandId("paste_group_restore_links"), type: "transaction.bulkLinkSignals", links: mapped.links });
  }
  const result = application.executeBatch(nextCommandId(`${operation}_group_batch`), commands);
  if (result.ok) {
    if (operation === "paste" && input.move) onCutGroupPasted(input);
    selection.selectGroup(newGroupId);
    reportStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${input.group.name} group`);
  } else reportStatus(`Cannot ${operation} Group: its linked references could not be preserved.`);
}
