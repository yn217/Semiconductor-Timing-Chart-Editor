import { useEffect, useState } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";

export function InlineNameInput({ value, ariaLabel, onRename, onCommitted }: { readonly value: string; readonly ariaLabel: string; readonly onRename: (name: string) => CommandResult; readonly onCommitted?: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(value); setError(""); }, [value]);
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
    <input aria-label={ariaLabel} value={draft} data-commit-policy="enter-only" onChange={(event) => { setDraft(event.target.value); setError(""); }} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commit(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(value); setError(""); }
    }} />
    {error && <span role="alert" className="editor-problem">{error}</span>}
  </>;
}
