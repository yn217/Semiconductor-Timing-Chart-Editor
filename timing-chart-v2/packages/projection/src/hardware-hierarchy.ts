import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";

export type HardwareHierarchyView = "group" | "hierarchy";

export interface HardwareHierarchyScopeBreadcrumb {
  readonly value: string;
  readonly label: string;
}

/** Builds view-only ancestor navigation for the selected hierarchy scope. */
export function hardwareHierarchyScopeBreadcrumbs(scope: string): readonly HardwareHierarchyScopeBreadcrumb[] {
  const breadcrumbs: HardwareHierarchyScopeBreadcrumb[] = [{ value: "all", label: "All scopes" }];
  if (scope === "all") return Object.freeze(breadcrumbs);
  if (scope === "(root)") {
    breadcrumbs.push({ value: "(root)", label: "(root)" });
    return Object.freeze(breadcrumbs);
  }

  let path = "";
  for (const segment of scope.split(".")) {
    path = path ? `${path}.${segment}` : segment;
    breadcrumbs.push({ value: path, label: segment });
  }
  return Object.freeze(breadcrumbs);
}

export interface HardwareHierarchyEntry {
  readonly signalId: SignalId;
  readonly scope: string;
  readonly instancePath: string;
  readonly relativePath: string;
  readonly signalName: string;
  readonly displayName: string;
  readonly fullPath: string;
  readonly role: string;
  readonly type: string;
  readonly width: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly groupOrder: number;
  readonly rowOrder: number;
}

export interface HardwareHierarchyRowLocation {
  readonly groupId: string;
  readonly groupName: string;
  readonly groupOrder: number;
  readonly rowOrder: number;
}

export interface HardwareHierarchyRowIndex {
  readonly locations: ReadonlyMap<SignalId, HardwareHierarchyRowLocation>;
  readonly metrics: Readonly<{ buildDurationMs: number; rowsVisited: number; indexEntries: number }>;
}

export interface HardwareHierarchyEntryDerivation {
  readonly entries: readonly HardwareHierarchyEntry[];
  readonly metrics: Readonly<{ buildDurationMs: number; signalsVisited: number; entriesCreated: number }>;
}

function now(): number {
  const runtimePerformance = (globalThis as typeof globalThis & { performance?: { now?: () => number } }).performance;
  return runtimePerformance?.now?.() ?? Date.now();
}

/** Builds the view-only row ownership index once for a canonical group collection. */
export function buildHardwareHierarchyRowIndex(signalGroups: CanonicalDocument["signalGroups"]): HardwareHierarchyRowIndex {
  const startedAt = now();
  const locations = new Map<SignalId, HardwareHierarchyRowLocation>();
  let rowsVisited = 0;
  signalGroups.forEach((group, groupOrder) => group.rows.forEach((rowId, rowOrder) => {
    rowsVisited += 1;
    const signalId = rowId as SignalId;
    // Preserve the historical first matching row behavior if malformed data repeats an ID.
    if (!locations.has(signalId)) locations.set(signalId, Object.freeze({ groupId: group.id, groupName: group.name, groupOrder, rowOrder }));
  }));
  const immutableLocations = new Proxy(locations, {
    get(target, property) {
      if (property === "set" || property === "delete" || property === "clear") return () => { throw new TypeError("Hardware hierarchy row index is immutable."); };
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ReadonlyMap<SignalId, HardwareHierarchyRowLocation>;
  return Object.freeze({
    locations: immutableLocations,
    metrics: Object.freeze({ buildDurationMs: Math.max(0, now() - startedAt), rowsVisited, indexEntries: locations.size }),
  });
}

export function deriveHardwareHierarchyEntries(document: CanonicalDocument, view: HardwareHierarchyView = "group", scope?: string, rowIndex: HardwareHierarchyRowIndex = buildHardwareHierarchyRowIndex(document.signalGroups)): HardwareHierarchyEntryDerivation {
  const startedAt = now();
  const scopeSegments = scope === undefined ? undefined : scope === "(root)" ? [] : scope.split(".");
  let signalsVisited = 0;
  const entries: HardwareHierarchyEntry[] = [];
  for (const signal of document.signals) {
    signalsVisited += 1;
    if (signal.type === "commentRow") continue;
    const location = rowIndex.locations.get(signal.id);
    if (!location) continue;
    const instancePathSegments = signal.source.instancePath;
    const instancePath = instancePathSegments.join(".");
    if (scopeSegments !== undefined && (scopeSegments.length > instancePathSegments.length || !scopeSegments.every((segment, index) => instancePathSegments[index] === segment))) continue;
    if (scope === "(root)" && instancePathSegments.length !== 0) continue;
    const hasEmbeddedBusRange = /\[\d+:\d+\]$/.test(signal.source.signalName);
    const sourceLeafPath = signal.type === "bus" && !hasEmbeddedBusRange && signal.source.msb !== undefined && signal.source.lsb !== undefined
      ? `${signal.source.signalName}[${signal.source.msb}:${signal.source.lsb}]`
      : signal.source.signalName;
    const fullPath = [...instancePathSegments, sourceLeafPath].join(".") || sourceLeafPath;
    const relativePath = [...instancePathSegments.slice(scopeSegments?.length ?? 0), sourceLeafPath].join(".");
    const width = signal.type === "bus" ? `[${signal.source.msb ?? (signal.width ?? 1) - 1}:${signal.source.lsb ?? 0}]` : "—";
    entries.push({ signalId: signal.id, scope: instancePath || "(root)", instancePath: instancePath || "(root)", relativePath, signalName: signal.source.signalName, displayName: signal.display.name, fullPath, role: signal.role, type: signal.type, width, groupId: location.groupId, groupName: location.groupName, groupOrder: location.groupOrder, rowOrder: location.rowOrder });
  }
  const sortedEntries = Object.freeze([...entries].sort((left, right) => view === "group"
    ? left.groupOrder - right.groupOrder || left.rowOrder - right.rowOrder || left.signalId.localeCompare(right.signalId)
    : left.fullPath.localeCompare(right.fullPath) || left.signalId.localeCompare(right.signalId)));
  return Object.freeze({
    entries: sortedEntries,
    metrics: Object.freeze({ buildDurationMs: Math.max(0, now() - startedAt), signalsVisited, entriesCreated: sortedEntries.length }),
  });
}

export function buildHardwareHierarchyEntries(document: CanonicalDocument, view: HardwareHierarchyView = "group", scope?: string): readonly HardwareHierarchyEntry[] {
  return deriveHardwareHierarchyEntries(document, view, scope).entries;
}

export function filterHardwareHierarchyEntries(entries: readonly HardwareHierarchyEntry[], query: string): readonly HardwareHierarchyEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return entries;
  return Object.freeze(entries.filter((entry) => [entry.fullPath, entry.instancePath, entry.signalName, entry.displayName, entry.groupName, entry.role, entry.type, entry.width]
    .some((value) => value.toLocaleLowerCase().includes(normalized))));
}

export function hardwareHierarchyScopes(document: CanonicalDocument): readonly string[] {
  const scopes = new Set<string>();
  for (const signal of document.signals) {
    if (signal.type === "commentRow") continue;
    if (signal.source.instancePath.length === 0) { scopes.add("(root)"); continue; }
    for (let end = 1; end <= signal.source.instancePath.length; end += 1) scopes.add(signal.source.instancePath.slice(0, end).join("."));
  }
  return Object.freeze([...scopes].sort((left, right) => left.localeCompare(right)));
}
