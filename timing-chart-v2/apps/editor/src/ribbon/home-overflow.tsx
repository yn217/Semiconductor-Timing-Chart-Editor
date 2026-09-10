import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { HistoryState } from "@timing-chart-v2/history";
import { DsIconBox } from "../design-system.js";
import { RibbonIcon } from "../ribbon-icon.js";

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

export function HomeOverflow(props: HomeOverflowProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number; readonly height: number; readonly maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

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
  const menu = open ? createPortal(<div ref={menuRef} onKeyDown={onMenuKeyDown} id="home-overflow-menu" className="home-overflow-menu" role="menu" aria-label="More Home Commands" style={{ left: `${position?.left ?? 0}px`, top: `${position?.top ?? 0}px`, height: position ? `${position.height}px` : "auto", maxHeight: `${position?.maxHeight ?? 120}px`, visibility: position ? "visible" : "hidden" }}>
    <strong>File</strong><button type="button" role="menuitem" onClick={action(props.onNew)}>New</button><button type="button" role="menuitem" onClick={action(props.onOpen)}>Open</button><button type="button" role="menuitem" onClick={action(props.onSave)}>Save</button><button type="button" role="menuitem" onClick={action(props.onSaveAs)}>Save As</button><button type="button" role="menuitem" onClick={action(props.onRecent)}>Recent</button>
    <strong>History</strong><button type="button" role="menuitem" onClick={action(props.onUndo)} disabled={!props.history.canUndo}>Undo</button><button type="button" role="menuitem" onClick={action(props.onRedo)} disabled={!props.history.canRedo}>Redo</button>
    <strong>Clipboard</strong><button type="button" role="menuitem" onClick={action(props.onCopy)} disabled={!props.hasSelectedClipboard}>Copy</button><button type="button" role="menuitem" onClick={action(props.onCut)} disabled={!props.hasSelectedClipboard}>Cut</button><button type="button" role="menuitem" onClick={action(props.onPaste)} disabled={!props.clipboardAvailable}>Paste</button><button type="button" role="menuitem" onClick={action(props.onDuplicate)} disabled={!props.hasSelectedClipboard}>Duplicate</button>
    <strong>Edit / Selection</strong><button type="button" role="menuitem" onClick={action(props.onDelete)} disabled={!props.hasDeletableSelection}>Delete</button><button type="button" role="menuitem" onClick={action(props.onRename)} disabled={!props.canRenameSelection}>Rename</button><button type="button" role="menuitem" onClick={action(props.onClearSelection)}>Clear Selection</button><button type="button" role="menuitem" onClick={action(props.onSelectAll)} disabled={!props.hasSelectableSignals}>Select All Signals</button>
    <strong>Visibility / Arrange</strong><button type="button" role="menuitem" onClick={action(() => props.onVisibility(true))} disabled={!props.canShowSelection}>Show</button><button type="button" role="menuitem" onClick={action(() => props.onVisibility(false))} disabled={!props.canHideSelection}>Hide</button><button type="button" role="menuitem" onClick={action(props.onMoveUp)} disabled={!props.canMoveUp}>Move Up</button><button type="button" role="menuitem" onClick={action(props.onMoveDown)} disabled={!props.canMoveDown}>Move Down</button>
    <strong>View</strong><button type="button" role="menuitem" onClick={action(() => props.onZoom(-0.25))}>Zoom −</button><button type="button" role="menuitem" onClick={action(() => props.onZoom(0.25))}>Zoom +</button><button type="button" role="menuitem" onClick={action(() => props.onSetZoom(0.5))}>Zoom 50%</button><button type="button" role="menuitem" onClick={action(() => props.onSetZoom(1))}>Zoom 100%</button><button type="button" role="menuitem" onClick={action(() => props.onSetZoom(1.5))}>Zoom 150%</button><button type="button" role="menuitem" onClick={action(() => props.onSetZoom(2))}>Zoom 200%</button><button type="button" role="menuitem" onClick={action(() => props.onSetZoom(4))}>Zoom 400%</button><button type="button" role="menuitem" onClick={action(() => props.onSetZoom(8))}>Zoom 800%</button><button type="button" role="menuitem" onClick={action(props.onFitSelection)}>Fit Selection</button><button type="button" role="menuitem" onClick={action(props.onFitAll)}>Fit All</button><button type="button" role="menuitem" onClick={action(props.onToggleGrid)}>Grid</button><button type="button" role="menuitem" onClick={action(props.onToggleSnap)}>Snap</button><button type="button" role="menuitem" onClick={action(props.onToggleRuler)}>Ruler</button><button type="button" role="menuitem" onClick={action(props.onToggleMinimap)}>MiniMap</button>
    <strong>Document</strong><button type="button" role="menuitem" onClick={action(props.onProperties)}>Document Properties</button><button type="button" role="menuitem" onClick={action(props.onShowProblems)}>Problems</button><button type="button" role="menuitem" onClick={action(props.onExport)}>SVG / PNG / PDF</button><strong>Timeline</strong><button type="button" role="menuitem" onClick={action(props.onOpenTimeline)}>Timeline Editor</button>
  </div>, window.document.body) : null;

  return <><button ref={triggerRef} type="button" className="ds-ribbon-button home-overflow-trigger" aria-expanded={open} aria-controls={open ? "home-overflow-menu" : undefined} onClick={() => setOpen((value) => !value)}><DsIconBox><RibbonIcon name="i-more" /></DsIconBox><span className="ds-ribbon-label">More</span></button>{menu}</>;
}
