import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { attachMenuKeyboardNavigation } from "../runtime/interaction-controller.js";
import type { ContextMenuState } from "./use-dialog-menu-state.js";

/** Own transient tree/canvas interaction refs and popup-menu focus/keyboard lifecycle. */
export function useEditorInteractionLifecycle(
  contextMenu: ContextMenuState | undefined,
  treeAddMenuOpen: boolean,
  treeMoreMenuOpen: boolean,
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | undefined>>,
  setTreeAddMenuOpen: Dispatch<SetStateAction<boolean>>,
  setTreeMoreMenuOpen: Dispatch<SetStateAction<boolean>>,
) {
  const treeFocusRowIdRef = useRef<string | undefined>(undefined);
  const menuOriginRef = useRef<HTMLElement | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const previousMenuOpenRef = useRef(false);
  const closeContextMenu = useCallback(() => setContextMenu(undefined), [setContextMenu]);
  const closeTreeAddMenu = useCallback(() => setTreeAddMenuOpen(false), [setTreeAddMenuOpen]);
  const closeTreeMoreMenu = useCallback(() => setTreeMoreMenuOpen(false), [setTreeMoreMenuOpen]);

  useEffect(() => {
    const menuOpen = contextMenu !== undefined || treeAddMenuOpen || treeMoreMenuOpen;
    if (previousMenuOpenRef.current && !menuOpen) {
      const origin = menuOriginRef.current;
      menuOriginRef.current = null;
      if (origin?.isConnected) requestAnimationFrame(() => {
        if (!origin.hasAttribute("tabindex")) origin.setAttribute("tabindex", "-1");
        origin.focus({ preventScroll: true });
      });
    }
    previousMenuOpenRef.current = menuOpen;
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen]);

  useEffect(() => {
    const selector = contextMenu ? ".context-menu" : treeAddMenuOpen ? ".tree-add-menu" : treeMoreMenuOpen ? ".tree-header-menu" : undefined;
    const menu = selector ? document.querySelector<HTMLElement>(selector) : undefined;
    menu?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus();
    return attachMenuKeyboardNavigation(document, closeContextMenu, closeTreeAddMenu, closeTreeMoreMenu);
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen, closeContextMenu, closeTreeAddMenu, closeTreeMoreMenu]);

  return [treeFocusRowIdRef, menuOriginRef, suppressCanvasClickRef, closeContextMenu, closeTreeAddMenu, closeTreeMoreMenu] as const;
}
