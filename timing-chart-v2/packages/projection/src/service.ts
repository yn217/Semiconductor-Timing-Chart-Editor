import type { GroupId, Signal, SignalId } from "@timing-chart-v2/schema";
import { calculateRowLayout, getRowLayoutSourceIndex, signalEntry } from "./row-layout.js";
import { projectPinnedRows } from "./pinned-rows.js";
import type { ProjectionRequest, ProjectionService, RenderProjection, RowLayoutEntry, VirtualizationWindow } from "./types.js";
import type { RowLayoutResult, RowLayoutSourceIndex } from "./row-layout.js";

const defaultTransform = { scrollX: 0, scrollY: 0, zoom: 1 } as const;
type SignalGroup = ProjectionRequest["snapshot"]["document"]["signalGroups"][number];
type RowPresentationPatch = Readonly<{
  changed: ReadonlySet<RowLayoutEntry["rowId"]>;
  signals: ReadonlyMap<RowLayoutEntry["rowId"], Signal>;
  groups: ReadonlyMap<SignalGroup["id"], SignalGroup>;
}>;

export class DefaultProjectionService implements ProjectionService {
  // Signal Split View (#200): an optional fixed pane filter for this
  // instance's own Frozen/Timing + Left Tree row set. `undefined` (every
  // caller before #200, and this instance's default) matches every row,
  // byte-for-byte identical to pre-#200 behavior. `setPane` lets the single
  // Upper-pane instance switch between unfiltered (Split off) and
  // pane:"upper" (Split on) without constructing a second instance -- the
  // Lower pane owns its own separate instance constructed with pane:"lower"
  // and never changes it. This is presentation-only: it never introduces a
  // second horizontal/pixels-per-cycle authority, only a second vertical row
  // filter.
  #pane: "upper" | "lower" | undefined;
  #layout: ReturnType<typeof calculateRowLayout> | undefined;
  #navigationLayout: ReturnType<typeof calculateRowLayout> | undefined;
  #projectionBuilds = 0;
  #viewportOnlyBuilds = 0;
  #fullVisibleRowScans = 0;
  #viewportRowsVisited = 0;
  #viewportBinarySearchSteps = 0;
  #groupHeadersVisited = 0;
  #rowLayoutBuilds = 0;
  #rowLayoutSourceIndexBuilds = 0;
  #rowLayoutSourceIndex: RowLayoutSourceIndex | undefined;
  #lastMountedRange: readonly [number, number] = [0, 0];
  #signalIndexById: ReadonlyMap<string, number> = new Map();
  #rowIndexById = new Map<RowLayoutEntry["rowId"], number>();
  #visibleRowIndexById = new Map<RowLayoutEntry["rowId"], number>();
  #navigationRowIndexById = new Map<RowLayoutEntry["rowId"], number>();
  #collapsedGroupKey = "";
  #treeFilterKey = "";
  #groupStylePreviewKey = "";
  #documentEpoch = 0;
  #canonicalSignals: ProjectionRequest["snapshot"]["document"]["signals"] | undefined;
  #canonicalSignalIds: readonly SignalId[] = [];
  #visibleRowIds: readonly RowLayoutEntry["rowId"][] = [];

  constructor(options: { readonly pane?: "upper" | "lower" } = {}) {
    this.#pane = options.pane;
  }

