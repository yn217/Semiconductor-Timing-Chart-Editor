import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { SelectionState } from "./use-selection-owner.js";
import type { SignalId } from "@timing-chart-v2/schema";

/** Owns editor-only visual toggles and transient selection decoration state.
 * None of these values are canonical document fields or history entries. */
export function useEditorPresentationState(input: { readonly hostRef: MutableRefObject<HTMLDivElement | null> }) {
  const [arrowPickStatus, setArrowPickStatus] = useState<"idle" | "from" | "to">("idle");
  const [gridEnabled, setGridEnabled] = useState(true);
  const gridEnabledRef = useRef(true);
  gridEnabledRef.current = gridEnabled;
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  snapEnabledRef.current = snapEnabled;
  const [rulerEnabled, setRulerEnabled] = useState(true);
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [showSignalNames, setShowSignalNames] = useState(true);
  const [showRoles, setShowRoles] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTransactions, setShowTransactions] = useState(true);
  const [showGroupBackground, setShowGroupBackground] = useState(true);
  const previousSelectionDecorationRef = useRef<SelectionState | undefined>(undefined);
  const applySelectionDecorations = (next: SelectionState): void => {
    const rendererHost = input.hostRef.current;
    if (!rendererHost) return;
    if (next.signalId) rendererHost.dataset.selectedSignalId = next.signalId;
    else delete rendererHost.dataset.selectedSignalId;
    const previous = previousSelectionDecorationRef.current;
    const affectedSignalIds = new Set<string>([
      ...(previous?.signalIds ?? []), ...(next.signalIds ?? []),
      ...(previous?.spacerId ? [previous.spacerId] : []), ...(next.spacerId ? [next.spacerId] : []),
    ]);
    for (const id of affectedSignalIds) for (const row of rendererHost.querySelectorAll<HTMLElement>(`[data-row-id="${CSS.escape(id)}"], [data-signal-id="${CSS.escape(id)}"]`)) {
      const isSelected = next.signalIds.has(id as SignalId) || id === next.spacerId;
      row.dataset.selected = String(isSelected);
      row.setAttribute("aria-selected", String(isSelected));
    }
    const affectedAnnotationIds = new Set([...(previous?.annotationIds ?? []), ...next.annotationIds]);
    for (const id of affectedAnnotationIds) for (const owner of rendererHost.querySelectorAll<HTMLElement>(`[data-annotation-id="${CSS.escape(String(id))}"]`)) owner.dataset.selected = String(next.annotationIds.has(id));
    const affectedGroupIds = new Set([previous?.groupId, next.groupId].filter(Boolean));
    for (const id of affectedGroupIds) for (const treeItem of rendererHost.querySelectorAll<HTMLElement>(`[role="treeitem"][data-row-id="${CSS.escape(String(id))}:header"]`)) treeItem.setAttribute("aria-selected", String(id === next.groupId));
    previousSelectionDecorationRef.current = next;
  };

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
  } as const;
}
