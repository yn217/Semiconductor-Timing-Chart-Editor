import { cachedTimeGroupHierarchy, type CanonicalDocument, type GroupId, type RowId, type Signal, type SpacerRow } from "@timing-chart-v2/schema";
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
  readonly matchingSignalCount: number;
}

export interface SignalTreeFilter {
  readonly text: string;
  readonly type: "all" | "input" | "output" | "wire" | "comment";
}

export interface RowLayoutSourceIndex {
  readonly signals: CanonicalDocument["signals"];
  readonly signalGroups: CanonicalDocument["signalGroups"];
  readonly signalsById: ReadonlyMap<string, Signal>;
  readonly signalIndexById: ReadonlyMap<string, number>;
  readonly spacersById: ReadonlyMap<string, SpacerRow>;
  readonly canonicalRowIds: readonly RowId[];
}

const rowLayoutSourceIndexes = new WeakMap<CanonicalDocument["signals"], WeakMap<CanonicalDocument["signalGroups"], RowLayoutSourceIndex>>();

export function getRowLayoutSourceIndex(document: CanonicalDocument): Readonly<{ index: RowLayoutSourceIndex; built: boolean }> {
  let byGroups = rowLayoutSourceIndexes.get(document.signals);
  const cached = byGroups?.get(document.signalGroups);
  if (cached) return { index: cached, built: false };

  const signalsById = new Map<string, Signal>();
  const signalIndexById = new Map<string, number>();
  const indexedSignals = document.signals.map((signal, index) => [signal, index] as const);
  for (const [signal, index] of indexedSignals) {
    signalsById.set(signal.id, signal);
    signalIndexById.set(signal.id, index);
  }
  const spacersById = new Map<string, SpacerRow>();
  for (const group of document.signalGroups) for (const spacer of group.spacers ?? []) spacersById.set(spacer.id, spacer);
  const canonicalRowIds = document.signalGroups.flatMap((group) => group.rows);
  const index = Object.freeze({ signals: document.signals, signalGroups: document.signalGroups, signalsById, signalIndexById, spacersById, canonicalRowIds });
  if (!byGroups) {
    byGroups = new WeakMap();
    rowLayoutSourceIndexes.set(document.signals, byGroups);
  }
  byGroups.set(document.signalGroups, index);
  return { index, built: true };
}

export function buildRowLayoutSourceIndex(document: CanonicalDocument): RowLayoutSourceIndex {
  return getRowLayoutSourceIndex(document).index;
}

/** Returns the visible rows intersecting a vertical viewport in O(log N + K).
 * Row layouts are emitted in Y order without vertical overlap; zero-height
 * bookkeeping rows may share a boundary but preserve that ordering. */
export function rowsIntersectingVerticalViewport<T extends Pick<RowLayoutEntry, "visible" | "y" | "height">>(rows: readonly T[], viewportStartY: number, viewportEndY: number): readonly T[] {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle]!.y + rows[middle]!.height < viewportStartY) low = middle + 1;
    else high = middle;
  }
  const result: T[] = [];
  for (let index = low; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (row.y > viewportEndY) break;
    if (row.visible && row.y + row.height >= viewportStartY) result.push(row);
  }
  return result;
}

/** Height the time ruler adds above its 34px tick band for Time Group outline levels (20px per level). Single owner: the ruler
 * frame (build-ruler) and the row-Y origin below both use it, so rows never start under the taller ruler (#901). */
export function timeGroupOutlineHeight(document: Pick<CanonicalDocument, "timeGroups">): number {
  if (document.timeGroups.length === 0) return 0;
  return (cachedTimeGroupHierarchy(document.timeGroups).maxDepth + 1) * 20;
}

export function calculateRowLayout(document: CanonicalDocument, collapsedGroupIds: ReadonlySet<GroupId> = new Set(), options: { readonly includeHidden?: boolean; readonly reserveHiddenSpace?: boolean; readonly pane?: "upper" | "lower"; readonly sourceIndex?: RowLayoutSourceIndex; readonly treeFilter?: SignalTreeFilter } = {}): RowLayoutResult {
  const includeHidden = options.includeHidden ?? true;
  // Signal Split is two viewports over the same canonical Signal sequence.
  // The legacy pane option remains accepted by callers during migration, but
  // it no longer filters rows based on deprecated per-signal assignment.
  const matchesPane = (_signal: Signal): boolean => true;
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
  const requestedSourceIndex = options.sourceIndex;
  const sourceIndex = requestedSourceIndex?.signals === document.signals && requestedSourceIndex.signalGroups === document.signalGroups
    ? requestedSourceIndex
    : buildRowLayoutSourceIndex(document);
  const signals = sourceIndex.signalsById;
  const spacers = sourceIndex.spacersById;
  const canonicalRowIds = sourceIndex.canonicalRowIds;
  const navigationRows: RowLayoutEntry[] = [];
  const visibleRows: RowLayoutEntry[] = [];
  const groupHeaders: GroupHeaderLayoutEntry[] = [];
  const paneExcludedRowIds = new Set<RowId>();
  const normalizedQuery = options.treeFilter?.text.trim().toLocaleLowerCase() ?? "";
  const filterActive = normalizedQuery.length > 0 || (options.treeFilter?.type ?? "all") !== "all";
  let matchingSignalCount = 0;
  // Rows start below the ruler outline band (the first Group header sits under the 34px tick band, as before).
  let y = timeGroupOutlineHeight(document);

  for (const group of document.signalGroups) {
    const eligibleRows = group.rows.filter((rowId) => {
      const signal = signals.get(rowId);
      return (signal !== undefined && (includeHidden || signal.display.visible !== false)) || spacers.has(rowId);
    });
    const matchesFilter = (rowId: RowId) => {
      const signal = signals.get(rowId);
      const spacer = spacers.get(rowId);
      const kind = signal?.type === "commentRow" ? "comment" : spacer ? "spacer" : "timing";
      const role = signal?.role;
      const type = options.treeFilter?.type ?? "all";
      const typeMatch = !filterActive || type === "all" || (type === "comment" ? kind === "comment" : type === "wire" ? role === "internal" : role === type);
      if (!typeMatch) return false;
      const textMatch = !filterActive || normalizedQuery.length === 0 || [signal?.display.name,
        signal ? [...signal.source.instancePath, signal.source.signalName].join(".") : "",
        signal?.source.instancePath.join("."), role, group.name].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery);
      if (textMatch && signal && signal.type !== "commentRow") matchingSignalCount += 1;
      return textMatch;
    };
    const groupRows = eligibleRows.filter(matchesFilter);
    if (filterActive && groupRows.length === 0) continue;
    y += group.spacingBefore ?? 0;
    const headerRowId = `${group.id}:header` as RowLayoutEntry["rowId"];
    // A search reveals matches inside collapsed groups without changing the
    // user's persisted collapse state; clearing the filter restores it.
    const collapsed = !filterActive && collapsedGroupIds.has(group.id);
    const headerHeight = group.style?.showHeader === false ? 0 : group.style?.headerHeight ?? 32;
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
  return { canonicalRowIds, navigationRows, visibleRows, groupHeaders, totalHeight: y, paneExcludedRowIds, matchingSignalCount };
}

export function signalEntry(signal: Signal | undefined, groupId: RowLayoutEntry["groupId"], groupName: string, groupStyle: RowLayoutEntry["groupStyle"], y: number, height: number, rowId: RowId): RowLayoutEntry | undefined {
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
