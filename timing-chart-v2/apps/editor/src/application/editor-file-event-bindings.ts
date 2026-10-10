import { useEffect, useRef } from "react";

export type EditorFileShortcut = "s" | "S" | "o";

export interface EditorFileEventActions {
  readonly onDropFile: (file: File) => void;
  readonly onFileShortcut: (key: EditorFileShortcut) => void;
}

export type EditorFileEventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Installs the editor-wide file-open and save shortcuts on one event target. */
export function installEditorFileEventBindings(target: EditorFileEventTarget, getActions: () => EditorFileEventActions): () => void {
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) getActions().onDropFile(file);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
    const key = event.key.toLowerCase();
    if (key !== "s" && key !== "o") return;
    if (key === "o" && event.shiftKey) return;
    event.preventDefault();
    if (typeof document !== "undefined" && document.querySelector("[role='dialog'][aria-modal='true']")) return;
    getActions().onFileShortcut(key === "o" ? "o" : event.shiftKey ? "S" : "s");
  };

  target.addEventListener("dragover", onDragOver as EventListener);
  target.addEventListener("drop", onDrop as EventListener);
  target.addEventListener("keydown", onKeyDown as EventListener);
  return () => {
    target.removeEventListener("dragover", onDragOver as EventListener);
    target.removeEventListener("drop", onDrop as EventListener);
    target.removeEventListener("keydown", onKeyDown as EventListener);
  };
}

/** React adapter keeps the event lifetime stable while dispatching to current document actions. */
export function useEditorFileEventBindings(actions: EditorFileEventActions): void {
  const latestActions = useRef(actions);
  latestActions.current = actions;
  useEffect(() => installEditorFileEventBindings(window, () => latestActions.current), []);
}
