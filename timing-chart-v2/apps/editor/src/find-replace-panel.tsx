import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommandResult } from "@timing-chart-v2/commands";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { RibbonIcon } from "./ribbon-icon.js";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Self-contained trigger + floating panel, same portal/position/dismiss
 * shell as the Home ribbon's overflow menu (minimal-cycle-view-ribbon.tsx),
 * just scoped to this component instead of the whole Ribbon so it doesn't
 * grow that already-large function further. Case-insensitive literal
 * substring match/replace on Signal.display.name, mirroring the left
 * tree's existing "Filter signals..." matching convention -- no free-form
 * regex from user input, only an escaped literal. */
export function FindReplacePanel({ document, onRenameSignals }: { readonly document: CanonicalDocument; readonly onRenameSignals: (items: readonly { readonly signalId: SignalId; readonly name: string }[]) => CommandResult }) {
  const [open, setOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number; readonly maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) { setPosition(undefined); return; }
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const margin = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const maxHeight = Math.max(160, window.innerHeight - margin * 2);
      const panelHeight = Math.min(panel.scrollHeight, maxHeight);
      const panelWidth = Math.max(280, panel.getBoundingClientRect().width);
      const left = Math.max(margin, Math.min(triggerRect.left, window.innerWidth - margin - panelWidth));
      const belowTop = triggerRect.bottom + margin;
      const top = belowTop + panelHeight <= window.innerHeight - margin ? belowTop : Math.max(margin, triggerRect.top - margin - panelHeight);
      setPosition({ left, top, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.document.addEventListener("pointerdown", onPointerDown, true);
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      window.document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const needle = findText.trim();
  // A fresh non-shared RegExp per signal -- a single shared "g" regex is
  // stateful across .test()/.replace() calls (lastIndex), easy to get
  // subtly wrong; building one per name sidesteps that entirely.
  const matches = needle ? document.signals.filter((signal) => new RegExp(escapeRegExp(needle), "i").test(signal.display.name)) : [];
  const preview = matches
    .map((signal) => ({ signal, nextName: signal.display.name.replace(new RegExp(escapeRegExp(needle), "gi"), replaceText).trim() }))
    .filter((item) => item.nextName.length > 0);
  const skippedCount = matches.length - preview.length;

  const replaceAll = () => {
    if (preview.length === 0) return;
    onRenameSignals(preview.map(({ signal, nextName }) => ({ signalId: signal.id, name: nextName })));
    setOpen(false);
  };

  return <>
    {/* #439: "wide" -- "Replace" alone is right at the default Home button
        width's limit; the margin is too thin to trust across font/kerning
        variance, so this opts into the shared wide class like Duplicate/
        Fit Selection rather than risk a mid-word break. */}
    <button ref={triggerRef} type="button" className="ds-ribbon-button ds-ribbon-button--wide" aria-expanded={open} aria-haspopup="dialog" data-testid="find-replace-trigger" onClick={() => setOpen((value) => !value)}><span className="ds-icon-box" aria-hidden="true"><RibbonIcon name="i-search" /></span><span className="ds-ribbon-label">Find &amp; Replace</span></button>
    {open && createPortal(<div ref={panelRef} className="find-replace-panel" role="dialog" aria-label="Find and Replace" data-testid="find-replace-panel" style={{ left: `${position?.left ?? 0}px`, top: `${position?.top ?? 0}px`, maxHeight: `${position?.maxHeight ?? 200}px`, visibility: position ? "visible" : "hidden" }}>
      <label>Find<input aria-label="Find" data-testid="find-replace-find" value={findText} onChange={(event) => setFindText(event.target.value)} autoFocus /></label>
      <label>Replace with<input aria-label="Replace with" data-testid="find-replace-replace" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} /></label>
      <output data-testid="find-replace-count">{needle ? `${preview.length} signal${preview.length === 1 ? "" : "s"} will be renamed${skippedCount > 0 ? ` (${skippedCount} skipped: would become empty)` : ""}` : "Enter text to search for"}</output>
      {preview.length > 0 && <ul className="find-replace-preview">{preview.slice(0, 20).map(({ signal, nextName }) => <li key={signal.id}><span>{signal.display.name}</span><RibbonIcon name="i-chevron-right" /><span>{nextName}</span></li>)}{preview.length > 20 && <li className="find-replace-more">…and {preview.length - 20} more</li>}</ul>}
      <div className="find-replace-actions">
        <button type="button" data-testid="find-replace-apply" disabled={preview.length === 0} onClick={replaceAll}>Replace All</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>, window.document.body)}
  </>;
}
