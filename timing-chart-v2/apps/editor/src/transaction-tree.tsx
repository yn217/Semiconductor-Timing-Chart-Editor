import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
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

type TransactionTreeMenu = Readonly<
  | { kind: "group"; id: string }
  | { kind: "transaction"; id: TransactionId }
>;
type TransactionTreeMenuItem = Readonly<{ label: string; run: () => void; disabled?: boolean; submenu?: readonly TransactionTreeMenuItem[]; movesFocus?: boolean }>;

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
  onFocusTransaction,
  onClearSelection,
  onDelete,
  onSetVisibility,
  onSetGroupVisibility,
  onDeleteGroup,
  onDuplicateTransaction,
  onRenameTransaction,
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
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
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
    setCollapsed(new Set());
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
  }, [openMenu]);
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
      if (event.key === "Delete") {
        const current =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>(".transaction-left-tree-row")
            : null;
        if (current && onDelete) {
          event.preventDefault();
          const id = current.dataset.transactionTreeId as
            TransactionId | undefined;
          if (id) {
            onSelect(id);
            queueMicrotask(onDelete);
          }
        }
        return;
      }
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
      const rows = [
        ...globalThis.document.querySelectorAll<HTMLElement>(
          ".transaction-left-tree-row",
        ),
      ];
      const next =
        rows[rows.indexOf(current) + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
      const id = next.dataset.transactionTreeId as TransactionId | undefined;
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
  }, [collapsed, document, groups, onDelete, onRenameTransaction, onSelect]);
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
  const groupTransactions = (groupId: TransactionGroup["id"] | undefined) =>
    document.transactions
      .filter(
        (transaction) =>
          transaction.groupId === groupId && matches(transaction),
      )
      .sort(
        (left, right) =>
          left.start - right.start || left.id.localeCompare(right.id),
      );
  const closeMenu = (restoreFocus = false) => {
    const trigger = menuTriggerRef.current;
    setOpenMenu(undefined);
    setMenuPosition(undefined);
    setSubmenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  };
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
        { label: "New Transaction", run: () => onCreateTransaction?.() },
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
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
              transaction.color ??
              (transaction.groupId === undefined
                ? "#8895a7"
                : (groupById.get(transaction.groupId)?.color ?? "#8895a7")),
          }}
        />
        {transaction.name}
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
  return (
    <>
    <div
      className="transaction-left-tree"
      data-testid="transaction-left-tree"
      data-transaction-tree-root="true"
      aria-label="Transaction tree"
      onClick={(event) => { if (onClearSelection && (event.target === event.currentTarget || (event.target instanceof Element && event.target.classList.contains("transaction-left-tree-root")))) onClearSelection(); }}
      onKeyDown={(event) => { if (event.key === "Escape" && onClearSelection && !openMenu && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); onClearSelection(); } }}
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
        <div className="transaction-left-tree-groups">
          {groups.map((group) => {
            const items = groupTransactions(group.id);
            const isCollapsed = collapsed.has(group.id);
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
                {!isCollapsed && items.map(renderTransaction)}
              </div>
            );
          })}
          {(() => {
            const items = groupTransactions(undefined);
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
                    onClick={() => toggle("__ungrouped__")}
                  >
                    <EditorIcon name={isCollapsed ? "chevron-right" : "chevron-down"} className="transaction-left-tree-icon" />
                  </button>
                  <span
                    className="transaction-left-tree-swatch"
                    aria-hidden="true"
                  />
                  <strong>Ungrouped</strong>
                  <span className="transaction-left-tree-group-count">({items.length})</span>
                  <span className="transaction-left-tree-action-placeholder" aria-hidden="true" />
                </div>
                {!isCollapsed && items.map(renderTransaction)}
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
