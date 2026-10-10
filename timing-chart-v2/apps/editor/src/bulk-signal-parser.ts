import type { CanonicalDocument } from "@timing-chart-v2/schema";

export type BulkSignalDefinition = Readonly<{
  path: string;
  kind: "binary" | "bus" | "state" | "logic" | "event" | "pulse" | "clock";
  signalName: string;
  displayName: string;
  instancePath: readonly string[];
  width?: number;
  msb?: number;
  lsb?: number;
}>;

function canonicalSourcePath(signal: CanonicalDocument["signals"][number]): string {
  const { signalName, msb, lsb } = signal.source;
  if (signal.type !== "bus" || /\[\d+:\d+\]$/.test(signalName) || msb === undefined || lsb === undefined) {
    return [...signal.source.instancePath, signalName].join(".");
  }
  return [...signal.source.instancePath, `${signalName}[${msb}:${lsb}]`].join(".");
}

export function parseBulkSignalDefinitions(text: string, document: Readonly<CanonicalDocument>): { readonly definitions: readonly BulkSignalDefinition[]; readonly errors: readonly string[] } {
  const definitions: BulkSignalDefinition[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const existing = new Set(document.signals.map(canonicalSourcePath));
  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = sourceLine.trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (fields.length !== 2) { errors.push(`Line ${lineNumber}: expected '<instance.path.signal> <binary|bus|state|logic|event|pulse|clock>'.`); continue; }
    const [path, rawKind] = fields;
    const kind = rawKind?.toLowerCase();
    if (kind !== "binary" && kind !== "bus" && kind !== "state" && kind !== "logic" && kind !== "event" && kind !== "pulse" && kind !== "clock") { errors.push(`Line ${lineNumber}: unsupported signal type '${rawKind}'.`); continue; }
    const parts = path?.split(".") ?? [];
    const rawName = parts.pop();
    if (!rawName || parts.length === 0 || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\[\d+:\d+\])?$/.test(rawName) || parts.some((part) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part))) { errors.push(`Line ${lineNumber}: invalid signal path '${path}'.`); continue; }
    const range = /^(.*)\[(\d+):(\d+)\]$/.exec(rawName);
    const msb = range ? Number(range[2]) : undefined;
    const lsb = range ? Number(range[3]) : undefined;
    const width = msb === undefined || lsb === undefined ? undefined : Math.abs(msb - lsb) + 1;
    if (range && (!Number.isSafeInteger(msb) || !Number.isSafeInteger(lsb) || !Number.isSafeInteger(width))) { errors.push(`Line ${lineNumber}: bit range in '${path}' exceeds the supported integer range.`); continue; }
    if (kind === "bus" && width === undefined) { errors.push(`Line ${lineNumber}: bus signal '${path}' must include a bit range such as [31:0].`); continue; }
    if (kind !== "bus" && width !== undefined) { errors.push(`Line ${lineNumber}: only bus signals may include a bit range.`); continue; }
    const signalName = range ? range[1]! : rawName;
    const displayName = rawName;
    const canonicalPath = [...parts, displayName].join(".");
    if (seen.has(canonicalPath) || existing.has(canonicalPath)) { errors.push(`Line ${lineNumber}: duplicate signal path '${canonicalPath}'.`); continue; }
    seen.add(canonicalPath);
    definitions.push({ path: canonicalPath, kind, signalName, displayName, instancePath: parts, ...(width === undefined || msb === undefined || lsb === undefined ? {} : { width, msb, lsb }) });
  }
  return { definitions, errors };
}
