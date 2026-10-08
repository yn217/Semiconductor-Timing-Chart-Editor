/** Freshness identity for work targeting the currently projected Scenario. */
export interface ActiveProjectionContext {
  readonly documentEpoch: number;
  readonly projectionGeneration: number;
  readonly revision: number;
}

export function isActiveProjectionContextFresh(captured: ActiveProjectionContext, current: ActiveProjectionContext): boolean {
  return captured.documentEpoch === current.documentEpoch
    && captured.projectionGeneration === current.projectionGeneration
    && captured.revision === current.revision;
}
