export type EditorIconName = "close" | "up" | "down" | "right" | "plus" | "more";

export function EditorIcon({ name }: { readonly name: EditorIconName }) {
  const path = name === "close" ? "M6 6l12 12M18 6L6 18" : name === "up" ? "M12 19V5M6 11l6-6 6 6" : name === "down" ? "M12 5v14M6 13l6 6 6-6" : name === "right" ? "M9 6l6 6-6 6" : name === "plus" ? "M12 5v14M5 12h14" : "M12 5.5h.01M12 12h.01M12 18.5h.01";
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d={path} fill="none" stroke="currentColor" strokeWidth={name === "more" ? "3" : "1.8"} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function EditorIconButton({ label, icon, disabled, onClick }: { readonly label: string; readonly icon: EditorIconName; readonly disabled?: boolean; readonly onClick: () => void }) {
  return <button type="button" data-icon-button={icon} aria-label={label} disabled={disabled} onClick={onClick}><EditorIcon name={icon} /></button>;
}
