import { useState } from "react";
import type { BulkSignalDefinition } from "../bulk-signal-parser.js";

export type ContextMenuState =
  | { readonly x: number; readonly y: number; readonly target: "ruler"; readonly cycle: number }
  | { readonly x: number; readonly y: number; readonly target: "signal" | "group" | "annotation" | "transaction"; /** Stable id of the row that invoked the menu (#899): the menu follows/dismisses with it. */ readonly originRowId?: string };

export type BulkRegistrationPreviewState<GroupId> = {
  readonly sourceText: string;
  readonly definitions: readonly BulkSignalDefinition[];
  readonly errors: readonly string[];
};

/** Owns dialog and popup-menu visibility/draft state: the Context Menu, the
 * Tree Add/More header menus, every modal dialog's visibility flag, the
 * Bulk Signal Registration form fields, and the Rename dialog's draft/error
 * fields. The focus restoration and keyboard-navigation lifecycle is composed
 * by `useEditorInteractionLifecycle`, keeping that imperative behavior out of
 * the root view. */
export function useDialogMenuState<GroupId>() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | undefined>();
  const [treeAddMenuOpen, setTreeAddMenuOpen] = useState(false);
  const [treeMoreMenuOpen, setTreeMoreMenuOpen] = useState(false);

  const [propertiesVisible, setPropertiesVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [hierarchyVisible, setHierarchyVisible] = useState(false);
  const [bulkRegistrationVisible, setBulkRegistrationVisible] = useState(false);

  const [bulkRegistrationText, setBulkRegistrationText] = useState("dut.status binary\ndut.data[7:0] bus\n");
  const [bulkRegistrationGroupId, setBulkRegistrationGroupId] = useState<GroupId | undefined>();
  const [bulkRegistrationStatus, setBulkRegistrationStatus] = useState("");
  const [bulkRegistrationPreview, setBulkRegistrationPreview] = useState<BulkRegistrationPreviewState<GroupId>>();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");

  return {
    contextMenu, setContextMenu,
    treeAddMenuOpen, setTreeAddMenuOpen,
    treeMoreMenuOpen, setTreeMoreMenuOpen,
    propertiesVisible, setPropertiesVisible,
    exportVisible, setExportVisible,
    saveAsVisible, setSaveAsVisible,
    hierarchyVisible, setHierarchyVisible,
    bulkRegistrationVisible, setBulkRegistrationVisible,
    bulkRegistrationText, setBulkRegistrationText,
    bulkRegistrationGroupId, setBulkRegistrationGroupId,
    bulkRegistrationStatus, setBulkRegistrationStatus,
    bulkRegistrationPreview, setBulkRegistrationPreview,
    renameDialogOpen, setRenameDialogOpen,
    renameDraft, setRenameDraft,
    renameError, setRenameError,
  } as const;
}

export type DialogMenuState<GroupId> = ReturnType<typeof useDialogMenuState<GroupId>>;
