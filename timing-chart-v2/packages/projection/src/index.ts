import type { ChangeSet } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { ViewTransform } from "@timing-chart-v2/geometry";
import type { RowId, SignalId } from "@timing-chart-v2/schema";

export interface RenderProjection {
  readonly revision: number;
  readonly visibleRowIds: readonly RowId[];
  readonly mountedSignalIds: readonly SignalId[];
  readonly transform: ViewTransform;
}

export interface VirtualizationWindow {
  readonly viewportStartY: number;
  readonly viewportEndY: number;
  readonly overscanBefore: number;
  readonly overscanAfter: number;
  readonly pinnedRowIds: readonly RowId[];
}

export interface ProjectionRequest {
  readonly snapshot: CanonicalSnapshot;
  readonly changeSet: ChangeSet;
  readonly viewport: VirtualizationWindow;
  readonly previous?: RenderProjection;
}

export interface ProjectionService {
  project(request: ProjectionRequest): RenderProjection;
}
