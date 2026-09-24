export interface SignalPinWorkspaceState<SignalId> {
  readonly epoch: number | undefined;
  readonly ids: readonly SignalId[];
}

export function pinnedSignalIdsForEpoch<SignalId>(state: SignalPinWorkspaceState<SignalId>, currentEpoch: number | undefined): readonly SignalId[] {
  return state.epoch === currentEpoch ? state.ids : [];
}

export function signalPinStateForEpoch<SignalId>(epoch: number | undefined, ids: readonly SignalId[]): SignalPinWorkspaceState<SignalId> {
  return { epoch, ids: [...new Set(ids)] };
}
