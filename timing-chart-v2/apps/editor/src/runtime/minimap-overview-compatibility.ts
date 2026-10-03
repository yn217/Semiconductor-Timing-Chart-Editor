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
  annotationPosition?: readonly unknown[];
  annotationStyle?: readonly unknown[];
  annotationOrder?: readonly unknown[];
  annotationGroups?: readonly unknown[];
  bookmarkPosition?: readonly unknown[];
  timeGroupSemantics?: readonly unknown[];
  timelineSemantics?: boolean;
  minimapOverview?: boolean;
}>;

export type SignalMiniMapUpdatePlan =
  | Readonly<{ kind: "reuse" }>
  | Readonly<{ kind: "incremental"; changedSignalIds: readonly unknown[] }>
  | Readonly<{ kind: "rebuild" }>;

/** Decide whether a canonical update changes the Signal MiniMap projection. */
export function planSignalMiniMapOverviewUpdate(
  cached: SignalMiniMapSource | undefined,
  current: SignalMiniMapSource,
  change: SignalMiniMapChange | undefined,
): SignalMiniMapUpdatePlan {
  if (cached?.signalGroups === current.signalGroups && cached.signalCollection === current.signalCollection && cached.cycleCount === current.cycleCount) {
    return { kind: "reuse" };
  }
  if (!cached || cached.signalGroups !== current.signalGroups || cached.cycleCount !== current.cycleCount || !change) return { kind: "rebuild" };
  if (change.fullDocumentReplace === true || change.timelineSemantics === true || change.minimapOverview === true
    || change.rowOrder !== undefined || change.addedSignals !== undefined || change.removedSignals !== undefined
    || change.addedGroups !== undefined || change.removedGroups !== undefined) return { kind: "rebuild" };
  const changedSignalIds = change.waveSemantics;
  return changedSignalIds === undefined || changedSignalIds.length === 0
    ? { kind: "reuse" }
    : { kind: "incremental", changedSignalIds };
}

/** Keep a rendered overview visible while a non-overview Canonical edit is re-acknowledged. */
export function canRetainSignalMiniMapOverview(
  cached: SignalMiniMapSource | undefined,
  current: SignalMiniMapSource,
  change: SignalMiniMapChange | undefined,
): boolean {
  return planSignalMiniMapOverviewUpdate(cached, current, change).kind === "reuse";
}
