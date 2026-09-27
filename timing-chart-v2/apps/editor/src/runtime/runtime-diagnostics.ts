import type { CommandHistorySession } from "@timing-chart-v2/history";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import type { WaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import type { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import type { EdgeCounterProjectionMetrics } from "./edge-counter-projection.js";
import type { ProjectionCoordinator } from "./projection-coordinator.js";
import type { SemanticSnapCandidateService, ImmutableSnapIndex } from "@timing-chart-v2/geometry";
import type { ViewMetricsOwner } from "./view-metrics.js";
import type { OpenWaveBatchMetrics } from "./open-wave-metrics.js";
export function collectWaveRenderErrors(host: HTMLElement): readonly DocumentProblem[] {
  return [...host.querySelectorAll<HTMLElement>("[data-wave-error]")].map((owner) => ({
    code: "WAVE_RENDER_ERROR",
    path: `$.signals[${owner.dataset.signalId}]`,
    message: owner.dataset.waveError ?? "WaveDrom render failed.",
    severity: "error" as const,
    operation: "waveform.render",
    operationLabel: "Render waveform",
    objectType: "signal",
    ...(owner.dataset.signalId ? { objectId: owner.dataset.signalId } : {}),
    source: "renderer" as const,
    stage: "render" as const,
    recommendation: "Review the affected Signal values or type, then retry the operation or open a supported document.",
    detail: "waveform-render:localized-failure",
  }));
}

export function publishRendererState(host: HTMLElement, session: Pick<CommandHistorySession, "getSnapshot" | "historyState" | "metrics" | "historyMetrics">, viewMetricsOwner: Pick<ViewMetricsOwner, "snapshot">, adapter: WaveDromAdapter, geometryCache: unknown, projectionCoordinator: Pick<ProjectionCoordinator, "currentDocumentEpoch" | "diagnostics">, renderer: Pick<TimingChartRenderer, "diagnosticSummary">, mappingCache: Pick<DisplayTimeMappingCache, "metrics">, snapService: Pick<SemanticSnapCandidateService, "metrics">, snapIndex: ImmutableSnapIndex | undefined, rulerBuilds: number, edgeCounterResolvePasses: number, zoom: number, validatorInvocations: number, edgeCounterMetrics?: EdgeCounterProjectionMetrics): void {
  host.dataset.rendererDiagnosticPublishes = String(Number(host.dataset.rendererDiagnosticPublishes ?? "0") + 1);
  host.dataset.canonicalRevision = String(session.getSnapshot().revision);
  host.dataset.historyDepth = String(session.historyState().undoDepth);
  const metrics = viewMetricsOwner.snapshot();
  host.dataset.viewMetrics = JSON.stringify(metrics);
  const { renderCallsBySignal: _renderCallsBySignal, ...waveAdapter } = adapter.metrics();
  const { last: _lastGeometry, ...geometryExtraction } = adapter.geometryMetrics();
  const projectionDocumentEpoch = projectionCoordinator.currentDocumentEpoch();
  host.dataset.sessionCounters = JSON.stringify({
    ...session.metrics(), ...session.historyMetrics(), ...projectionCoordinator.diagnostics(), projectionDocumentEpoch,
    ...renderer.diagnosticSummary(), rulerBuilds, edgeCounterResolvePasses, ...edgeCounterMetrics, ...mappingCache.metrics(),
    snapIndexBuilds: snapService.metrics().builds, snapCandidateCount: snapService.metrics().candidateCount,
    snapQueries: snapIndex?.metrics().queries ?? 0, snapCandidatesVisited: snapIndex?.metrics().candidatesVisited ?? 0,
    viewMetrics: metrics, waveAdapter, geometryExtraction, zoom, validatorInvocations,
  });
  void geometryCache;
}
export type OpenPhaseTracker = Readonly<{
  mark: (phase: string, phaseTimestamp?: number) => void;
  recordWaveBatch: (metrics: OpenWaveBatchMetrics) => void;
  begin: (commandStartedAt?: number, fileReadStartedAt?: number) => void;
}>;

type OpenReadiness = "opening" | "document-ready" | "presentation-ready" | "visible-waveforms-ready" | "idle";
const OPEN_READINESS_ORDER: readonly OpenReadiness[] = ["opening", "document-ready", "presentation-ready", "visible-waveforms-ready", "idle"];

/** Owns open/first-paint instrumentation for the editor runtime bridge. */
export function createOpenPhaseTracker(rendererHost: HTMLElement, onPresentationReady?: () => void): OpenPhaseTracker {
  const marks: Record<string, number> = {};
  let active = false;
  let rowShellPainted = false;
  let referenceGeometryReady = false;
  let rulerPainted = false;
  let readiness: OpenReadiness = "opening";
  let readinessIndex = 0;
  let presentationReadyNotified = false;
  let visibleWaveformsCompletedAt: number | undefined;
  let idleCompletedAt: number | undefined;
  let diagnosticsCompletedAt: number | undefined;
  const waveBatchMetrics = {
    batchCount: 0,
    batchWallMs: 0,
    waveJsonPreparationMs: 0,
    renderAwaitMs: 0,
    renderCount: 0,
    cooperativeYieldCount: 0,
    cooperativeYieldWaitMs: 0,
    requestedCount: 0,
    requiredNowCount: 0,
    deferredCount: 0,
    skippedStaleBeforeRunCount: 0,
    staleAfterRunCount: 0,
    duplicateOwnerRequestCount: 0,
    reusedMarkupCount: 0,
    markupCacheMissCount: 0,
    waveJsonBytes: 0,
    semanticValuesBytes: 0,
    svgMarkupBytes: 0,
    cacheKeySerializeMs: 0,
    waveDromRenderAnyMs: 0,
    onmlStringifyMs: 0,
    valueLabelLayoutMs: 0,
    markupSafetyMs: 0,
    templateParseMs: 0,
    svgSafetyDomWalkMs: 0,
    domInstallMs: 0,
    totalSignalWallMs: 0,
  };
  const publishWaveBatchMetrics = (): void => {
    rendererHost.dataset.openWaveBatchMetrics = JSON.stringify(waveBatchMetrics);
  };
  const advanceReadiness = (next: OpenReadiness, timestamp: number): void => {
    const nextIndex = OPEN_READINESS_ORDER.indexOf(next);
    // Readiness is an ordered contract even when independent async work
    // finishes out of order. Defer later milestones until their prerequisites
    // have been published instead of skipping a stage permanently.
    if (nextIndex !== readinessIndex + 1) return;
    readiness = next;
    readinessIndex = nextIndex;
    marks[next] = timestamp;
    globalThis.performance.mark(`timing-chart-v2:${next}`);
    rendererHost.dataset.openReadiness = readiness;
    if (next === "presentation-ready") rendererHost.dataset.cycleViewReady = "true";
    if (next === "idle") rendererHost.dataset.editorIdle = "true";
  };
  const mark = (phase: string, phaseTimestamp = globalThis.performance.now()): void => {
    if (!active || marks[phase] !== undefined) return;
    marks[phase] = phaseTimestamp;
    globalThis.performance.mark(`timing-chart-v2:${phase}`);
    if (phase === "canonical-replaced") advanceReadiness("document-ready", phaseTimestamp);
    if (phase === "row-shell-painted") rowShellPainted = true;
    if (phase === "reference-geometry-ready") referenceGeometryReady = true;
    if (phase === "ruler-painted") rulerPainted = true;
    if (rowShellPainted && referenceGeometryReady && rulerPainted) {
      if (marks["first-correct-paint"] === undefined) {
        marks["first-correct-paint"] = phaseTimestamp;
        globalThis.performance.mark("timing-chart-v2:first-correct-paint");
      }
      advanceReadiness("presentation-ready", phaseTimestamp);
      if (visibleWaveformsCompletedAt !== undefined) {
        advanceReadiness("visible-waveforms-ready", visibleWaveformsCompletedAt);
      }
      if (idleCompletedAt !== undefined && diagnosticsCompletedAt !== undefined) advanceReadiness("idle", Math.max(idleCompletedAt, diagnosticsCompletedAt));
      if (!presentationReadyNotified) {
        presentationReadyNotified = true;
        onPresentationReady?.();
      }
    }
    if (phase === "visible-waveforms-ready") {
      visibleWaveformsCompletedAt = phaseTimestamp;
      advanceReadiness("visible-waveforms-ready", phaseTimestamp);
    }
    if (phase === "all-visible-idle") {
      idleCompletedAt = phaseTimestamp;
      if (diagnosticsCompletedAt !== undefined && readinessIndex >= 3) advanceReadiness("idle", Math.max(phaseTimestamp, diagnosticsCompletedAt));
    }
    if (phase === "diagnostics-ready") {
      diagnosticsCompletedAt = phaseTimestamp;
      if (idleCompletedAt !== undefined && readinessIndex >= 3) advanceReadiness("idle", Math.max(phaseTimestamp, idleCompletedAt));
    }
    rendererHost.dataset.openPhaseMarks = JSON.stringify(marks);
    const fileReadDurationMs = marks["file-read-start"] !== undefined && marks["file-read-complete"] !== undefined
      ? Math.max(0, marks["file-read-complete"] - marks["file-read-start"]) : undefined;
    const phaseOrigin = marks["open-command-start"];
    const phaseDurationsMs = phaseOrigin === undefined ? {} : Object.fromEntries(Object.entries(marks).map(([name, timestamp]) => [name, Math.max(0, timestamp - phaseOrigin)]));
    rendererHost.dataset.openPhaseDurations = JSON.stringify({ ...phaseDurationsMs, ...(fileReadDurationMs === undefined ? {} : { fileReadDurationMs }) });
  };
  return {
    mark,
    recordWaveBatch(metrics) {
      if (!active) return;
      waveBatchMetrics.batchCount += 1;
      waveBatchMetrics.batchWallMs += metrics.batchWallMs;
      waveBatchMetrics.waveJsonPreparationMs += metrics.waveJsonPreparationMs;
      waveBatchMetrics.renderAwaitMs += metrics.renderAwaitMs;
      waveBatchMetrics.renderCount += metrics.renderCount;
      waveBatchMetrics.cooperativeYieldCount += metrics.cooperativeYieldCount;
      waveBatchMetrics.cooperativeYieldWaitMs += metrics.cooperativeYieldWaitMs;
      waveBatchMetrics.requestedCount += metrics.requestedCount;
      waveBatchMetrics.requiredNowCount += metrics.requiredNowCount;
      waveBatchMetrics.deferredCount += metrics.deferredCount;
      waveBatchMetrics.skippedStaleBeforeRunCount += metrics.skippedStaleBeforeRunCount;
      waveBatchMetrics.staleAfterRunCount += metrics.staleAfterRunCount;
      waveBatchMetrics.duplicateOwnerRequestCount += metrics.duplicateOwnerRequestCount;
      waveBatchMetrics.reusedMarkupCount += metrics.reusedMarkupCount;
      waveBatchMetrics.markupCacheMissCount += metrics.markupCacheMissCount;
      waveBatchMetrics.waveJsonBytes += metrics.waveJsonBytes;
      waveBatchMetrics.semanticValuesBytes += metrics.semanticValuesBytes;
      waveBatchMetrics.svgMarkupBytes += metrics.svgMarkupBytes;
      waveBatchMetrics.cacheKeySerializeMs += metrics.cacheKeySerializeMs;
      waveBatchMetrics.waveDromRenderAnyMs += metrics.waveDromRenderAnyMs;
      waveBatchMetrics.onmlStringifyMs += metrics.onmlStringifyMs;
      waveBatchMetrics.valueLabelLayoutMs += metrics.valueLabelLayoutMs;
      waveBatchMetrics.markupSafetyMs += metrics.markupSafetyMs;
      waveBatchMetrics.templateParseMs += metrics.templateParseMs;
      waveBatchMetrics.svgSafetyDomWalkMs += metrics.svgSafetyDomWalkMs;
      waveBatchMetrics.domInstallMs += metrics.domInstallMs;
      waveBatchMetrics.totalSignalWallMs += metrics.totalSignalWallMs;
      publishWaveBatchMetrics();
    },
    begin(commandStartedAt = globalThis.performance.now(), fileReadStartedAt) {
      active = true;
      readiness = "opening";
      readinessIndex = OPEN_READINESS_ORDER.indexOf(readiness);
      presentationReadyNotified = false;
      visibleWaveformsCompletedAt = undefined;
      idleCompletedAt = undefined;
      diagnosticsCompletedAt = undefined;
      waveBatchMetrics.batchCount = 0;
      waveBatchMetrics.batchWallMs = 0;
      waveBatchMetrics.waveJsonPreparationMs = 0;
      waveBatchMetrics.renderAwaitMs = 0;
      waveBatchMetrics.renderCount = 0;
      waveBatchMetrics.cooperativeYieldCount = 0;
      waveBatchMetrics.cooperativeYieldWaitMs = 0;
      waveBatchMetrics.requestedCount = 0;
      waveBatchMetrics.requiredNowCount = 0;
      waveBatchMetrics.deferredCount = 0;
      waveBatchMetrics.skippedStaleBeforeRunCount = 0;
      waveBatchMetrics.staleAfterRunCount = 0;
      waveBatchMetrics.duplicateOwnerRequestCount = 0;
      waveBatchMetrics.reusedMarkupCount = 0;
      waveBatchMetrics.markupCacheMissCount = 0;
      waveBatchMetrics.waveJsonBytes = 0;
      waveBatchMetrics.semanticValuesBytes = 0;
      waveBatchMetrics.svgMarkupBytes = 0;
      waveBatchMetrics.cacheKeySerializeMs = 0;
      waveBatchMetrics.waveDromRenderAnyMs = 0;
      waveBatchMetrics.onmlStringifyMs = 0;
      waveBatchMetrics.valueLabelLayoutMs = 0;
      waveBatchMetrics.markupSafetyMs = 0;
      waveBatchMetrics.templateParseMs = 0;
      waveBatchMetrics.svgSafetyDomWalkMs = 0;
      waveBatchMetrics.domInstallMs = 0;
      waveBatchMetrics.totalSignalWallMs = 0;
      rowShellPainted = false;
      referenceGeometryReady = false;
      rulerPainted = false;
      for (const key of Object.keys(marks)) delete marks[key];
      delete rendererHost.dataset.openPhaseMarks;
      delete rendererHost.dataset.openPhaseDurations;
      delete rendererHost.dataset.openWaveBatchMetrics;
      rendererHost.dataset.openReadiness = readiness;
      delete rendererHost.dataset.cycleViewReady;
      mark("open-command-start", commandStartedAt);
      mark("open-start", commandStartedAt);
      if (fileReadStartedAt !== undefined) mark("file-read-start", fileReadStartedAt);
    },
  };
}
