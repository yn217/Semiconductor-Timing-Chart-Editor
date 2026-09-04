import { useRef, useState } from "react";
import type { RefObject } from "react";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { EditorIcon } from "./editor-icon.js";

export function SaveAsDialog({ defaultName, restoreFocusRef, onSave, onClose }: { readonly defaultName: string; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onSave: (name: string) => boolean; readonly onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocusLoop(dialogRef, restoreFocusRef);
  return <div className="modal-backdrop"><form ref={dialogRef} className="save-as-dialog" role="dialog" aria-modal="true" aria-label="Save As" onSubmit={(event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/:*?"<>|]/.test(trimmed)) { setError("Enter a valid filename."); return; }
    if (!onSave(trimmed)) setError("Save failed. The document remains modified.");
  }}><header><h2>Save As</h2><button type="button" aria-label="Close Save As" onClick={onClose}><EditorIcon name="close" /></button></header><label>Filename<input data-dialog-initial-focus aria-label="Save As filename" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} autoFocus /></label>{error && <output role="alert">{error}</output>}<footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" data-testid="save-as-submit">Save</button></footer></form></div>;
}
