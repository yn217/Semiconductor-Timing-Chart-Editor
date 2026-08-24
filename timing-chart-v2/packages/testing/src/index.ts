export interface PerformanceCounterExpectation {
  readonly counter: "waveDromRenders" | "localGeometryBuilds" | "rowPositionUpdates" | "overlayUpdates";
  readonly delta: number;
}
