# Interaction conventions (#720)

Recognition over recall, without reducing CAD/EDA command density. Every new control is checked against this list; the automated part lives in
`tests/e2e/issue-720-control-affordance-audit.spec.ts` (runs in Cycle/Transaction/Combined at 1672x941 and 1280x720).

## Checklist for a new control

1. **Icon-only?** Needs `aria-label` AND `title` (tooltip: action name + shortcut if any). Only conventional icons (close, eye, chevron, undo/redo, zoom, plus, more)
   may be icon-only; uncommon operations keep a text label. *(automated)*
2. **Menu vs dialog vs immediate.** Menu: `aria-haspopup="menu"` + `aria-expanded` + chevron. Dialog: label ends with `…`. Immediate commands never mimic either.
3. **Disabled.** Stay visible; when the reason is contextual give it in `title`/described-by (e.g. "Select a Transaction first").
4. **Scope.** State the scope in label or tooltip: document, mode, selection, Bottom bulk selection, Inspector draft.
5. **Cursor.** Resize handle -> resize cursor; draggable -> grab/grabbing; editable cell -> text; pan tool -> hand; clickable icon -> pointer.
6. **Keyboard.** Esc cancels, Enter confirms a focused edit, F2 renames/edits, Delete deletes the selection, Ctrl/Cmd+Z / Shift+Z undo/redo, arrows navigate trees.
   No mode-specific meaning without a visible hint.
7. **Context menus** never the only path: the same actions must exist in a toolbar/menu.
8. **Transient gesture hint** in the status area (e.g. "Move Transaction - drag horizontally; Esc cancels").
9. **Hover/help never mutates Canonical/History.** *(automated: revision and history unchanged after hovering every Ribbon button)*
10. Tooltips use the normal delayed browser behaviour (no custom immediate popovers over the active target).
