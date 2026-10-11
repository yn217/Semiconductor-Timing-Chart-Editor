import { useEffect, useRef } from "react";
import { cancelActiveGesture } from "./active-gesture-cancellation.js";

export function useWaveformPencilLifecycle(input: Readonly<{
  documentEpoch: number;
  activeScenarioId: string | undefined;
  revision: number;
}>) {
  const { documentEpoch, activeScenarioId, revision } = input;
  const previousLifecycle = useRef(`${documentEpoch}:${activeScenarioId ?? "none"}:${revision}`);
  useEffect(() => {
    const lifecycle = `${documentEpoch}:${activeScenarioId ?? "none"}:${revision}`;
    if (previousLifecycle.current !== lifecycle) cancelActiveGesture();
    previousLifecycle.current = lifecycle;
  }, [documentEpoch, activeScenarioId, revision, cancelActiveGesture]);
}
