import type { CanonicalDocument } from "@timing-chart-v2/schema";

export type BulkSignalDefinition = Readonly<{
  path: string;
  kind: "binary" | "bus" | "state" | "logic" | "event" | "pulse" | "clock";
  signalName: string;
  instancePath: readonly string[];
  width?: number;
}>;

export function parseBulkSignalDefinitions(text: string, document: Readonly<CanonicalDocument>): { readonly definitions: readonly BulkSignalDefinition[]; readonly errors: readonly string[] } {
  const definitions: BulkSignalDefinition[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const existing = new Set(document.signals.map((signal) => [...signal.source.instancePath, signal.source.signalName].join(".")));
  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = sourceLine.trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (fields.length !== 2) { errors.push(`Line ${lineNumber}: expected '<instance.path.signal> <binary|bus|state|logic|event|pulse|clock>'.`); continue; }
    const [path, rawKind] = fields;
    const kind = rawKind?.toLowerCase();
    if (kind !== "binary" && kind !== "bus" && kind !== "state" && kind !== "logic" && kind !== "event" && kind !== "pulse" && kind !== "clock") { errors.push(`Line ${lineNumber}: unsupported signal type '${rawKind}'.`); continue; }
    const parts = path?.split(".").filter(Boolean) ?? [];
    const rawName = parts.pop();
    if (!rawName || parts.length === 0 || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\[\d+:\d+\])?$/.test(rawName)) { errors.push(`Line ${lineNumber}: invalid signal path '${path}'.`); continue; }
    const range = /\[(\d+):(\d+)\]$/.exec(rawName);
    const width = range ? Math.abs(Number(range[1]) - Number(range[2])) + 1 : undefined;
    if (kind === "bus" && width === undefined) { errors.push(`Line ${lineNumber}: bus signal '${path}' must include a bit range such as [31:0].`); continue; }
    if (kind !== "bus" && width !== undefined) { errors.push(`Line ${lineNumber}: only bus signals may include a bit range.`); continue; }
    const canonicalPath = [...parts, rawName].join(".");
    if (seen.has(canonicalPath) || existing.has(canonicalPath)) { errors.push(`Line ${lineNumber}: duplicate signal path '${canonicalPath}'.`); continue; }
    seen.add(canonicalPath);
    definitions.push({ path: canonicalPath, kind, signalName: rawName, instancePath: parts, ...(width === undefined ? {} : { width }) });
  }
  return { definitions, errors };
}
