import { useMemo, useState } from "react";
import { serializeCanonicalDocument, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

export function JsonPanel({ document }: { readonly document: CanonicalDocument }) {
  const text = useMemo(() => serializeCanonicalDocument(document), [document]);
  const [status, setStatus] = useState("Read only");
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>Generated JSON</strong><span aria-label="JSON read-only status">Read only</span><button type="button" onClick={() => setStatus("Formatted")}>Format</button><button type="button" onClick={() => setStatus(validateCanonicalDocument(document).length === 0 ? "Valid" : "Invalid")}>Validate</button><button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setStatus("Copied"); }}>Copy</button><select aria-label="JSON scope"><option>Selected Object</option><option>Whole Document</option></select><output>{status}</output></div><pre>{text}</pre></section>;
}
