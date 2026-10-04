import type { CanonicalDocument, GroupId, SignalGroupStyle, SignalId } from "@timing-chart-v2/schema";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { RenderProjection, VirtualizationWindow } from "@timing-chart-v2/projection";
import type { ProjectionCoordinator } from "./projection-coordinator.js";
import { refreshGroupStylePreview } from "./presentation-preview.js";
import { buildViewportWindow } from "./viewport-window.js";

/** Owns the transient Group-style projection and its canonical commit/restore lifecycle. */
export function createGroupStylePreviewOwner(input: Readonly<{
  coordinator: ProjectionCoordinator;
  host: HTMLElement;
  viewport: HTMLDivElement;
  getSnapshot: () => CanonicalSnapshot;
  getPinnedRowIds: () => readonly SignalId[];
  getCollapsedGroupIds: () => readonly GroupId[];
  renderer: Readonly<{ update: (projection: RenderProjection) => void }>;
  refreshRange: () => void;
  refreshOverlays: () => void;
  publishState: () => void;
  publishProjection: (window: VirtualizationWindow, projection: RenderProjection) => void;
  requestProjection: () => void;
}>) {
  let previewGroupId: GroupId | undefined;
  let acceptedGroupId: GroupId | undefined;
  return {
    preview(groupId: GroupId, style: SignalGroupStyle | undefined): void {
      previewGroupId = style === undefined ? undefined : groupId;
      input.coordinator.setGroupStylePreview(groupId, style);
      input.requestProjection();
    },
    beginAcceptedCommand(): void {
      acceptedGroupId = previewGroupId;
      if (acceptedGroupId !== undefined) input.coordinator.setGroupStylePreview(acceptedGroupId, undefined);
      previewGroupId = undefined;
    },
    restoreCanonicalStyle(document: CanonicalDocument): void {
      if (acceptedGroupId === undefined) return;
      refreshGroupStylePreview(input.host, acceptedGroupId, document.signalGroups.find((group) => group.id === acceptedGroupId)?.style, false);
      acceptedGroupId = undefined;
    },
    render(previous: RenderProjection): void {
      const snapshot = input.getSnapshot();
      const window = buildViewportWindow(input.viewport, snapshot.document.timeline.referenceClock, input.getPinnedRowIds());
      const projection = input.coordinator.project({ snapshot, changeSet: {}, viewport: window, previous, collapsedGroupIds: [...input.getCollapsedGroupIds()] });
      input.publishProjection(window, projection);
      input.renderer.update(projection);
      input.refreshRange();
      input.refreshOverlays();
      input.publishState();
    },
  };
}
