/** Inspector redesign (shared primitive): a compact, always-present header
 * naming what is currently selected -- "what am I editing, and where does
 * it sit" -- before any Property below it. One component used by every
 * Entity's own Inspector (Signal/Group/Transaction/Annotation/Bookmark),
 * never a per-Entity copy: only the `kind`/`title`/`detail` strings vary,
 * the layout and markup are shared. Reads whatever Selection state its
 * caller already resolved (signal/group/transaction/annotation/bookmark
 * in minimal-cycle-view-panels.tsx's `InspectorPanel`) -- this component
 * owns no Selection state of its own. */
export function InspectorSelectionHeader({ kind, title, detail, iconKind }: { readonly kind: string; readonly title: string; readonly detail?: string; readonly iconKind?: string }) {
  return <div className="inspector-selection-header" data-testid="inspector-selection-header">
    <span className="inspector-selection-icon" data-kind={(iconKind ?? kind).toLowerCase()} aria-hidden="true" />
    <span className="inspector-selection-text">
      <strong className="inspector-selection-title" title={title}>{title}</strong>
      <span className="inspector-selection-kind">{kind}</span>
      {detail && <span className="inspector-selection-detail" title={detail}>{detail}</span>}
    </span>
  </div>;
}

/** Inspector redesign, Section 9: the Inspector's own top bar --
 * "Inspector" + Close, shared by every Entity's Inspector (previously each
 * editor hand-rolled its own `<header><span>Inspector</span>...</header>`).
 * Deliberately NOT a Pin button: no "stop following Selection" mechanism
 * exists anywhere in this codebase today, and the user's own instruction is
 * explicit that an unwired look-only button must not be added -- Pin is a
 * separate Issue candidate, reported as such rather than faked here. */
export function InspectorHeaderBar({ label, onClose }: { readonly label?: string; readonly onClose: () => void }) {
  return <header>
    <span>Inspector</span>
    {label && <b>{label}</b>}
    <button type="button" aria-label="Close Inspector" data-testid="inspector-close" onClick={onClose}>×</button>
  </header>;
}
