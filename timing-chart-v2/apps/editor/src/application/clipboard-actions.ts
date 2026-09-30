import { useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, AnnotationId, GroupId, Signal, SignalGroup, SignalId, SpacerId, SpacerRow, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";
import { createEntityIdAllocator, nextEntityId } from "../entity-id.js";
import { groupId, signalId } from "../minimal-cycle-view-fixture-helpers.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";

type SignalClipboardItem = Readonly<{ signal: Signal; groupId: GroupId; index: number }>;
type GroupClipboardItem = Readonly<{ group: SignalGroup; rows: readonly Signal[]; sourceIndex: number }>;
type SpacerClipboardItem = Readonly<{ spacer: SpacerRow; groupId: GroupId; index: number }>;
const spacerId = (value: string) => value as SpacerId;

export function useClipboardActions({ application, selection }: { application: EditorApplicationOwner; selection: SelectionOwner }) {
  const [status, setStatus] = useState("Empty");
  const [available, setAvailable] = useState(false);
  const signalsRef = useRef<readonly SignalClipboardItem[]>([]);
  const groupRef = useRef<GroupClipboardItem | undefined>(undefined);
  const annotationRef = useRef<Annotation | undefined>(undefined);
  const transactionsRef = useRef<readonly Transaction[]>([]);
  const spacerRef = useRef<SpacerClipboardItem | undefined>(undefined);
  const cutSignalsRef = useRef(false);
  const cutSignalLinksRef = useRef<readonly Readonly<{ transactionId: TransactionId; signalId: SignalId }>[]>([]);
  const sourceDocumentEpochRef = useRef<number | undefined>(undefined);
  const signalIndexRef = useRef<Readonly<{ signals: readonly Signal[]; groups: readonly SignalGroup[]; byId: ReadonlyMap<SignalId, Signal>; order: ReadonlyMap<SignalId, number>; owner: ReadonlyMap<SignalId, { groupId: GroupId; index: number }>; groupsById: ReadonlyMap<GroupId, SignalGroup> }> | undefined>(undefined);
  const transactionIndexRef = useRef<Readonly<{ transactions: readonly Transaction[]; byId: ReadonlyMap<TransactionId, Transaction>; order: ReadonlyMap<TransactionId, number> }> | undefined>(undefined);
  const document = () => application.runtime.session.current().getSnapshot().document;

  const signalIndexes = (current: ReturnType<typeof document>) => {
    const cached = signalIndexRef.current;
    if (cached?.signals === current.signals && cached.groups === current.signalGroups) return cached;
    const byId = new Map(current.signals.map((signal, index) => [signal.id, signal] as const));
    const order = new Map(current.signals.map((signal, index) => [signal.id, index] as const));
    const owner = new Map<SignalId, { groupId: GroupId; index: number }>();
    for (const group of current.signalGroups) group.rows.forEach((rowId, index) => { if (byId.has(rowId as SignalId)) owner.set(rowId as SignalId, { groupId: group.id, index }); });
    const groupsById = new Map(current.signalGroups.map((group) => [group.id, group] as const));
    const next = { signals: current.signals, groups: current.signalGroups, byId, order, owner, groupsById };
    signalIndexRef.current = next;
    return next;
  };

  const transactionIndexes = (current: ReturnType<typeof document>) => {
    const cached = transactionIndexRef.current;
    if (cached?.transactions === current.transactions) return cached;
    const byId = new Map(current.transactions.map((transaction, index) => [transaction.id, transaction] as const));
    const order = new Map(current.transactions.map((transaction, index) => [transaction.id, index] as const));
    const next = { transactions: current.transactions, byId, order };
    transactionIndexRef.current = next;
    return next;
  };

  const selected = () => {
    const current = document();
    const state = selection.refs.state.current;
    const signalsIndex = state.signalIds.size > 0 || state.groupId !== undefined ? signalIndexes(current) : undefined;
    const transactionsIndex = state.transactionIds.size > 0 || state.transactionId !== undefined ? transactionIndexes(current) : undefined;
    const group = state.groupId === undefined ? undefined : signalsIndex?.groupsById.get(state.groupId);
    return {
      document: current,
      state,
      group,
      signalById: signalsIndex?.byId,
      spacer: state.spacerId === undefined ? undefined : group?.spacers?.find((item) => item.id === state.spacerId),
      annotation: state.annotationId === undefined ? undefined : current.annotations.find((item) => item.id === state.annotationId),
      transaction: state.transactionId === undefined ? undefined : transactionsIndex?.byId.get(state.transactionId) ?? current.transactions.find((item) => item.id === state.transactionId),
      transactions: transactionsIndex === undefined ? [] : [...state.transactionIds].flatMap((id) => { const transaction = transactionsIndex.byId.get(id); return transaction ? [transaction] : []; }).sort((left, right) => transactionsIndex.order.get(left.id)! - transactionsIndex.order.get(right.id)!),
      signals: signalsIndex === undefined ? [] : [...state.signalIds].flatMap((id) => { const signal = signalsIndex.byId.get(id); const owner = signalsIndex.owner.get(id); return signal && owner ? [{ signal, ...owner }] : []; }).sort((left, right) => signalsIndex.order.get(left.signal.id)! - signalsIndex.order.get(right.signal.id)!),
    };
  };
  const setClipboard = ({ signals = [], group, annotation, transactions = [], spacer, cutSignals = false, signalLinks = [] }: { signals?: readonly SignalClipboardItem[]; group?: GroupClipboardItem; annotation?: Annotation; transactions?: readonly Transaction[]; spacer?: SpacerClipboardItem; cutSignals?: boolean; signalLinks?: readonly Readonly<{ transactionId: TransactionId; signalId: SignalId }>[] }) => {
    signalsRef.current = signals;
    groupRef.current = group;
    annotationRef.current = annotation;
    transactionsRef.current = transactions;
    spacerRef.current = spacer;
    cutSignalsRef.current = cutSignals;
    cutSignalLinksRef.current = signalLinks;
    sourceDocumentEpochRef.current = application.runtime.documentEpoch.current();
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
      detail: "clipboard-failure:foreign-document",
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
    } else if (value.transactions.length > 0 && value.signals.length === 0 && !value.annotation) {
      setClipboard({ transactions: value.transactions });
      setStatus(`Copied ${value.transactions.length} transaction${value.transactions.length === 1 ? "" : "s"}`);
    } else if (value.annotation && value.signals.length === 0) {
      setClipboard({ annotation: value.annotation });
      setStatus(`Copied ${value.annotation.label || value.annotation.type} annotation`);
    } else if (value.signals.length > 0) {
      setClipboard({ signals: value.signals });
      setStatus(value.signals.length === 1 ? `Copied ${value.signals[0]!.signal.display.name}` : `Copied ${value.signals.length} signals`);
    } else setStatus("Select a signal, Comment Row, Annotation, or Transaction to copy");
  };

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
      setClipboard({ spacer: { spacer: value.spacer, groupId: value.group.id, index: value.group.rows.indexOf(value.spacer.id) } });
      const result = application.execute({ id: nextCommandId("cut_spacer"), type: "spacer.delete", spacerId: value.spacer.id });
      if (result.ok) { selection.clear(); setStatus(`Cut spacer ${value.spacer.id}`); }
      return;
    }
    if (value.group) {
      const signalsById = new Map(value.document.signals.map((signal) => [signal.id, signal]));
      const rows = value.group.rows.flatMap((rowId) => signalsById.has(rowId as SignalId) ? [signalsById.get(rowId as SignalId)!] : []);
      setClipboard({ group: { group: value.group, rows, sourceIndex: value.document.signalGroups.indexOf(value.group) } });
      const groupSignalIds = value.group.rows.filter((rowId) => signalsById.has(rowId as SignalId)) as SignalId[];
      const commands: SemanticCommand[] = groupSignalIds.length === 0 ? [] : [{ id: nextCommandId("cut_group_signals"), type: "signal.bulkDelete", signalIds: groupSignalIds }];
      commands.push(...value.group.rows.filter((rowId) => !signalsById.has(rowId as SignalId)).map((rowId) => ({ id: nextCommandId("cut_group_spacer"), type: "spacer.delete" as const, spacerId: rowId as SpacerId })));
      commands.push({ id: nextCommandId("cut_group_delete"), type: "group.delete", groupId: value.group.id });
      const result = application.executeBatch(nextCommandId("cut_group"), commands);
      if (result.ok) { selection.clear(); setStatus(`Cut ${value.group.name} group`); }
      return;
    }
    if (value.transactions.length > 0 && value.signals.length === 0 && !value.annotation) {
      setClipboard({ transactions: value.transactions });
      const result = application.execute({ id: nextCommandId("cut_transactions"), type: "transaction.bulkDelete", transactionIds: value.transactions.map((transaction) => transaction.id) });
      if (result.ok) { selection.clear(); setStatus(`Cut ${value.transactions.length} transaction${value.transactions.length === 1 ? "" : "s"}`); }
      return;
    }
    if (value.annotation && value.signals.length === 0) {
      setClipboard({ annotation: value.annotation });
      const result = application.execute({ id: nextCommandId("cut_annotation"), type: "annotation.delete", annotationId: value.annotation.id });
      if (result.ok) { selection.clear(); setStatus(`Cut ${value.annotation.label || value.annotation.type} annotation`); }
      return;
    }
    if (value.signals.length === 0) { setStatus("Select a signal, Comment Row, Annotation, or Transaction to cut"); return; }
    const selectedIds = new Set(cutSignalIds);
    const signalLinks = value.document.transactions.flatMap((transaction) => (transaction.linkedSignals ?? [])
      .filter((signalId) => selectedIds.has(signalId))
      .map((signalId) => ({ transactionId: transaction.id, signalId })));
    setClipboard({ signals: value.signals, cutSignals: true, signalLinks });
    const result = application.execute({ id: nextCommandId("cut"), type: "signal.bulkDelete", signalIds: value.signals.map(({ signal }) => signal.id) });
    if (result.ok) { selection.clear(); setStatus(value.signals.length === 1 ? `Cut ${value.signals[0]!.signal.display.name}` : `Cut ${value.signals.length} signals`); }
  };

  const moveCutSignals = () => {
    const input = signalsRef.current;
    const current = document();
    const selectedSignalId = selection.refs.signalId.current;
    const selectedGroupId = selection.refs.state.current.groupId;
    const target = current.signalGroups.find((group) => group.id === selectedGroupId) ?? current.signalGroups.find((group) => selectedSignalId !== undefined && group.rows.includes(selectedSignalId)) ?? current.signalGroups.find((group) => group.id === input[0]?.groupId) ?? current.signalGroups.at(-1);
    if (!target || input.length === 0) return;
    const commands: SemanticCommand[] = [
      { id: nextCommandId("cut_paste_move_signals"), type: "signal.bulkCreate", signals: input.map(({ signal }) => signal), targetGroupId: target.id, index: target.rows.length },
      ...cutSignalLinksRef.current.map(({ transactionId, signalId }) => ({ id: nextCommandId("cut_paste_restore_link"), type: "transaction.linkSignal" as const, transactionId, signalId })),
    ];
    const result = application.executeBatch(nextCommandId("cut_paste_move"), commands);
    if (result.ok) { cutSignalsRef.current = false; cutSignalLinksRef.current = []; selection.selectSignals(new Set(input.map(({ signal }) => signal.id)), input[0]!.signal.id); setStatus(`Moved ${input.length} signal${input.length === 1 ? "" : "s"}`); }
  };

  const createSignals = (input: readonly SignalClipboardItem[], operation: "paste" | "duplicate", placement: "current-selection" | "source-group" = "current-selection") => {
    if (input.length === 0) { setStatus("No signal clipboard available"); return; }
    const current = document();
    const allocateId = createEntityIdAllocator(current);
    const selectedSignalId = selection.refs.signalId.current;
    const selectedGroup = placement === "current-selection" ? current.signalGroups.find((item) => selectedSignalId !== undefined && item.rows.includes(selectedSignalId)) : undefined;
    const createdByGroup = new Map<GroupId, { target: SignalGroup; signals: Signal[] }>();
    const created: Signal[] = [];
    for (const source of input) {
      const target = selectedGroup ?? current.signalGroups.find((item) => item.id === source.groupId) ?? current.signalGroups.at(-1);
      if (!target) continue;
      const id = signalId(allocateId(source.signal.type === "commentRow" ? "commentRow" : "signal"));
      const copyOrdinal = created.length + 1;
      const name = `${source.signal.display.name}_${operation === "duplicate" ? "duplicate" : "copy"}${input.length > 1 ? `_${copyOrdinal}` : ""}`;
      const signal: Signal = { ...source.signal, id, name, display: { ...source.signal.display, name } };
      created.push(signal);
      const bucket = createdByGroup.get(target.id) ?? { target, signals: [] };
      bucket.signals.push(signal);
      createdByGroup.set(target.id, bucket);
    }
    if (created.length === 0) return;
    const commands: SemanticCommand[] = [...createdByGroup.values()].map(({ target, signals }) => ({
      id: nextCommandId(`${operation}_signals`),
      type: "signal.bulkCreate",
      signals,
      targetGroupId: target.id,
      index: target.rows.length,
    }));
    const result = application.executeBatch(nextCommandId(operation), commands);
    if (result.ok) {
      const ids = created.map((signal) => signal.id);
      selection.selectSignals(new Set(ids), ids[0]);
      setStatus(operation === "paste" ? `Pasted ${created.length} signal${created.length === 1 ? "" : "s"}` : `Duplicated ${created.length} signal${created.length === 1 ? "" : "s"}`);
    }
  };
  const createGroup = (input: GroupClipboardItem, operation: "paste" | "duplicate") => {
    const current = document();
    const allocateId = createEntityIdAllocator(current);
    const newGroupId = groupId(allocateId("group"));
    const sourceSignalsById = new Map(input.rows.map((signal) => [signal.id, signal]));
    const sourceSpacers = new Map<string, SpacerRow>((input.group.spacers ?? []).map((item) => [item.id, item]));
    const newIdByOldId = new Map<string, string>();
    const createdSignals: Signal[] = [];
    const createdSpacers: SpacerRow[] = [];
    for (const rowId of input.group.rows) {
      const source = sourceSignalsById.get(rowId as SignalId);
      if (source) {
        const id = signalId(allocateId(source.type === "commentRow" ? "commentRow" : "signal"));
        const signal: Signal = { ...source, id };
        createdSignals.push(signal);
        newIdByOldId.set(rowId, id);
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
    const result = application.execute({
      id: nextCommandId(`${operation}_group`),
      type: "group.createWithContents",
      group,
      signals: createdSignals,
      index: Math.min(current.signalGroups.length, input.sourceIndex + 1),
    });
    if (result.ok) { selection.selectGroup(newGroupId); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${input.group.name} group`); }
  };
  const createAnnotation = (source: Annotation, operation: "paste" | "duplicate") => {
    const annotation = { ...source, id: nextEntityId("annotation", document()) as AnnotationId };
    const result = application.execute({ id: nextCommandId(`${operation}_annotation`), type: "annotation.create", annotation });
    if (result.ok) { selection.selectAnnotation(annotation.id); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${annotation.label || annotation.type} annotation`); }
  };
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
  };
  const createSpacer = (input: SpacerClipboardItem, operation: "paste" | "duplicate") => {
    const current = document();
    const target = current.signalGroups.find((item) => item.id === input.groupId) ?? current.signalGroups.at(-1);
    if (!target) return;
    const spacer = { ...input.spacer, id: spacerId(nextEntityId("spacer", current)) };
    const result = application.execute({ id: nextCommandId(`${operation}_spacer`), type: "spacer.create", spacer, targetGroupId: target.id, index: Math.min(input.index, target.rows.length) });
    if (result.ok) { selection.selectSpacer(target.id, spacer.id); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} spacer`); }
  };

  const paste = () => {
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
    else if (value.group) createGroup({ group: value.group, rows: value.group.rows.flatMap((rowId) => value.document.signals.find((signal) => signal.id === rowId) ?? []), sourceIndex: value.document.signalGroups.indexOf(value.group) }, "duplicate");
    else if (value.annotation) createAnnotation(value.annotation, "duplicate");
    else if (value.transactions.length > 0) createTransactions(value.transactions, "duplicate");
    else createSignals(value.signals, "duplicate");
  };
  const deleteSelection = () => {
    const value = selected();
    const result = value.transactions.length > 1 ? application.execute({ id: nextCommandId("route_delete_transactions"), type: "transaction.bulkDelete", transactionIds: value.transactions.map((transaction) => transaction.id) })
      : value.transaction ? application.execute({ id: nextCommandId("route_delete_transaction"), type: "transaction.delete", transactionId: value.transaction.id })
      : value.annotation ? application.execute({ id: nextCommandId("route_delete_annotation"), type: "annotation.delete", annotationId: value.annotation.id })
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
      const commands = value.transactions.filter((transaction) => (transaction.visible ?? true) !== visible).map((transaction) => ({ id: nextCommandId("route_transaction_visibility"), type: "transaction.update" as const, transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.phases === undefined ? {} : { phases: transaction.phases }), ...(transaction.groupId === undefined ? {} : { groupId: transaction.groupId }), ...(transaction.color === undefined ? {} : { color: transaction.color }), ...(transaction.description === undefined ? {} : { description: transaction.description }), visible }));
      if (commands.length > 1) return application.executeBatch(nextCommandId("route_transaction_visibility_selection"), commands);
      if (commands.length === 1) return application.execute(commands[0]!);
      return undefined;
    }
    const commands = value.signals
      .filter(({ signal }) => (signal.display.visible !== false) !== visible)
      .map(({ signal }) => ({ id: nextCommandId("route_visibility"), type: "signal.setVisibility" as const, signalId: signal.id, visible }));
    if (commands.length > 1) return application.executeBatch(nextCommandId("route_visibility_selection"), commands);
    if (commands.length === 1) return application.execute(commands[0]!);
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
    const commands = value.document.signals
      .filter((signal) => (signal.display.visible !== false) !== selectedIds.has(signal.id))
      .map((signal) => ({ id: nextCommandId("route_isolate"), type: "signal.setVisibility" as const, signalId: signal.id, visible: selectedIds.has(signal.id) }));
    if (commands.length > 1) return application.executeBatch(nextCommandId("route_isolate_selection"), commands);
    if (commands.length === 1) return application.execute(commands[0]!);
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
    const current = document();
    const targets = current.transactions.filter((transaction) => transactionIds.includes(transaction.id) && (transaction.visible ?? true) !== visible);
    const commands = targets.map((transaction) => ({ id: nextCommandId("route_transaction_visibility"), type: "transaction.update" as const, transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.phases === undefined ? {} : { phases: transaction.phases }), ...(transaction.groupId === undefined ? {} : { groupId: transaction.groupId }), ...(transaction.color === undefined ? {} : { color: transaction.color }), ...(transaction.description === undefined ? {} : { description: transaction.description }), visible }));
    if (commands.length > 1) return application.executeBatch(nextCommandId("route_transaction_visibility_bulk"), commands);
    if (commands.length === 1) return application.execute(commands[0]!);
    return undefined;
  };

  return { status, available, copy, cut, paste, duplicate, deleteSelection, deleteSignal, deleteAnnotation, deleteTransaction, rename, setVisibility, setSignalVisibility, setTransactionsVisibility, isolateSelection, move, createSignals } as const;
}

export type ClipboardActions = ReturnType<typeof useClipboardActions>;
