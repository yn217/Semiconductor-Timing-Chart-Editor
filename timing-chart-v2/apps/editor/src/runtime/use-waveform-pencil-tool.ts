import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { cancelActiveGesture } from "./active-gesture-cancellation.js";

export function useWaveformPencilTool(input: Readonly<{
  enabled: boolean;
  enabledRef: MutableRefObject<boolean>;
  setEnabled: (enabled: boolean) => void;
  viewMode: "Cycle" | "Transaction" | "Split";
  hostRef: RefObject<HTMLDivElement | null>;
  documentEpoch: number;
  activeScenarioId: string | undefined;
  revision: number;
}>) {
  const { enabled, enabledRef, setEnabled, viewMode, hostRef, documentEpoch, activeScenarioId, revision } = input;
  const toggle = useCallback(() => {
    if (viewMode !== "Cycle") return;
    const next = !enabledRef.current;
    if (!next) cancelActiveGesture();
    setEnabled(next);
    if (hostRef.current) hostRef.current.dataset.waveformPencil = String(next);
  }, [viewMode, enabledRef, cancelActiveGesture, setEnabled, hostRef]);

  useEffect(() => {
    if (viewMode === "Cycle" || !enabledRef.current) return;
    cancelActiveGesture();
    enabledRef.current = false;
    setEnabled(false);
    if (hostRef.current) hostRef.current.dataset.waveformPencil = "false";
  }, [viewMode, enabledRef, cancelActiveGesture, setEnabled, hostRef]);

  const previousLifecycle = useRef(`${documentEpoch}:${activeScenarioId ?? "none"}:${revision}`);
  useEffect(() => {
    const lifecycle = `${documentEpoch}:${activeScenarioId ?? "none"}:${revision}`;
    if (previousLifecycle.current !== lifecycle) cancelActiveGesture();
    previousLifecycle.current = lifecycle;
  }, [documentEpoch, activeScenarioId, revision, cancelActiveGesture]);

  return {
    toggle,
    secondarySurfaceProps: { waveformPencilEnabled: enabled, waveformPencilAvailable: viewMode === "Cycle", onToggleWaveformPencil: toggle },
    ribbonProps: { waveformPencilEnabled: enabled, onToggleWaveformPencil: toggle },
    interactionPresentationProps: { waveformPencilEnabledRef: enabledRef, setWaveformPencilEnabled: setEnabled },
  };
}
