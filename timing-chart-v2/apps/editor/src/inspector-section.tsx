import type { ReactNode } from "react";

export function InspectorSection({ sectionId, title, open, onToggle, children }: { readonly sectionId: string; readonly title: string; readonly open: boolean; readonly onToggle: () => void; readonly children: ReactNode }) {
  const contentId = `inspector-section-${sectionId}`;
  return <section className={`inspector-section${open ? " is-open" : " is-collapsed"}`} data-section-id={sectionId}>
    <h3><button type="button" className="inspector-section-toggle" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><span aria-hidden="true">{open ? "▼" : "▶"}</span>{title}</button></h3>
    {open && <div id={contentId} className="inspector-section-content">{children}</div>}
  </section>;
}
