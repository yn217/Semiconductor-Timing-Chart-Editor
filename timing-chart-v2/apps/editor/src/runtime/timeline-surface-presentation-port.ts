import type { MutableRefObject } from "react";
import type { AnnotationId, GroupId, SignalGroupStyle, SignalId } from "@timing-chart-v2/schema";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import type { SelectedClockEdge } from "./edge-counter-projection.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

/** Runtime bridge owned by presentation state; semantic document and selection stay shared. */
export interface TimelineSurfacePresentationPort {
  readonly getPinnedSignalIds: () => readonly SignalId[];
  readonly collapsedGroupIdsRef: MutableRefObject<ReadonlySet<GroupId>>;
  readonly applyCollapsedGroupsRef: MutableRefObject<(ids: ReadonlySet<GroupId>) => void>;
  readonly forceUpperReprojectRef: MutableRefObject<() => void>;
  readonly reapplySelectionRef: MutableRefObject<() => void>;
  readonly lowerCanvasClickRef: MutableRefObject<(event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void>;
  readonly timelineRuntimeRef: MutableRefObject<TimelineViewportRuntime | null>;
  readonly armArrowPick: MutableRefObject<(annotationType: "arrow" | "dependency") => void>;
  readonly snapTransactionCycle: MutableRefObject<(clientX: number, surfaceLeft?: number, horizontalScroll?: number) => number | undefined>;
  readonly transactionBoundaryX: MutableRefObject<(cycle: number) => number | undefined>;
  readonly transactionSourceWindow: MutableRefObject<(viewport: HTMLElement) => Readonly<{ start: number; end: number }> | undefined>;
  readonly refreshPlayhead: MutableRefObject<() => void>;
  readonly refreshRangeSelectionBand: MutableRefObject<() => void>;
  readonly publishStateRef: MutableRefObject<() => void>;
  readonly timelineRangeRef: MutableRefObject<TimelineRange>;
  readonly rangeSelectionActiveRef: MutableRefObject<boolean>;
  readonly selectedCycleRef: MutableRefObject<number>;
  readonly selectedEdgeRef: MutableRefObject<SelectedClockEdge | undefined>;
  readonly selectedAnnotationRef: MutableRefObject<AnnotationId | undefined>;
  readonly gridEnabledRef: MutableRefObject<boolean>;
  readonly snapEnabledRef: MutableRefObject<boolean>;
  readonly treeFocusRowIdRef: MutableRefObject<string | undefined>;
  readonly suppressCanvasClickRef: MutableRefObject<boolean>;
  readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
  readonly transactionCyclesPerTcRef: MutableRefObject<number>;
  readonly groupStylePreviewRef: MutableRefObject<(groupId: GroupId, style: SignalGroupStyle | undefined) => void>;
}
