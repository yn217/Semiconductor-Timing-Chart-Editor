import type { ChangeSet } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { ViewTransform } from "@timing-chart-v2/geometry";
import type { GroupId, RowId, SignalId, SignalRole } from "@timing-chart-v2/schema";

export interface RowLayoutEntry {
  readonly rowId: RowId;
  readonly groupId: GroupId;
  readonly groupName: string;
  readonly kind: "timing" | "comment" | "spacer";
  readonly name: string;
  readonly role?: SignalRole;
  readonly instancePath?: readonly string[];
  readonly fullPath?: string;
  readonly y: number;
  readonly height: number;
}

export interface RenderProjection {
  readonly revision: number;
  readonly canonicalRowIds: readonly RowId[];
  readonly visibleRowIds: readonly RowId[];
  readonly mountedRowIds: readonly RowId[];
  readonly leftRowIds: readonly RowId[];
  readonly frozenLabelRowIds: readonly RowId[];
  readonly timingRowIds: readonly RowId[];
  readonly rowLayout: readonly RowLayoutEntry[];
  readonly canonicalSignalIds: readonly SignalId[];
  readonly mountedSignalIds: readonly SignalId[];
  readonly waveSignalIds: readonly SignalId[];
  readonly totalHeight: number;
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
  diagnostics(): Readonly<{ projectionBuilds: number; rowLayoutBuilds: number; lastMountedRange: readonly [number, number] }>;
}
