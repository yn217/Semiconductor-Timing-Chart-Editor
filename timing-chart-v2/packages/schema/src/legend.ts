import type { CanonicalDocument, LegendEntry, SignalRole } from "./types.js";

export type EffectiveLegendEntry = Pick<LegendEntry, "id" | "role" | "label">;

const effectiveLegendEntriesBySignals = new WeakMap<CanonicalDocument["signals"], WeakMap<CanonicalDocument["legend"], readonly EffectiveLegendEntry[]>>();

/** Resolve the one effective legend list shared by Editor and Export. */
export function effectiveLegendEntries(document: Pick<CanonicalDocument, "signals" | "legend">): readonly EffectiveLegendEntry[] {
  let entriesByLegend = effectiveLegendEntriesBySignals.get(document.signals);
  const cached = entriesByLegend?.get(document.legend);
  if (cached) return cached;

  const usedRoles = new Set<SignalRole>(document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.role));
  const entries = document.legend.items?.length
    ? document.legend.items.filter((entry) => entry.visible && (!document.legend.usedRolesOnly || usedRoles.has(entry.role))).map(({ id, role, label }) => ({ id, role, label }))
    : (document.legend.usedRolesOnly ? [...usedRoles].sort() : ["input", "output", "internal"] as const).map((role) => ({ id: `legend_${role}`, role, label: role }));
  const resolved = [...entries].sort((left, right) => {
    const leftOrder = document.legend.items?.find((entry) => entry.id === left.id)?.order ?? 0;
    const rightOrder = document.legend.items?.find((entry) => entry.id === right.id)?.order ?? 0;
    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });
  if (!entriesByLegend) {
    entriesByLegend = new WeakMap();
    effectiveLegendEntriesBySignals.set(document.signals, entriesByLegend);
  }
  entriesByLegend.set(document.legend, resolved);
  return resolved;
}
