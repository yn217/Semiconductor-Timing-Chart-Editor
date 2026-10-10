import { resolveTransactionColor } from "./transaction-color.js";
import { type TransactionDisclosure } from "./workspace/use-transaction-disclosure.js";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CommandResult } from "@timing-chart-v2/commands";
import type {
  CanonicalDocument,
  Transaction,
  TransactionGroup,
  TransactionId,
} from "@timing-chart-v2/schema";
import { EditorIcon } from "./editor-icon.js";
import { InlineNameInput } from "./inline-name-input.js";
import { computeViewportSafePosition, currentViewportBounds } from "./viewport-safe-position.js";
import { usePeerMenuSurface } from "./runtime/peer-menu-surface.js";

type TransactionTreeMenu = Readonly<
  | { kind: "group"; id: string }
  | { kind: "transaction"; id: TransactionId }
>;
type TransactionTreeMenuItem = Readonly<{ label: string; run: () => void; disabled?: boolean; submenu?: readonly TransactionTreeMenuItem[]; movesFocus?: boolean }>;

const TREE_ROW_HEIGHT = 29;
const TREE_WINDOWING_THRESHOLD = 150;

/**
 * Fixed-height row windowing for large Transaction groups: only the rows intersecting the tree's scroll viewport (plus a small
 * overscan) are mounted; a spacer keeps the scroll extent exact. Small groups render every row as before.
 */
type TreeViewport = Readonly<{ scrollTop: number; clientHeight: number; groupsTop: number; groupHeaderHeight: number }>;

function getWindowRange(itemCount: number, rowsTop: number, viewport: TreeViewport) {
  const firstVisible = Math.floor((viewport.scrollTop - rowsTop) / TREE_ROW_HEIGHT);
  const lastVisible = Math.ceil((viewport.scrollTop + viewport.clientHeight - rowsTop) / TREE_ROW_HEIGHT);
  const start = Math.max(0, Math.min(itemCount, firstVisible - 10));
  const end = Math.max(start, Math.min(itemCount, lastVisible + 10));
  return { start, end };
}

/** The Transaction id of the tree row containing `target`, if any. */
function rowIdOf(target: EventTarget | null): TransactionId | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>(".transaction-left-tree-row")?.dataset.transactionTreeId as TransactionId | undefined;
}

function WindowedTreeRows<T>({ items, render, getId, focusId, rowsTop, viewport, windowed }: { readonly items: readonly T[]; readonly render: (item: T) => ReactNode; readonly getId?: (item: T) => string; readonly focusId?: string | undefined; readonly rowsTop: number; readonly viewport: TreeViewport; readonly windowed: boolean }) {
  const initialRange = () => getWindowRange(items.length, rowsTop, viewport);
  const [range, setRange] = useState(initialRange);
  useLayoutEffect(() => {
    if (!windowed) return;
    const next = getWindowRange(items.length, rowsTop, viewport);
    setRange((current) => current.start === next.start && current.end === next.end ? current : next);
  }, [windowed, items.length, rowsTop, viewport]);
  // #769: keyboard navigation targets a logical id that may not be mounted yet; widen the window (via useLayoutEffect, before paint) to
  // include it so the caller's post-render focus effect can find and focus the real DOM node on the very next commit.
  useLayoutEffect(() => {
    if (!windowed || focusId === undefined || !getId) return;
    const index = items.findIndex((item) => getId(item) === focusId);
    if (index < 0) return;
    setRange((current) => (index >= current.start && index < current.end ? current : { start: Math.max(0, index - 10), end: Math.min(items.length, index + 20) }));
  }, [windowed, items, getId, focusId]);
  if (!windowed) return <>{items.map(render)}</>;
  const end = range.end;
  return <div data-tree-windowed="true" style={{ position: "relative", height: items.length * TREE_ROW_HEIGHT }}><div style={{ position: "absolute", left: 0, right: 0, top: range.start * TREE_ROW_HEIGHT }}>{items.slice(range.start, end).map(render)}</div></div>;
}

