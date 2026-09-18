import type { KeyboardEvent, MutableRefObject, PointerEvent } from "react";
import type { PaneResizeGesture, RatioResizeGesture, VerticalResizeGesture } from "../workspace/use-workspace-ui-state.js";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH } from "../workspace/use-workspace-ui-state.js";
import { resolveCombinedSplitConstraints } from "../workspace/combined-split-constraints.js";

export interface EditorResizeActionsInput {
  readonly bottomResizeRef: MutableRefObject<VerticalResizeGesture | undefined>;
  readonly bottomHeight: number;
  readonly setBottomHeight: (value: number | ((current: number) => number)) => void;
  readonly signalSplitResizeRef: MutableRefObject<RatioResizeGesture | undefined>;
  readonly signalSplitRatio: number;
  readonly setSignalSplitRatio: (value: number | ((current: number) => number)) => void;
  readonly inspectorResizeRef: MutableRefObject<PaneResizeGesture | undefined>;
  readonly inspectorWidth: number;
  readonly setInspectorWidth: (value: number | ((current: number) => number)) => void;
  readonly leftPaneResizeRef: MutableRefObject<PaneResizeGesture | undefined>;
  readonly leftPaneWidth: number;
  readonly setLeftPaneWidth: (value: number | ((current: number) => number)) => void;
  readonly frozenPaneResizeRef: MutableRefObject<PaneResizeGesture | undefined>;
  readonly frozenPaneWidth: number;
  readonly frozenPaneMinWidth: number;
  readonly setFrozenPaneWidth: (value: number | ((current: number) => number)) => void;
}

export function useEditorResizeActions(input: EditorResizeActionsInput) {
  const startBottomResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    input.bottomResizeRef.current = { startY: event.clientY, startHeight: input.bottomHeight };
  };
  const moveBottomResize = (event: PointerEvent<HTMLDivElement>) => {
    const resize = input.bottomResizeRef.current;
    if (!resize) return;
    const nextHeight = Math.max(180, Math.min(420, resize.startHeight - (event.clientY - resize.startY)));
    if (nextHeight !== input.bottomHeight) input.setBottomHeight(nextHeight);
  };
  const finishBottomResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!input.bottomResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    input.bottomResizeRef.current = undefined;
  };
  const resizeBottomByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    input.setBottomHeight((current) => Math.max(180, Math.min(420, current + delta)));
  };
  const startSignalSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const isCombinedSplitter = event.currentTarget.dataset.testid === "combined-split-divider";
    const containerHeight = isCombinedSplitter ? container.clientHeight : container.getBoundingClientRect().height;
    const constraints = isCombinedSplitter ? resolveCombinedSplitConstraints(containerHeight) : undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    input.signalSplitResizeRef.current = {
      startY: event.clientY,
      startRatio: constraints ? Math.max(constraints.minRatio, Math.min(constraints.maxRatio, input.signalSplitRatio)) : input.signalSplitRatio,
      containerHeight,
      ...(constraints ? { minRatio: constraints.minRatio, maxRatio: constraints.maxRatio } : {}),
    };
  };
  const moveSignalSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    const resize = input.signalSplitResizeRef.current;
    if (!resize || resize.containerHeight <= 0) return;
    const nextRatio = Math.max(resize.minRatio ?? 0.15, Math.min(resize.maxRatio ?? 0.85, resize.startRatio + (event.clientY - resize.startY) / resize.containerHeight));
    if (nextRatio !== input.signalSplitRatio) input.setSignalSplitRatio(nextRatio);
  };
  const finishSignalSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!input.signalSplitResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    input.signalSplitResizeRef.current = undefined;
  };
  const resizeSignalSplitByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const delta = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    const isCombinedSplitter = event.currentTarget.dataset.testid === "combined-split-divider";
    const constraints = isCombinedSplitter && event.currentTarget.parentElement
      ? resolveCombinedSplitConstraints(event.currentTarget.parentElement.clientHeight)
      : { minRatio: 0.15, maxRatio: 0.85 };
    input.setSignalSplitRatio((current) => Math.max(constraints.minRatio, Math.min(constraints.maxRatio, current + delta)));
  };
  const startInspectorResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    input.inspectorResizeRef.current = { startX: event.clientX, startWidth: input.inspectorWidth };
  };
  const moveInspectorResize = (event: PointerEvent<HTMLDivElement>) => {
    const resize = input.inspectorResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(240, Math.min(420, resize.startWidth - (event.clientX - resize.startX)));
    if (nextWidth !== input.inspectorWidth) input.setInspectorWidth(nextWidth);
  };
  const finishInspectorResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!input.inspectorResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    input.inspectorResizeRef.current = undefined;
  };
  const resizeInspectorByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    input.setInspectorWidth((current) => Math.max(240, Math.min(420, current + delta)));
  };
  const startLeftPaneResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    input.leftPaneResizeRef.current = { startX: event.clientX, startWidth: input.leftPaneWidth };
  };
  const moveLeftPaneResize = (event: PointerEvent<HTMLDivElement>) => {
    const resize = input.leftPaneResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(LEFT_PANE_MIN_WIDTH, Math.min(LEFT_PANE_MAX_WIDTH, resize.startWidth + (event.clientX - resize.startX)));
    if (nextWidth !== input.leftPaneWidth) input.setLeftPaneWidth(nextWidth);
  };
  const finishLeftPaneResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!input.leftPaneResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    input.leftPaneResizeRef.current = undefined;
  };
  const resizeLeftPaneByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    input.setLeftPaneWidth((current) => Math.max(LEFT_PANE_MIN_WIDTH, Math.min(LEFT_PANE_MAX_WIDTH, current + delta)));
  };
  const startFrozenPaneResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    input.frozenPaneResizeRef.current = { startX: event.clientX, startWidth: input.frozenPaneWidth };
  };
  const moveFrozenPaneResize = (event: PointerEvent<HTMLDivElement>) => {
    const resize = input.frozenPaneResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(input.frozenPaneMinWidth, Math.min(360, resize.startWidth + (event.clientX - resize.startX)));
    if (nextWidth !== input.frozenPaneWidth) input.setFrozenPaneWidth(nextWidth);
  };
  const finishFrozenPaneResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!input.frozenPaneResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    input.frozenPaneResizeRef.current = undefined;
  };
  const resizeFrozenPaneByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    input.setFrozenPaneWidth(Math.max(input.frozenPaneMinWidth, Math.min(360, input.frozenPaneWidth + delta)));
  };

  return {
    startBottomResize, moveBottomResize, finishBottomResize, resizeBottomByKeyboard,
    startSignalSplitResize, moveSignalSplitResize, finishSignalSplitResize, resizeSignalSplitByKeyboard,
    startInspectorResize, moveInspectorResize, finishInspectorResize, resizeInspectorByKeyboard,
    startLeftPaneResize, moveLeftPaneResize, finishLeftPaneResize, resizeLeftPaneByKeyboard,
    startFrozenPaneResize, moveFrozenPaneResize, finishFrozenPaneResize, resizeFrozenPaneByKeyboard,
  } as const;
}
