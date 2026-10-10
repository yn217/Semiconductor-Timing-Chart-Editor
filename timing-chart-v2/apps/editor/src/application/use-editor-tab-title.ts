import { useEffect } from "react";

export function useEditorTabTitle(title: string, dirty: boolean): void {
  const normalizedTitle = title.replace(/\s+(?:--|—)\s+(?:Cycle|Transaction|Combined)\s+Mode$/i, "").trim() || title.trim() || "Untitled";
  useEffect(() => {
    globalThis.document.title = `${dirty ? "* " : ""}${normalizedTitle} - Timing Chart Editor`;
  }, [dirty, normalizedTitle]);
}
