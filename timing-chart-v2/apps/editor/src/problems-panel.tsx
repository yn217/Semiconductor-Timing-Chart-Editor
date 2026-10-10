import { useMemo, useState } from "react";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor } from "@timing-chart-v2/schema";

function details(item: DocumentProblem) {
  if (!(item.operation || item.source || item.stage || item.recommendation || item.commandId || item.objectId || item.entityId)) return null;
  return <details><summary>Details</summary><dl><dt>Severity</dt><dd>{severityOf(item)}</dd><dt>Operation</dt><dd>{item.operationLabel ?? item.operation ?? "—"}</dd>{item.commandId ? <><dt>Command ID</dt><dd>{item.commandId}</dd></> : null}{item.objectId ? <><dt>Object Type</dt><dd>{item.objectType ?? "—"}</dd><dt>Object ID</dt><dd>{item.objectId}</dd></> : item.entityId ? <><dt>Entity ID</dt><dd>{item.entityId}</dd></> : null}{item.field ? <><dt>Field</dt><dd>{item.field}</dd></> : null}<dt>Source</dt><dd>{item.source ?? "—"}</dd><dt>Stage</dt><dd>{item.stage ?? "—"}</dd>{item.expected !== undefined ? <><dt>Expected</dt><dd>{item.expected}</dd></> : null}{item.value !== undefined ? <><dt>Value</dt><dd>{String(item.value)}</dd></> : null}{item.recommendation ? <><dt>Recovery</dt><dd>{item.recommendation}</dd></> : null}</dl></details>;
}

function severityOf(item: DocumentProblem): "error" | "warning" | "info" {
  return item.severity ?? "error";
}

/**
 * Stable, unique row keys for Problems. The leading `CODE:objectId|entityId|path`
 * target stays the historical data-problem-key prefix; sourceCycle and an occurrence
 * counter disambiguate several findings that share an object and path (for example one
 * constraint with several missing acknowledges). Keys are computed over the unfiltered
 * list so they do not change when the text filter or review scope changes.
 */
export function problemRowKeys(diagnostics: readonly DocumentProblem[]): string[] {
  const seen = new Map<string, number>();
  return diagnostics.map((item) => {
    const target = `${item.code}:${item.objectId ?? item.entityId ?? item.path}`;
    const identity = `${target}|${item.path}|${item.sourceCycle ?? ""}`;
    const occurrence = seen.get(identity) ?? 0;
    seen.set(identity, occurrence + 1);
    return `${identity}|${occurrence}`;
  });
}

export function ProblemsPanel({ diagnostics, pending = false, onNavigate }: { readonly diagnostics: readonly DocumentProblem[]; readonly pending?: boolean; readonly onNavigate: (path: string, problem?: DocumentProblem) => void }) {
  const [filter, setFilter] = useState("");
  const keys = useMemo(() => problemRowKeys(diagnostics), [diagnostics]);
  const visible = diagnostics
    .map((item, index) => ({ item, key: keys[index]! }))
    .filter(({ item }) => `${item.code} ${item.path} ${item.message} ${item.operation ?? ""} ${item.source ?? ""} ${item.stage ?? ""} ${item.recommendation ?? ""} ${item.commandId ?? ""} ${item.entityId ?? ""} ${item.objectId ?? ""} ${item.detail ?? ""} ${documentProblemRuleDescriptor(item.code)?.owner ?? ""} ${documentProblemRuleDescriptor(item.code)?.layer ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="problems-panel" data-testid="problems-panel"><header><strong>Problems</strong><span>{pending ? "Checking…" : `${diagnostics.length} diagnostics`}</span><input aria-label="Filter problems" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter" /><button type="button" onClick={() => setFilter("")}>Clear Filter</button></header>{pending && diagnostics.length === 0 ? <p role="status">Checking document timing…</p> : visible.length === 0 ? <p>{diagnostics.length === 0 ? "No validation problems." : "No matching problems."}</p> : <table><thead><tr><th>Severity</th><th>Code</th><th>Path</th><th>Message</th><th>Details</th></tr></thead><tbody>{visible.map(({ item, key }) => <tr key={key} data-problem-key={key} data-problem-path={item.path}><td data-testid={`problem-severity-${severityOf(item)}`}>{severityOf(item)}</td><td><button type="button" onClick={() => onNavigate(item.path, item)}>{item.code}</button></td><td>{item.path}</td><td>{item.message}</td><td>{details(item)}</td></tr>)}</tbody></table>}</section>;
}
