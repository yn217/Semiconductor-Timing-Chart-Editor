import { useRef, useState } from "react";
import type { AnnotationId, GroupId, SignalId, SpacerId, TransactionId } from "@timing-chart-v2/schema";

type SelectionState = Readonly<{
  signalId: SignalId | undefined;
  signalIds: ReadonlySet<SignalId>;
  groupId: GroupId | undefined;
  spacerId: SpacerId | undefined;
  annotationId: AnnotationId | undefined;
  transactionId: TransactionId | undefined;
}>;

function initialState(signalId: SignalId | undefined): SelectionState {
  return {
    signalId,
    signalIds: signalId === undefined ? new Set() : new Set([signalId]),
    groupId: undefined,
    spacerId: undefined,
    annotationId: undefined,
    transactionId: undefined,
  };
}

/** Single synchronous authority for semantic editor selection and event-handler ref mirrors. */
export function useSelectionOwner(initialSignalId?: SignalId) {
  const [state, setState] = useState<SelectionState>(() => initialState(initialSignalId));
  const stateRef = useRef(state);

  const replace = (next: SelectionState | ((current: SelectionState) => SelectionState)) => {
    const value = typeof next === "function" ? next(stateRef.current) : next;
    stateRef.current = value;
    setState(value);
  };
  const update = (patch: Partial<SelectionState>) => replace((current) => ({ ...current, ...patch }));
  const writeRef = (patch: Partial<SelectionState>) => { stateRef.current = { ...stateRef.current, ...patch }; };

  return {
    state,
    refs: {
      state: stateRef,
      signalId: { get current() { return stateRef.current.signalId; }, set current(value: SignalId | undefined) { writeRef({ signalId: value }); } },
      signalIds: { get current() { return stateRef.current.signalIds; }, set current(value: ReadonlySet<SignalId>) { writeRef({ signalIds: value }); } },
      groupId: { get current() { return stateRef.current.groupId; }, set current(value: GroupId | undefined) { writeRef({ groupId: value }); } },
      spacerId: { get current() { return stateRef.current.spacerId; }, set current(value: SpacerId | undefined) { writeRef({ spacerId: value }); } },
      annotationId: { get current() { return stateRef.current.annotationId; }, set current(value: AnnotationId | undefined) { writeRef({ annotationId: value }); } },
      transactionId: { get current() { return stateRef.current.transactionId; }, set current(value: TransactionId | undefined) { writeRef({ transactionId: value }); } },
    },
    setSignalId: (signalId: SignalId | undefined) => update({ signalId }),
    setSignalIds: (signalIds: ReadonlySet<SignalId>) => update({ signalIds }),
    setGroupId: (groupId: GroupId | undefined) => update({ groupId }),
    setSpacerId: (spacerId: SpacerId | undefined) => update({ spacerId }),
    setAnnotationId: (annotationId: AnnotationId | undefined) => update({ annotationId }),
    setTransactionId: (transactionId: TransactionId | undefined) => update({ transactionId }),
    replace,
    clear: () => replace(initialState(undefined)),
  } as const;
}

export type SelectionOwner = ReturnType<typeof useSelectionOwner>;
