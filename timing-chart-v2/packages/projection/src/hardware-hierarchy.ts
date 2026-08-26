import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";

export type HardwareHierarchyView = "group" | "hierarchy";

export interface HardwareHierarchyEntry {
  readonly signalId: SignalId;
  readonly scope: string;
  readonly instancePath: string;
  readonly relativePath: string;
  readonly signalName: string;
  readonly fullPath: string;
  readonly role: string;
  readonly type: string;
  readonly width: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly groupOrder: number;
  readonly rowOrder: number;
}

export function buildHardwareHierarchyEntries(document: CanonicalDocument, view: HardwareHierarchyView = "group", scope?: string): readonly HardwareHierarchyEntry[] {
  const entries = document.signals.filter((signal) => signal.type !== "commentRow").flatMap((signal) => {
    const location = document.signalGroups.flatMap((group, groupOrder) => group.rows.map((rowId, rowOrder) => ({ rowId, group, groupOrder, rowOrder }))).find((item) => item.rowId === signal.id);
    if (!location) return [];
    const instancePath = signal.source.instancePath.join(".");
    if (scope !== undefined && instancePath !== scope) return [];
    const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName;
    const width = signal.type === "bus" ? `[${signal.source.msb ?? (signal.width ?? 1) - 1}:${signal.source.lsb ?? 0}]` : "—";
    return [{ signalId: signal.id, scope: instancePath || "(root)", instancePath: instancePath || "(root)", relativePath: signal.source.signalName, signalName: signal.source.signalName, fullPath, role: signal.role, type: signal.type, width, groupId: location.group.id, groupName: location.group.name, groupOrder: location.groupOrder, rowOrder: location.rowOrder } satisfies HardwareHierarchyEntry];
  });
  return Object.freeze([...entries].sort((left, right) => view === "group"
    ? left.groupOrder - right.groupOrder || left.rowOrder - right.rowOrder || left.signalId.localeCompare(right.signalId)
    : left.fullPath.localeCompare(right.fullPath) || left.signalId.localeCompare(right.signalId)));
}

export function hardwareHierarchyScopes(document: CanonicalDocument): readonly string[] {
  return Object.freeze([...new Set(buildHardwareHierarchyEntries(document).map((entry) => entry.instancePath))].sort((left, right) => left.localeCompare(right)));
}
