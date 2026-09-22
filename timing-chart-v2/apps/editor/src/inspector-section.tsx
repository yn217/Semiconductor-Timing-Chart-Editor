import type { ReactNode } from "react";
import { EditorIcon } from "./editor-icon.js";

/** Inspector redesign: `count` renders as a compact trailing badge (e.g.
 * "0", "3") and `onAdd` (when the section is collapsed) as a small "+"
 * next to it -- so a section that's currently empty (Phases, Linked
 * Signals) reads as "▶ Phases   0  +" in one collapsed row instead of
 * unconditionally expanding a "No phases yet / Add..." block that costs
 * real vertical space even with nothing in it. Both are optional so
 * every existing `InspectorSection` call site (which has neither) is
 * unaffected. */
export function InspectorSection({ sectionId, title, open, onToggle, count, onAdd, addDisabled = false, children }: { readonly sectionId: string; readonly title: string; readonly open: boolean; readonly onToggle: () => void; readonly count?: number; readonly onAdd?: () => void; readonly addDisabled?: boolean; readonly children: ReactNode }) {
  const contentId = `inspector-section-${sectionId}`;
  return <section className={`inspector-section${open ? " is-open" : " is-collapsed"}`} data-section-id={sectionId}>
    <h3 className="inspector-section-heading">
      <button type="button" className="inspector-section-toggle" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><EditorIcon name={open ? "chevron-down" : "chevron-right"} className="inspector-section-chevron" />{title}</button>
      {count !== undefined && <span className="inspector-section-count" data-testid={`inspector-section-count-${sectionId}`}>{count}</span>}
      {count !== undefined && !open && onAdd && <button type="button" className="inspector-section-add" aria-label={`Add to ${title}`} disabled={addDisabled} title={addDisabled ? "No unused cycles remain. Extend the Transaction or shorten a Phase to add another." : undefined} onClick={(event) => { event.stopPropagation(); if (!open) onToggle(); onAdd(); }}><EditorIcon name="plus" /></button>}
    </h3>
    {open && <div id={contentId} className="inspector-section-content">{children}</div>}
  </section>;
}

/** Inspector redesign (v2 -- generic Revert/Apply contract): the one
 * Draft/Apply action bar every Entity's Inspector uses, sticky at the
 * panel's own bottom. Deliberately NOT type-specific wording ("Apply
 * Signal Properties" vs "Apply Transaction") -- every entity shares the
 * same shell, so the button always just reads "Apply"/"Revert"; only
 * `applyTestId` varies (kept stable per entity so existing tests still
 * target the right button). `changeCount`, when the caller can actually
 * track it (Signal/Bookmark's real field-by-field hasChanges), renders
 * "● N changes"; omit it (undefined) for entities that don't have real
 * per-field dirty-tracking yet (Group/Transaction currently apply
 * unconditionally) rather than fake a count. */
export function InspectorFooter({ changeCount, onCancel, onApply, applyDisabled, applyTestId, cancelTestId = "cancel-inspector-draft" }: { readonly changeCount?: number; readonly onCancel: () => void; readonly onApply: () => void; readonly applyDisabled: boolean; readonly applyTestId: string; readonly cancelTestId?: string }) {
  return <div className="inspector-sticky-footer">
    {changeCount !== undefined && changeCount > 0 && <output className="draft-unapplied-indicator" data-testid="inspector-footer-unapplied">● {changeCount} change{changeCount === 1 ? "" : "s"}</output>}
    <span className="inspector-footer-buttons">
      <button type="button" data-testid={cancelTestId} onClick={onCancel}>Revert</button>
      <button type="button" data-testid={applyTestId} disabled={applyDisabled} onClick={onApply}>Apply</button>
    </span>
  </div>;
}

/** Inspector redesign, Section 7 (toggle switches): the one Boolean
 * Property control every entity Inspector uses -- e.g. Visible, Show
 * Background -- replacing a plain `<input type="checkbox">` with a
 * compact switch, per the Reference's "toggle = property editor" rule.
 * A native checkbox input still drives it (so existing
 * `getByLabel(...).check()/.uncheck()` Playwright calls keep working
 * unchanged) -- only the visual chrome around it changes; the checkbox
 * itself is visually hidden but stays in the accessibility tree. */
export function PropertyToggle({ label, checked, onChange, ariaLabel }: { readonly label?: ReactNode; readonly checked: boolean; readonly onChange: (checked: boolean) => void; readonly ariaLabel: string }) {
  // Renders as a `<label>` (not a bare `<span>`) so it inherits the same
  // 98px/1fr `.inspector label` grid every other Property row already
  // uses -- a toggle's row must line up with its neighbors exactly like
  // a checkbox row used to, not introduce its own one-off alignment.
  return <label className="property-toggle">
    {label}
    <span className="property-toggle-switch" data-checked={checked}>
      <input type="checkbox" aria-label={ariaLabel} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="property-toggle-track" aria-hidden="true"><span className="property-toggle-thumb" /></span>
    </span>
  </label>;
}
