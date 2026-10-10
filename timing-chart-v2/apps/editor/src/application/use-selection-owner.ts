import { useRef, useState } from "react";
import type { AnnotationId, CanonicalDocument, GroupId, SignalId, SpacerId, TransactionId, TransactionPhaseId } from "@timing-chart-v2/schema";
import { selectedTransactionsInDocumentOrder, transactionById } from "../runtime/transaction-selection-index.js";
import { signalGroupSelectionIndex } from "../runtime/signal-group-selection-index.js";

export type SelectionState = Readonly<{
  signalId: SignalId | undefined;
  signalIds: ReadonlySet<SignalId>;
  groupId: GroupId | undefined;
  spacerId: SpacerId | undefined;
  annotationId: AnnotationId | undefined;
  annotationIds: ReadonlySet<AnnotationId>;
  transactionId: TransactionId | undefined;
  transactionPhaseId: TransactionPhaseId | undefined;
  /** The document-wide Legend is a selectable singleton, not a deletable entity. */
  legendSelected: boolean;
  /** First-class bulk target set; transactionId remains the deterministic primary. */
  transactionIds: ReadonlySet<TransactionId>;
}>;
type SelectionKind = "signal" | "group" | "spacer" | "annotation" | "transaction" | "legend" | "none";
export type SelectionCapabilities = Readonly<{
  hasSelectedSignal: boolean;
  hasSelectedEntity: boolean;
  hasSelectedClipboard: boolean;
  hasDeletableSelection: boolean;
  canRename: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canShow: boolean;
  canHide: boolean;
}>;
type SelectionEffects = Readonly<{
  decorateSelection: (state: SelectionState) => void;
  synchronizeContext: (kind: SelectionKind) => void;
}>;

function initialState(signalId: SignalId | undefined): SelectionState {
  return {
    signalId,
    signalIds: signalId === undefined ? new Set() : new Set([signalId]),
    groupId: undefined,
    spacerId: undefined,
    annotationId: undefined,
    annotationIds: new Set(),
    transactionId: undefined,
    transactionPhaseId: undefined,
    legendSelected: false,
    transactionIds: new Set(),
  };
}

/**
 * Derive every cross-surface selection capability from one immutable snapshot.
 * Ribbon, overflow and context-menu surfaces consume this same result so an
 * enabled command always describes the command router's current target set.
 */
// #857: stable-ID lookups go through an index keyed by the owning collection's identity instead of repeated whole-collection scans.
const signalIndexByCollection = new WeakMap<CanonicalDocument["signals"], ReadonlyMap<SignalId, CanonicalDocument["signals"][number]>>();
function signalIndexOf(signals: CanonicalDocument["signals"]) {
  let index = signalIndexByCollection.get(signals);
  if (!index) { index = new Map(signals.map((signal) => [signal.id, signal] as const)); signalIndexByCollection.set(signals, index); }
  return index;
}

