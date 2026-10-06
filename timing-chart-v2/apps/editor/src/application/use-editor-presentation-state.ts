import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { SelectionState } from "./use-selection-owner.js";
import { applySelectionDecorationToHost } from "./selection-decoration.js";

/** Owns editor-only visual toggles and transient selection decoration state.
 * None of these values are canonical document fields or history entries. */
export function useEditorPresentationState(input: { readonly hostRef: MutableRefObject<HTMLDivElement | null>; readonly mode: string; readonly selection: SelectionState; readonly selectionRef: MutableRefObject<SelectionState> }) {
  const [arrowPickStatus, setArrowPickStatus] = useState<"idle" | "from" | "to">("idle");
  const [gridEnabled, setGridEnabled] = useState(true);
  const gridEnabledRef = useRef(true);
  gridEnabledRef.current = gridEnabled;
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  snapEnabledRef.current = snapEnabled;
  const [rulerEnabled, setRulerEnabled] = useState(true);
  // CAD/EDA canvases prioritize chart area; MiniMap remains available via View when requested.
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [showSignalNames, setShowSignalNames] = useState(true);
  const [showRoles, setShowRoles] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTransactions, setShowTransactions] = useState(true);
  const [showGroupBackground, setShowGroupBackground] = useState(true);
  const previousSelectionDecorationRef = useRef<SelectionState | undefined>(undefined);
  const applySelectionDecorations = useCallback((next: SelectionState): void => {
    const rendererHost = input.hostRef.current;
    if (!rendererHost) return;
    applySelectionDecorationToHost(rendererHost, next, previousSelectionDecorationRef.current);
    previousSelectionDecorationRef.current = next;
  }, [input.hostRef]);
  const reapplySelectionRef = useRef<() => void>(() => applySelectionDecorations(input.selectionRef.current));
  reapplySelectionRef.current = () => applySelectionDecorations(input.selectionRef.current);

  // Mode owners may remove and recreate presentation-only row DOM while the
  // semantic SelectionState remains unchanged. Reapply decoration after that
  // remount so stable-ID selection does not depend on a new selection event.
  useEffect(() => { applySelectionDecorations(input.selection); }, [applySelectionDecorations, input.mode, input.selection]);

  return {
    arrowPickStatus, setArrowPickStatus,
    gridEnabled, setGridEnabled, gridEnabledRef,
    snapEnabled, setSnapEnabled, snapEnabledRef,
    rulerEnabled, setRulerEnabled,
    minimapEnabled, setMinimapEnabled,
    showSignalNames, setShowSignalNames,
    showRoles, setShowRoles,
    showAnnotations, setShowAnnotations,
    showTransactions, setShowTransactions,
    showGroupBackground, setShowGroupBackground,
    previousSelectionDecorationRef,
    applySelectionDecorations,
    reapplySelectionRef,
  } as const;
}
