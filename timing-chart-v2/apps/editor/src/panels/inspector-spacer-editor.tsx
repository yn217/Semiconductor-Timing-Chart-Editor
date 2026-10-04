import { useEffect, useState } from "react";
import type { SpacerRow } from "@timing-chart-v2/schema";

export function InspectorSpacerEditor({ spacer, onApply, onDelete }: { readonly spacer: SpacerRow; readonly onApply: (height: number) => void; readonly onDelete: () => void }) {
  const [draft, setDraft] = useState(String(spacer.height));
  useEffect(() => setDraft(String(spacer.height)), [spacer.id, spacer.height]);
  const height = Number(draft);
  const valid = draft.trim().length > 0 && Number.isFinite(height) && height > 0;
  const dirty = draft !== String(spacer.height);
  const changed = valid && height !== spacer.height;
  const error = dirty && !valid ? "Spacer height must be a finite positive number." : "";
  return <form data-spacer-id={spacer.id} onSubmit={(event) => {
    event.preventDefault();
    if (changed) onApply(height);
  }}>
    <code>{spacer.id}</code>
    <label>Height<input name="height" aria-label={`Spacer height ${spacer.id}`} aria-invalid={error ? true : undefined} type="number" min="1" step="1" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    {error && <span role="alert" className="editor-problem">{error}</span>}
    {changed && <span className="draft-unapplied-indicator" role="status">Unapplied changes</span>}
    <button type="submit" disabled={!changed}>Apply Height</button>
    <button type="button" onClick={() => setDraft(String(spacer.height))} disabled={!dirty}>Cancel</button>
    <button type="button" onClick={onDelete}>Delete</button>
  </form>;
}
