import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { BOTTOM_PANEL_MAX_HEIGHT, BOTTOM_PANEL_MIN_HEIGHT, clampBottomPanelHeight, maxBottomPanelHeight } from "./bottom-panel-sizing.js";

type SizePreset = "hidden" | "compact" | "expanded";

export function useBottomPanelSizing(
  host: RefObject<HTMLDivElement | null>,
  setRawBottomHeight: Dispatch<SetStateAction<number>>,
  setBottomVisible: (value: boolean | ((current: boolean) => boolean)) => void,
  bottomVisible: boolean,
  bottomHeight: number,
  /** A mode change mounts a new workspace element: the limit must be measured (and observed) on that one. */
  layoutKey?: string,
) {
  const [bottomMaxHeight, setBottomMaxHeight] = useState(BOTTOM_PANEL_MAX_HEIGHT);
  const bottomMaxHeightRef = useRef(BOTTOM_PANEL_MAX_HEIGHT);

  const setBottomHeight = useCallback((value: SetStateAction<number>) => {
    setRawBottomHeight((current) => clampBottomPanelHeight(typeof value === "function" ? value(current) : value, bottomMaxHeightRef.current));
  }, [setRawBottomHeight]);

  useEffect(() => {
    const desktopWorkspace = host.current?.closest<HTMLElement>(".desktop-workspace");
    if (!desktopWorkspace) return;
    const updateBottomLimit = () => {
      // Cycle has no `.workspace-header` grid row (its header lives inside the panel), so its header height is 0.
      const headerHeight = desktopWorkspace.querySelector<HTMLElement>(".workspace-header")?.getBoundingClientRect().height ?? 0;
      const maximum = maxBottomPanelHeight(desktopWorkspace.clientHeight, headerHeight);
      bottomMaxHeightRef.current = maximum;
      setBottomMaxHeight(maximum);
      setRawBottomHeight((current) => clampBottomPanelHeight(current, maximum));
    };
    updateBottomLimit();
    const observer = new ResizeObserver(updateBottomLimit);
    observer.observe(desktopWorkspace);
    window.addEventListener("resize", updateBottomLimit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBottomLimit);
    };
  }, [host, setRawBottomHeight, layoutKey]);

  const setBottomSize = (size: SizePreset) => {
    if (size === "hidden") {
      setBottomVisible(false);
      return;
    }
    setBottomVisible(true);
    setBottomHeight(size === "compact" ? BOTTOM_PANEL_MIN_HEIGHT : bottomMaxHeight);
  };
  const resetBottomHeight = () => setBottomHeight(clampBottomPanelHeight(240, bottomMaxHeight));

  return {
    bottomMaxHeight,
    setBottomHeight,
    setBottomSize,
    resetBottomHeight,
    ribbonProps: { bottomVisible, bottomHeight, bottomMaxHeight, onSetBottomSize: setBottomSize },
  } as const;
}
