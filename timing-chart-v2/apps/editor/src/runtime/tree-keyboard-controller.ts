export function createTreeKeyboardController(host: HTMLElement, focusRowIdRef: { current: string | undefined }) {
  const leftTree = host.querySelector<HTMLElement>("[data-role='left-tree-rows']");
  const treeItems = () => [...(leftTree?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? [])].filter((item) => !item.hidden && !item.closest("[hidden]"));
  const focusItem = (item: HTMLElement | undefined) => {
    if (!item || !leftTree) return;
    focusRowIdRef.current = item.dataset.rowId;
    for (const candidate of leftTree.querySelectorAll<HTMLElement>("[role='treeitem']")) candidate.tabIndex = candidate === item ? 0 : -1;
    item.focus({ preventScroll: true });
    leftTree.dataset.focusRowId = item.dataset.rowId ?? "";
  };
  const focusChild = (groupId: string) => focusItem(treeItems().find((item) => item.dataset.groupId === groupId && item.dataset.groupHeader !== "true"));
  const onKeyDown = (event: KeyboardEvent) => {
    if (!leftTree || !(event.target instanceof Element) || !leftTree.contains(event.target)) return;
    const item = event.target.closest<HTMLElement>("[role='treeitem']");
    const items = treeItems();
    if (items.length === 0) return;
    const active = item ?? items.find((candidate) => candidate.dataset.rowId === focusRowIdRef.current) ?? items[0];
    if (!active) return;
    const index = items.indexOf(active);
    const move = (next: HTMLElement | undefined) => { if (next) { event.preventDefault(); event.stopPropagation(); focusItem(next); requestAnimationFrame(() => focusItem(next)); } };
    if (event.key === "ArrowDown") { move(items[Math.min(items.length - 1, index + 1)]); return; }
    if (event.key === "ArrowUp") { move(items[Math.max(0, index - 1)]); return; }
    if (event.key === "Home") { move(items[0]); return; }
    if (event.key === "End") { move(items.at(-1)); return; }
    if (event.key === "ArrowRight" && active.dataset.groupHeader === "true") {
      if (active.getAttribute("aria-expanded") === "false") {
        event.preventDefault();
        event.stopPropagation();
        active.querySelector<HTMLElement>("[data-role='tree-collapse']")?.click();
        requestAnimationFrame(() => focusChild(active.dataset.groupId ?? ""));
      } else move(items.find((candidate) => candidate.dataset.groupId === active.dataset.groupId && candidate.dataset.groupHeader !== "true"));
      return;
    }
    if (event.key === "ArrowLeft") {
      if (active.dataset.groupHeader === "true" && active.getAttribute("aria-expanded") !== "false") {
        event.preventDefault();
        event.stopPropagation();
        active.querySelector<HTMLElement>("[data-role='tree-collapse']")?.click();
        requestAnimationFrame(() => focusItem(active));
      } else if (active.dataset.groupHeader !== "true") move(items.find((candidate) => candidate.dataset.groupId === active.dataset.groupId && candidate.dataset.groupHeader === "true"));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const target = active.dataset.groupHeader === "true" ? active.querySelector<HTMLElement>("[data-role='tree-branch']") : active;
      target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: globalThis.window }));
      return;
    }
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      const rect = active.getBoundingClientRect();
      active.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, view: globalThis.window }));
    }
  };
  return { onKeyDown, focusItem };
}
