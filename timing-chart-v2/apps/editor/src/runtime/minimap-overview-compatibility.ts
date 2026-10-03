export type SignalMiniMapSource = Readonly<{
  signalGroups: object;
  signalCollection: object;
  cycleCount: number;
}>;

export type SignalMiniMapChange = Readonly<{
  fullDocumentReplace?: boolean;
  rowPresentation?: readonly unknown[];
  rowOrder?: readonly unknown[];
  addedSignals?: readonly unknown[];
  removedSignals?: readonly unknown[];
  addedGroups?: readonly unknown[];
  removedGroups?: readonly unknown[];
  waveSemantics?: readonly unknown[];
  timelineSemantics?: boolean;
  minimapOverview?: boolean;
}>;

/** Keep a rendered overview visible while a non-overview Canonical edit is re-acknowledged. */
export function canRetainSignalMiniMapOverview(
  cached: SignalMiniMapSource | undefined,
  current: SignalMiniMapSource,
  change: SignalMiniMapChange | undefined,
): boolean {
  if (!cached || cached.signalGroups !== current.signalGroups || cached.cycleCount !== current.cycleCount) return false;
  if (cached.signalCollection === current.signalCollection) return true;
  if (!change || change.fullDocumentReplace === true || change.timelineSemantics === true || change.minimapOverview === true) return false;
  if (change.rowOrder !== undefined || change.addedSignals !== undefined || change.removedSignals !== undefined
    || change.addedGroups !== undefined || change.removedGroups !== undefined) return false;
  return change.waveSemantics === undefined || change.waveSemantics.length === 0;
}
