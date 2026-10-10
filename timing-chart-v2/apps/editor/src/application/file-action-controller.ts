import type { MutableRefObject } from "react";
import type { DocumentLifecycleOwner } from "./use-document-lifecycle.js";
import { documentFilename } from "../document-filename.js";

export interface FileActionControllerInput {
  readonly documentLifecycle: DocumentLifecycleOwner;
  readonly pendingFileOriginRef: MutableRefObject<HTMLElement | null>;
  readonly documentTitle: string;
}

export interface FileActionController {
  readonly restorePendingFileFocus: () => void;
  readonly capturePendingFileOrigin: () => void;
  readonly cancelPendingFileAction: () => void;
  readonly continuePendingFileAction: () => void;
  readonly saveAndContinuePendingFileAction: () => void;
  readonly requestNewDocument: () => void;
}

/** Owns file-dialog coordination around the document lifecycle controller. */
export function createFileActionController(input: FileActionControllerInput): FileActionController {
  const restorePendingFileFocus = () => {
    const origin = input.pendingFileOriginRef.current;
    input.pendingFileOriginRef.current = null;
    if (origin?.isConnected) requestAnimationFrame(() => origin.focus());
  };
  const capturePendingFileOrigin = () => {
    if (input.pendingFileOriginRef.current === null) input.pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
  };
  const cancelPendingFileAction = () => { input.documentLifecycle.cancelPending(); restorePendingFileFocus(); };
  const continuePendingFileAction = () => { input.documentLifecycle.discardPending(); restorePendingFileFocus(); };
  const saveAndContinuePendingFileAction = () => {
    if (input.documentLifecycle.savePendingAndContinue(documentFilename(input.documentTitle))) restorePendingFileFocus();
  };
  const requestNewDocument = () => { capturePendingFileOrigin(); input.documentLifecycle.requestNew(); };
  return { restorePendingFileFocus, capturePendingFileOrigin, cancelPendingFileAction, continuePendingFileAction, saveAndContinuePendingFileAction, requestNewDocument };
}