export function deriveSelectionCapabilities(document: CanonicalDocument, selection: SelectionState): SelectionCapabilities {
  const signalsById = signalIndexOf(document.signals);
  const groups = signalGroupSelectionIndex(document.signalGroups);
  const selectedSignal = selection.signalId === undefined ? undefined : signalsById.get(selection.signalId);
  const selectedGroup = selection.groupId === undefined ? undefined : groups.groupById.get(selection.groupId);
  const selectedAnnotation = selection.annotationId === undefined ? undefined : document.annotations.find((annotation) => annotation.id === selection.annotationId);
  const selectedTransaction = selection.transactionId === undefined ? undefined : transactionById(document.transactions, selection.transactionId);
  const selectedTransactions = selectedTransactionsInDocumentOrder(document.transactions, selection.transactionIds);
  const hasSelectedSignal = selection.signalIds.size > 0 && selectedSignal !== undefined;
  const hasSelectedEntity = hasSelectedSignal || selectedGroup !== undefined || selectedTransaction !== undefined || selectedTransactions.length > 0 || selection.spacerId !== undefined;
  const hasSelectedClipboard = hasSelectedEntity || selectedAnnotation !== undefined;
  const hasDeletableSelection = hasSelectedEntity || selectedAnnotation !== undefined;
  const selectedSignalGroup = selectedSignal === undefined ? undefined : groups.groupByRowId.get(selectedSignal.id);
  const canMoveUp = selection.signalIds.size === 1 && selectedSignal !== undefined && selectedSignalGroup !== undefined
    ? (groups.rowIndexByGroupId.get(selectedSignalGroup.id)?.get(selectedSignal.id) ?? -1) > 0
    : selection.signalIds.size === 0 && selectedGroup !== undefined && selection.spacerId === undefined
      ? (groups.groupIndexById.get(selectedGroup.id) ?? -1) > 0
      : false;
  const canMoveDown = selection.signalIds.size === 1 && selectedSignal !== undefined && selectedSignalGroup !== undefined
    ? (() => { const index = groups.rowIndexByGroupId.get(selectedSignalGroup.id)?.get(selectedSignal.id) ?? -1; return index >= 0 && index < selectedSignalGroup.rows.length - 1; })()
    : selection.signalIds.size === 0 && selectedGroup !== undefined && selection.spacerId === undefined
      ? (() => { const index = groups.groupIndexById.get(selectedGroup.id) ?? -1; return index >= 0 && index < document.signalGroups.length - 1; })()
      : false;
  // A selected Spacer carries its parent Group in selection.groupId, so it must be excluded explicitly or Rename would target the Group.
  const canRename = (selection.signalIds.size === 1 && selectedSignal !== undefined) || (selection.signalIds.size === 0 && selection.transactionIds.size <= 1 && selection.spacerId === undefined && (selectedGroup !== undefined || selectedTransaction !== undefined));
  const canShow = (selection.signalIds.size > 0 && selectedSignal !== undefined && [...selection.signalIds].some((id) => signalsById.get(id)?.display.visible === false)) || selectedTransactions.some((transaction) => transaction.visible === false);
  const canHide = (selection.signalIds.size > 0 && selectedSignal !== undefined && [...selection.signalIds].some((id) => { const signal = signalsById.get(id); return signal !== undefined && signal.display.visible !== false; })) || selectedTransactions.some((transaction) => transaction.visible !== false);
  return { hasSelectedSignal, hasSelectedEntity, hasSelectedClipboard, hasDeletableSelection, canRename, canMoveUp, canMoveDown, canShow, canHide };
}

