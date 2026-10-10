import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { DocumentProblem } from "@timing-chart-v2/schema";
import type { EditorExportController } from "./application/editor-export-controller.js";

function useExportDialogFocusLoop(dialogRef: RefObject<HTMLElement | null>, restoreFocusRef: RefObject<HTMLElement | null> | undefined, onDismiss: () => void, dismissible: boolean): void {
  const dismissRef = useRef(onDismiss);
  const dismissibleRef = useRef(dismissible);
  dismissRef.current = onDismiss;
  dismissibleRef.current = dismissible;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const backdrop = dialog.parentElement;
    if (!backdrop) return undefined;
    const previous = restoreFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onBackdropClick = (event: MouseEvent) => {
      // Child clicks must reach React's delegated listener on the root.
      if (event.target !== backdrop) return;
      event.stopPropagation();
      if (dismissibleRef.current) dismissRef.current();
    };
    dialog.addEventListener("keydown", onKeyDown);
    backdrop.addEventListener("click", onBackdropClick);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      backdrop.removeEventListener("click", onBackdropClick);
      if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
      if (restoreFocusRef?.current === previous) restoreFocusRef.current = null;
    };
  }, [dialogRef, restoreFocusRef]);
}

function ExportCloseIcon(): ReactNode {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function ExportDialog({ snapshot, range, restoreFocusRef, onDiagnostic, onClose, controller }: { readonly snapshot: CanonicalSnapshot; readonly range: { start: number; end: number }; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onDiagnostic: (diagnostic: DocumentProblem | undefined) => void; readonly onClose: () => void; readonly controller: EditorExportController }) {
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [scope, setScope] = useState<"document" | "selected-range">("document");
  const [scale, setScale] = useState(2);
  // "none" is the default unpaged export; the other controls are only applied (and only shown as active) when a page size is chosen.
  const [pageSize, setPageSize] = useState<"none" | "A4" | "Letter" | "wide">("none");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [margin, setMargin] = useState(24);
  const [fit, setFit] = useState<"width" | "page">("width");
  const pageEnabled = pageSize !== "none";
  const [foldPolicy, setFoldPolicy] = useState<"respect" | "expand">("respect");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);
  const settings = () => ({ scope, ...(scope === "selected-range" ? { range } : {}), scale, ...(pageEnabled ? { page: { size: pageSize, orientation, margin, fit } } : {}), foldPolicy });
  const progressText = (stage: string) => ({ preparing: "Preparing chart…", drawing: "Drawing export…", encoding: "Encoding file…", rasterizing: "Rasterizing image…", finalizing: "Finalizing PDF…" }[stage] ?? "Working…");
  const cancel = () => abortRef.current?.abort();
  const close = () => { cancel(); onClose(); };
  useExportDialogFocusLoop(dialogRef, restoreFocusRef, close, !busy);
  const runExport = async (fileFormat: "svg" | "png" | "pdf", deliver: (bytes: Uint8Array) => Promise<void> | void, failureCode: "EXPORT_FAILED" | "CLIPBOARD_FAILED", failurePath: string, failureOperation: string, failureLabel: string, successText: string) => {
    if (abortRef.current) return;
    const abort = new AbortController();
    abortRef.current = abort;
    if (mountedRef.current) { setBusy(true); setStatus("Preparing chart…"); }
    try {
      const bytes = await controller.export({ format: fileFormat, snapshot, settings: settings(), signal: abort.signal, onProgress: ({ stage }) => { if (!abort.signal.aborted) setStatus(progressText(stage)); } });
      if (abort.signal.aborted) { const error = new Error("Export canceled."); error.name = "AbortError"; throw error; }
      await deliver(bytes);
      if (abort.signal.aborted) { const error = new Error("Export canceled."); error.name = "AbortError"; throw error; }
      onDiagnostic(undefined);
      if (mountedRef.current) setStatus(successText);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") { if (mountedRef.current) setStatus("Export canceled"); return; }
      const reason = error instanceof Error ? error.message : "Export generation failed.";
      if (!(error instanceof Error && "diagnosticReported" in error)) {
        onDiagnostic({ code: failureCode, path: failurePath, message: `${failureLabel}: ${reason}`, severity: "error", operation: failureOperation, operationLabel: failureLabel, source: failureCode === "CLIPBOARD_FAILED" ? "clipboard" : "export", stage: failureCode === "CLIPBOARD_FAILED" ? "clipboard-write" : "rasterize", recommendation: failureCode === "CLIPBOARD_FAILED" ? "Allow clipboard access or retry the copy operation." : "Reduce the selected range or export scale, then retry.", detail: failureCode === "CLIPBOARD_FAILED" ? "clipboard-failure:copy" : "export-failure:generate" });
      }
      if (mountedRef.current) setStatus(reason);
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      if (mountedRef.current) setBusy(false);
    }
  };
  const exportNow = async () => runExport(format, (bytes) => {
    try {
      controller.download(bytes, `${snapshot.document.document.title || "timing-chart"}.${format}`, format === "svg" ? "image/svg+xml" : format === "png" ? "image/png" : "application/pdf");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Browser download preparation failed.";
      onDiagnostic({ code: "EXPORT_FAILED", path: "$.export.download", message: `Export download failed: ${reason}`, severity: "error", operation: "document.export.download", operationLabel: `Download ${format.toUpperCase()} export`, source: "export", stage: "storage", recommendation: "Retry the download or choose another export format.", detail: "export-failure:download" });
      const reported = new Error(`Download failed · ${reason}`) as Error & { diagnosticReported: true };
      reported.diagnosticReported = true;
      throw reported;
    }
  }, "EXPORT_FAILED", "$.export", "document.export.generate", `Generate ${format.toUpperCase()} export`, `${format.toUpperCase()} ready`);
  const copyNow = async (copyFormat: "svg" | "png") => {
    await runExport(copyFormat, (bytes) => controller.copyImage(bytes, copyFormat), "CLIPBOARD_FAILED", "$.clipboard", "document.clipboard.copy", `Copy ${copyFormat.toUpperCase()} export`, `${copyFormat.toUpperCase()} copied`);
  };
  return <div className="modal-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Export Timing Chart" className="export-dialog"><header><h2>Export</h2><button type="button" aria-label="Close export" onClick={close}><ExportCloseIcon /></button></header><label>Format<select aria-label="Export format" value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="svg">SVG</option><option value="png">PNG</option><option value="pdf">PDF</option></select></label><label>Scope<select aria-label="Export scope" value={scope} disabled={busy} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="document">Entire Document</option><option value="selected-range">Selected Range</option></select></label><label>Page Size<select aria-label="Export page size" value={pageSize} disabled={busy} onChange={(event) => setPageSize(event.target.value as typeof pageSize)}><option value="none">None</option><option value="A4">A4</option><option value="Letter">Letter</option><option value="wide">Wide</option></select></label><label>Orientation<select aria-label="Export orientation" value={orientation} disabled={busy || !pageEnabled} onChange={(event) => setOrientation(event.target.value as typeof orientation)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label>Fit<select aria-label="Export fit" value={fit} disabled={busy || !pageEnabled} onChange={(event) => setFit(event.target.value as typeof fit)}><option value="width">Fit Width</option><option value="page">Fit Page</option></select></label><label>Margin<input aria-label="Export margin" type="number" min="0" step="1" value={margin} disabled={busy || !pageEnabled} onChange={(event) => setMargin(Number(event.target.value))} /></label><label>Fold Policy<select aria-label="Export fold policy" value={foldPolicy} disabled={busy} onChange={(event) => setFoldPolicy(event.target.value as typeof foldPolicy)}><option value="respect">Respect Axis Break</option><option value="expand">Expand Folded Ranges</option></select></label>{format === "png" && <label>Scale<select aria-label="PNG scale" value={scale} disabled={busy} onChange={(event) => setScale(Number(event.target.value))}><option value="1">1x</option><option value="2">2x</option><option value="3">3x</option></select></label>}<div className="export-summary">Canonical source · {snapshot.document.signals.length} signals · {snapshot.document.transactions.length} transactions</div><footer><output role="status" aria-live="polite">{status}</output>{busy ? <button type="button" onClick={cancel}>Cancel Export</button> : <><button type="button" onClick={() => void copyNow("svg")}>Copy SVG</button><button type="button" onClick={() => void copyNow("png")}>Copy PNG</button><button type="button" onClick={() => void exportNow()}>Export {format.toUpperCase()}</button></>}</footer></section></div>;
}
