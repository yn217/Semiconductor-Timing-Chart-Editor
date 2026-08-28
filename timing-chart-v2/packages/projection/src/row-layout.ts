import type { CanonicalDocument, GroupId, RowId, Signal, SpacerRow } from "@timing-chart-v2/schema";
import type { GroupHeaderLayoutEntry, RowLayoutEntry } from "./types.js";

export interface RowLayoutResult {
  readonly canonicalRowIds: readonly RowId[];
  /** Rows retained by navigation surfaces, including intentionally hidden signals. */
  readonly navigationRows: readonly RowLayoutEntry[];
  /** Rows that may be rendered by the waveform/timing projection. */
  readonly visibleRows: readonly RowLayoutEntry[];
  readonly groupHeaders: readonly GroupHeaderLayoutEntry[];
  readonly totalHeight: number;
}

export function calculateRowLayout(document: CanonicalDocument, collapsedGroupIds: ReadonlySet<GroupId> = new Set()): RowLayoutResult {
  const signals = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const spacers = new Map<string, SpacerRow>();
  for (const group of document.signalGroups) for (const spacer of group.spacers ?? []) spacers.set(spacer.id, spacer);
  const canonicalRowIds = document.signalGroups.flatMap((group) => group.rows);
  const navigationRows: RowLayoutEntry[] = [];
  const visibleRows: RowLayoutEntry[] = [];
  const groupHeaders: GroupHeaderLayoutEntry[] = [];
  let y = 0;

  for (const group of document.signalGroups) {
    const groupRows = group.rows.filter((rowId) => {
      const signal = signals.get(rowId);
      return signal !== undefined || spacers.has(rowId);
    });
    if (groupRows.length === 0) continue;
    y += group.spacingBefore ?? 0;
    const headerRowId = `${group.id}:header` as RowLayoutEntry["rowId"];
    const collapsed = collapsedGroupIds.has(group.id);
    groupHeaders.push({ rowId: headerRowId, groupId: group.id, groupName: group.name, ...(group.style === undefined ? {} : { groupStyle: group.style }), collapsed, y, height: 32 });
    y += 32;
    if (collapsed) {
      y += group.spacingAfter ?? 0;
      continue;
    }
    let visibleInGroup = 0;
    for (const rowId of groupRows) {
      const signal = signals.get(rowId);
      const spacer = spacers.get(rowId);
      if (visibleInGroup > 0) y += document.layout.signalSpacing;
      if (signal) y += signal.spacingBefore ?? 0;
      const entry = signalEntry(signal, group.id, group.name, group.style, y, document.layout.rowHeight, rowId);
      if (entry) {
        navigationRows.push(entry);
        if (entry.visible) visibleRows.push(entry);
        y += entry.height + (signal?.spacingAfter ?? 0);
      } else if (spacer) {
        const spacerEntry = { rowId, groupId: group.id, groupName: group.name, kind: "spacer" as const, name: "", visible: true, y, height: spacer.height };
        navigationRows.push(spacerEntry);
        visibleRows.push(spacerEntry);
        y += spacerEntry.height;
      }
      visibleInGroup += 1;
    }
    y += group.spacingAfter ?? 0;
  }
  return { canonicalRowIds, navigationRows, visibleRows, groupHeaders, totalHeight: y };
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
    visible: signal.display.visible !== false,
    instancePath: signal.source.instancePath,
    fullPath: [...signal.source.instancePath, signal.source.signalName].join("."),
    y,
    height,
  };
}
