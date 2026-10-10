import { useEffect, useState } from "react";
import { reconcileNameDraft, type NameDraft } from "./name-draft.js";
import type { CommandResult } from "@timing-chart-v2/commands";

export function InlineNameInput({ target, value, ariaLabel, onRename, onCommitted, onCanceled, autoFocus = false, onDraftChange }: { readonly target: object | undefined; readonly value: string; readonly ariaLabel: string; readonly onRename: (name: string) => CommandResult; readonly onCommitted?: (name: string) => void; readonly onCanceled?: () => void; readonly autoFocus?: boolean; readonly onDraftChange?: (name: string) => void }) {
  const [stored, setStored] = useState<NameDraft>({ target, base: value, value, error: "" });
  const current = reconcileNameDraft(stored, target, value);
  // Reconcile before committing children, so no event sees a previous target's draft.
  if (current !== stored) setStored(current);
  const draft = current.value;
  const error = current.error;
  useEffect(() => { if (autoFocus) globalThis.document.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape(ariaLabel)}"]`)?.focus(); }, [ariaLabel, autoFocus]);
  const setDraft = (next: string) => setStored((state) => ({ ...reconcileNameDraft(state, target, value), value: next }));
  const setError = (next: string) => setStored((state) => ({ ...reconcileNameDraft(state, target, value), error: next }));
  const commit = () => {
    const name = draft.trim();
    if (!name) { setError("Name is required."); return; }
    if (name === value) { setDraft(value); setError(""); return; }
    const result = onRename(name);
    if (!result.ok) { setError(result.problems[0]?.message ?? "Name was rejected."); return; }
    setDraft(name);
    setError("");
    onCommitted?.(name);
  };
  return <>
    <input aria-label={ariaLabel} value={draft} data-commit-policy="enter-only" onChange={(event) => { setDraft(event.target.value); onDraftChange?.(event.target.value); setError(""); }} onKeyDown={(event) => {
      // Enter/Escape that confirm or cancel an IME conversion belong to the IME, not to the rename.
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commit(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(value); onDraftChange?.(value); setError(""); onCanceled?.(); }
    }} />
    {error && <span role="alert" className="editor-problem">{error}</span>}
  </>;
}
