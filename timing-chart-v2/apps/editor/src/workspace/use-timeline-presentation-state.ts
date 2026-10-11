import { useCallback, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GroupId, SignalGroupStyle } from "@timing-chart-v2/schema";
import type { SelectedClockEdge } from "../runtime/edge-counter-projection.js";

export type TimelineRange = Readonly<{ start: number; end: number }>;

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export interface TimelinePresentationState {
  readonly collapsedGroupIds: ReadonlySet<GroupId>;
  readonly treePresentationRevision: number;
  readonly playheadPresentationRevision: number;
  readonly transactionPresentationRevision: number;
  readonly rangePresentationRevision: number;
  readonly timelineRange: TimelineRange;
  readonly rangeSelectionActive: boolean;
  readonly selectedCycle: number;
  readonly selectedEdge: SelectedClockEdge | undefined;
  readonly setCollapsedGroups: (next: ReadonlySet<GroupId>) => void;
  readonly resetCollapsedGroups: () => void;
  readonly resetForDocument: (cycleCount: number) => void;
  readonly toggleCollapsedGroup: (id: GroupId) => void;
  readonly setTreePresentationRevision: StateSetter<number>;
  readonly setPlayheadPresentationRevision: StateSetter<number>;
  readonly setTransactionPresentationRevision: StateSetter<number>;
  readonly setRangePresentationRevision: StateSetter<number>;
  readonly setTimelineRange: StateSetter<TimelineRange>;
  readonly setRangeSelectionActive: StateSetter<boolean>;
  readonly setSelectedCycle: StateSetter<number>;
  readonly refs: {
    readonly collapsedGroupIdsRef: MutableRefObject<ReadonlySet<GroupId>>;
    readonly applyCollapsedGroupsRef: MutableRefObject<(ids: ReadonlySet<GroupId>) => void>;
    readonly timelineRangeRef: MutableRefObject<TimelineRange>;
    readonly rangeSelectionActiveRef: MutableRefObject<boolean>;
    readonly selectedCycleRef: MutableRefObject<number>;
    readonly selectedEdgeRef: MutableRefObject<SelectedClockEdge | undefined>;
    readonly groupStylePreviewRef: MutableRefObject<(groupId: GroupId, style: SignalGroupStyle | undefined) => void>;
  };
}

export function useTimelinePresentationState(input: { readonly visualReference: boolean }): TimelinePresentationState {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<GroupId>>(new Set());
  const [treePresentationRevision, setTreePresentationRevision] = useState(0);
  const [playheadPresentationRevision, setPlayheadPresentationRevision] = useState(0);
  const [transactionPresentationRevision, setTransactionPresentationRevision] = useState(0);
  const [rangePresentationRevision, setRangePresentationRevision] = useState(0);
  const collapsedGroupIdsRef = useRef<ReadonlySet<GroupId>>(new Set());
  const applyCollapsedGroupsRef = useRef<(ids: ReadonlySet<GroupId>) => void>(() => undefined);
  const [timelineRangeState, setTimelineRangeState] = useState<TimelineRange>(() => input.visualReference ? { start: 0, end: 1 } : { start: 2, end: 4 });
  const [rangeSelectionActiveState, setRangeSelectionActiveState] = useState(false);
  const [selectedCycleState, setSelectedCycleState] = useState(() => input.visualReference ? 0 : 2);
  const timelineRangeRef = useRef(timelineRangeState);
  const rangeSelectionActiveRef = useRef(rangeSelectionActiveState);
  const selectedCycleRef = useRef(selectedCycleState);
  const selectedEdgeRef = useRef<SelectedClockEdge | undefined>(undefined);
  const groupStylePreviewRef = useRef<(groupId: GroupId, style: SignalGroupStyle | undefined) => void>(() => undefined);
  const setCollapsedGroups = useCallback((next: ReadonlySet<GroupId>) => {
    const stable = new Set(next);
    collapsedGroupIdsRef.current = stable;
    setCollapsedGroupIds(stable);
    applyCollapsedGroupsRef.current(stable);
  }, []);
  const resetCollapsedGroups = useCallback(() => {
    if (collapsedGroupIdsRef.current.size === 0) return;
    const empty = new Set<GroupId>();
    collapsedGroupIdsRef.current = empty;
    setCollapsedGroupIds(empty);
  }, []);
  const resetForDocument = useCallback((cycleCount: number) => {
    if (collapsedGroupIdsRef.current.size > 0) {
      const empty = new Set<GroupId>();
      collapsedGroupIdsRef.current = empty;
      setCollapsedGroupIds(empty);
    }
    const nextRange = { start: 0, end: Math.min(1, Math.max(0, cycleCount)) };
    if (timelineRangeRef.current.start !== nextRange.start || timelineRangeRef.current.end !== nextRange.end) {
      timelineRangeRef.current = nextRange;
      setTimelineRangeState(nextRange);
    }
    if (rangeSelectionActiveRef.current) {
      rangeSelectionActiveRef.current = false;
      setRangeSelectionActiveState(false);
    }
    if (selectedCycleRef.current !== 0) {
      selectedCycleRef.current = 0;
      setSelectedCycleState(0);
    }
    selectedEdgeRef.current = undefined;
  }, []);
  const toggleCollapsedGroup = useCallback((id: GroupId) => {
    const next = new Set(collapsedGroupIdsRef.current);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsedGroups(next);
  }, [setCollapsedGroups]);
  const setTimelineRange = useCallback<StateSetter<TimelineRange>>((next) => {
    const resolved = typeof next === "function" ? next(timelineRangeRef.current) : next;
    timelineRangeRef.current = resolved;
    setTimelineRangeState(resolved);
  }, []);
  const setRangeSelectionActive = useCallback<StateSetter<boolean>>((next) => {
    const resolved = typeof next === "function" ? next(rangeSelectionActiveRef.current) : next;
    rangeSelectionActiveRef.current = resolved;
    setRangeSelectionActiveState(resolved);
  }, []);
  const setSelectedCycle = useCallback<StateSetter<number>>((next) => {
    const resolved = typeof next === "function" ? next(selectedCycleRef.current) : next;
    selectedCycleRef.current = resolved;
    setSelectedCycleState(resolved);
  }, []);

  timelineRangeRef.current = timelineRangeState;
  rangeSelectionActiveRef.current = rangeSelectionActiveState;
  selectedCycleRef.current = selectedCycleState;

  return {
    collapsedGroupIds,
    treePresentationRevision,
    playheadPresentationRevision,
    transactionPresentationRevision,
    rangePresentationRevision,
    timelineRange: timelineRangeState,
    rangeSelectionActive: rangeSelectionActiveState,
    selectedCycle: selectedCycleState,
    selectedEdge: selectedEdgeRef.current,
    setCollapsedGroups,
    resetCollapsedGroups,
    resetForDocument,
    toggleCollapsedGroup,
    setTreePresentationRevision,
    setPlayheadPresentationRevision,
    setTransactionPresentationRevision,
    setRangePresentationRevision,
    setTimelineRange,
    setRangeSelectionActive,
    setSelectedCycle,
    refs: { collapsedGroupIdsRef, applyCollapsedGroupsRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, groupStylePreviewRef },
  };
}
