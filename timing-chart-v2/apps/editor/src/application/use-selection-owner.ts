import { useRef, useState } from "react";
import type { AnnotationId, GroupId, SignalId, SpacerId, TransactionId } from "@timing-chart-v2/schema";

export type SelectionState = Readonly<{
  signalId: SignalId | undefined;
  signalIds: ReadonlySet<SignalId>;
  groupId: GroupId | undefined;
  spacerId: SpacerId | undefined;
  annotationId: AnnotationId | undefined;
  annotationIds: ReadonlySet<AnnotationId>;
  transactionId: TransactionId | undefined;
}>;
type SelectionKind = "signal" | "group" | "spacer" | "annotation" | "transaction" | "none";
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
  };
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
    selectTransaction: (transactionId: TransactionId) => commit({ ...initialState(undefined), transactionId }, "transaction"),
    selectTarget: (target: Partial<Omit<SelectionState, "signalIds" | "annotationIds">> & { signalIds?: ReadonlySet<SignalId>; annotationIds?: ReadonlySet<AnnotationId> }) => {
      const next = { ...initialState(undefined), ...target, signalIds: new Set(target.signalIds ?? []), annotationIds: new Set(target.annotationIds ?? (target.annotationId ? [target.annotationId] : [])) };
      const kind: SelectionKind = next.signalId ? "signal" : next.groupId ? "group" : next.spacerId ? "spacer" : next.annotationId ? "annotation" : next.transactionId ? "transaction" : "none";
      commit(next, kind);
    },
    replace,
    clear: () => commit(initialState(undefined), "none"),
  } as const;
}

export type SelectionOwner = ReturnType<typeof useSelectionOwner>;
