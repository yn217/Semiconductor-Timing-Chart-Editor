import type { ChangeSet } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { ViewTransform } from "@timing-chart-v2/geometry";
import type { GroupId, JsonObject, RowId, SignalGroupStyle, SignalId, SignalRole } from "@timing-chart-v2/schema";

export interface RowLayoutEntry {
  readonly rowId: RowId;
  readonly groupId: GroupId;
  readonly groupName: string;
  readonly groupStyle?: SignalGroupStyle;
  readonly kind: "timing" | "comment" | "spacer";
  readonly name: string;
  readonly commentTitle?: string;
  readonly commentBody?: string;
  readonly role?: SignalRole;
  readonly signalType?: import("@timing-chart-v2/schema").Signal["type"];
  readonly displayStyle?: JsonObject;
  readonly displayAlign?: "left" | "center" | "right";
  readonly displayOverflow?: "expand" | "ellipsis" | "wrap";
  readonly visible: boolean;
  /** User-pinned view row. Presentation-only; canonical row order is unchanged. */
  readonly pinned?: boolean;
  readonly instancePath?: readonly string[];
  readonly fullPath?: string;
  readonly y: number;
  readonly height: number;
}

export interface GroupHeaderLayoutEntry {
  readonly rowId: RowId;
  readonly groupId: GroupId;
  readonly groupName: string;
  readonly groupStyle?: SignalGroupStyle;
  readonly collapsed: boolean;
  readonly y: number;
  readonly height: number;
}

export interface RenderProjection {
  readonly documentEpoch: number;
  readonly revision: number;
  readonly canonicalRowIds: readonly RowId[];
  /** Rows retained by the Left Tree projection, including hidden signals. */
  readonly navigationRowLayout: readonly RowLayoutEntry[];
  readonly visibleRowIds: readonly RowId[];
  readonly mountedRowIds: readonly RowId[];
  readonly leftRowIds: readonly RowId[];
  readonly frozenLabelRowIds: readonly RowId[];
  readonly timingRowIds: readonly RowId[];
  readonly rowLayout: readonly RowLayoutEntry[];
  readonly groupHeaders: readonly GroupHeaderLayoutEntry[];
  readonly leftGroupHeaders: readonly GroupHeaderLayoutEntry[];
  readonly mountedGroupHeaderIds: readonly RowId[];
  readonly mountedLeftGroupHeaderIds: readonly RowId[];
  readonly canonicalSignalIds: readonly SignalId[];
  readonly mountedSignalIds: readonly SignalId[];
  readonly waveSignalIds: readonly SignalId[];
  readonly totalHeight: number;
  readonly navigationTotalHeight: number;
  /** View-only filter state for the virtualized Left Tree, projected from the complete row model. */
  readonly signalTreeFilter: string;
  readonly signalTreeTypeFilter: "all" | "input" | "output" | "wire" | "comment";
  /** Matching non-comment Signal count across the complete canonical tree, not only mounted rows. */
  readonly matchingSignalCount: number;
  readonly transform: ViewTransform;
  readonly collapsedGroupIds: readonly GroupId[];
}

export interface VirtualizationWindow {
  readonly viewportStartY: number;
  readonly viewportEndY: number;
  readonly overscanBefore: number;
  readonly overscanAfter: number;
  readonly pinnedRowIds: readonly RowId[];
  /** Stable IDs whose visible rows stay at the top of the scrolling surfaces. */
  readonly stickyRowIds?: readonly RowId[];
}

export interface ProjectionRequest {
  readonly snapshot: CanonicalSnapshot;
  readonly changeSet: ChangeSet;
  readonly viewport: VirtualizationWindow;
  readonly previous?: RenderProjection;
  readonly collapsedGroupIds?: readonly GroupId[];
  readonly signalTreeFilter?: string;
  readonly signalTreeTypeFilter?: RenderProjection["signalTreeTypeFilter"];
}

export interface ProjectionService {
  project(request: ProjectionRequest): RenderProjection;
  diagnostics(): Readonly<{ projectionBuilds: number; rowLayoutBuilds: number; lastMountedRange: readonly [number, number]; groupHeadersVisited: number }>;
}
