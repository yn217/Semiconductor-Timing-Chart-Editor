import type { ChangeEvent, MutableRefObject, ReactNode } from "react";
import type { DocumentLifecycleOwner } from "./application/use-document-lifecycle.js";
import { ModalBackdrop } from "./modal-backdrop.js";

export interface EditorDialogLayerProps {
  readonly compatibilityPreview: DocumentLifecycleOwner["compatibilityPreview"];
  readonly compatibilityDialogRef: MutableRefObject<HTMLElement | null>;
  readonly closeCompatibility: () => void;
  readonly restorePendingFileFocus: () => void;
  readonly enterCompatibilityReadOnly: () => void;
  readonly pendingFileAction: DocumentLifecycleOwner["pendingAction"];
  readonly unsavedFileDialogRef: MutableRefObject<HTMLElement | null>;
  readonly unsavedCancelRef: MutableRefObject<HTMLButtonElement | null>;
  readonly cancelPendingFileAction: () => void;
  readonly continuePendingFileAction: () => void;
  readonly discardPendingTransactionDraft: () => void;
  readonly saveAndContinuePendingFileAction: () => void;
  readonly fileInputRef: MutableRefObject<HTMLInputElement | null>;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly children?: ReactNode;
}

/** Owns modal/document replacement markup; lifecycle and focus policy remain in application owners. */
export function EditorDialogLayer({
  compatibilityPreview, compatibilityDialogRef, closeCompatibility, restorePendingFileFocus,
  enterCompatibilityReadOnly, pendingFileAction, unsavedFileDialogRef, cancelPendingFileAction,
  continuePendingFileAction, discardPendingTransactionDraft, saveAndContinuePendingFileAction, fileInputRef, onFileChange, unsavedCancelRef, children,
}: EditorDialogLayerProps) {
  const onPreview = () => enterCompatibilityReadOnly();
  return <>
    {children}
    {compatibilityPreview && <ModalBackdrop testId="compatibility-dialog" onDismiss={() => { closeCompatibility(); restorePendingFileFocus(); }}><section ref={compatibilityDialogRef} className="document-properties compatibility-dialog" role="dialog" aria-modal="true" aria-labelledby="compatibility-dialog-title"><header><h2 id="compatibility-dialog-title">Compatibility Mode</h2></header><p>Format version {compatibilityPreview.sourceFormatVersion} {compatibilityPreview.sourceFormatVersion > 2 ? "is newer than this editor supports." : "is not supported by this editor."} The current document has not been replaced.</p><p className="inspector-note">Unknown fields are preserved in the original source below. Compatibility Mode is read-only and cannot Save or overwrite this file.</p><textarea aria-label="Compatibility source" readOnly value={compatibilityPreview.sourceText} rows={14} />{compatibilityPreview.readOnly && <output role="status">Read-only Compatibility Mode active</output>}<footer><button type="button" onClick={() => { closeCompatibility(); restorePendingFileFocus(); }}>{compatibilityPreview.readOnly ? "Close" : "Cancel"}</button>{!compatibilityPreview.readOnly && <button type="button" data-testid="compatibility-read-only" onClick={() => onPreview()}>View Read-Only</button>}</footer></section></ModalBackdrop>}
    {pendingFileAction && <ModalBackdrop testId="unsaved-file-dialog" onDismiss={cancelPendingFileAction}><section ref={unsavedFileDialogRef} className="document-properties unsaved-file-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-file-dialog-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelPendingFileAction(); } }}><header><h2 id="unsaved-file-dialog-title">Unsaved Changes</h2></header>{pendingFileAction.hasUnappliedTransactionDraft ? <><p>There are unapplied Transaction edits. They are not part of the saved document.</p><p className="inspector-note">Discarding this draft does not discard committed document changes. If those are also unsaved, you will be asked what to do next.</p><footer><button type="button" ref={unsavedCancelRef} autoFocus data-testid="unsaved-cancel" onClick={cancelPendingFileAction}>Keep Editing</button><button type="button" data-testid="unsaved-discard-transaction-draft" onClick={discardPendingTransactionDraft}>Discard Transaction Draft</button></footer></> : <><p>Save changes before {pendingFileAction.kind === "new" ? "creating a new document" : "opening another document"}?</p><p className="inspector-note">Your current document has unsaved changes.</p><footer><button type="button" ref={unsavedCancelRef} autoFocus data-testid="unsaved-cancel" onClick={cancelPendingFileAction}>Cancel</button><button type="button" data-testid="unsaved-discard" onClick={continuePendingFileAction}>Discard</button><button type="button" data-testid="unsaved-save" onClick={saveAndContinuePendingFileAction}>Save</button></footer></>}</section></ModalBackdrop>}
    <input ref={fileInputRef} hidden type="file" accept=".json,.tcd" onChange={onFileChange} />
  </>;
}