  /** Switches this instance's fixed pane filter and forces the next
   * `project()` call to rebuild the row layout, since the previous cache was
   * built for the old filter. Used only by the Upper-pane instance to toggle
   * between unfiltered (Split off) and pane:"upper" (Split on); the Lower
   * instance is always constructed with its pane fixed and never calls this. */
  setPane(pane: "upper" | "lower" | undefined): void {
    if (this.#pane === pane) return;
    this.#pane = pane;
    this.#layout = undefined;
    this.#navigationLayout = undefined;
  }

  project(request: ProjectionRequest): RenderProjection {
    const document = request.snapshot.document;
    if (request.changeSet.fullDocumentReplace) this.#documentEpoch += 1;
    const collapsedGroupIds = [...new Set(request.collapsedGroupIds ?? [])].sort() as GroupId[];
    const collapsedGroupKey = collapsedGroupIds.join("\u0000");
    const signalTreeFilter = request.signalTreeFilter ?? "";
    const signalTreeTypeFilter = request.signalTreeTypeFilter ?? "all";
    const normalizedTreeFilter = signalTreeFilter.trim().toLocaleLowerCase();
    const treeFilterKey = `${signalTreeTypeFilter}\u0000${normalizedTreeFilter}`;
    const groupStylePreviewKey = request.groupStylePreview === undefined
      ? ""
      : `${request.groupStylePreview.groupId}\u0000${JSON.stringify(request.groupStylePreview.style)}`;
    const groupStylePreviewChanged = this.#groupStylePreviewKey !== groupStylePreviewKey;
    const presentationKeys = Object.keys(request.changeSet);
    const annotationOnlyChange = presentationKeys.some((key) => key === "annotationPosition" || key === "annotationStyle" || key === "annotationOrder" || key === "annotationGroups")
      && presentationKeys.every((key) => key === "annotationPosition" || key === "annotationStyle" || key === "annotationOrder" || key === "annotationGroups" || key === "minimapOverview" || key === "timingDiagnosticsUnchanged");
    const presentationOnlyRows = request.changeSet.rowPresentation !== undefined
      && presentationKeys.every((key) => key === "rowPresentation" || key === "timingDiagnosticsUnchanged" || key === "minimapOverview");
    if (presentationOnlyRows && !groupStylePreviewChanged && request.previous && this.#layout && this.#navigationLayout && this.#collapsedGroupKey === collapsedGroupKey && this.#treeFilterKey === treeFilterKey) {
      const patch = this.#patchRowPresentation(document, request.changeSet.rowPresentation!);
      this.#projectionBuilds += 1;
      return this.#projectPresentationOnly(request, patch);
    }
    if (annotationOnlyChange && !groupStylePreviewChanged && request.previous && this.#layout && this.#navigationLayout && this.#collapsedGroupKey === collapsedGroupKey && this.#treeFilterKey === treeFilterKey) {
      this.#projectionBuilds += 1;
      return { ...request.previous, revision: request.snapshot.revision, waveSignalIds: [] };
    }
    const invalidatesLayout = groupStylePreviewChanged || request.changeSet.fullDocumentReplace || request.changeSet.rowOrder !== undefined || request.changeSet.rowPresentation !== undefined || request.changeSet.geometryScreenY !== undefined || request.changeSet.addedSignals !== undefined || request.changeSet.removedSignals !== undefined || request.changeSet.addedGroups !== undefined || request.changeSet.removedGroups !== undefined;
    if (!this.#layout || !this.#navigationLayout || invalidatesLayout || this.#collapsedGroupKey !== collapsedGroupKey || this.#treeFilterKey !== treeFilterKey) {
      const cachedSourceIndex = this.#rowLayoutSourceIndex;
      if (!cachedSourceIndex || cachedSourceIndex.signals !== document.signals || cachedSourceIndex.signalGroups !== document.signalGroups) {
        const sourceIndex = getRowLayoutSourceIndex(document);
        this.#rowLayoutSourceIndex = sourceIndex.index;
        if (sourceIndex.built) this.#rowLayoutSourceIndexBuilds += 1;
      }
      // Keep hidden rows present (by rowId) so a previously-mounted, now-
      // hidden row can still be looked up during retention, but their Y
      // reserves no space here (reserveHiddenSpace: false) -- this
      // instance feeds Frozen/Timing (rowLayout/groupHeaders/visibleRows
      // below), which must never leave a dead gap where a hidden signal
      // used to render. The separate #navigationLayout below (Left Tree)
      // keeps the default reserveHiddenSpace so every row -- hidden ones
      // included -- gets its own real slot there.
      const sourceIndex = this.#rowLayoutSourceIndex!;
      const rawLayout = calculateRowLayout(document, new Set(), { includeHidden: true, reserveHiddenSpace: false, sourceIndex, ...(this.#pane === undefined ? {} : { pane: this.#pane }), ...(request.groupStylePreview === undefined ? {} : { groupStylePreview: request.groupStylePreview }) });
      const rawNavigationLayout = calculateRowLayout(document, new Set(collapsedGroupIds), {
        sourceIndex,
        ...(this.#pane === undefined ? {} : { pane: this.#pane }),
        treeFilter: { text: signalTreeFilter, type: signalTreeTypeFilter },
        ...(request.groupStylePreview === undefined ? {} : { groupStylePreview: request.groupStylePreview }),
      });
      // Signal Split View (#200): `calculateRowLayout` keeps a pane-mismatched
      // row in `navigationRows` purely for Y-sequence bookkeeping (see its own
      // `paneExcludedRowIds` doc) -- a pane-fixed instance (this one, when
      // `#pane` is set) must drop those rows here so mounting/Left Tree for
      // this pane only ever sees its own Signals. Every existing caller
      // (`#pane === undefined`) is unaffected: `paneExcludedRowIds` is always
      // empty in that case, so this is a no-op filter.
      this.#layout = this.#pane === undefined || rawLayout.paneExcludedRowIds.size === 0 ? rawLayout : { ...rawLayout, navigationRows: rawLayout.navigationRows.filter((row) => !rawLayout.paneExcludedRowIds.has(row.rowId)) };
      this.#navigationLayout = this.#pane === undefined || rawNavigationLayout.paneExcludedRowIds.size === 0 ? rawNavigationLayout : { ...rawNavigationLayout, navigationRows: rawNavigationLayout.navigationRows.filter((row) => !rawNavigationLayout.paneExcludedRowIds.has(row.rowId)) };
      this.#collapsedGroupKey = collapsedGroupKey;
      this.#treeFilterKey = treeFilterKey;
      this.#groupStylePreviewKey = groupStylePreviewKey;
      this.#rowLayoutBuilds += 1;
      this.#visibleRowIds = this.#layout.visibleRows.map((row) => row.rowId);
      this.#signalIndexById = sourceIndex.signalIndexById;
      this.#rowIndexById = new Map(this.#layout.navigationRows.map((row, index) => [row.rowId, index]));
      this.#visibleRowIndexById = new Map(this.#layout.visibleRows.map((row, index) => [row.rowId, index]));
      this.#navigationRowIndexById = new Map(this.#navigationLayout.navigationRows.map((row, index) => [row.rowId, index]));
    }
    const layout = this.#layout;
    const navigationLayout = this.#navigationLayout;
    this.#projectionBuilds += 1;
    if (!groupStylePreviewChanged && request.previous && request.snapshot.revision === request.previous.revision && Object.keys(request.changeSet).length === 0 && request.previous.collapsedGroupIds.join("\u0000") === collapsedGroupKey) {
      this.#viewportOnlyBuilds += 1;
      return this.#projectViewportOnly(request, layout);
    }
    this.#fullVisibleRowScans += layout.visibleRows.length;
    const visibleRowIds = this.#visibleRowIds;
    const viewportStart = request.viewport.viewportStartY - request.viewport.overscanBefore;
    const viewportEnd = request.viewport.viewportEndY + request.viewport.overscanAfter;
    const pinned = new Set(request.viewport.pinnedRowIds);
    // A full-document Open/New rebuilds the canonical layout, but rows that
    // were already mounted and still exist in the replacement document remain
    // valid viewport retention candidates. Keeping those IDs avoids making a
    // Save -> Open of the same document appear to lose rows that were visible
    // immediately before the replacement, while still filtering stale IDs
    // through the newly-built layout and preserving virtualization for new
    // offscreen rows.
    const preservePreviousRows = request.changeSet.rowOrder !== undefined || request.changeSet.fullDocumentReplace === true;
    const mountedRowsOrdered = mountRows(layout, request.viewport, pinned, preservePreviousRows ? (request.previous?.mountedRowIds ?? []) : [], this.#rowIndexById, undefined, undefined, preservePreviousRows);
    const mountedNavigationRows = mountRows(navigationLayout, request.viewport, pinned, preservePreviousRows ? (request.previous?.leftRowIds ?? []) : [], this.#navigationRowIndexById, undefined, undefined, preservePreviousRows);
    const mountedGroupHeaders = selectIntersectingHeaders(layout.groupHeaders, viewportStart, viewportEnd, undefined, (visited) => { this.#groupHeadersVisited += visited; });
    const mountedLeftGroupHeaders = selectIntersectingHeaders(navigationLayout.groupHeaders, viewportStart, viewportEnd, undefined, (visited) => { this.#groupHeadersVisited += visited; });
    const mountedRowIds = mergeIds(mountedRowsOrdered.map((row) => row.rowId), mountedNavigationRows.map((row) => row.rowId));
    this.#lastMountedRange = [mountedRowsOrdered[0]?.y ?? 0, mountedRowsOrdered.at(-1) ? mountedRowsOrdered.at(-1)!.y + mountedRowsOrdered.at(-1)!.height : 0];
    const mountedMetadata = classifyMountedRows(mountedRowsOrdered);
    const { mountedSignalIds, timingRowIds, frozenLabelRowIds } = mountedMetadata;
    const pinnedRows = projectPinnedRows({ visibleRowLayout: layout.visibleRows, rowLayout: layout.navigationRows, navigationRowLayout: navigationLayout.navigationRows, stickyRowIds: request.viewport.stickyRowIds ?? [], viewportStartY: request.viewport.viewportStartY, leadingHeaderHeight: layout.groupHeaders[0]?.height ?? 0 });
    const canonicalSignalIds = this.#canonicalSignalIdsFor(document);
    const requestedWaves = request.changeSet.fullDocumentReplace
      ? mountedSignalIds
      : (request.changeSet.waveSemantics ?? []);
    return {
      documentEpoch: this.#documentEpoch,
      revision: request.snapshot.revision,
      canonicalRowIds: layout.canonicalRowIds,
      visibleRowIds,
      mountedRowIds,
      leftRowIds: mountedNavigationRows.map((row) => row.rowId),
      frozenLabelRowIds,
      timingRowIds,
      rowLayout: pinnedRows.rowLayout,
      navigationRowLayout: pinnedRows.navigationRowLayout,
      groupHeaders: layout.groupHeaders,
      leftGroupHeaders: navigationLayout.groupHeaders,
      mountedGroupHeaderIds: mountedGroupHeaders.map((row) => row.rowId),
      mountedLeftGroupHeaderIds: mountedLeftGroupHeaders.map((row) => row.rowId),
      canonicalSignalIds,
      mountedSignalIds,
      waveSignalIds: [...new Set(requestedWaves)],
      totalHeight: layout.totalHeight,
      navigationTotalHeight: navigationLayout.totalHeight,
      signalTreeFilter,
      signalTreeTypeFilter,
      matchingSignalCount: navigationLayout.matchingSignalCount,
      transform: request.previous?.transform ?? defaultTransform,
      collapsedGroupIds,
    };
  }

  diagnostics() {
    return Object.freeze({ projectionBuilds: this.#projectionBuilds, viewportOnlyBuilds: this.#viewportOnlyBuilds, fullVisibleRowScans: this.#fullVisibleRowScans, viewportRowsVisited: this.#viewportRowsVisited, viewportBinarySearchSteps: this.#viewportBinarySearchSteps, groupHeadersVisited: this.#groupHeadersVisited, rowLayoutBuilds: this.#rowLayoutBuilds, rowLayoutSourceIndexBuilds: this.#rowLayoutSourceIndexBuilds, lastMountedRange: this.#lastMountedRange });
  }

  #canonicalSignalIdsFor(document: ProjectionRequest["snapshot"]["document"]): readonly SignalId[] {
    if (this.#canonicalSignals !== document.signals) {
      this.#canonicalSignals = document.signals;
      this.#canonicalSignalIds = document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    }
    return this.#canonicalSignalIds;
  }

  #patchRowPresentation(document: ProjectionRequest["snapshot"]["document"], rowIds: readonly RowLayoutEntry["rowId"][]) {
    const changed = new Set(rowIds);
    const signals = new Map<RowLayoutEntry["rowId"], Signal>();
    for (const rowId of rowIds) {
      const index = this.#signalIndexById.get(rowId);
      const signal = index === undefined ? undefined : document.signals[index];
      if (signal?.id === rowId) signals.set(rowId, signal);
    }
    const groups = new Map(document.signalGroups.map((group) => [group.id, group]));
    const patchRows = (rows: readonly RowLayoutEntry[], indexById: ReadonlyMap<RowLayoutEntry["rowId"], number>): readonly RowLayoutEntry[] => {
      let next: RowLayoutEntry[] | undefined;
      for (const rowId of rowIds) {
        const index = indexById.get(rowId);
        if (index === undefined) continue;
        const row = rows[index];
        if (!row || row.rowId !== rowId) continue;
        const signal = signals.get(rowId);
        const group = groups.get(row.groupId);
        const groupName = group?.name ?? row.groupName;
        const groupStyle = group?.style;
        const { groupStyle: _previousStyle, ...rowWithoutStyle } = row;
        const updated = signal
          ? signalEntry(signal, row.groupId, groupName, groupStyle, row.y, row.height, row.rowId)
          : { ...rowWithoutStyle, groupName, ...(groupStyle === undefined ? {} : { groupStyle }) };
        if (!updated) continue;
        next ??= [...rows];
        next[index] = { ...updated, ...(row.pinned === undefined ? {} : { pinned: row.pinned }) };
      }
      return next ?? rows;
    };
    const patchHeaders = (headers: RowLayoutResult["groupHeaders"]) => headers.map((header) => {
      const group = groups.get(header.groupId);
      if (!group) return header;
      const { groupStyle: _previousStyle, ...headerWithoutStyle } = header;
      return { ...headerWithoutStyle, groupName: group.name, ...(group.style === undefined ? {} : { groupStyle: group.style }) };
    });
    this.#layout = {
      ...this.#layout!,
      navigationRows: patchRows(this.#layout!.navigationRows, this.#rowIndexById),
      visibleRows: patchRows(this.#layout!.visibleRows, this.#visibleRowIndexById),
      groupHeaders: patchHeaders(this.#layout!.groupHeaders),
    };
    this.#navigationLayout = {
      ...this.#navigationLayout!,
      navigationRows: patchRows(this.#navigationLayout!.navigationRows, this.#navigationRowIndexById),
      groupHeaders: patchHeaders(this.#navigationLayout!.groupHeaders),
    };
    return { changed, signals, groups };
  }

  #projectPresentationOnly(request: ProjectionRequest, patch: RowPresentationPatch): RenderProjection {
    const previous = request.previous!;
    const updateRows = (rows: readonly RowLayoutEntry[]) => rows.map((row) => {
      if (!patch.changed.has(row.rowId)) return row;
      const group = patch.groups.get(row.groupId);
      const signal = patch.signals.get(row.rowId);
      const { groupStyle: _previousStyle, ...rowWithoutStyle } = row;
      const updated = signal
        ? signalEntry(signal, row.groupId, group?.name ?? row.groupName, group?.style, row.y, row.height, row.rowId)
        : { ...rowWithoutStyle, groupName: group?.name ?? row.groupName, ...(group?.style === undefined ? {} : { groupStyle: group.style }) };
      return updated ? { ...updated, ...(row.pinned === undefined ? {} : { pinned: row.pinned }) } : row;
    });
    return {
      ...previous,
      revision: request.snapshot.revision,
      rowLayout: updateRows(previous.rowLayout),
      navigationRowLayout: updateRows(previous.navigationRowLayout),
      groupHeaders: this.#layout!.groupHeaders,
      leftGroupHeaders: this.#navigationLayout!.groupHeaders,
      waveSignalIds: [],
    };
  }

  #projectViewportOnly(request: ProjectionRequest, layout: RowLayoutResult): RenderProjection {
    const navigationLayout = this.#navigationLayout!;
    const onStep = () => { this.#viewportBinarySearchSteps += 1; };
    const mountedRows = mountRows(layout, request.viewport, new Set(request.viewport.pinnedRowIds), request.previous!.mountedRowIds, this.#rowIndexById, onStep, (visited) => { this.#viewportRowsVisited += visited; });
    const mountedNavigationRows = mountRows(navigationLayout, request.viewport, new Set(request.viewport.pinnedRowIds), request.previous!.leftRowIds, this.#navigationRowIndexById, onStep);
    const start = request.viewport.viewportStartY - request.viewport.overscanBefore;
    const end = request.viewport.viewportEndY + request.viewport.overscanAfter;
    const mountedGroupHeaders = selectIntersectingHeaders(layout.groupHeaders, start, end, onStep, (visited) => { this.#groupHeadersVisited += visited; });
    const mountedLeftGroupHeaders = selectIntersectingHeaders(navigationLayout.groupHeaders, start, end, onStep, (visited) => { this.#groupHeadersVisited += visited; });
    const mountedRowIds = mergeIds(mountedRows.map((row) => row.rowId), mountedNavigationRows.map((row) => row.rowId));
    this.#lastMountedRange = [mountedRows[0]?.y ?? 0, mountedRows.at(-1) ? mountedRows.at(-1)!.y + mountedRows.at(-1)!.height : 0];
    const { mountedSignalIds, timingRowIds, frozenLabelRowIds } = classifyMountedRows(mountedRows);
    const pinnedRows = projectPinnedRows({ visibleRowLayout: layout.visibleRows, rowLayout: layout.navigationRows, navigationRowLayout: navigationLayout.navigationRows, stickyRowIds: request.viewport.stickyRowIds ?? [], viewportStartY: request.viewport.viewportStartY, leadingHeaderHeight: layout.groupHeaders[0]?.height ?? 0 });
    return {
      ...request.previous!,
      revision: request.snapshot.revision,
      mountedRowIds,
      leftRowIds: mountedNavigationRows.map((row) => row.rowId),
      frozenLabelRowIds,
      timingRowIds,
      mountedGroupHeaderIds: mountedGroupHeaders.map((row) => row.rowId),
      mountedLeftGroupHeaderIds: mountedLeftGroupHeaders.map((row) => row.rowId),
      mountedSignalIds,
      rowLayout: pinnedRows.rowLayout,
      navigationRowLayout: pinnedRows.navigationRowLayout,
      groupHeaders: layout.groupHeaders,
      leftGroupHeaders: navigationLayout.groupHeaders,
      navigationTotalHeight: navigationLayout.totalHeight,
      signalTreeFilter: request.signalTreeFilter ?? "",
      signalTreeTypeFilter: request.signalTreeTypeFilter ?? "all",
      matchingSignalCount: navigationLayout.matchingSignalCount,
      waveSignalIds: [],
      transform: request.previous!.transform,
      collapsedGroupIds: request.previous!.collapsedGroupIds,
    };
  }
}

function classifyMountedRows(rows: readonly RowLayoutEntry[]): { readonly mountedSignalIds: readonly SignalId[]; readonly timingRowIds: readonly RowLayoutEntry["rowId"][]; readonly frozenLabelRowIds: readonly RowLayoutEntry["rowId"][] } {
  const mountedSignalIds: SignalId[] = [];
  const timingRowIds: RowLayoutEntry["rowId"][] = [];
  const frozenLabelRowIds: RowLayoutEntry["rowId"][] = [];
  for (const row of rows) {
    if (row.kind === "timing" && row.visible) mountedSignalIds.push(row.rowId as SignalId);
    if (row.kind !== "timing" || row.visible) {
      timingRowIds.push(row.rowId);
      frozenLabelRowIds.push(row.rowId);
    }
  }
  return { mountedSignalIds, timingRowIds, frozenLabelRowIds };
}

function mountRows(
  layout: RowLayoutResult,
  viewport: VirtualizationWindow,
  pinned: ReadonlySet<RowLayoutEntry["rowId"]>,
  previousIds: readonly RowLayoutEntry["rowId"][],
  rowIndexById: ReadonlyMap<RowLayoutEntry["rowId"], number>,
  onStep?: () => void,
  onVisited?: (count: number) => void,
  preservePreviousRows = false,
): readonly RowLayoutEntry[] {
  const start = viewport.viewportStartY - viewport.overscanBefore;
  const end = viewport.viewportEndY + viewport.overscanAfter;
  // RowLayoutEntry.y is in absolute surface coordinates. The scroll window
  // starts below the one fixed surface header offset; apply that leading
  // offset once, rather than summing every preceding group header.
  const leadingHeaderOffset = layout.groupHeaders[0]?.height ?? 0;
  const firstRow = lowerBound(layout.navigationRows, start, (row) => row.y + row.height, onStep);
  const afterLastRow = upperBound(layout.navigationRows, end + leadingHeaderOffset, (row) => row.y, onStep);
  onVisited?.(Math.max(0, afterLastRow - firstRow));
  const candidateIds = new Set<RowLayoutEntry["rowId"]>();
  for (let index = firstRow; index < afterLastRow; index += 1) candidateIds.add(layout.navigationRows[index]!.rowId);
  for (const rowId of pinned) candidateIds.add(rowId);
  const retentionStart = start - 32;
  const retentionEnd = end + 32;
  for (const rowId of previousIds) {
    const index = rowIndexById.get(rowId);
    const row = index === undefined ? undefined : layout.navigationRows[index];
    if (row && (preservePreviousRows || intersects(row, retentionStart, retentionEnd))) candidateIds.add(rowId);
  }
  return [...candidateIds]
    .map((rowId) => rowIndexById.get(rowId))
    .filter((index): index is number => index !== undefined)
    .sort((left, right) => left - right)
    .map((index) => layout.navigationRows[index]!);
}

function selectIntersectingHeaders<T extends Pick<RowLayoutEntry, "y" | "height">>(
  headers: readonly T[],
  start: number,
  end: number,
  onStep?: () => void,
  onVisited?: (count: number) => void,
): readonly T[] {
  const first = lowerBound(headers, start, (header) => header.y + header.height, onStep);
  const afterLast = upperBound(headers, end, (header) => header.y, onStep);
  const count = Math.max(0, afterLast - first);
  onVisited?.(count);
  return headers.slice(first, afterLast);
}

function mergeIds<T extends string>(...lists: readonly (readonly T[])[]): readonly T[] {
  return [...new Set(lists.flat())];
}

function lowerBound<T>(items: readonly T[], target: number, value: (item: T) => number, onStep?: () => void): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    onStep?.();
    const middle = Math.floor((low + high) / 2);
    if (value(items[middle]!) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound<T>(items: readonly T[], target: number, value: (item: T) => number, onStep?: () => void): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    onStep?.();
    const middle = Math.floor((low + high) / 2);
    if (value(items[middle]!) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function intersects(row: Pick<RowLayoutEntry, "y" | "height">, start: number, end: number): boolean {
  return row.y + row.height >= start && row.y <= end;
}
