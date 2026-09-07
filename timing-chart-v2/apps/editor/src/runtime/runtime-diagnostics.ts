import type { CommandHistorySession } from "@timing-chart-v2/history";
import type { DocumentProblem, CanonicalDocument } from "@timing-chart-v2/schema";
import type { WaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import type { DisplayTimeMappingCache, RenderProjection } from "@timing-chart-v2/projection";
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
    rendererHost.dataset.openPhaseDurations = JSON.stringify(fileReadDurationMs === undefined ? {} : { fileReadDurationMs });
    if (phase === "row-shell-painted") rowShellPainted = true;
    if (phase === "reference-geometry-ready") referenceGeometryReady = true;
    if (phase === "ruler-painted") rulerPainted = true;
    if (rowShellPainted && referenceGeometryReady && rulerPainted) mark("first-correct-paint");
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
      mark("open-command-start", commandStartedAt);
      mark("open-start", commandStartedAt);
      if (fileReadStartedAt !== undefined) mark("file-read-start", fileReadStartedAt);
    },
  };
}
