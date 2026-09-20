import { useEffect, type MutableRefObject, type RefObject } from "react";
import { refreshTransactionLinkedRows } from "./editor-dom-bridge.js";

type LinkedSignalIds = Parameters<typeof refreshTransactionLinkedRows>[1];

export type PresentationRefreshInput = Readonly<{
  refreshPlayhead: MutableRefObject<() => void>;
  refreshRangeSelectionBand: MutableRefObject<() => void>;
  host: RefObject<HTMLDivElement | null>;
  selectedCycle: number;
  playheadPresentationRevision: number;
  rangePresentationRevision: number;
  timelineRange: unknown;
  rangeSelectionActive: boolean;
  zoom: number;
  leftPaneWidth: number;
  frozenPaneWidth: number;
  inspectorWidth: number;
  selectedTransactionId: string | undefined;
  selectedLinkedSignals: readonly (LinkedSignalIds extends ReadonlySet<infer T> ? T : never)[] | undefined;
}>;

/**
 * Owner of the view-only overlay refresh effects that follow presentation state (#615): the playhead,
 * the range-selection band and the Transaction-linked signal row highlight. Each effect only repaints
 * imperative overlay DOM; none of them mutates Canonical, History or Dirty.
 */
export function useOverlayPresentationRefresh(input: PresentationRefreshInput): void {
  const { refreshPlayhead, refreshRangeSelectionBand, host } = input;
  useEffect(() => {
    refreshPlayhead.current();
  }, [input.selectedCycle, input.playheadPresentationRevision, input.zoom, input.leftPaneWidth, input.frozenPaneWidth, input.inspectorWidth, refreshPlayhead]);
  useEffect(() => {
    refreshRangeSelectionBand.current();
  }, [input.rangePresentationRevision, input.timelineRange, input.rangeSelectionActive, input.zoom, input.leftPaneWidth, input.frozenPaneWidth, input.inspectorWidth, refreshRangeSelectionBand]);
  const linkedKey = input.selectedLinkedSignals?.join("\u0000") ?? "";
  useEffect(() => {
    refreshTransactionLinkedRows(host, new Set(input.selectedLinkedSignals ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the joined ids, like the inline effect it replaced
  }, [input.selectedTransactionId, linkedKey, host]);
}
