import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { HistoryState } from "@timing-chart-v2/history";
import { DsIconBox } from "../design-system.js";
import { RibbonIcon } from "../ribbon-icon.js";
import { usePeerMenuSurface } from "../runtime/peer-menu-surface.js";

export interface HomeOverflowProps {
  readonly history: HistoryState;
  readonly hasSelectableSignals: boolean;
  readonly hasSelectedClipboard: boolean;
  readonly clipboardAvailable: boolean;
  readonly hasDeletableSelection: boolean;
  readonly canRenameSelection: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canShowSelection: boolean;
  readonly canHideSelection: boolean;
  readonly onNew: () => void;
  readonly onOpen: () => void;
  readonly onSave: () => void;
  readonly onSaveAs: () => void;
  readonly onRecent: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onRename: () => void;
  readonly onClearSelection: () => void;
  readonly onSelectAll: () => void;
  readonly onVisibility: (visible: boolean) => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onZoom: (delta: number) => void;
  readonly onSetZoom: (zoom: number) => void;
  readonly onFitSelection: () => void;
  readonly onFitAll: () => void;
  readonly onToggleGrid: () => void;
  readonly onToggleSnap: () => void;
  readonly onToggleRuler: () => void;
  readonly onToggleMinimap: () => void;
  readonly onProperties: () => void;
  readonly onShowProblems: () => void;
  readonly onExport: () => void;
  readonly onOpenTimeline: () => void;
}

type HomeOverflowCommand = Readonly<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}>;

type HomeOverflowSection = Readonly<{
  label: string;
  commands: readonly HomeOverflowCommand[];
}>;

export function HomeOverflow(props: HomeOverflowProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number; readonly height: number; readonly maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  usePeerMenuSurface(open, close);

  useLayoutEffect(() => {
    if (!open) { setPosition(undefined); return; }
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const margin = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const maxHeight = Math.max(120, window.innerHeight - margin * 2);
      const menuHeight = Math.min(menu.scrollHeight, maxHeight);
      const menuWidth = Math.min(menuRect.width, Math.max(220, window.innerWidth - margin * 2));
      const left = Math.max(margin, Math.min(triggerRect.right - menuWidth, window.innerWidth - margin - menuWidth));
      const belowTop = triggerRect.bottom + margin;
      const aboveTop = triggerRect.top - margin - menuHeight;
      const top = belowTop + menuHeight <= window.innerHeight - margin ? belowTop : Math.max(margin, aboveTop);
      setPosition({ left, top, height: menuHeight, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.document.addEventListener("pointerdown", onPointerDown, true);
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      window.document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Keep the menu contract explicit even for commands whose markup is
    // generated from the ribbon schema: every actionable child of a
    // role=menu surface is a menuitem, including disabled commands.
    menuRef.current?.querySelectorAll<HTMLButtonElement>("button").forEach((item) => item.setAttribute("role", "menuitem"));
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const action = (run: () => void) => () => { run(); close(); };
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)")];
    if (items.length === 0) return;
    const current = event.target instanceof HTMLElement ? items.indexOf(event.target.closest<HTMLButtonElement>("[role='menuitem']")!) : -1;
    const next = event.key === "ArrowDown" ? (current + 1) % items.length : event.key === "ArrowUp" ? (current - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  };
  const sections: readonly HomeOverflowSection[] = [
    { label: "File", commands: [{ label: "New", onClick: props.onNew }, { label: "Open", onClick: props.onOpen }, { label: "Save", onClick: props.onSave }, { label: "Save As", onClick: props.onSaveAs }, { label: "Recent", onClick: props.onRecent }] },
    { label: "History", commands: [{ label: "Undo", onClick: props.onUndo, disabled: !props.history.canUndo }, { label: "Redo", onClick: props.onRedo, disabled: !props.history.canRedo }] },
    { label: "Clipboard", commands: [{ label: "Copy", onClick: props.onCopy, disabled: !props.hasSelectedClipboard }, { label: "Cut", onClick: props.onCut, disabled: !props.hasSelectedClipboard }, { label: "Paste", onClick: props.onPaste, disabled: !props.clipboardAvailable }, { label: "Duplicate", onClick: props.onDuplicate, disabled: !props.hasSelectedClipboard }] },
    { label: "Edit / Selection", commands: [{ label: "Delete", onClick: props.onDelete, disabled: !props.hasDeletableSelection }, { label: "Rename", onClick: props.onRename, disabled: !props.canRenameSelection }, { label: "Clear Selection", onClick: props.onClearSelection }, { label: "Select All Signals", onClick: props.onSelectAll, disabled: !props.hasSelectableSignals }] },
    { label: "Visibility / Arrange", commands: [{ label: "Show", onClick: () => props.onVisibility(true), disabled: !props.canShowSelection }, { label: "Hide", onClick: () => props.onVisibility(false), disabled: !props.canHideSelection }, { label: "Move Up", onClick: props.onMoveUp, disabled: !props.canMoveUp }, { label: "Move Down", onClick: props.onMoveDown, disabled: !props.canMoveDown }] },
    { label: "View", commands: [{ label: "Zoom −", onClick: () => props.onZoom(-0.25) }, { label: "Zoom +", onClick: () => props.onZoom(0.25) }, ...[0.5, 1, 1.5, 2, 4, 8].map((zoom) => ({ label: `Zoom ${zoom * 100}%`, onClick: () => props.onSetZoom(zoom) })), { label: "Fit Selection", onClick: props.onFitSelection }, { label: "Fit All", onClick: props.onFitAll }, { label: "Grid", onClick: props.onToggleGrid }, { label: "Snap", onClick: props.onToggleSnap }, { label: "Ruler", onClick: props.onToggleRuler }, { label: "MiniMap", onClick: props.onToggleMinimap }] },
    { label: "Document", commands: [{ label: "Document Properties", onClick: props.onProperties }, { label: "Problems", onClick: props.onShowProblems }, { label: "SVG / PNG / PDF", onClick: props.onExport }] },
    { label: "Timeline", commands: [{ label: "Timeline Editor", onClick: props.onOpenTimeline }] },
  ];
  const menu = open ? createPortal(<div ref={menuRef} onKeyDown={onMenuKeyDown} id="home-overflow-menu" className="home-overflow-menu" role="menu" aria-label="More Home Commands" style={{ left: `${position?.left ?? 0}px`, top: `${position?.top ?? 0}px`, height: position ? `${position.height}px` : "auto", maxHeight: `${position?.maxHeight ?? 120}px`, visibility: position ? "visible" : "hidden" }}>
    {sections.map((section) => <div key={section.label} className="home-overflow-section" role="group" aria-label={section.label}><strong aria-hidden="true">{section.label}</strong>{section.commands.map((command) => <button key={command.label} type="button" role="menuitem" onClick={action(command.onClick)} disabled={command.disabled}>{command.label}</button>)}</div>)}
  </div>, window.document.body) : null;

  return <><button ref={triggerRef} type="button" className="ds-ribbon-button home-overflow-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? "home-overflow-menu" : undefined} onClick={() => setOpen((value) => !value)}><DsIconBox><RibbonIcon name="i-more" /></DsIconBox><span className="ds-ribbon-label">More</span></button>{menu}</>;
}
