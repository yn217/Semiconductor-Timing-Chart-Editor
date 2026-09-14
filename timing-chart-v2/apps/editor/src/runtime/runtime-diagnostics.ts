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
  begin: (commandStartedAt?: number, fileReadStartedAt?: number) => void;
}>;

/** Owns open/first-paint instrumentation for the editor runtime bridge. */
export function createOpenPhaseTracker(rendererHost: HTMLElement): OpenPhaseTracker {
  const marks: Record<string, number> = {};
  let active = false;
  let rowShellPainted = false;
  let referenceGeometryReady = false;
  let rulerPainted = false;
  const mark = (phase: string, phaseTimestamp = globalThis.performance.now()): void => {
    if (!active || marks[phase] !== undefined) return;
    marks[phase] = phaseTimestamp;
    globalThis.performance.mark(`timing-chart-v2:${phase}`);
    rendererHost.dataset.openPhaseMarks = JSON.stringify(marks);
    const fileReadDurationMs = marks["file-read-start"] !== undefined && marks["file-read-complete"] !== undefined
      ? Math.max(0, marks["file-read-complete"] - marks["file-read-start"]) : undefined;
    const phaseOrigin = marks["open-command-start"];
    const phaseDurationsMs = phaseOrigin === undefined ? {} : Object.fromEntries(Object.entries(marks).map(([name, timestamp]) => [name, Math.max(0, timestamp - phaseOrigin)]));
    rendererHost.dataset.openPhaseDurations = JSON.stringify({ ...phaseDurationsMs, ...(fileReadDurationMs === undefined ? {} : { fileReadDurationMs }) });
    if (phase === "row-shell-painted") rowShellPainted = true;
    if (phase === "reference-geometry-ready") referenceGeometryReady = true;
    if (phase === "ruler-painted") rulerPainted = true;
    if (rowShellPainted && referenceGeometryReady && rulerPainted) {
      mark("first-correct-paint");
      // Preserve the existing browser readiness contract used by the focused
      // acceptance suites. This is set only after the first correct paint,
      // never merely after a React mount or partial waveform render.
      rendererHost.dataset.cycleViewReady = "true";
    }
  };
  return {
    mark,
    begin(commandStartedAt = globalThis.performance.now(), fileReadStartedAt) {
      active = true;
      rowShellPainted = false;
      referenceGeometryReady = false;
      rulerPainted = false;
      for (const key of Object.keys(marks)) delete marks[key];
      delete rendererHost.dataset.openPhaseMarks;
      delete rendererHost.dataset.openPhaseDurations;
      delete rendererHost.dataset.cycleViewReady;
      mark("open-command-start", commandStartedAt);
      mark("open-start", commandStartedAt);
      if (fileReadStartedAt !== undefined) mark("file-read-start", fileReadStartedAt);
    },
  };
}
