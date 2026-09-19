import { DISCLOSURE_CHEVRON_SIZE, DISCLOSURE_CHEVRON_SPEC } from "@timing-chart-v2/renderer";

export type EditorIconName = "close" | "up" | "down" | "right" | "chevron-down" | "chevron-right" | "plus" | "more";

export function EditorIcon({ name }: { readonly name: EditorIconName }) {
  const disclosureSpec = name === "chevron-down" ? DISCLOSURE_CHEVRON_SPEC.down : name === "chevron-right" ? DISCLOSURE_CHEVRON_SPEC.right : undefined;
  const path = disclosureSpec?.path ?? (name === "close" ? "M6 6l12 12M18 6L6 18" : name === "up" ? "M12 19V5M6 11l6-6 6 6" : name === "down" ? "M12 5v14M6 13l6 6 6-6" : name === "right" ? "M9 6l6 6-6 6" : name === "plus" ? "M12 5v14M5 12h14" : "M12 5.5h.01M12 12h.01M12 18.5h.01");
  const isDisclosureChevron = disclosureSpec !== undefined;
  return <svg className={isDisclosureChevron ? "shared-disclosure-chevron" : undefined} aria-hidden="true" focusable="false" viewBox="0 0 24 24" width={isDisclosureChevron ? DISCLOSURE_CHEVRON_SIZE : 16} height={isDisclosureChevron ? DISCLOSURE_CHEVRON_SIZE : 16}><path d={path} fill="none" stroke="currentColor" strokeWidth={disclosureSpec?.strokeWidth ?? (name === "more" ? "3" : "1.8")} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function EditorIconButton({ label, icon, disabled, onClick }: { readonly label: string; readonly icon: EditorIconName; readonly disabled?: boolean; readonly onClick: () => void }) {
  return <button type="button" data-icon-button={icon} aria-label={label} disabled={disabled} onClick={onClick}><EditorIcon name={icon} /></button>;
}
