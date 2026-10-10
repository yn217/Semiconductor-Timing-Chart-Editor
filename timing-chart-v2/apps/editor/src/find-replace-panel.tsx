import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommandResult } from "@timing-chart-v2/commands";
import type { CanonicalDocument, Signal, SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { RibbonIcon } from "./ribbon-icon.js";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { consumeOutsidePointerDown } from "./modal-backdrop.js";
import { compileLiteralFindReplace } from "./find-replace-model.js";
const itemName = (item: Signal | Transaction) => "display" in item ? item.display.name : item.name;

/** Self-contained trigger + floating panel, same portal/position/dismiss
 * shell as the Home ribbon's overflow menu (minimal-cycle-view-ribbon.tsx),
 * just scoped to this component instead of the whole Ribbon so it doesn't
 * grow that already-large function further. Case-insensitive literal
 * substring match/replace on Signal.display.name, mirroring the left
 * tree's existing "Filter signals..." matching convention -- no free-form
 * regex from user input, only an escaped literal. */
export function FindReplacePanel({ document, mode = "signals", onRenameSignals, onRenameTransactions }: { readonly document: CanonicalDocument; readonly mode?: "signals" | "transactions"; readonly onRenameSignals?: (items: readonly { readonly signalId: SignalId; readonly name: string }[]) => CommandResult; readonly onRenameTransactions?: (items: readonly { readonly transactionId: TransactionId; readonly name: string }[]) => CommandResult }) {
  const [open, setOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number; readonly maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Do not pass triggerRef as the restore ref: the hook clears a restore ref on close, which detached the persistent trigger button and
  // left the reopened panel unpositioned (invisible). Focus returns to the element that was active when the panel opened (the trigger).
  useDialogFocusLoop(panelRef, undefined, open);

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
      consumeOutsidePointerDown(event, () => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); });
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

  // Keep large collection searches at deferred priority and compile one
  // escaped literal expression per settled query.
  const needle = useDeferredValue(findText.trim());
  // #859: compile the escaped literal needle ONCE per query (the search regex has no `g`, so .test() is stateless; String.replace resets
  // lastIndex of a global regex on every call) and recompute only when the owning collection, mode, needle or replacement changes.
  const deferredReplaceText = useDeferredValue(replaceText);
  const expressions = useMemo(() => compileLiteralFindReplace(needle), [needle]);
  const searchExpression = expressions?.search;
  const replacementExpression = expressions?.replace;
  const matches = useMemo(() => {
    if (!searchExpression) return [];
    const collection = mode === "transactions" ? document.transactions : document.signals;
    return mode === "transactions"
      ? (collection as readonly Transaction[]).filter((transaction) => searchExpression.test(transaction.name))
      : (collection as readonly Signal[]).filter((signal) => searchExpression.test(signal.display.name));
  }, [document.signals, document.transactions, mode, searchExpression]);
  const preview = useMemo(() => {
    const rows: Array<{ readonly item: Signal | Transaction; readonly nextName: string }> = [];
    let validCount = 0;
    if (replacementExpression) {
      for (const item of matches) {
        const nextName = itemName(item).replace(replacementExpression, () => deferredReplaceText).trim();
        if (nextName.length === 0) continue;
        validCount += 1;
        if (rows.length < 20) rows.push({ item, nextName });
      }
    }
    return { rows, validCount, skippedCount: matches.length - validCount };
  }, [matches, replacementExpression, deferredReplaceText]);
  const inputIsSettled = needle === findText.trim() && deferredReplaceText === replaceText;

  const replaceAll = () => {
    if (!inputIsSettled || preview.validCount === 0 || !replacementExpression) return;
    const replacements = matches.flatMap((item) => {
      const nextName = itemName(item).replace(replacementExpression, () => deferredReplaceText).trim();
      return nextName.length === 0 ? [] : [{ item, nextName }];
    });
    if (mode === "transactions") onRenameTransactions?.(replacements.map(({ item, nextName }) => ({ transactionId: item.id as TransactionId, name: nextName })));
    else onRenameSignals?.(replacements.map(({ item, nextName }) => ({ signalId: item.id as SignalId, name: nextName })));
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
      <output data-testid="find-replace-count">{needle ? `${preview.validCount} ${mode === "transactions" ? "transaction" : "signal"}${preview.validCount === 1 ? "" : "s"} will be renamed${preview.skippedCount > 0 ? ` (${preview.skippedCount} skipped: would become empty)` : ""}` : "Enter text to search for"}</output>
      {preview.validCount > 0 && <ul className="find-replace-preview">{preview.rows.map(({ item, nextName }) => <li key={item.id}><span>{itemName(item)}</span><RibbonIcon name="i-chevron-right" /><span>{nextName}</span></li>)}{preview.validCount > preview.rows.length && <li className="find-replace-more">…and {preview.validCount - preview.rows.length} more</li>}</ul>}
      <div className="find-replace-actions">
        <button type="button" data-testid="find-replace-apply" disabled={!inputIsSettled || preview.validCount === 0} onClick={replaceAll}>Replace All</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>, window.document.body)}
  </>;
}
