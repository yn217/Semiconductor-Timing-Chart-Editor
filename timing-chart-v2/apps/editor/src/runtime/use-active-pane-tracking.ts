import { useEffect, useRef, type RefObject } from "react";

export type ActivePane = "signal" | "transaction";

/**
 * The single owner of "which pane is active" in Combined mode (#407, #593, #615).
 *
 * Panes are rendered by other files, so activation is click/focus-delegated: interacting inside the
 * Transaction lanes or split Transaction pane, or with the Transaction Tree in the left rail (outside
 * `.cycle-panel`), activates Transaction; any other interaction inside the cycle panel activates Signal.
 * The setter is read through a ref so the listeners attach once. Also publishes `data-active-pane` on the
 * viewport (Combined only) for CSS.
 */
export function useActivePaneTracking(
  viewport: RefObject<HTMLElement | null>,
  setActivePane: (pane: ActivePane) => void,
  activePane: ActivePane,
  viewMode: string,
): void {
  const setterRef = useRef(setActivePane);
  setterRef.current = setActivePane;
  useEffect(() => {
    const root = viewport.current?.closest<HTMLElement>(".cycle-panel");
    if (!root) return;
    const paneOf = (target: HTMLElement | null): ActivePane => (target?.closest(".transaction-lanes, .split-transaction-pane") ? "transaction" : "signal");
    const onPointerDownCapture = (event: PointerEvent) => setterRef.current(paneOf(event.target as HTMLElement | null));
    const onFocusIn = (event: FocusEvent) => setterRef.current(paneOf(event.target as HTMLElement | null));
    const onTreeInteraction = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest(".transaction-left-tree")) setterRef.current("transaction");
    };
    document.addEventListener("pointerdown", onTreeInteraction, true);
    root.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
    root.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onTreeInteraction, true);
      root.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
      root.removeEventListener("focusin", onFocusIn);
    };
  }, [viewport]);
  useEffect(() => {
    const root = viewport.current;
    if (root) root.dataset.activePane = viewMode === "Split" ? activePane : "";
  }, [viewport, activePane, viewMode]);
}
