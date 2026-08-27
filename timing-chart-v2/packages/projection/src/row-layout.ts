import type { CanonicalDocument, RowId, Signal, SpacerRow } from "@timing-chart-v2/schema";
import type { GroupHeaderLayoutEntry, RowLayoutEntry } from "./types.js";

export interface RowLayoutResult {
  readonly canonicalRowIds: readonly RowId[];
  readonly visibleRows: readonly RowLayoutEntry[];
  readonly groupHeaders: readonly GroupHeaderLayoutEntry[];
  readonly totalHeight: number;
}

export function calculateRowLayout(document: CanonicalDocument): RowLayoutResult {
  const signals = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const spacers = new Map<string, SpacerRow>();
  for (const group of document.signalGroups) for (const spacer of group.spacers ?? []) spacers.set(spacer.id, spacer);
  const canonicalRowIds = document.signalGroups.flatMap((group) => group.rows);
  const visibleRows: RowLayoutEntry[] = [];
  const groupHeaders: GroupHeaderLayoutEntry[] = [];
  let y = 0;

  for (const group of document.signalGroups) {
    const visibleGroupRows = group.rows.filter((rowId) => {
      const signal = signals.get(rowId);
      return signal?.display.visible !== false && (signal !== undefined || spacers.has(rowId));
    });
    if (visibleGroupRows.length === 0) continue;
    y += group.spacingBefore ?? 0;
    const headerRowId = `${group.id}:header` as RowLayoutEntry["rowId"];
    groupHeaders.push({ rowId: headerRowId, groupId: group.id, groupName: group.name, ...(group.style === undefined ? {} : { groupStyle: group.style }), y, height: 32 });
    y += 32;
    let visibleInGroup = 0;
    for (const rowId of visibleGroupRows) {
      const signal = signals.get(rowId);
      const spacer = spacers.get(rowId);
      if (visibleInGroup > 0) y += document.layout.signalSpacing;
      if (signal) y += signal.spacingBefore ?? 0;
      const entry = signalEntry(signal, group.id, group.name, group.style, y, document.layout.rowHeight, rowId);
      if (entry) {
        visibleRows.push(entry);
        y += entry.height + (signal?.spacingAfter ?? 0);
      } else if (spacer) {
        visibleRows.push({ rowId, groupId: group.id, groupName: group.name, kind: "spacer", name: "", y, height: spacer.height });
        y += spacer.height;
      }
      visibleInGroup += 1;
    }
    y += group.spacingAfter ?? 0;
  }
  return { canonicalRowIds, visibleRows, groupHeaders, totalHeight: y };
}

function signalEntry(signal: Signal | undefined, groupId: RowLayoutEntry["groupId"], groupName: string, groupStyle: RowLayoutEntry["groupStyle"], y: number, height: number, rowId: RowId): RowLayoutEntry | undefined {
  if (!signal) return undefined;
  return {
    rowId,
    groupId,
    groupName,
    ...(groupStyle === undefined ? {} : { groupStyle }),
    kind: signal.type === "commentRow" ? "comment" : "timing",
    name: signal.display.name,
    ...(signal.type === "commentRow" ? { commentTitle: signal.title, commentBody: signal.body } : {}),
    role: signal.role,
    ...(signal.display.style === undefined ? {} : { displayStyle: signal.display.style }),
    ...(signal.display.align === undefined ? {} : { displayAlign: signal.display.align }),
    ...(signal.display.overflow === undefined ? {} : { displayOverflow: signal.display.overflow }),
    instancePath: signal.source.instancePath,
    fullPath: [...signal.source.instancePath, signal.source.signalName].join("."),
    y,
    height,
  };
}
