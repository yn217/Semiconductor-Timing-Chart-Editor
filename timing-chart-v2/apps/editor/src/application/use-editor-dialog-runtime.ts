import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { DocumentLifecycleOwner } from "./use-document-lifecycle.js";
import { useDialogFocusLoop } from "../dialog-focus-loop.js";
import { attachDialogOriginCapture, attachDirtyUnloadGuard, scheduleDialogFocusRestore, trapDialogTab } from "../runtime/editor-dom-bridge.js";

export interface EditorDialogRuntimeInput {
  readonly dirty: boolean;
  readonly documentLifecycle: DocumentLifecycleOwner;
  readonly contextMenu: unknown;
  readonly treeAddMenuOpen: boolean;
  readonly treeMoreMenuOpen: boolean;
  readonly propertiesVisible: boolean;
  readonly exportVisible: boolean;
  readonly saveAsVisible: boolean;
  readonly hierarchyVisible: boolean;
  readonly bulkRegistrationVisible: boolean;
  readonly setContextMenu: (value: undefined) => void;
  readonly setTreeAddMenuOpen: (value: boolean) => void;
  readonly setTreeMoreMenuOpen: (value: boolean) => void;
  readonly setPropertiesVisible: (value: boolean) => void;
  readonly setExportVisible: (value: boolean) => void;
  readonly setSaveAsVisible: (value: boolean) => void;
  readonly setHierarchyVisible: (value: boolean) => void;
  readonly setBulkRegistrationVisible: (value: boolean) => void;
  readonly setBulkRegistrationPreview: (value: undefined) => void;
  readonly suppressCanvasClickRef: MutableRefObject<boolean>;
  readonly dialogOriginRef: MutableRefObject<HTMLElement | null>;
  readonly dialogOriginLabelRef: MutableRefObject<string | null>;
  readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
  readonly pendingFileOriginRef: MutableRefObject<HTMLElement | null>;
  readonly renameDialogRef: MutableRefObject<HTMLFormElement | null>;
  readonly renameDialogOriginRef: MutableRefObject<HTMLElement | null>;
  readonly bulkRegistrationDialogRef: MutableRefObject<HTMLElement | null>;
  readonly unsavedFileDialogRef: MutableRefObject<HTMLElement | null>;
  readonly compatibilityDialogRef: MutableRefObject<HTMLElement | null>;
  readonly renameDialogOpen: boolean;
  readonly pendingFileAction: DocumentLifecycleOwner["pendingAction"];
  readonly compatibilityPreview: DocumentLifecycleOwner["compatibilityPreview"];
  readonly restorePendingFileFocus: () => void;
  readonly cancelPendingFileAction: () => void;
  readonly closeContextMenu: () => void;
  readonly closeTreeAddMenu: () => void;
  readonly closeTreeMoreMenu: () => void;
}

/** Owns document-level dialog/menu listeners so the composition root remains listener-free. */
export function useEditorDialogRuntime(input: EditorDialogRuntimeInput): void {
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => attachDirtyUnloadGuard(input.dirty), [input.dirty]);

  useEffect(() => {
    const menuOpen = input.contextMenu !== undefined || input.treeAddMenuOpen || input.treeMoreMenuOpen;
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const current = inputRef.current;
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest(".context-menu, .tree-add-menu, .tree-header-menu, .tree-add-button, .tree-more-button")) return;
      const canvasOutside = target !== undefined && target.closest("[data-testid='cycle-viewport'], [data-role='timing-chart-surface'], [data-testid='cycle-ruler']") !== null
        && target.closest("[data-row-id], [data-annotation-id], [data-transaction-id]") === null;
      current.suppressCanvasClickRef.current = canvasOutside;
      current.setContextMenu(undefined);
      current.setTreeAddMenuOpen(false);
      current.setTreeMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [input.contextMenu, input.treeAddMenuOpen, input.treeMoreMenuOpen]);

  useEffect(() => attachDialogOriginCapture(document, input.dialogOriginRef, input.dialogOriginLabelRef, input.menuOriginRef), [input.dialogOriginRef, input.dialogOriginLabelRef, input.menuOriginRef]);
  useLayoutEffect(() => {
    if (input.propertiesVisible || input.exportVisible || input.saveAsVisible || input.hierarchyVisible || input.bulkRegistrationVisible) return undefined;
    return scheduleDialogFocusRestore(document, input.dialogOriginRef, input.dialogOriginLabelRef);
  }, [input.propertiesVisible, input.exportVisible, input.saveAsVisible, input.hierarchyVisible, input.bulkRegistrationVisible, input.dialogOriginRef, input.dialogOriginLabelRef]);

  useEffect(() => {
    const onDialogKeyDown = (event: KeyboardEvent) => {
      const current = inputRef.current;
      if (trapDialogTab(document, event)) return;
      if (event.key !== "Escape" || current.contextMenu || current.treeAddMenuOpen || current.treeMoreMenuOpen) return;
      if (current.compatibilityPreview) { event.preventDefault(); current.documentLifecycle.closeCompatibility(); current.restorePendingFileFocus(); return; }
      if (current.pendingFileAction) { event.preventDefault(); current.cancelPendingFileAction(); return; }
      if (current.bulkRegistrationVisible) { event.preventDefault(); current.setBulkRegistrationVisible(false); current.setBulkRegistrationPreview(undefined); return; }
      if (current.hierarchyVisible) { event.preventDefault(); current.setHierarchyVisible(false); return; }
      if (current.propertiesVisible) { event.preventDefault(); current.setPropertiesVisible(false); return; }
      if (current.exportVisible) { event.preventDefault(); current.setExportVisible(false); return; }
      if (current.saveAsVisible) { event.preventDefault(); current.setSaveAsVisible(false); }
    };
    document.addEventListener("keydown", onDialogKeyDown, true);
    return () => document.removeEventListener("keydown", onDialogKeyDown, true);
  }, [input.contextMenu, input.treeAddMenuOpen, input.treeMoreMenuOpen, input.compatibilityPreview, input.pendingFileAction, input.bulkRegistrationVisible, input.hierarchyVisible, input.propertiesVisible, input.exportVisible, input.saveAsVisible]);

  useDialogFocusLoop(input.renameDialogRef, input.renameDialogOriginRef, input.renameDialogOpen);
  useDialogFocusLoop(input.bulkRegistrationDialogRef, input.dialogOriginRef, input.bulkRegistrationVisible);
  useDialogFocusLoop(input.unsavedFileDialogRef, input.pendingFileOriginRef, input.pendingFileAction !== undefined);
  useDialogFocusLoop(input.compatibilityDialogRef, input.pendingFileOriginRef, input.compatibilityPreview !== undefined);
}
