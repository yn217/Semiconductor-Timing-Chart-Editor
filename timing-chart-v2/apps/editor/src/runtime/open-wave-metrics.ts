/** Fixed-size counters accumulated only while an Open/New presentation is active. */
export type OpenWaveBatchMetrics = Readonly<{
  batchWallMs: number;
  waveJsonPreparationMs: number;
  renderAwaitMs: number;
  renderCount: number;
  cooperativeYieldCount: number;
  cooperativeYieldWaitMs: number;
  requestedCount: number;
  /** Jobs that passed the pre-run freshness guard and executed (including duplicate owner requests). */
  requiredNowCount: number;
  deferredCount: number;
  skippedStaleBeforeRunCount: number;
  /** Subset of required-now jobs that became stale after executing. */
  staleAfterRunCount: number;
  /** Successful SVG/artifact installs that occurred before first presentation readiness. */
  artifactInstallsBeforePresentationReady: number;
  /** Progressive artifacts prepared but rejected because reprojection made their request stale. */
  staleProgressiveInstallPreventedCount: number;
  /** Contextual overlap: duplicate owner requests remain included in scheduler outcome counts. */
  duplicateOwnerRequestCount: number;
  /** Reuses an exact WaveDrom artifact across equivalent signals; owner SVG installation remains per signal. */
  reusedMarkupCount: number;
  markupCacheMissCount: number;
  waveJsonBytes: number;
  semanticValuesBytes: number;
  svgMarkupBytes: number;
  cacheKeySerializeMs: number;
  waveDromRenderAnyMs: number;
  onmlStringifyMs: number;
  valueLabelLayoutMs: number;
  markupSafetyMs: number;
  templateParseMs: number;
  svgSafetyDomWalkMs: number;
  domInstallMs: number;
  totalSignalWallMs: number;
}>;
