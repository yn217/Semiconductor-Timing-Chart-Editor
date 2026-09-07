import { useEffect, useLayoutEffect, type MutableRefObject } from "react";
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
  useEffect(() => attachDirtyUnloadGuard(input.dirty), [input.dirty]);

  useEffect(() => {
    const menuOpen = input.contextMenu !== undefined || input.treeAddMenuOpen || input.treeMoreMenuOpen;
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest(".context-menu, .tree-add-menu, .tree-header-menu, .tree-add-button, .tree-more-button")) return;
      const canvasOutside = target !== undefined && target.closest("[data-testid='cycle-viewport'], [data-role='timing-chart-surface'], [data-testid='cycle-ruler']") !== null
        && target.closest("[data-row-id], [data-annotation-id], [data-transaction-id]") === null;
      input.suppressCanvasClickRef.current = canvasOutside;
      input.setContextMenu(undefined);
      input.setTreeAddMenuOpen(false);
      input.setTreeMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [input]);

  useEffect(() => attachDialogOriginCapture(document, input.dialogOriginRef, input.dialogOriginLabelRef, input.menuOriginRef), [input]);
  useLayoutEffect(() => {
    if (input.propertiesVisible || input.exportVisible || input.saveAsVisible || input.hierarchyVisible || input.bulkRegistrationVisible) return undefined;
    return scheduleDialogFocusRestore(document, input.dialogOriginRef, input.dialogOriginLabelRef);
  }, [input]);

  useEffect(() => {
    const onDialogKeyDown = (event: KeyboardEvent) => {
      if (trapDialogTab(document, event)) return;
      if (event.key !== "Escape" || input.contextMenu || input.treeAddMenuOpen || input.treeMoreMenuOpen) return;
      if (input.compatibilityPreview) { event.preventDefault(); input.documentLifecycle.closeCompatibility(); input.restorePendingFileFocus(); return; }
      if (input.pendingFileAction) { event.preventDefault(); input.cancelPendingFileAction(); return; }
      if (input.bulkRegistrationVisible) { event.preventDefault(); input.setBulkRegistrationVisible(false); input.setBulkRegistrationPreview(undefined); return; }
      if (input.hierarchyVisible) { event.preventDefault(); input.setHierarchyVisible(false); return; }
      if (input.propertiesVisible) { event.preventDefault(); input.setPropertiesVisible(false); return; }
      if (input.exportVisible) { event.preventDefault(); input.setExportVisible(false); return; }
      if (input.saveAsVisible) { event.preventDefault(); input.setSaveAsVisible(false); }
    };
    document.addEventListener("keydown", onDialogKeyDown, true);
    return () => document.removeEventListener("keydown", onDialogKeyDown, true);
  }, [input]);

  useDialogFocusLoop(input.renameDialogRef, input.renameDialogOriginRef, input.renameDialogOpen);
  useDialogFocusLoop(input.bulkRegistrationDialogRef, input.dialogOriginRef, input.bulkRegistrationVisible);
  useDialogFocusLoop(input.unsavedFileDialogRef, input.pendingFileOriginRef, input.pendingFileAction !== undefined);
  useDialogFocusLoop(input.compatibilityDialogRef, input.pendingFileOriginRef, input.compatibilityPreview !== undefined);
}
