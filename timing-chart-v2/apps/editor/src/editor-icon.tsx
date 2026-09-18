// This leaf module contains only shared SVG path data; importing it directly
// keeps the React Tree and DOM renderer on one icon grammar without pulling a
// second rendering API into the editor.
import { LEFT_TREE_ICON_DOTS, LEFT_TREE_ICON_PATHS, LEFT_TREE_ICON_PUPIL, type LeftTreeIconPathName } from "../../../packages/renderer/src/left-tree-icon-spec.js";

export type EditorIconName = "close" | "up" | "down" | "right" | "plus" | "more" | LeftTreeIconPathName;

export function EditorIcon({ name, className }: { readonly name: EditorIconName; readonly className?: string }) {
  if (name === "more") {
    return (
      <svg aria-hidden="true" focusable="false" data-icon={name} className={className} viewBox="0 0 24 24" width="16" height="16">
        {LEFT_TREE_ICON_DOTS.map(({ cx, cy, r }) => <circle key={cy} cx={cx} cy={cy} r={r} fill="currentColor" />)}
      </svg>
    );
  }
  if (name in LEFT_TREE_ICON_PATHS) {
    const treeIconName = name as LeftTreeIconPathName;
    return (
      <svg aria-hidden="true" focusable="false" data-icon={name} className={className} viewBox="0 0 24 24" width="16" height="16">
        <path d={LEFT_TREE_ICON_PATHS[treeIconName]} fill="none" stroke="currentColor" strokeWidth={treeIconName.startsWith("chevron") ? "2" : "1.6"} strokeLinecap="round" strokeLinejoin="round" />
        {treeIconName === "eye" && <circle cx={LEFT_TREE_ICON_PUPIL.cx} cy={LEFT_TREE_ICON_PUPIL.cy} r={LEFT_TREE_ICON_PUPIL.r} fill="none" stroke="currentColor" strokeWidth="1.6" />}
      </svg>
    );
  }
  const path = name === "close" ? "M6 6l12 12M18 6L6 18" : name === "up" ? "M12 19V5M6 11l6-6 6 6" : name === "down" ? "M12 5v14M6 13l6 6 6-6" : name === "right" ? "M9 6l6 6-6 6" : name === "plus" ? "M12 5v14M5 12h14" : "M12 5.5h.01M12 12h.01M12 18.5h.01";
  return <svg aria-hidden="true" focusable="false" data-icon={name} className={className} viewBox="0 0 24 24" width="16" height="16"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function EditorIconButton({ label, icon, disabled, onClick }: { readonly label: string; readonly icon: EditorIconName; readonly disabled?: boolean; readonly onClick: () => void }) {
  return <button type="button" data-icon-button={icon} aria-label={label} disabled={disabled} onClick={onClick}><EditorIcon name={icon} /></button>;
}
