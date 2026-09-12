import { useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, AnnotationId, GroupId, Signal, SignalGroup, SignalId, SpacerId, SpacerRow, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";
import { nextEntityId } from "../entity-id.js";
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
  const sourceDocumentEpochRef = useRef<number | undefined>(undefined);
  const document = () => application.runtime.session.current().getSnapshot().document;

  const selected = () => {
    const current = document();
    const state = selection.refs.state.current;
    const group = state.groupId === undefined ? undefined : current.signalGroups.find((item) => item.id === state.groupId);
    return {
      document: current,
      state,
      group,
      spacer: state.spacerId === undefined ? undefined : group?.spacers?.find((item) => item.id === state.spacerId),
      annotation: state.annotationId === undefined ? undefined : current.annotations.find((item) => item.id === state.annotationId),
      transaction: state.transactionId === undefined ? undefined : current.transactions.find((item) => item.id === state.transactionId),
      transactions: current.transactions.filter((item) => state.transactionIds.has(item.id)),
      signals: current.signals.filter((signal) => state.signalIds.has(signal.id)).flatMap((signal) => {
        const owner = current.signalGroups.find((candidate) => candidate.rows.includes(signal.id));
        return owner ? [{ signal, groupId: owner.id, index: owner.rows.indexOf(signal.id) }] : [];
      }),
    };
  };
  const setClipboard = ({ signals = [], group, annotation, transactions = [], spacer, cutSignals = false }: { signals?: readonly SignalClipboardItem[]; group?: GroupClipboardItem; annotation?: Annotation; transactions?: readonly Transaction[]; spacer?: SpacerClipboardItem; cutSignals?: boolean }) => {
    signalsRef.current = signals;
    groupRef.current = group;
    annotationRef.current = annotation;
    transactionsRef.current = transactions;
    spacerRef.current = spacer;
    cutSignalsRef.current = cutSignals;
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
      const rows = value.group.rows.flatMap((rowId) => value.document.signals.find((signal) => signal.id === rowId) ?? []);
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
    if (value.spacer && value.group) {
      setClipboard({ spacer: { spacer: value.spacer, groupId: value.group.id, index: value.group.rows.indexOf(value.spacer.id) } });
      const result = application.execute({ id: nextCommandId("cut_spacer"), type: "spacer.delete", spacerId: value.spacer.id });
      if (result.ok) { selection.clear(); setStatus(`Cut spacer ${value.spacer.id}`); }
      return;
    }
    if (value.group) {
      const rows = value.group.rows.flatMap((rowId) => value.document.signals.find((signal) => signal.id === rowId) ?? []);
      setClipboard({ group: { group: value.group, rows, sourceIndex: value.document.signalGroups.indexOf(value.group) } });
      const commands: SemanticCommand[] = value.group.rows.map((rowId) => value.document.signals.some((signal) => signal.id === rowId)
        ? { id: nextCommandId("cut_group_signal"), type: "signal.delete", signalId: rowId as SignalId }
        : { id: nextCommandId("cut_group_spacer"), type: "spacer.delete", spacerId: rowId as SpacerId });
      commands.push({ id: nextCommandId("cut_group_delete"), type: "group.delete", groupId: value.group.id });
      const result = application.executeBatch(nextCommandId("cut_group"), commands);
      if (result.ok) { selection.clear(); setStatus(`Cut ${value.group.name} group`); }
      return;
    }
    if (value.transactions.length > 0 && value.signals.length === 0 && !value.annotation) {
      setClipboard({ transactions: value.transactions });
      const result = application.executeBatch(nextCommandId("cut_transactions"), value.transactions.map((transaction) => ({ id: nextCommandId("cut_transaction"), type: "transaction.delete" as const, transactionId: transaction.id })));
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
    setClipboard({ signals: value.signals, cutSignals: true });
    const result = application.executeBatch(nextCommandId("cut"), value.signals.map(({ signal }) => ({ id: nextCommandId("cut_item"), type: "signal.delete" as const, signalId: signal.id })));
    if (result.ok) { selection.clear(); setStatus(value.signals.length === 1 ? `Cut ${value.signals[0]!.signal.display.name}` : `Cut ${value.signals.length} signals`); }
  };

  const moveCutSignals = () => {
    const input = signalsRef.current;
    const current = document();
    const selectedSignalId = selection.refs.signalId.current;
    const selectedGroupId = selection.refs.state.current.groupId;
    const target = current.signalGroups.find((group) => group.id === selectedGroupId) ?? current.signalGroups.find((group) => selectedSignalId !== undefined && group.rows.includes(selectedSignalId)) ?? current.signalGroups.find((group) => group.id === input[0]?.groupId) ?? current.signalGroups.at(-1);
    if (!target || input.length === 0) return;
    const commands: SemanticCommand[] = input.map(({ signal }, offset) => (signal.type === "commentRow"
      ? { id: nextCommandId("paste_cut_signal"), type: "commentRow.create" as const, commentRow: signal, targetGroupId: target.id, index: target.rows.length + offset }
      : { id: nextCommandId("paste_cut_signal"), type: "signal.create" as const, signal, targetGroupId: target.id, index: target.rows.length + offset }));
    const result = application.executeBatch(nextCommandId("cut_paste_move"), commands);
    if (result.ok) { cutSignalsRef.current = false; selection.selectSignals(new Set(input.map(({ signal }) => signal.id)), input[0]!.signal.id); setStatus(`Moved ${input.length} signal${input.length === 1 ? "" : "s"}`); }
  };

  const createSignals = (input: readonly SignalClipboardItem[], operation: "paste" | "duplicate", placement: "current-selection" | "source-group" = "current-selection") => {
    if (input.length === 0) { setStatus("No signal clipboard available"); return; }
    const current = document();
    const selectedSignalId = selection.refs.signalId.current;
    const selectedGroup = placement === "current-selection" ? current.signalGroups.find((item) => selectedSignalId !== undefined && item.rows.includes(selectedSignalId)) : undefined;
    const commands: SemanticCommand[] = [];
    const created: Signal[] = [];
    const insertedByGroup = new Map<GroupId, number>();
    for (const source of input) {
      const target = selectedGroup ?? current.signalGroups.find((item) => item.id === source.groupId) ?? current.signalGroups.at(-1);
      if (!target) continue;
      const id = signalId(nextEntityId(source.signal.type === "commentRow" ? "commentRow" : "signal", { ...current, signals: [...current.signals, ...created] }));
      const copyOrdinal = created.length + 1;
      const name = `${source.signal.display.name}_copy${input.length > 1 ? `_${copyOrdinal}` : ""}`;
      const signal: Signal = { ...source.signal, id, name, display: { ...source.signal.display, name } };
      created.push(signal);
      const index = target.rows.length + (insertedByGroup.get(target.id) ?? 0);
      insertedByGroup.set(target.id, (insertedByGroup.get(target.id) ?? 0) + 1);
      commands.push({ id: nextCommandId(`${operation}_item`), type: signal.type === "commentRow" ? "commentRow.create" : "signal.create", ...(signal.type === "commentRow" ? { commentRow: signal } : { signal }), targetGroupId: target.id, index } as SemanticCommand);
    }
    if (commands.length === 0) return;
    const result = application.executeBatch(nextCommandId(operation), commands);
    if (result.ok) {
      const ids = created.map((signal) => signal.id);
      selection.selectSignals(new Set(ids), ids[0]);
      setStatus(operation === "paste" ? `Pasted ${created.length} signal${created.length === 1 ? "" : "s"}` : `Duplicated ${created.length} signal${created.length === 1 ? "" : "s"}`);
    }
  };
  const createGroup = (input: GroupClipboardItem, operation: "paste" | "duplicate") => {
    const current = document();
    const newGroupId = groupId(nextEntityId("group", current));
    const group: SignalGroup = { ...input.group, id: newGroupId, rows: [], ...(input.group.spacers === undefined ? {} : { spacers: [] }) };
    const commands: SemanticCommand[] = [{ id: nextCommandId(`${operation}_group`), type: "group.create", group, index: Math.min(current.signalGroups.length, input.sourceIndex + 1) }];
    const createdSignals: Signal[] = [];
    const sourceSpacers = new Map<string, SpacerRow>((input.group.spacers ?? []).map((item) => [item.id, item]));
    for (const rowId of input.group.rows) {
      const source = input.rows.find((signal) => signal.id === rowId);
      if (source) {
        const id = signalId(nextEntityId(source.type === "commentRow" ? "commentRow" : "signal", { ...current, signals: [...current.signals, ...createdSignals] }));
        const signal: Signal = { ...source, id };
        createdSignals.push(signal);
        commands.push({ id: nextCommandId(`${operation}_group_item`), type: signal.type === "commentRow" ? "commentRow.create" : "signal.create", ...(signal.type === "commentRow" ? { commentRow: signal } : { signal }), targetGroupId: newGroupId, index: commands.length - 1 } as SemanticCommand);
      } else {
        const sourceSpacer = sourceSpacers.get(rowId);
        if (!sourceSpacer) continue;
        const id = spacerId(nextEntityId("spacer", { ...current, signals: [...current.signals, ...createdSignals] }));
        commands.push({ id: nextCommandId(`${operation}_group_spacer`), type: "spacer.create", spacer: { ...sourceSpacer, id }, targetGroupId: newGroupId, index: commands.length - 1 });
      }
    }
    const result = application.executeBatch(nextCommandId(`${operation}_group_batch`), commands);
    if (result.ok) { selection.selectGroup(newGroupId); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${input.group.name} group`); }
  };
  const createAnnotation = (source: Annotation, operation: "paste" | "duplicate") => {
    const annotation = { ...source, id: nextEntityId("annotation", document()) as AnnotationId };
    const result = application.execute({ id: nextCommandId(`${operation}_annotation`), type: "annotation.create", annotation });
    if (result.ok) { selection.selectAnnotation(annotation.id); setStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${annotation.label || annotation.type} annotation`); }
  };
  const createTransactions = (sources: readonly Transaction[], operation: "paste" | "duplicate") => {
    const current = document();
    const created: Transaction[] = [];
    for (const source of sources) {
      const transaction: Transaction = { ...source, id: nextEntityId("transaction", { ...current, transactions: [...current.transactions, ...created] }) as TransactionId, name: `${source.name} ${operation === "paste" ? "Paste" : "Copy"}` };
      created.push(transaction);
    }
    const result = application.executeBatch(nextCommandId(`${operation}_transactions`), created.map((transaction) => ({ id: nextCommandId(`${operation}_transaction`), type: "transaction.create" as const, transaction })));
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
    const result = value.transactions.length > 1 ? application.executeBatch(nextCommandId("route_delete_transactions"), value.transactions.map((transaction) => ({ id: nextCommandId("route_delete_transaction"), type: "transaction.delete" as const, transactionId: transaction.id })))
      : value.transaction ? application.execute({ id: nextCommandId("route_delete_transaction"), type: "transaction.delete", transactionId: value.transaction.id })
      : value.annotation ? application.execute({ id: nextCommandId("route_delete_annotation"), type: "annotation.delete", annotationId: value.annotation.id })
      : value.signals.length > 1 ? application.executeBatch(nextCommandId("route_delete_selection"), value.signals.map(({ signal }) => ({ id: nextCommandId("route_delete_signal"), type: "signal.delete", signalId: signal.id })))
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

  return { status, available, copy, cut, paste, duplicate, deleteSelection, deleteSignal, deleteAnnotation, deleteTransaction, rename, setVisibility, setSignalVisibility, isolateSelection, move, createSignals } as const;
}

export type ClipboardActions = ReturnType<typeof useClipboardActions>;