/** Single synchronous authority for semantic editor selection and event-handler ref mirrors. */
export function useSelectionOwner(initialSignalId?: SignalId) {
  const [state, setState] = useState<SelectionState>(() => initialState(initialSignalId));
  const stateRef = useRef(state);
  const effectsRef = useRef<SelectionEffects | undefined>(undefined);

  const replace = (next: SelectionState | ((current: SelectionState) => SelectionState)) => {
    const value = typeof next === "function" ? next(stateRef.current) : next;
    stateRef.current = value;
    setState(value);
  };
  const commit = (next: SelectionState, kind: SelectionKind) => {
    replace(next);
    effectsRef.current?.decorateSelection(next);
    effectsRef.current?.synchronizeContext(kind);
  };
  const selectSignals = (signalIds: ReadonlySet<SignalId>, primary?: SignalId) => {
    const ids = new Set(signalIds);
    const signalId = primary && ids.has(primary) ? primary : [...ids][0];
    commit({ ...initialState(signalId), signalIds: ids }, signalId === undefined ? "none" : "signal");
  };
  const selectAnnotations = (annotationIds: ReadonlySet<AnnotationId>, primary?: AnnotationId) => {
    const ids = new Set(annotationIds);
    const annotationId = primary && ids.has(primary) ? primary : [...ids][0];
    commit({ ...initialState(undefined), annotationId, annotationIds: ids }, annotationId === undefined ? "none" : "annotation");
  };

  return {
    state,
    refs: {
      state: stateRef,
      signalId: { get current() { return stateRef.current.signalId; } },
      signalIds: { get current() { return stateRef.current.signalIds; } },
      groupId: { get current() { return stateRef.current.groupId; } },
      spacerId: { get current() { return stateRef.current.spacerId; } },
      annotationId: { get current() { return stateRef.current.annotationId; } },
      annotationIds: { get current() { return stateRef.current.annotationIds; } },
      transactionId: { get current() { return stateRef.current.transactionId; } },
      transactionPhaseId: { get current() { return stateRef.current.transactionPhaseId; } },
      legendSelected: { get current() { return stateRef.current.legendSelected; } },
      transactionIds: { get current() { return stateRef.current.transactionIds; } },
    },
    configure: (effects: SelectionEffects) => { effectsRef.current = effects; },
    selectSignal: (signalId: SignalId, additive = false) => {
      const ids = additive ? new Set(stateRef.current.signalIds) : new Set<SignalId>();
      if (ids.has(signalId)) ids.delete(signalId); else ids.add(signalId);
      if (ids.size === 0) ids.add(signalId);
      selectSignals(ids, signalId);
    },
    selectSignals,
    selectGroup: (groupId: GroupId) => commit({ ...initialState(undefined), groupId }, "group"),
    selectSpacer: (groupId: GroupId, spacerId: SpacerId) => commit({ ...initialState(undefined), groupId, spacerId }, "spacer"),
    selectAnnotation: (annotationId: AnnotationId, additive = false) => {
      const ids = additive ? new Set(stateRef.current.annotationIds) : new Set<AnnotationId>();
      if (ids.has(annotationId)) ids.delete(annotationId); else ids.add(annotationId);
      if (ids.size === 0) ids.add(annotationId);
      selectAnnotations(ids, annotationId);
    },
    selectAnnotations,
    selectTransaction: (transactionId: TransactionId, additive = false) => {
      const ids = additive ? new Set(stateRef.current.transactionIds) : new Set<TransactionId>();
      if (ids.has(transactionId)) ids.delete(transactionId); else ids.add(transactionId);
      if (ids.size === 0) ids.add(transactionId);
      commit({ ...initialState(undefined), transactionId, transactionIds: ids }, "transaction");
    },
    selectTransactionPhase: (transactionId: TransactionId, phaseId: TransactionPhaseId) => commit({ ...initialState(undefined), transactionId, transactionIds: new Set([transactionId]), transactionPhaseId: phaseId }, "transaction"),
    selectTransactions: (transactionIds: ReadonlySet<TransactionId>, primary?: TransactionId) => {
      const ids = new Set(transactionIds);
      const transactionId = primary && ids.has(primary) ? primary : [...ids][0];
      commit({ ...initialState(undefined), transactionId, transactionIds: ids }, transactionId === undefined ? "none" : "transaction");
    },
    selectLegend: () => commit({ ...initialState(undefined), legendSelected: true }, "legend"),
    selectTarget: (target: Partial<Omit<SelectionState, "signalIds" | "annotationIds" | "transactionIds">> & { signalIds?: ReadonlySet<SignalId>; annotationIds?: ReadonlySet<AnnotationId>; transactionIds?: ReadonlySet<TransactionId> }) => {
      const next = { ...initialState(undefined), ...target, signalIds: new Set(target.signalIds ?? []), annotationIds: new Set(target.annotationIds ?? (target.annotationId ? [target.annotationId] : [])), transactionIds: new Set(target.transactionIds ?? (target.transactionId ? [target.transactionId] : [])) };
      const kind: SelectionKind = next.signalId ? "signal" : next.groupId ? "group" : next.spacerId ? "spacer" : next.annotationId ? "annotation" : next.transactionId ? "transaction" : next.legendSelected ? "legend" : "none";
      commit(next, kind);
    },
    replace,
    clear: () => commit(initialState(undefined), "none"),
  } as const;
}

export type SelectionOwner = ReturnType<typeof useSelectionOwner>;
