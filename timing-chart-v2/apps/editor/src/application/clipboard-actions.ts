import { useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { referencesToAny } from "@timing-chart-v2/schema";
import type { AnnotationId, GroupId, Signal, SignalGroup, SignalId, SpacerId, SpacerRow, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";
import { createEntityIdAllocator, nextEntityId } from "../entity-id.js";
import { groupId, signalId } from "../minimal-cycle-view-fixture-helpers.js";
import { annotationClipboardStatus, captureAnnotationClipboard, createAnnotationsFromClipboard, cutAnnotations, selectedAnnotations, type AnnotationClipboard } from "./annotation-clipboard.js";
import { captureGroupTransactionLinks, remapGroupTransactionLinks, type GroupTransactionSignalLink } from "./group-clipboard-links.js";
import { createClipboardIndexes, resolveClipboardSignalGroupTarget, resolveGroupSignalsInRowOrder } from "./group-clipboard-selection.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";

type SignalClipboardItem = Readonly<{ signal: Signal; groupId: GroupId; index: number }>;
type GroupClipboardItem = Readonly<{ group: SignalGroup; rows: readonly Signal[]; sourceIndex: number; cutLinks?: readonly GroupTransactionSignalLink[] }>;
type SpacerClipboardItem = Readonly<{ spacer: SpacerRow; groupId: GroupId; index: number }>;
const spacerId = (value: string) => value as SpacerId;
export const NO_SIGNAL_GROUP_STATUS = "No Signal Group to insert into";
/** Mixed Signal + Annotation selection keeps the existing precedence: Copy/Cut act on the Signals (the status says the Annotations were
 * left out), Duplicate/Delete act on the Annotations. */
const mixedNote = (annotations: number) => annotations > 0 ? ` (${annotations} selected annotation${annotations === 1 ? "" : "s"} not included: Signals take precedence)` : "";

/** A copied Signal must not share value-change IDs with its source (IDs are unique across the Document). */
function withFreshValueChangeIds<T extends Signal>(signal: T): T {
  const fresh = <C extends { readonly id?: string }>(changes: readonly C[], scope: string): C[] => changes.map((change, index) => change.id === undefined ? change : { ...change, id: `value_${signal.id}${scope}_${index}` });
  if (signal.type === "commentRow") return signal;
  if (signal.type === "clock") return signal.enable ? { ...signal, enable: fresh(signal.enable, "_enable") } : signal;
  return { ...signal, values: fresh(signal.values, "") };
}

/** Names already shown in the tree; a copy must not reuse one of them. */
function signalNamesInUse(document: { readonly signals: readonly Signal[] }): Set<string> {
  return new Set(document.signals.flatMap((signal) => [signal.name, signal.display.name]));
}

/** Returns `base`, or the first free `base_N` (N >= 2), and reserves the result in `taken`. */
function takeUniqueName(taken: Set<string>, base: string): string {
  let candidate = base;
  for (let ordinal = 2; taken.has(candidate); ordinal += 1) candidate = `${base}_${ordinal}`;
  taken.add(candidate);
  return candidate;
}

const FOREIGN_PASTE_DETAIL = "clipboard-failure:foreign-document";

export function useClipboardActions({ application, selection }: { application: EditorApplicationOwner; selection: SelectionOwner }) {
  const [status, setStatus] = useState("Empty");
  const [available, setAvailable] = useState(false);
  const signalsRef = useRef<readonly SignalClipboardItem[]>([]);
  const groupRef = useRef<GroupClipboardItem | undefined>(undefined);
  const annotationRef = useRef<AnnotationClipboard | undefined>(undefined);
  const transactionsRef = useRef<readonly Transaction[]>([]);
  const spacerRef = useRef<SpacerClipboardItem | undefined>(undefined);
  const cutSignalsRef = useRef(false);
  const cutSignalLinksRef = useRef<readonly GroupTransactionSignalLink[]>([]);
  const sourceDocumentEpochRef = useRef<number | undefined>(undefined);
  const [indexResolver] = useState(createClipboardIndexes);
  const document = () => application.runtime.session.current().getSnapshot().document;

  const selected = () => {
    const current = document();
    const state = selection.refs.state.current;
    const signalsIndex = state.signalIds.size > 0 || state.groupId !== undefined ? indexResolver.signals(current) : undefined;
    const transactionsIndex = state.transactionIds.size > 0 || state.transactionId !== undefined ? indexResolver.transactions(current) : undefined;
    const group = state.groupId === undefined ? undefined : signalsIndex?.groupsById.get(state.groupId);
    return {
      document: current,
      state,
      group,
      signalById: signalsIndex?.byId,
      spacer: state.spacerId === undefined ? undefined : group?.spacers?.find((item) => item.id === state.spacerId),
      annotations: selectedAnnotations(current, state.annotationIds),
      transaction: state.transactionId === undefined ? undefined : transactionsIndex?.byId.get(state.transactionId) ?? current.transactions.find((item) => item.id === state.transactionId),
      transactions: transactionsIndex === undefined ? [] : [...state.transactionIds].flatMap((id) => { const transaction = transactionsIndex.byId.get(id); return transaction ? [transaction] : []; }).sort((left, right) => transactionsIndex.order.get(left.id)! - transactionsIndex.order.get(right.id)!),
      signals: signalsIndex === undefined ? [] : [...state.signalIds].flatMap((id) => { const signal = signalsIndex.byId.get(id); const owner = signalsIndex.owner.get(id); return signal && owner ? [{ signal, ...owner }] : []; }).sort((left, right) => signalsIndex.order.get(left.signal.id)! - signalsIndex.order.get(right.signal.id)!),
    };
  };
  const setClipboard = ({ signals = [], group, annotation, transactions = [], spacer, cutSignals = false, signalLinks = [] }: { signals?: readonly SignalClipboardItem[]; group?: GroupClipboardItem; annotation?: AnnotationClipboard; transactions?: readonly Transaction[]; spacer?: SpacerClipboardItem; cutSignals?: boolean; signalLinks?: readonly Readonly<{ transactionId: TransactionId; signalId: SignalId }>[] }) => {
    signalsRef.current = signals;
    groupRef.current = group;
    annotationRef.current = annotation;
    transactionsRef.current = transactions;
    spacerRef.current = spacer;
    cutSignalsRef.current = cutSignals;
    cutSignalLinksRef.current = signalLinks;
    sourceDocumentEpochRef.current = application.runtime.documentEpoch.current();
    // A fresh copy in this document supersedes an earlier "belongs to another document" rejection.
    application.setRuntimeDiagnostics((current) => current.some((item) => item.detail === FOREIGN_PASTE_DETAIL) ? current.filter((item) => item.detail !== FOREIGN_PASTE_DETAIL) : current);
    setAvailable(true);
  };

  const rejectForeignPaste = () => {
    const diagnostic = {
      code: "CLIPBOARD_FOREIGN_DOCUMENT",
      path: "$.clipboard.provenance",
      message: "Paste rejected: the clipboard payload belongs to another document.",
      severity: "error" as const,
      operation: "clipboard.paste",
      operationLabel: "Paste",
      source: "clipboard" as const,
      stage: "commit" as const,
      detail: FOREIGN_PASTE_DETAIL,
      recommendation: "Copy the entity again in the current document, then retry Paste.",
    };
    setStatus("Paste rejected: clipboard belongs to another document");
    application.setProblem(diagnostic.message);
    application.setRuntimeDiagnostics((current) => [...current.filter((item) => item.detail !== diagnostic.detail), diagnostic]);
  };

  const copy = () => {
    const value = selected();
    if (value.spacer && value.group) {
      setClipboard({ spacer: { spacer: value.spacer, groupId: value.group.id, index: value.group.rows.indexOf(value.spacer.id) } });
      setStatus(`Copied spacer ${value.spacer.id}`);
    } else if (value.group && !value.spacer) {
      const rows = value.group.rows.flatMap((rowId) => { const signal = value.signalById?.get(rowId as SignalId); return signal ? [signal] : []; });
      setClipboard({ group: { group: value.group, rows, sourceIndex: value.document.signalGroups.indexOf(value.group) } });
      setStatus(`Copied ${value.group.name} group`);
    } else if (value.transactions.length > 0 && value.signals.length === 0 && value.annotations.length === 0) {
      setClipboard({ transactions: value.transactions });
      setStatus(`Copied ${value.transactions.length} transaction${value.transactions.length === 1 ? "" : "s"}`);
    } else if (value.annotations.length > 0 && value.signals.length === 0) {
      setClipboard({ annotation: captureAnnotationClipboard(value.document, value.annotations) });
      setStatus(annotationClipboardStatus("Copied", value.annotations));
    } else if (value.signals.length > 0) {
      setClipboard({ signals: value.signals });
      setStatus(`${value.signals.length === 1 ? `Copied ${value.signals[0]!.signal.display.name}` : `Copied ${value.signals.length} signals`}${mixedNote(value.annotations.length)}`);
    } else setStatus("Select a signal, Comment Row, Annotation, or Transaction to copy");
  };

  /** A rejected Cut keeps the previous clipboard and says why (the full diagnostic is in Problems). */
  const cutRejectedStatus = (result: { readonly ok: false; readonly problems: readonly { readonly message: string }[] }) => `Cut rejected: ${result.problems[0]?.message ?? "the selection cannot be removed"}`;
  const cut = () => {
    const value = selected();
    const cutSignalIds = !value.spacer && value.group
      ? value.group.rows.filter((rowId) => value.signalById?.has(rowId as SignalId)) as SignalId[]
      : value.signals.map(({ signal }) => signal.id);
    if (value.document.timeline.referenceClock && cutSignalIds.includes(value.document.timeline.referenceClock)) {
      setStatus("Reference Clock cannot be cut; change the reference clock first");
      return;
    }
    if (value.spacer && value.group) {
      const spacerClipboard = { spacer: value.spacer, groupId: value.group.id, index: value.group.rows.indexOf(value.spacer.id) };
      const result = application.execute({ id: nextCommandId("cut_spacer"), type: "spacer.delete", spacerId: value.spacer.id });
      // The clipboard is replaced only when the Cut really happened: a rejected Cut must keep the user's previous clipboard.
      if (result.ok) { setClipboard({ spacer: spacerClipboard }); selection.clear(); setStatus(`Cut spacer ${value.spacer.id}`); }
      else setStatus(cutRejectedStatus(result));
      return;
    }
    if (value.group) {
      const signalsById = value.signalById;
      if (!signalsById) { setStatus("Cannot cut Group: Signal index is unavailable."); return; }
      const rows = resolveGroupSignalsInRowOrder(value.group.rows, signalsById);
      const groupSignalIds = rows.map((signal) => signal.id);
      const groupSignalIdSet = new Set(groupSignalIds);
      const cutLinks = captureGroupTransactionLinks(value.document.transactions, groupSignalIdSet);
      const commands: SemanticCommand[] = groupSignalIds.length === 0 ? [] : [{ id: nextCommandId("cut_group_signals"), type: "signal.bulkDelete", signalIds: groupSignalIds }];
      const groupSpacerIds = value.group.rows.filter((rowId) => !groupSignalIdSet.has(rowId as SignalId)) as SpacerId[];
      if (groupSpacerIds.length > 0) commands.push({ id: nextCommandId("cut_group_spacers"), type: "spacer.bulkDelete", spacerIds: groupSpacerIds });
      commands.push({ id: nextCommandId("cut_group_delete"), type: "group.delete", groupId: value.group.id });
      const result = application.executeBatch(nextCommandId("cut_group"), commands);
      if (result.ok) {
        setClipboard({ group: { group: value.group, rows, sourceIndex: value.document.signalGroups.indexOf(value.group), cutLinks } });
        selection.clear();
        setStatus(`Cut ${value.group.name} group`);
      } else setStatus("Cannot cut Group: one or more rows have dependent Annotations or protected references.");
      return;
    }
    if (value.transactions.length > 0 && value.signals.length === 0 && value.annotations.length === 0) {
      const result = application.execute({ id: nextCommandId("cut_transactions"), type: "transaction.bulkDelete", transactionIds: value.transactions.map((transaction) => transaction.id) });
      if (!result.ok) { setStatus(cutRejectedStatus(result)); return; }
      setClipboard({ transactions: value.transactions });
      { selection.clear(); setStatus(`Cut ${value.transactions.length} transaction${value.transactions.length === 1 ? "" : "s"}`); }
      return;
    }
    if (value.annotations.length > 0 && value.signals.length === 0) {
      const annotationClipboard = captureAnnotationClipboard(value.document, value.annotations);
      const result = cutAnnotations(application, value.annotations);
      if (!result.ok) { setStatus(cutRejectedStatus(result)); return; }
      setClipboard({ annotation: annotationClipboard });
      { selection.clear(); setStatus(annotationClipboardStatus("Cut", value.annotations)); }
      return;
    }
    if (value.signals.length === 0) { setStatus("Select a signal, Comment Row, Annotation, or Transaction to cut"); return; }
    const selectedIds = new Set(cutSignalIds);
    const signalLinks = referencesToAny(value.document, "signal", selectedIds)
      .filter((reference) => reference.kind === "transaction.linkedSignal")
      .map((reference) => ({ transactionId: reference.ownerId as TransactionId, signalId: reference.targetId as SignalId }));
    const result = application.execute({ id: nextCommandId("cut"), type: "signal.bulkDelete", signalIds: value.signals.map(({ signal }) => signal.id) });
    if (!result.ok) { setStatus(cutRejectedStatus(result)); return; }
    setClipboard({ signals: value.signals, cutSignals: true, signalLinks });
    { selection.clear(); setStatus(`${value.signals.length === 1 ? `Cut ${value.signals[0]!.signal.display.name}` : `Cut ${value.signals.length} signals`}${mixedNote(value.annotations.length)}`); }
  };

  const moveCutSignals = () => {
    const input = signalsRef.current;
    const current = document();
    const selectedSignalId = selection.refs.signalId.current;
    const selectedGroupId = selection.refs.state.current.groupId;
    const indexes = indexResolver.signals(current);
    const target = resolveClipboardSignalGroupTarget({
      groups: current.signalGroups,
      groupsById: indexes.groupsById,
      ownerBySignalId: indexes.owner,
      ...(selectedGroupId === undefined ? {} : { selectedGroupId }),
      ...(selectedSignalId === undefined ? {} : { selectedSignalId }),
      ...(input[0] === undefined ? {} : { sourceGroupId: input[0].groupId }),
    });
    if (input.length === 0) { setStatus("No signal clipboard available"); return; }
    if (!target) { setStatus(NO_SIGNAL_GROUP_STATUS); return; }
    const commands: SemanticCommand[] = [
      { id: nextCommandId("cut_paste_move_signals"), type: "signal.bulkCreate", signals: input.map(({ signal }) => signal), targetGroupId: target.id, index: target.rows.length },
    ];
    if (cutSignalLinksRef.current.length > 0) commands.push({ id: nextCommandId("cut_paste_restore_links"), type: "transaction.bulkLinkSignals", links: cutSignalLinksRef.current });
    const result = application.executeBatch(nextCommandId("cut_paste_move"), commands);
    if (result.ok) { cutSignalsRef.current = false; cutSignalLinksRef.current = []; selection.selectSignals(new Set(input.map(({ signal }) => signal.id)), input[0]!.signal.id); setStatus(`Moved ${input.length} signal${input.length === 1 ? "" : "s"}`); }
  };

  /** Duplicate puts each copy right after its source, inside the source's own Group. Adjacent selected Signals in one Group are copied
   * as one block placed after the run's last member, so their order is kept; a non-adjacent selection gets one block per run. */
  const duplicateSignals = (input: readonly SignalClipboardItem[]) => {
    const current = document();
    const allocateId = createEntityIdAllocator(current);
    const indexes = indexResolver.signals(current);
    const groupPosition = new Map(current.signalGroups.map((group, position) => [group.id, position] as const));
    const takenNames = signalNamesInUse(current);
    const fallbackGroup = current.signalGroups.at(-1);
    const sources = input
      .map((item) => ({ item, owner: indexes.owner.get(item.signal.id) }))
      .sort((left, right) => {
        if (!left.owner || !right.owner) return left.owner ? -1 : right.owner ? 1 : 0;
        return groupPosition.get(left.owner.groupId)! - groupPosition.get(right.owner.groupId)! || left.owner.index - right.owner.index;
      });
    const blocks: { target: SignalGroup; lastRow: number | undefined; signals: Signal[] }[] = [];
    const created: Signal[] = [];
    for (const { item, owner } of sources) {
      const target = owner === undefined ? (indexes.groupsById.get(item.groupId) ?? fallbackGroup) : indexes.groupsById.get(owner.groupId);
      if (!target) continue;
      const id = signalId(allocateId(item.signal.type === "commentRow" ? "commentRow" : "signal"));
      const name = takeUniqueName(takenNames, `${item.signal.display.name}_duplicate`);
      const signal: Signal = withFreshValueChangeIds({ ...item.signal, id, name, display: { ...item.signal.display, name } });
      created.push(signal);
      const last = blocks.at(-1);
      if (owner !== undefined && last !== undefined && last.target.id === target.id && last.lastRow !== undefined && owner.index === last.lastRow + 1) {
        last.signals.push(signal);
        last.lastRow = owner.index;
      } else blocks.push({ target, lastRow: owner?.index, signals: [signal] });
    }
    if (created.length === 0) { setStatus(NO_SIGNAL_GROUP_STATUS); return; }
    // Blocks in one Group are inserted from the bottom up, so each recorded index still points at the right row when it runs.
    const commands = blocks
      .map((block) => ({ block, index: block.lastRow === undefined ? block.target.rows.length : block.lastRow + 1 }))
      .sort((left, right) => groupPosition.get(left.block.target.id)! - groupPosition.get(right.block.target.id)! || right.index - left.index)
      .map(({ block, index }, offset): SemanticCommand => ({ id: nextCommandId(`duplicate_signals_${offset}`), type: "signal.bulkCreate", signals: block.signals, targetGroupId: block.target.id, index }));
    const result = application.executeBatch(nextCommandId("duplicate_signals_batch"), commands);
    if (result.ok) {
      const ids = created.map((signal) => signal.id);
      selection.selectSignals(new Set(ids), ids[0]);
      setStatus(`Duplicated ${created.length} signal${created.length === 1 ? "" : "s"}`);
    } else setStatus(`Duplicate rejected: ${result.problems[0]?.message ?? result.reason}`);
  };

  const createSignals = (input: readonly SignalClipboardItem[], operation: "paste" | "duplicate", placement: "current-selection" | "source-group" = "current-selection") => {
    if (input.length === 0) { setStatus("No signal clipboard available"); return; }
    if (operation === "duplicate") { duplicateSignals(input); return; }
    const current = document();
    const allocateId = createEntityIdAllocator(current);
    const takenNames = signalNamesInUse(current);
    const selectedSignalId = selection.refs.signalId.current;
    const indexes = indexResolver.signals(current);
    // Paste goes into a selected Group (its header), like Cut-then-Paste does.
    const selectedGroupId = selection.refs.state.current.groupId;
    const selectedGroup = placement === "current-selection"
      ? resolveClipboardSignalGroupTarget({ groups: current.signalGroups, groupsById: indexes.groupsById, ownerBySignalId: indexes.owner, ...(selectedGroupId === undefined ? {} : { selectedGroupId }), ...(selectedSignalId === undefined ? {} : { selectedSignalId }), fallbackToLast: false })
      : undefined;
    const groupsById = indexes.groupsById;
    const createdByGroup = new Map<GroupId, { target: SignalGroup; signals: Signal[] }>();
    const created: Signal[] = [];
    for (const source of input) {
      const target = selectedGroup ?? groupsById.get(source.groupId) ?? current.signalGroups.at(-1);
      if (!target) continue;
      const id = signalId(allocateId(source.signal.type === "commentRow" ? "commentRow" : "signal"));
      const name = takeUniqueName(takenNames, `${source.signal.display.name}_copy`);
      const signal: Signal = withFreshValueChangeIds({ ...source.signal, id, name, display: { ...source.signal.display, name } });
      created.push(signal);
      const bucket = createdByGroup.get(target.id) ?? { target, signals: [] };
      bucket.signals.push(signal);
      createdByGroup.set(target.id, bucket);
    }
    if (created.length === 0) { setStatus(NO_SIGNAL_GROUP_STATUS); return; }
    const placements = [...createdByGroup.values()].map(({ target, signals }) => ({
      targetGroupId: target.id,
      index: target.rows.length,
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
      setStatus(`Pasted ${created.length} signal${created.length === 1 ? "" : "s"}`);
    } else setStatus(`Paste rejected: ${result.problems[0]?.message ?? result.reason}`);
  };
  const createGroup = (input: GroupClipboardItem, operation: "paste" | "duplicate") => {
    const current = document();
    const allocateId = createEntityIdAllocator(current);
    const newGroupId = groupId(allocateId("group"));
    const sourceSignalsById = new Map(input.rows.map((signal) => [signal.id, signal]));
    const sourceSpacers = new Map<string, SpacerRow>((input.group.spacers ?? []).map((item) => [item.id, item]));
    const newIdByOldId = new Map<string, string>();
    const newSignalIdByOldId = new Map<SignalId, SignalId>();
    const createdSignals: Signal[] = [];
    const createdSpacers: SpacerRow[] = [];
    for (const rowId of input.group.rows) {
      const source = sourceSignalsById.get(rowId as SignalId);
      if (source) {
        const id = signalId(allocateId(source.type === "commentRow" ? "commentRow" : "signal"));
        const signal: Signal = withFreshValueChangeIds({ ...source, id });
        createdSignals.push(signal);
        newIdByOldId.set(rowId, id);
        newSignalIdByOldId.set(rowId as SignalId, id);
      } else {
        const sourceSpacer = sourceSpacers.get(rowId);
        if (!sourceSpacer) { setStatus(`Cannot ${operation} Group: a source row is missing.`); return; }
        const id = spacerId(allocateId("spacer"));
        createdSpacers.push({ ...sourceSpacer, id });
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
      index: Math.min(current.signalGroups.length, input.sourceIndex + 1),
    };
    const commands: SemanticCommand[] = [groupCommand];
    if (operation === "paste" && input.cutLinks && input.cutLinks.length > 0) {
      const mapped = remapGroupTransactionLinks(input.cutLinks, newSignalIdByOldId);
      if (!mapped.ok) {
        setStatus(`Cannot paste Group: a linked source row is missing (${mapped.missingSignalIds.join(", ")}).`);
        return;
      }
      commands.push({ id: nextCommandId("paste_group_restore_links"), type: "transaction.bulkLinkSignals", links: mapped.links });
    }
    const result = application.executeBatch(nextCommandId(`${operation}_group_batch`), commands);
    if (result.ok) {
      if (operation === "paste" && input.cutLinks?.length) groupRef.current = { ...input, cutLinks: [] };
      selection.selectGroup(newGroupId);
      setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${input.group.name} group`);
    } else setStatus(`Cannot ${operation} Group: its linked references could not be preserved.`);
  };
  const createAnnotation = (clipboard: AnnotationClipboard, operation: "paste" | "duplicate") => setStatus(createAnnotationsFromClipboard(application, selection, clipboard, operation));
  const createTransactions = (sources: readonly Transaction[], operation: "paste" | "duplicate") => {
    const current = document();
    const allocateId = createEntityIdAllocator(current);
    const created: Transaction[] = [];
    for (const source of sources) {
      const transaction: Transaction = { ...source, id: allocateId("transaction") as TransactionId, name: `${source.name} ${operation === "paste" ? "Paste" : "Copy"}` };
      created.push(transaction);
    }
    const result = application.execute({ id: nextCommandId(`${operation}_transactions`), type: "transaction.bulkCreate", transactions: created });
    if (result.ok) { const ids = created.map((transaction) => transaction.id); selection.selectTransactions(new Set(ids), ids[0]); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${created.length} transaction${created.length === 1 ? "" : "s"}`); }
    else setStatus(`${operation === "paste" ? "Paste" : "Duplicate"} rejected: ${result.problems[0]?.message ?? result.reason}`);
  };
  const createSpacer = (input: SpacerClipboardItem, operation: "paste" | "duplicate") => {
    const current = document();
    const target = current.signalGroups.find((item) => item.id === input.groupId) ?? current.signalGroups.at(-1);
    if (!target) { setStatus(NO_SIGNAL_GROUP_STATUS); return; }
    const spacer ={ ...input.spacer, id: spacerId(nextEntityId("spacer", current)) };
    const result = application.execute({ id: nextCommandId(`${operation}_spacer`), type: "spacer.create", spacer, targetGroupId: target.id, index: Math.min(input.index, target.rows.length) });
    if (result.ok) { selection.selectSpacer(target.id, spacer.id); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} spacer`); }
  };

  const paste = () => {
    // Nothing was ever copied in this session: say so instead of blaming another document (and do not raise a Problem).
    if (sourceDocumentEpochRef.current === undefined) { setStatus("Nothing to paste: copy something first"); return; }
    if (sourceDocumentEpochRef.current !== application.runtime.documentEpoch.current()) {
      rejectForeignPaste();
      return;
    }
    if (groupRef.current) createGroup(groupRef.current, "paste");
    else if (annotationRef.current) createAnnotation(annotationRef.current, "paste");
    else if (transactionsRef.current.length > 0) createTransactions(transactionsRef.current, "paste");
    else if (spacerRef.current) createSpacer(spacerRef.current, "paste");
    else if (cutSignalsRef.current) moveCutSignals();
    else createSignals(signalsRef.current, "paste");
  };
  const duplicate = () => {
    const value = selected();
    if (value.spacer && value.group) createSpacer({ spacer: value.spacer, groupId: value.group.id, index: value.group.rows.indexOf(value.spacer.id) }, "duplicate");
    else if (value.group) createGroup({ group: value.group, rows: value.group.rows.flatMap((rowId) => { const signal = value.signalById?.get(rowId as SignalId); return signal ? [signal] : []; }), sourceIndex: value.document.signalGroups.indexOf(value.group) }, "duplicate");
    else if (value.annotations.length > 0) createAnnotation(captureAnnotationClipboard(value.document, value.annotations), "duplicate");
    else if (value.transactions.length > 0) createTransactions(value.transactions, "duplicate");
    else createSignals(value.signals, "duplicate");
  };
  const deleteSelection = () => {
    const value = selected();
    const result = value.transactions.length > 1 ? application.execute({ id: nextCommandId("route_delete_transactions"), type: "transaction.bulkDelete", transactionIds: value.transactions.map((transaction) => transaction.id) })
      : value.transaction ? application.execute({ id: nextCommandId("route_delete_transaction"), type: "transaction.delete", transactionId: value.transaction.id })
      : value.annotations.length > 0 ? cutAnnotations(application, value.annotations)
      : value.signals.length > 1 ? application.execute({ id: nextCommandId("route_delete_selection"), type: "signal.bulkDelete", signalIds: value.signals.map(({ signal }) => signal.id) })
      : value.signals[0] ? application.execute({ id: nextCommandId("route_delete_signal"), type: "signal.delete", signalId: value.signals[0].signal.id })
      : value.spacer ? application.execute({ id: nextCommandId("route_delete_spacer"), type: "spacer.delete", spacerId: value.spacer.id })
      : value.group ? application.execute({ id: nextCommandId("route_delete_group"), type: "group.delete", groupId: value.group.id }) : undefined;
    if (result?.ok) selection.clear();
  };
  const rename = (name: string) => {
    const value = selected();
    if (value.transaction) return application.execute({ id: nextCommandId("route_rename_transaction"), type: "transaction.rename", transactionId: value.transaction.id, name });
    if (value.state.signalId) return application.execute({ id: nextCommandId("route_rename"), type: "signal.rename", signalId: value.state.signalId, name });
    if (value.group) return application.execute({ id: nextCommandId("route_rename_group"), type: "group.rename", groupId: value.group.id, name });
    return undefined;
  };
  const setVisibility = (visible: boolean) => {
    const value = selected();
    if (value.transactions.length > 0) {
      return application.execute({ id: nextCommandId("route_transaction_visibility_selection"), type: "transaction.bulkSetVisibility", transactionIds: value.transactions.map((transaction) => transaction.id), visible });
    }
    const updates = value.signals
      .filter(({ signal }) => (signal.display.visible !== false) !== visible)
      .map(({ signal }) => ({ signalId: signal.id, visible }));
    if (updates.length > 0) return application.execute({ id: nextCommandId("route_visibility_selection"), type: "signal.bulkSetVisibility", updates });
    return undefined;
  };
  // #431 item 9 ("Signal Tree productivity" -- "show only selected"): a
  // genuinely missing composition of the existing `signal.setVisibility`
  // command (already used one-at-a-time by setSignalVisibility and batched
  // uniformly by setVisibility above) -- no new command, no new Canonical
  // field. Selected signals/comment rows go visible, everything else in
  // the document goes hidden, as one atomic batch/History entry.
  const isolateSelection = () => {
    const value = selected();
    const selectedIds = new Set(value.signals.map(({ signal }) => signal.id));
    if (selectedIds.size === 0) return undefined;
    const updates = value.document.signals
      .filter((signal) => (signal.display.visible !== false) !== selectedIds.has(signal.id))
      .map((signal) => ({ signalId: signal.id, visible: selectedIds.has(signal.id) }));
    if (updates.length > 0) return application.execute({ id: nextCommandId("route_isolate_selection"), type: "signal.bulkSetVisibility", updates });
    return undefined;
  };
  const move = (direction: -1 | 1) => {
    const value = selected();
    if (value.signals.length === 1 && value.state.signalId) {
      const group = value.document.signalGroups.find((item) => item.rows.includes(value.state.signalId!));
      const index = group?.rows.indexOf(value.state.signalId) ?? -1;
      if (group && index >= 0 && index + direction >= 0 && index + direction < group.rows.length) return application.execute({ id: nextCommandId("home_move_signal"), type: "signal.move", signalId: value.state.signalId, targetGroupId: group.id, index: index + direction });
    } else if (value.group && !value.spacer) {
      const index = value.document.signalGroups.findIndex((item) => item.id === value.group!.id);
      if (index >= 0 && index + direction >= 0 && index + direction < value.document.signalGroups.length) return application.execute({ id: nextCommandId("home_move_group"), type: "group.move", groupId: value.group.id, index: index + direction });
    }
    return undefined;
  };

  const deleteSignal = (signalId: SignalId) => application.execute({ id: nextCommandId("delete_signal"), type: "signal.delete", signalId });
  const deleteAnnotation = (annotationId: AnnotationId) => application.execute({ id: nextCommandId("delete_annotation"), type: "annotation.delete", annotationId });
  const deleteTransaction = (transactionId: TransactionId) => application.execute({ id: nextCommandId("delete_transaction"), type: "transaction.delete", transactionId });
  const setSignalVisibility = (signalId: SignalId, visible: boolean) => application.execute({ id: nextCommandId("signal_visibility"), type: "signal.setVisibility", signalId, visible });
  // #774: Tree-level bulk visibility (Show/Hide All, per-Group Show/Hide) takes explicit target IDs instead of routing through
  // Selection -- the selection Transport-mechanism pattern silently replaced the user's real selection with the bulk target, so a
  // following Delete/Duplicate/Group/Color would act on the wrong scope. This never reads or writes Selection at all.
  const setTransactionsVisibility = (transactionIds: readonly TransactionId[], visible: boolean) => {
    const ids = [...new Set(transactionIds)];
    if (ids.length === 0) return undefined;
    return application.execute({ id: nextCommandId("route_transaction_visibility_bulk"), type: "transaction.bulkSetVisibility", transactionIds: ids, visible });
  };

  return { status, reportStatus: setStatus, available, copy, cut, paste, duplicate, deleteSelection, deleteSignal, deleteAnnotation, deleteTransaction, rename, setVisibility, setSignalVisibility, setTransactionsVisibility, isolateSelection, move, createSignals } as const;
}

export type ClipboardActions = ReturnType<typeof useClipboardActions>;
