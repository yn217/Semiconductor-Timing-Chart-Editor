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
  snapshot,
  previous,
  projectionCoordinator,
  collapsedGroupIds,
  onProjection,
}: {
  readonly viewport: HTMLElement;
  readonly referenceClock: SignalId | undefined;
  readonly snapshot: CanonicalSnapshot;
  readonly previous: Readonly<{ readonly window: VirtualizationWindow; readonly projection: RenderProjection }>;
  readonly projectionCoordinator: Pick<ProjectionCoordinator, "project">;
  readonly collapsedGroupIds: readonly GroupId[];
  readonly onProjection: (projection: RenderProjection, window: VirtualizationWindow, mountedSignalsChanged: boolean) => void;
}): void {
  const nextWindow = buildViewportWindow(viewport, referenceClock);
  if (nextWindow.viewportStartY === previous.window.viewportStartY && nextWindow.viewportEndY === previous.window.viewportEndY) return;
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
  readonly projectionCoordinator: Pick<ProjectionCoordinator, "project">;
  readonly snapshot: CanonicalSnapshot;
  readonly collapsedGroupIds: readonly GroupId[];
}): { readonly window: VirtualizationWindow; readonly projection: RenderProjection } {
  context.coordinator.mount(context.host);
  const window = buildViewportWindow(context.viewport, context.referenceClock);
  const projection = context.projectionCoordinator.project({ snapshot: context.snapshot, changeSet: { fullDocumentReplace: true }, viewport: window, collapsedGroupIds: context.collapsedGroupIds });
  context.renderer.update(projection);
  return { window, projection };
}
