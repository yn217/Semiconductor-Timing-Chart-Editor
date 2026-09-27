import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { GroupId, SignalId } from "@timing-chart-v2/schema";
import type { RenderProjection, VirtualizationWindow } from "@timing-chart-v2/projection";
import { buildViewportWindow } from "./viewport-window.js";
import type { ProjectionCoordinator } from "./projection-coordinator.js";
import type { RenderCoordinator } from "./render-coordinator.js";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";

export function projectViewportWindow({
  viewport,
  referenceClock,
  stickyRowIds = [],
  snapshot,
  previous,
  projectionCoordinator,
  collapsedGroupIds,
  onProjection,
}: {
  readonly viewport: HTMLElement;
  readonly referenceClock: SignalId | undefined;
  readonly stickyRowIds?: readonly SignalId[];
  readonly snapshot: CanonicalSnapshot;
  readonly previous: Readonly<{ readonly window: VirtualizationWindow; readonly projection: RenderProjection }>;
  readonly projectionCoordinator: Pick<ProjectionCoordinator, "project">;
  readonly collapsedGroupIds: readonly GroupId[];
  readonly onProjection: (projection: RenderProjection, window: VirtualizationWindow, mountedSignalsChanged: boolean) => void;
}): void {
  const nextWindow = buildViewportWindow(viewport, referenceClock, stickyRowIds);
  const nextStickyRowIds = nextWindow.stickyRowIds ?? [];
  const stickyRowsChanged = nextStickyRowIds.length !== (previous.window.stickyRowIds?.length ?? 0)
    || nextStickyRowIds.some((rowId, index) => rowId !== previous.window.stickyRowIds?.[index]);
  const pinnedRowsChanged = nextWindow.pinnedRowIds.length !== previous.window.pinnedRowIds.length
    || nextWindow.pinnedRowIds.some((rowId, index) => rowId !== previous.window.pinnedRowIds[index]);
  if (nextWindow.viewportStartY === previous.window.viewportStartY
    && nextWindow.viewportEndY === previous.window.viewportEndY
    && !stickyRowsChanged
    && !pinnedRowsChanged) {
    // Vertical row virtualization is unchanged, but a horizontal-only scroll
    // still moves each wave-owner's bounded source window (see
    // `getSourceWindow`, keyed off `viewport.scrollLeft`). Re-publish the same
    // projection so the renderer's per-owner `sourceWindowChanged` check (the
    // only thing that re-queues a bounded WaveDrom re-render) gets a chance to
    // run; without this call horizontal scroll never triggers it at all.
    onProjection(previous.projection, previous.window, false);
    return;
  }
  const nextProjection = projectionCoordinator.project({ snapshot, changeSet: {}, viewport: nextWindow, previous: previous.projection, collapsedGroupIds });
  const oldMounted = previous.projection.mountedSignalIds;
  const nextMounted = nextProjection.mountedSignalIds;
  const mountedSignalsChanged = oldMounted.length !== nextMounted.length || oldMounted.some((signalId: string, index: number) => signalId !== nextMounted[index]);
  onProjection(nextProjection, nextWindow, mountedSignalsChanged);
}

export function mountInitialTimelineProjection(context: {
  readonly coordinator: Pick<RenderCoordinator, "mount">;
  readonly renderer: Pick<TimingChartRenderer, "update">;
  readonly host: HTMLElement;
  readonly viewport: HTMLElement;
  readonly referenceClock: SignalId | undefined;
  readonly stickyRowIds?: readonly SignalId[];
  readonly projectionCoordinator: Pick<ProjectionCoordinator, "project">;
  readonly snapshot: CanonicalSnapshot;
  readonly collapsedGroupIds: readonly GroupId[];
  /**
   * For large/windowed documents, mount the geometry-owner waveform first.
   * The reference-geometry-ready callback will reproject and mount the full
   * viewport set with authoritative source windows.
   */
  readonly initialWaveSignalIds?: readonly SignalId[];
}): { readonly window: VirtualizationWindow; readonly projection: RenderProjection } {
  context.coordinator.mount(context.host);
  const window = buildViewportWindow(context.viewport, context.referenceClock, context.stickyRowIds);
  const projection = context.projectionCoordinator.project({ snapshot: context.snapshot, changeSet: { fullDocumentReplace: true }, viewport: window, collapsedGroupIds: context.collapsedGroupIds });
  const initialWaveSignalIds = context.initialWaveSignalIds;
  const referenceWaveIsMounted = initialWaveSignalIds?.some((signalId) => projection.mountedSignalIds.includes(signalId)) === true;
  // New mounted owners are normally queued automatically by the renderer.
  // Restrict only this initial bootstrap update so a provisional/thinned
  // projection does not enqueue every visible WaveDrom owner before reference
  // geometry triggers the authoritative reproject. Keep the full projection
  // as the returned/shared value; the follow-up renderer update mounts every
  // visible owner normally.
  context.renderer.update(referenceWaveIsMounted
    ? { ...projection, mountedSignalIds: projection.mountedSignalIds.filter((signalId) => initialWaveSignalIds!.includes(signalId)) }
    : projection);
  return { window, projection };
}
