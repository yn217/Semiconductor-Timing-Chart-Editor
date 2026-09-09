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
  /** Signal Split View (#200): rowIds present in `navigationRows` purely for
   * Y-sequence bookkeeping (see the no-dead-gap comment below) whose Signal
   * does not belong to the requested `pane`. Distinct from "hidden" -- a
   * pane-mismatched row is never actually rendered by a caller that owns one
   * fixed pane (unlike a hidden Signal, which genuinely stays in that pane's
   * own Left Tree). A pane-fixed caller (see `DefaultProjectionService`)
   * uses this set to drop these rows before mounting, so each pane's own
   * Left Tree/Frozen/Timing shows only its own Signals. Always empty when
   * `pane` is omitted, so every existing call site is unaffected. */
  readonly paneExcludedRowIds: ReadonlySet<RowId>;
}

export function calculateRowLayout(document: CanonicalDocument, collapsedGroupIds: ReadonlySet<GroupId> = new Set(), options: { readonly includeHidden?: boolean; readonly reserveHiddenSpace?: boolean; readonly pane?: "upper" | "lower" } = {}): RowLayoutResult {
  const includeHidden = options.includeHidden ?? true;
  // Signal Split View (#200): a signal's `display.splitPane` (absent means
  // "both", i.e. today's single-pane behavior) opts it into a specific
  // pane's Frozen/Timing rendering. Omitting `pane` entirely (every
  // existing call site) matches every row, byte-for-byte identical to
  // pre-#200 behavior -- this option only takes effect for a caller that
  // explicitly requests one pane's filtered view.
  const matchesPane = (signal: Signal): boolean => options.pane === undefined || (signal.display.splitPane ?? "both") === "both" || signal.display.splitPane === options.pane;
  // Navigation surfaces (Left Tree) show every row -- hidden ones included,
  // each occupying its own real slot -- so their Y sequence must reserve
  // space for hidden rows exactly like visible ones (reserveHiddenSpace
  // defaults true, matching that use). The Frozen/Timing layout instead
  // consumes visibleRows/groupHeaders from this same call and must never
  // draw a hidden signal; without this flag it kept advancing `y` by a
  // hidden row's full height anyway, leaving a dead visual gap where the
  // hidden row would have been -- see the caller passing
  // `reserveHiddenSpace: false` for that instance.
  const reserveHiddenSpace = options.reserveHiddenSpace ?? true;
  const signals = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const spacers = new Map<string, SpacerRow>();
  for (const group of document.signalGroups) for (const spacer of group.spacers ?? []) spacers.set(spacer.id, spacer);
  const canonicalRowIds = document.signalGroups.flatMap((group) => group.rows);
  const navigationRows: RowLayoutEntry[] = [];
  const visibleRows: RowLayoutEntry[] = [];
  const groupHeaders: GroupHeaderLayoutEntry[] = [];
  const paneExcludedRowIds = new Set<RowId>();
  let y = 0;

  for (const group of document.signalGroups) {
    const groupRows = group.rows.filter((rowId) => {
      const signal = signals.get(rowId);
      return (signal !== undefined && (includeHidden || signal.display.visible !== false)) || spacers.has(rowId);
    });
    y += group.spacingBefore ?? 0;
    const headerRowId = `${group.id}:header` as RowLayoutEntry["rowId"];
    const collapsed = collapsedGroupIds.has(group.id);
    const headerHeight = group.style?.showHeader === false ? 0 : 32;
    groupHeaders.push({ rowId: headerRowId, groupId: group.id, groupName: group.name, ...(group.style === undefined ? {} : { groupStyle: group.style }), collapsed, y, height: headerHeight });
    y += headerHeight;
    if (collapsed) {
      y += group.spacingAfter ?? 0;
      continue;
    }
    let visibleInGroup = 0;
    for (const rowId of groupRows) {
      const signal = signals.get(rowId);
      const spacer = spacers.get(rowId);
      const isHiddenSignal = signal !== undefined && signal.display.visible === false;
      const isPaneExcluded = signal !== undefined && !matchesPane(signal);
      if (isPaneExcluded) paneExcludedRowIds.add(rowId);
      if ((isHiddenSignal || isPaneExcluded) && !reserveHiddenSpace) {
        // Positioned at the current (unreserved) y so it remains
        // findable/orderable by rowId, but consumes no space of its own --
        // the next space-reserving entry starts exactly where this one
        // would have, with no dead gap left behind.
        const entry = signalEntry(signal, group.id, group.name, group.style, y, document.layout.rowHeight, rowId);
        if (entry) navigationRows.push(entry);
        continue;
      }
      if (visibleInGroup > 0) y += document.layout.signalSpacing;
      if (signal) y += signal.spacingBefore ?? 0;
      const entry = signalEntry(signal, group.id, group.name, group.style, y, document.layout.rowHeight, rowId);
      if (entry) {
        navigationRows.push(entry);
        if (entry.visible && (signal === undefined || matchesPane(signal))) visibleRows.push(entry);
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
  return { canonicalRowIds, navigationRows, visibleRows, groupHeaders, totalHeight: y, paneExcludedRowIds };
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
    signalType: signal.type,
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
