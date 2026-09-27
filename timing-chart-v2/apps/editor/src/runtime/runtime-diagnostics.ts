import type { CommandHistorySession } from "@timing-chart-v2/history";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import type { WaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import type { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import type { EdgeCounterProjectionMetrics } from "./edge-counter-projection.js";
import type { ProjectionCoordinator } from "./projection-coordinator.js";
import type { SemanticSnapCandidateService, ImmutableSnapIndex } from "@timing-chart-v2/geometry";
import type { ViewMetricsOwner } from "./view-metrics.js";
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
  recordWaveBatch: (metrics: Readonly<{
    batchWallMs: number;
    renderAwaitMs: number;
    renderCount: number;
    cooperativeYieldCount: number;
    cooperativeYieldWaitMs: number;
  }>) => void;
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
    renderAwaitMs: 0,
    renderCount: 0,
    cooperativeYieldCount: 0,
    cooperativeYieldWaitMs: 0,
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
      waveBatchMetrics.renderAwaitMs += metrics.renderAwaitMs;
      waveBatchMetrics.renderCount += metrics.renderCount;
      waveBatchMetrics.cooperativeYieldCount += metrics.cooperativeYieldCount;
      waveBatchMetrics.cooperativeYieldWaitMs += metrics.cooperativeYieldWaitMs;
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
      waveBatchMetrics.renderAwaitMs = 0;
      waveBatchMetrics.renderCount = 0;
      waveBatchMetrics.cooperativeYieldCount = 0;
      waveBatchMetrics.cooperativeYieldWaitMs = 0;
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