export function TransactionTree({
  document,
  documentEpoch,
  filter,
  filterMode = "all",
  selectedId,
  selectedIds,
  onSelect,
  onRenameGroup,
  onMoveToGroup,
  onMoveToNewGroup,
  onContextMenu,
  onCreateTransaction,
  onCreateTransactionInGroup,
  onFocusTransaction,
  onClearSelection,
  onDelete,
  onSetVisibility,
  onSetGroupVisibility,
  onDeleteGroup,
  onDuplicateTransaction,
  onRenameTransaction,
  disclosure,
}: {
  readonly document: CanonicalDocument;
  readonly documentEpoch: number;
  readonly filter: string;
  readonly filterMode?:
    | "all"
    | "grouped"
    | "ungrouped"
    | "phases"
    | "linked"
    | "visible"
    | "hidden"
    | "no-phases";
  readonly selectedId?: TransactionId;
  readonly selectedIds?: ReadonlySet<TransactionId>;
  readonly onSelect: (id: TransactionId, additive?: boolean) => void;
  readonly onRenameGroup?: (id: TransactionGroup["id"], name: string) => void;
  readonly onMoveToGroup?: (
    transactionId: TransactionId,
    groupId: TransactionGroup["id"] | undefined,
  ) => void;
  /** #749: submenu 'New Group…' -- create a Group and move the Transaction into it atomically. */
  readonly onMoveToNewGroup?: (transactionId: TransactionId) => void;
  readonly onContextMenu?: (
    event: React.MouseEvent<HTMLButtonElement>,
    transactionId: TransactionId,
  ) => void;
  readonly onCreateTransaction?: () => void;
  readonly onCreateTransactionInGroup?: (groupId: TransactionGroup["id"]) => void;
  readonly onFocusTransaction?: (transactionId: TransactionId) => void;
  readonly onClearSelection?: () => void;
  readonly onDelete?: () => void;
  readonly onSetVisibility?: (
    transactionId: TransactionId,
    visible: boolean,
  ) => void;
  readonly onSetGroupVisibility?: (
    groupId: TransactionGroup["id"] | undefined,
    visible: boolean,
  ) => void;
  readonly onDeleteGroup?: (groupId: TransactionGroup["id"]) => void;
  readonly onDuplicateTransaction?: (transactionId: TransactionId) => void;
  readonly onRenameTransaction?: (transactionId: TransactionId, name: string) => CommandResult;
  /** #759: workspace-level Group disclosure owner (shared with the center Group headers). */
  readonly disclosure: TransactionDisclosure;
}) {
  const { collapsed, toggle } = disclosure;
  const [dragOverGroup, setDragOverGroup] = useState<string>();
  const [editingGroupId, setEditingGroupId] = useState<string>();
  const [openMenu, setOpenMenu] = useState<TransactionTreeMenu>();
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ readonly left: number; readonly top: number; readonly maxHeight: number }>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<TransactionId>();
  const isTransactionSelected = (id: TransactionId) =>
    selectedId === id || selectedIds?.has(id) === true;
  useEffect(() => {
    setDragOverGroup(undefined);
    setEditingGroupId(undefined);
    setOpenMenu(undefined);
    setMenuPosition(undefined);
    setEditingTransactionId(undefined);
  }, [documentEpoch]);
  useEffect(() => {
    if (!openMenu) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) return;
      setOpenMenu(undefined);
      setMenuPosition(undefined);
      const targetElement = target instanceof Element ? target : null;
      const clickedFocusable = targetElement?.closest("button, a, input, select, textarea, [tabindex]:not([tabindex='-1'])");
      const trigger = menuTriggerRef.current;
      if (!clickedFocusable) requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
    };
    globalThis.document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      cancelAnimationFrame(frame);
      globalThis.document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [openMenu]);
  useLayoutEffect(() => {
    if (!openMenu) { setMenuPosition(undefined); return; }
    const updatePosition = () => {
      const trigger = menuTriggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const bounds = currentViewportBounds();
      const maxHeight = Math.max(64, bounds.bottom - bounds.top - 16);
      const rect = trigger.getBoundingClientRect();
      const height = Math.min(menu.scrollHeight, maxHeight);
      const position = computeViewportSafePosition(
        { x: rect.right, y: rect.bottom },
        { width: menu.getBoundingClientRect().width, height },
        bounds,
      );
      setMenuPosition({ left: position.x, top: position.y, maxHeight });
    };
    updatePosition();
    globalThis.addEventListener("resize", updatePosition);
    globalThis.addEventListener("scroll", updatePosition, true);
    globalThis.visualViewport?.addEventListener("resize", updatePosition);
    globalThis.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      globalThis.removeEventListener("resize", updatePosition);
      globalThis.removeEventListener("scroll", updatePosition, true);
      globalThis.visualViewport?.removeEventListener("resize", updatePosition);
      globalThis.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [openMenu, submenuOpen]); // expanding "Move to Group" grows the menu, so it must be re-fitted to the window
  const groups = useMemo(
    () =>
      [...(document.transactionGroups ?? [])].sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      ),
    [document.transactionGroups],
  );
  const needle = filter.trim().toLocaleLowerCase();
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "F2" ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const header =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              ".transaction-left-tree-group-header",
            )
          : null;
      const row = event.target instanceof Element ? event.target.closest<HTMLElement>(".transaction-left-tree-row") : null;
      const transactionId = row?.dataset.transactionTreeId as TransactionId | undefined;
      if (transactionId && onRenameTransaction) {
        event.preventDefault();
        setEditingTransactionId(transactionId);
        return;
      }
      const groupId = header?.closest<HTMLElement>(
        "[data-transaction-group-id]",
      )?.dataset.transactionGroupId;
      if (!groupId || groupId === "ungrouped") return;
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      event.preventDefault();
      setEditingGroupId(group.id);
    };
    globalThis.document.addEventListener("keydown", onKeyDown);
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button, input, select, textarea, [role='menuitem'], [contenteditable='true']",
        )
      )
        return;
      const header = target?.closest<HTMLElement>(
        ".transaction-left-tree-group-header",
      );
      const groupId = header?.closest<HTMLElement>(
        "[data-transaction-group-id]",
      )?.dataset.transactionGroupId;
      const group =
        groupId === undefined || groupId === "ungrouped"
          ? undefined
          : groups.find((candidate) => candidate.id === groupId);
      if (group) toggle(group.id);
    };
    const onArrow = (event: KeyboardEvent) => {
      // Delete is handled by the capture listener below plus the global shortcut router (exactly one dispatch).
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const groupHeader =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>(
                ".transaction-left-tree-group-header",
              )
            : null;
        const groupId = groupHeader?.closest<HTMLElement>(
          "[data-transaction-group-id]",
        )?.dataset.transactionGroupId;
        if (!groupHeader || !groupId || groupId === "ungrouped") return;
        const collapsedNow = collapsed.has(groupId);
        if (
          (event.key === "ArrowLeft" && !collapsedNow) ||
          (event.key === "ArrowRight" && collapsedNow)
        ) {
          event.preventDefault();
          toggle(groupId);
        }
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const current =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".transaction-left-tree-row")
          : null;
      if (!current) return;
      // #769: navigate the logical visible-Transaction sequence (groups in order, skipping collapsed ones, then Ungrouped) so
      // ArrowUp/Down works past a virtualization window boundary -- not just the currently-mounted DOM rows.
      const logicalRows: TransactionId[] = [];
      for (const group of groups) if (!collapsed.has(group.id)) for (const transaction of groupTransactions(group.id)) logicalRows.push(transaction.id);
      if (!collapsed.has("__ungrouped__")) for (const transaction of groupTransactions(undefined)) logicalRows.push(transaction.id);
      const currentId = current.dataset.transactionTreeId as TransactionId | undefined;
      const currentIndex = currentId === undefined ? -1 : logicalRows.indexOf(currentId);
      if (currentIndex < 0) return;
      const nextId = logicalRows[currentIndex + (event.key === "ArrowDown" ? 1 : -1)];
      if (nextId === undefined) return;
      event.preventDefault();
      setPendingFocusId(nextId);
      const id: TransactionId | undefined = nextId;
      if (id) onSelect(id);
    };
    globalThis.document.addEventListener("dblclick", onDoubleClick);
    globalThis.document.addEventListener("keydown", onArrow);
    const onGroupMultiSelect = (event: MouseEvent) => {
      if (!event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button, input, select, textarea, [role='menuitem'], [contenteditable='true']",
        )
      )
        return;
      const header = target?.closest<HTMLElement>(
        ".transaction-left-tree-group-header",
      );
      const groupId = header?.closest<HTMLElement>(
        "[data-transaction-group-id]",
      )?.dataset.transactionGroupId;
      if (!groupId || groupId === "ungrouped") return;
      const children = document.transactions
        .filter(
          (transaction) =>
            transaction.groupId === groupId && matches(transaction),
        )
        .sort(
          (left, right) =>
            left.start - right.start || left.id.localeCompare(right.id),
        );
      if (children.length === 0) return;
      event.preventDefault();
      children.forEach((transaction) => onSelect(transaction.id, true));
    };
    globalThis.document.addEventListener("click", onGroupMultiSelect);
    return () => {
      globalThis.document.removeEventListener("keydown", onKeyDown);
      globalThis.document.removeEventListener("dblclick", onDoubleClick);
      globalThis.document.removeEventListener("keydown", onArrow);
      globalThis.document.removeEventListener("click", onGroupMultiSelect);
    };
  }, [collapsed, document, groups, onRenameTransaction, onSelect]);
  const matches = (transaction: Transaction) => {
    if (filterMode === "grouped" && transaction.groupId === undefined)
      return false;
    if (filterMode === "ungrouped" && transaction.groupId !== undefined)
      return false;
    if (filterMode === "phases" && (transaction.phases?.length ?? 0) === 0)
      return false;
    if (
      filterMode === "linked" &&
      (transaction.linkedSignals?.length ?? 0) === 0
    )
      return false;
    if (filterMode === "visible" && transaction.visible === false) return false;
    if (filterMode === "hidden" && transaction.visible !== false) return false;
    if (filterMode === "no-phases" && (transaction.phases?.length ?? 0) > 0)
      return false;
    if (needle.length === 0) return true;
    const groupName =
      transaction.groupId === undefined
        ? ""
        : (groupById.get(transaction.groupId)?.name ?? "");
    return (
      transaction.name.toLocaleLowerCase().includes(needle) ||
      groupName.toLocaleLowerCase().includes(needle)
    );
  };
  // Build the filtered/sorted ownership index in one canonical pass. Calling filter+sort once per Group was
  // O(groupCount × transactionCount), which made many-small-Group documents expensive before virtualization began.
  const transactionsByGroup = useMemo(() => {
    const byGroup = new Map<TransactionGroup["id"] | undefined, Transaction[]>();
    byGroup.set(undefined, []);
    for (const group of groups) byGroup.set(group.id, []);
    for (const transaction of document.transactions) {
      if (!matches(transaction)) continue;
      const bucket = byGroup.get(transaction.groupId);
      if (bucket) bucket.push(transaction);
    }
    for (const transactions of byGroup.values()) transactions.sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    return byGroup;
  }, [document.transactions, groups, filterMode, needle, groupById]);
  const groupTransactions = (groupId: TransactionGroup["id"] | undefined) => transactionsByGroup.get(groupId) ?? [];
  const rowId = (transaction: Transaction) => transaction.id;
  // #769: recomputes whenever ANY Group's collapse state changes -- passed to every WindowedTreeRows instance so a Group collapsing/
  // expanding above another (unchanged) Group invalidates that Group's stale scroll-relative window too.
  const collapsedSignature = [...collapsed].sort().join(",");
  // #771: one tree-level viewport snapshot drives every group's virtual window. Group offsets are derived from the shared ordered
  // row index and fixed row/header heights; no per-Group DOM geometry is read during scroll.
  const treeScrollerRef = useRef<HTMLDivElement>(null);
  const groupsElementRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<TreeViewport>({ scrollTop: 0, clientHeight: 600, groupsTop: 28, groupHeaderHeight: 28 });
  useEffect(() => {
    const scroller = treeScrollerRef.current;
    const groupsElement = groupsElementRef.current;
    if (!scroller || !groupsElement) return undefined;
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const scrollerRect = scroller.getBoundingClientRect();
      const groupsRect = groupsElement.getBoundingClientRect();
      const header = groupsElement.querySelector<HTMLElement>(".transaction-left-tree-group-header");
      const next = {
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        groupsTop: scroller.scrollTop + groupsRect.top - scrollerRect.top,
        groupHeaderHeight: header?.getBoundingClientRect().height || 28,
      };
      setViewport((current) => current.scrollTop === next.scrollTop && current.clientHeight === next.clientHeight && current.groupsTop === next.groupsTop && current.groupHeaderHeight === next.groupHeaderHeight ? current : next);
    };
    const bump = () => { if (frame !== undefined) return; frame = requestAnimationFrame(update); };
    update();
    scroller.addEventListener("scroll", bump, { passive: true });
    const observer = new ResizeObserver(bump);
    observer.observe(scroller);
    observer.observe(groupsElement);
    return () => { scroller.removeEventListener("scroll", bump); observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, []);
  const [pendingFocusId, setPendingFocusId] = useState<TransactionId>();
  // The Transaction row that currently holds keyboard focus inside the tree (undefined when focus is on a header/chevron/elsewhere).
  const focusedRowIdRef = useRef<TransactionId | undefined>(undefined);
  // Post-render: once the pending row is actually mounted (WindowedTreeRows above widened its window to include it), focus and reveal
  // it, then stop. No dependency array: this deliberately re-runs on every render until it finds the node (usually the very next commit).
  useEffect(() => {
    if (pendingFocusId === undefined) return;
    const node = globalThis.document.querySelector<HTMLElement>(`.transaction-left-tree-row[data-transaction-tree-id="${CSS.escape(pendingFocusId)}"]`);
    if (!node) return;
    node.focus();
    node.scrollIntoView({ block: "nearest" });
    setPendingFocusId(undefined);
  });
  // #769 Failure 2 follow-on: a Group elsewhere collapsing/expanding can shrink the freshly recomputed window of an UNRELATED, already
  // visible Group past the currently focused row, unmounting it (and silently dropping keyboard focus to <body>). Whenever collapse
  // state changes, re-request the current selection so its WindowedTreeRows widens to keep covering it.
  // Only a Transaction row that actually holds keyboard focus is restored (never the selection, which may sit elsewhere). Chevron
  // presses keep focus where it was (see onMouseDown on the chevrons), and keyboard collapse from a header keeps focus on the header.
  useEffect(() => {
    const focusedId = focusedRowIdRef.current;
    if (focusedId === undefined) return;
    if (globalThis.document.activeElement?.getAttribute("data-transaction-tree-id") === focusedId) return;
    setPendingFocusId(focusedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedSignature]);
  // Delete and Ctrl+A run as document-capture listeners so they settle the selection BEFORE the global shortcut router (bubble) acts on
  // the same keydown. Delete: a focused row outside the selection becomes the selection; the router then deletes exactly once.
  // Ctrl+A (inside the tree only): selects the rows the tree currently shows (filter, filter mode and collapsed Groups applied).
  useEffect(() => {
    if (!onDelete) return undefined;
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Delete") {
        const id = rowIdOf(target);
        if (id === undefined || selectedId === id || selectedIds?.has(id) === true) return;
        onSelect(id);
        return;
      }
      const isSelectAll = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a";
      if (!isSelectAll || !target.closest("[data-transaction-tree-root='true']") || collapsed.has("__all__")) return;
      event.preventDefault();
      event.stopPropagation();
      const shown: TransactionId[] = [];
      for (const group of groups) if (!collapsed.has(group.id)) for (const transaction of groupTransactions(group.id)) if (transaction.visible !== false) shown.push(transaction.id);
      if (!collapsed.has("__ungrouped__")) for (const transaction of groupTransactions(undefined)) if (transaction.visible !== false) shown.push(transaction.id);
      if (shown.length === 0) return;
      onSelect(shown[0]!);
      for (const id of shown.slice(1)) onSelect(id, true);
    };
    globalThis.document.addEventListener("keydown", onKeyDownCapture, true);
    return () => globalThis.document.removeEventListener("keydown", onKeyDownCapture, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- groupTransactions is derived from transactionsByGroup, listed below
  }, [collapsed, groups, onDelete, onSelect, selectedId, selectedIds, transactionsByGroup]);
  // #771: virtualization is decided by the TOTAL visible Transaction count across every Group, not each Group's own count -- 100 Groups
  // of 100 (10,000 total) must window just as much as one Group of 10,000; a distribution across many small/medium Groups must not
  // bypass it.
  const totalVisibleCount = [...transactionsByGroup.values()].reduce((sum, transactions) => sum + transactions.length, 0);
  const globalWindowingEnabled = totalVisibleCount > TREE_WINDOWING_THRESHOLD;
  const closeMenu = (restoreFocus = false) => {
    const trigger = menuTriggerRef.current;
    setOpenMenu(undefined);
    setMenuPosition(undefined);
    setSubmenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  };
  usePeerMenuSurface(openMenu !== undefined, () => closeMenu());
  const toggleMenu = (nextMenu: TransactionTreeMenu, trigger: HTMLButtonElement) => {
    if (openMenu?.kind === nextMenu.kind && openMenu.id === nextMenu.id) {
      closeMenu();
      return;
    }
    menuTriggerRef.current = trigger;
    setSubmenuOpen(false);
    setMenuPosition(undefined);
    setOpenMenu(nextMenu);
  };
  const invokeMenuItem = (item: TransactionTreeMenuItem) => {
    // Items that start inline editing own focus; restoring it to the trigger
    // would blur the new input and cancel the edit immediately.
    closeMenu(item.movesFocus !== true);
    item.run();
  };
  const selectedMenuGroup = openMenu?.kind === "group" ? groups.find((group) => group.id === openMenu.id) : undefined;
  const selectedMenuTransaction = openMenu?.kind === "transaction" ? document.transactions.find((transaction) => transaction.id === openMenu.id) : undefined;
  const menuItems: readonly TransactionTreeMenuItem[] = selectedMenuGroup
    ? [
        { label: "Rename Group", movesFocus: true, run: () => rename(selectedMenuGroup) },
        { label: "New Transaction", run: () => (onCreateTransactionInGroup ? onCreateTransactionInGroup(selectedMenuGroup.id) : onCreateTransaction?.()) },
        { label: "Select Children", run: () => groupTransactions(selectedMenuGroup.id).forEach((transaction, index) => onSelect(transaction.id, index > 0)) },
        ...(onDeleteGroup ? [{ label: "Delete Group", run: () => onDeleteGroup(selectedMenuGroup.id) }] : []),
        ...(onSetGroupVisibility ? [
          { label: "Show All", run: () => onSetGroupVisibility(selectedMenuGroup.id, true) },
          { label: "Hide All", run: () => onSetGroupVisibility(selectedMenuGroup.id, false) },
        ] : []),
      ]
    : selectedMenuTransaction
      ? [
          { label: "Focus in Timeline", run: () => onFocusTransaction?.(selectedMenuTransaction.id) },
          ...(onMoveToGroup ? [{
            label: "Move to Group",
            run: () => undefined,
            submenu: [
              ...groups.map((group) => ({ label: group.name, disabled: selectedMenuTransaction.groupId === group.id, run: () => onMoveToGroup(selectedMenuTransaction.id, group.id) })),
              { label: "Ungrouped", disabled: selectedMenuTransaction.groupId === undefined, run: () => onMoveToGroup(selectedMenuTransaction.id, undefined) },
              ...(onMoveToNewGroup ? [{ label: "New Group…", run: () => onMoveToNewGroup(selectedMenuTransaction.id) }] : []),
            ],
          }] : []),
          ...(onDuplicateTransaction ? [{ label: "Duplicate", run: () => { onSelect(selectedMenuTransaction.id); onDuplicateTransaction(selectedMenuTransaction.id); } }] : []),
          ...(onDelete ? [{ label: "Delete", run: () => { onSelect(selectedMenuTransaction.id); onDelete(); } }] : []),
        ]
      : [];
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)")];
    if (items.length === 0) return;
    const current = event.target instanceof HTMLElement ? items.indexOf(event.target.closest<HTMLButtonElement>("[role='menuitem']")!) : -1;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    const next = event.key === "ArrowDown" ? (current + 1) % items.length
      : event.key === "ArrowUp" ? (current - 1 + items.length) % items.length
        : event.key === "Home" ? 0
          : event.key === "End" ? items.length - 1
            : event.key === "Tab" ? (current + (event.shiftKey ? -1 : 1) + items.length) % items.length
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  };
  const rename = (group: TransactionGroup) => setEditingGroupId(group.id);
  const renderTransaction = (transaction: Transaction) => (
    <div className="transaction-left-tree-row-wrap" key={transaction.id}>
      {editingTransactionId === transaction.id && onRenameTransaction ? (
        <InlineNameInput target={transaction} value={transaction.name} ariaLabel={`Rename ${transaction.name}`} autoFocus onRename={(name) => onRenameTransaction(transaction.id, name)} onCommitted={() => setEditingTransactionId(undefined)} onCanceled={() => setEditingTransactionId(undefined)} />
      ) : <button
        type="button"
        draggable={onMoveToGroup !== undefined}
        className="transaction-left-tree-row"
        data-testid={`transaction-left-tree-row-${transaction.id}`}
        data-transaction-tree-id={transaction.id}
        data-selected={String(isTransactionSelected(transaction.id))}
        title={transaction.name}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/x-timing-chart-transaction",
            transaction.id,
          );
        }}
        onClick={(event) =>
          onSelect(transaction.id, event.ctrlKey || event.metaKey)
        }
        onDoubleClick={() => {
          onSelect(transaction.id);
          onFocusTransaction?.(transaction.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect(transaction.id);
          onContextMenu?.(event, transaction.id);
        }}
      >
        <i
          aria-hidden="true"
          style={{
            background:
              resolveTransactionColor(document, transaction),
          }}
        />
        <span className="transaction-left-tree-name">{transaction.name}</span>
      </button>}
      <span className="transaction-left-tree-row-actions" aria-label={`${transaction.name} row actions`}>
        {onSetVisibility ? (
          <button
            type="button"
            className="transaction-left-tree-visibility"
            data-transaction-tree-visibility-id={transaction.id}
            data-visibility-state={transaction.visible === false ? "off" : "on"}
            aria-pressed={transaction.visible !== false}
            aria-label={`${transaction.visible === false ? "Show" : "Hide"} ${transaction.name}`}
            title={`${transaction.visible === false ? "Show" : "Hide"} ${transaction.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(transaction.id);
              onSetVisibility(transaction.id, transaction.visible === false);
            }}
          >
            <EditorIcon name={transaction.visible === false ? "eye-off" : "eye"} className="transaction-left-tree-icon" />
          </button>
        ) : <span className="transaction-left-tree-action-placeholder" aria-hidden="true" />}
        <button
          type="button"
          className="transaction-left-tree-more"
          aria-haspopup="menu"
          aria-expanded={openMenu?.kind === "transaction" && openMenu.id === transaction.id}
          aria-controls={openMenu?.kind === "transaction" && openMenu.id === transaction.id ? "transaction-tree-action-menu" : undefined}
          aria-label={`More actions for ${transaction.name}`}
          title={`More actions for ${transaction.name}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu({ kind: "transaction", id: transaction.id }, event.currentTarget);
          }}
        >
          <EditorIcon name="more" className="transaction-left-tree-icon" />
        </button>
      </span>
    </div>
  );
  const dropTarget = (groupId: TransactionGroup["id"] | undefined) => {
    const key = groupId ?? "ungrouped";
    return {
      "data-drop-target": dragOverGroup === key ? "true" : "false",
      onDragOver: (event: DragEvent) => {
        if (
          !event.dataTransfer.types.includes(
            "application/x-timing-chart-transaction",
          )
        )
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOverGroup(key);
      },
      onDragLeave: () =>
        setDragOverGroup((current) => (current === key ? undefined : current)),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        setDragOverGroup(undefined);
        const transactionId = event.dataTransfer.getData(
          "application/x-timing-chart-transaction",
        ) as TransactionId;
        if (transactionId) onMoveToGroup?.(transactionId, groupId);
      },
    };
  };
  let groupCursor = viewport.groupsTop;
  const renderedGroups = groups.map((group) => {
    const items = groupTransactions(group.id);
    const isCollapsed = collapsed.has(group.id);
    const rowsTop = groupCursor + viewport.groupHeaderHeight;
    groupCursor = rowsTop + (isCollapsed ? 0 : items.length * TREE_ROW_HEIGHT);
    return { group, items, isCollapsed, rowsTop };
  });
  const ungroupedItems = groupTransactions(undefined);
  const ungroupedRowsTop = groupCursor + viewport.groupHeaderHeight;
  return (
    <>
    <div
      ref={treeScrollerRef}
      className="transaction-left-tree"
      data-testid="transaction-left-tree"
      data-transaction-tree-root="true"
      aria-label="Transaction tree"
      onClick={(event) => { if (onClearSelection && (event.target === event.currentTarget || (event.target instanceof Element && event.target.classList.contains("transaction-left-tree-root")))) onClearSelection(); }}
      onKeyDown={(event) => { if (event.key === "Escape" && onClearSelection && !openMenu && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); onClearSelection(); } }}
      onFocus={(event) => { focusedRowIdRef.current = rowIdOf(event.target); }}
      onBlur={(event) => {
        // Focus moving between rows is re-recorded by onFocus; a row removed from the DOM (windowing) keeps its record for restoring.
        if (rowIdOf(event.relatedTarget) !== undefined) return;
        if (event.target instanceof Element && !event.target.isConnected) return;
        focusedRowIdRef.current = undefined;
      }}
    >
      <div className="transaction-left-tree-root">
        <button
          type="button"
          aria-label={`${collapsed.has("__all__") ? "Expand" : "Collapse"} All Transactions`}
          aria-expanded={!collapsed.has("__all__")}
          onClick={() => toggle("__all__")}
        >
          <EditorIcon name={collapsed.has("__all__") ? "chevron-right" : "chevron-down"} className="transaction-left-tree-icon" />
        </button>
        <strong>All Transactions</strong>
        <span>({document.transactions.length})</span>
      </div>
      {document.transactions.length > 0 && (needle.length > 0 || filterMode !== "all") && !document.transactions.some(matches) && (
        <p className="inspector-note" role="status" data-testid="transaction-tree-no-match">No transactions match the active tree filter{needle.length > 0 ? ` “${filter.trim()}”` : ""}{filterMode !== "all" ? ` (${filterMode})` : ""}. Clear the search / choose All to see them.</p>
      )}
      {!collapsed.has("__all__") && (
        <div className="transaction-left-tree-groups" ref={groupsElementRef}>
          {renderedGroups.map(({ group, items, isCollapsed, rowsTop }) => {
            const editing = editingGroupId === group.id;
            return (
              <div
                className="transaction-left-tree-group"
                key={group.id}
                data-transaction-group-id={group.id}
              >
                <div
                  className="transaction-left-tree-group-header"
                  {...dropTarget(group.id)}
                >
                  <button
                    type="button"
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`}
                    aria-expanded={!isCollapsed}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle(group.id)}
                  >
                    <EditorIcon name={isCollapsed ? "chevron-right" : "chevron-down"} className="transaction-left-tree-icon" />
                  </button>
                  <span
                    className="transaction-left-tree-swatch"
                    style={{ background: group.color ?? "#8895a7" }}
                    aria-hidden="true"
                  />
                  {editing ? (
                    <InlineNameInput
                      target={group}
                      value={group.name}
                      ariaLabel={`Rename ${group.name}`}
                      autoFocus
                      onRename={(name) =>
                        onRenameGroup?.(group.id, name) ?? {
                          ok: false,
                          reason: "invalid",
                          problems: [
                            {
                              code: "RENAME_UNAVAILABLE",
                              path: "$.name",
                              message: "Rename unavailable",
                            },
                          ],
                        }
                      }
                      onCommitted={() => setEditingGroupId(undefined)}
                      onCanceled={() => setEditingGroupId(undefined)}
                    />
                  ) : (
                    <strong title={group.name}>{group.name}</strong>
                  )}
                  <span className="transaction-left-tree-group-count">({items.length})</span>
                  <button
                    type="button"
                    className="transaction-left-tree-more"
                    aria-haspopup="menu"
                    aria-expanded={openMenu?.kind === "group" && openMenu.id === group.id}
                    aria-controls={openMenu?.kind === "group" && openMenu.id === group.id ? "transaction-tree-action-menu" : undefined}
                    aria-label={`More actions for ${group.name}`}
                    title={`More actions for ${group.name}`}
                    onClick={(event) => toggleMenu({ kind: "group", id: group.id }, event.currentTarget)}
                  >
                    <EditorIcon name="more" className="transaction-left-tree-icon" />
                  </button>
                </div>
                {!isCollapsed && <WindowedTreeRows items={items} render={renderTransaction} getId={rowId} focusId={pendingFocusId} rowsTop={rowsTop} viewport={viewport} windowed={globalWindowingEnabled} />}
              </div>
            );
          })}
          {(() => {
            const isCollapsed = collapsed.has("__ungrouped__");
            return (
              <div
                className="transaction-left-tree-group"
                data-transaction-group-id="ungrouped"
              >
                <div
                  className="transaction-left-tree-group-header"
                  {...dropTarget(undefined)}
                >
                  <button
                    type="button"
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} Ungrouped`}
                    aria-expanded={!isCollapsed}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle("__ungrouped__")}
                  >
                    <EditorIcon name={isCollapsed ? "chevron-right" : "chevron-down"} className="transaction-left-tree-icon" />
                  </button>
                  <span
                    className="transaction-left-tree-swatch"
                    aria-hidden="true"
                  />
                  <strong>Ungrouped</strong>
                  <span className="transaction-left-tree-group-count">({ungroupedItems.length})</span>
                  <span className="transaction-left-tree-action-placeholder" aria-hidden="true" />
                </div>
                {!isCollapsed && <WindowedTreeRows items={ungroupedItems} render={renderTransaction} getId={rowId} focusId={pendingFocusId} rowsTop={ungroupedRowsTop} viewport={viewport} windowed={globalWindowingEnabled} />}
              </div>
            );
          })()}
        </div>
      )}
    </div>
    {openMenu && createPortal(
      <div
        ref={menuRef}
        id="transaction-tree-action-menu"
        data-testid="transaction-tree-action-menu"
        className={`transaction-left-tree-group-menu${openMenu.kind === "transaction" ? " transaction-left-tree-transaction-menu" : ""}`}
        role="menu"
        aria-label={selectedMenuGroup ? `${selectedMenuGroup.name} actions` : `${selectedMenuTransaction?.name ?? "Transaction"} actions`}
        onKeyDown={onMenuKeyDown}
        style={{ left: `${menuPosition?.left ?? 0}px`, top: `${menuPosition?.top ?? 0}px`, maxHeight: `${menuPosition?.maxHeight ?? 200}px`, visibility: menuPosition ? "visible" : "hidden" }}
      >
        {menuItems.map((item) => item.submenu ? <Fragment key={item.label}>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={submenuOpen} onClick={() => setSubmenuOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); setSubmenuOpen(true); } else if (event.key === "ArrowLeft") { event.preventDefault(); setSubmenuOpen(false); } }}>{item.label} {submenuOpen ? "▾" : "▸"}</button>
          {submenuOpen && <div role="group" aria-label={item.label} className="transaction-left-tree-submenu">
            {item.submenu.map((sub) => <button key={sub.label} type="button" role="menuitem" disabled={sub.disabled} onClick={() => invokeMenuItem(sub)}>{sub.label}</button>)}
          </div>}
        </Fragment> : <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => invokeMenuItem(item)}>{item.label}</button>)}
      </div>,
      globalThis.document.body,
    )}
    </>
  );
}
