import { useEditorFileEventBindings } from "./editor-file-event-bindings.js";

export function useEditorDocumentFileEvents({ pendingAction, fileName, readFile, captureOrigin, save, saveAs, openFile }: {
  readonly pendingAction: unknown;
  readonly fileName: string;
  readonly readFile: (file: File) => void | Promise<void>;
  readonly captureOrigin: () => void;
  readonly save: (fileName: string) => void;
  readonly saveAs: () => void;
  readonly openFile: () => void;
}): void {
  useEditorFileEventBindings({
    onDropFile: (file) => {
      if (pendingAction !== undefined || document.querySelector("[role='dialog'][aria-modal='true']")) return;
      captureOrigin();
      void readFile(file);
    },
    onFileShortcut: (key) => {
      if (key === "s") save(fileName);
      else if (key === "S") saveAs();
      else openFile();
    },
  });
}
