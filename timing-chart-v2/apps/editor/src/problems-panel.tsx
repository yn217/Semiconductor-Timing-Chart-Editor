import { useState } from "react";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor } from "@timing-chart-v2/schema";

function details(item: DocumentProblem) {
  if (!(item.operation || item.source || item.stage || item.recommendation || item.commandId || item.objectId)) return null;
  return <details><summary>Details</summary><dl><dt>Operation</dt><dd>{item.operationLabel ?? item.operation ?? "—"}</dd>{item.commandId ? <><dt>Command ID</dt><dd>{item.commandId}</dd></> : null}{item.objectId ? <><dt>Object Type</dt><dd>{item.objectType ?? "—"}</dd><dt>Object ID</dt><dd>{item.objectId}</dd></> : null}<dt>Source</dt><dd>{item.source ?? "—"}</dd><dt>Stage</dt><dd>{item.stage ?? "—"}</dd>{item.recommendation ? <><dt>Recovery</dt><dd>{item.recommendation}</dd></> : null}</dl></details>;
}

function severityOf(item: DocumentProblem): "error" | "warning" | "info" {
  return item.severity ?? "error";
}

export function ProblemsPanel({ diagnostics, onNavigate }: { readonly diagnostics: readonly DocumentProblem[]; readonly onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState("");
  const visible = diagnostics.filter((item) => `${item.code} ${item.path} ${item.message} ${item.operation ?? ""} ${item.source ?? ""} ${item.stage ?? ""} ${item.recommendation ?? ""} ${item.commandId ?? ""} ${item.detail ?? ""} ${item.excerpt ?? ""} ${documentProblemRuleDescriptor(item.code)?.owner ?? ""} ${documentProblemRuleDescriptor(item.code)?.layer ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="problems-panel" data-testid="problems-panel"><header><strong>Problems</strong><span>{diagnostics.length} diagnostics</span><input aria-label="Filter problems" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter" /><button type="button" onClick={() => setFilter("")}>Clear Filter</button></header>{visible.length === 0 ? <p>{diagnostics.length === 0 ? "No validation problems." : "No matching problems."}</p> : <table><thead><tr><th>Severity</th><th>Code</th><th>Path</th><th>Message</th><th>Details</th></tr></thead><tbody>{visible.map((item, index) => <tr key={`${item.code}:${index}`}><td data-testid={`problem-severity-${severityOf(item)}`}>{severityOf(item)}</td><td><button type="button" onClick={() => onNavigate(item.path)}>{item.code}</button></td><td>{item.path}</td><td>{item.message}</td><td>{details(item)}</td></tr>)}</tbody></table>}</section>;
}
