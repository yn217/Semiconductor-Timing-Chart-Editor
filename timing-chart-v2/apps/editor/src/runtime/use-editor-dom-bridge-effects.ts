import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ViewMetricsOwner } from "./view-metrics.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { refreshTreeCollapsedMetadata, refreshTreeFilterPresentation, refreshTreeRovingFocus } from "../minimal-cycle-view-ui.js";
import { refreshRulerRangeSelection } from "./editor-dom-bridge.js";
import { applyRendererHostSizing } from "./renderer-host-sizing.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

export function useEditorDomBridgeEffects(input: {
  readonly host: RefObject<HTMLDivElement | null>;
  readonly ruler: RefObject<HTMLDivElement | null>;
  readonly viewport: RefObject<HTMLDivElement | null>;
  readonly timelineRuntimeRef: RefObject<TimelineViewportRuntime | null>;
  readonly viewMetricsOwner: ViewMetricsOwner;
  readonly treeFilter: string;
  readonly treeTypeFilter: string;
  readonly treePresentationRevision: number;
  readonly collapsedGroupIds: ReadonlySet<string>;
  readonly treeFocusRowIdRef: RefObject<string | undefined>;
  readonly selectedSignalId: string | undefined;
  readonly selectedGroupId: string | undefined;
  readonly rangeSelectionActive: boolean;
  readonly timelineRange: TimelineRange;
  readonly rangePresentationRevision: number;
  readonly cyclesPerTc: number;
  readonly leftPaneWidth: number;
  readonly frozenPaneWidth: number;
  readonly inspectorWidth: number;
}) {
  const previousCyclesPerTcRef = useRef(input.cyclesPerTc);
  useEffect(() => {
    refreshTreeFilterPresentation(input.host, input.treeFilter, input.treeTypeFilter);
  }, [input.treePresentationRevision, input.treeFilter, input.treeTypeFilter, input.collapsedGroupIds]);
  useEffect(() => {
    refreshTreeCollapsedMetadata(input.host, input.collapsedGroupIds);
  }, [input.treePresentationRevision, input.collapsedGroupIds]);
  useEffect(() => {
    refreshTreeRovingFocus(input.host, input.treeFocusRowIdRef);
  }, [input.treePresentationRevision, input.treeFilter, input.collapsedGroupIds, input.selectedSignalId, input.selectedGroupId]);
  useEffect(() => {
    refreshRulerRangeSelection(input.ruler, input.rangeSelectionActive, input.timelineRange);
  }, [input.rangeSelectionActive, input.timelineRange, input.rangePresentationRevision]);
  useEffect(() => {
    if (input.timelineRuntimeRef.current) input.timelineRuntimeRef.current.onViewportResize();
    else applyRendererHostSizing({ host: input.host, viewport: input.viewport, metrics: input.viewMetricsOwner.snapshot() });
  }, [input.viewMetricsOwner, input.leftPaneWidth, input.frozenPaneWidth, input.inspectorWidth]);
  useEffect(() => {
    if (previousCyclesPerTcRef.current === input.cyclesPerTc) return;
    previousCyclesPerTcRef.current = input.cyclesPerTc;
    input.timelineRuntimeRef.current?.refreshRuler();
    input.timelineRuntimeRef.current?.refreshGrid();
  }, [input.cyclesPerTc]);
}
