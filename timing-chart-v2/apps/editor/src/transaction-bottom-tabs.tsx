import { cyclesToTc, tcToCycles } from "./transaction-tc.js";
import { newPhaseUid, startOrder, stripPhaseUid, toDraftPhases, validatePhases, type DraftPhase } from "./transaction-phase-model.js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CanonicalDocument, Transaction, TransactionPhase } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";

function phasesEqual(left: readonly TransactionPhase[], right: readonly TransactionPhase[]): boolean {
  return left.length === right.length && left.every((phase, index) => {
    const other = right[index];
    return other !== undefined && phase.name === other.name && phase.start === other.start && phase.end === other.end;
  });
}

const phaseDrafts = new Map<string, { readonly base: readonly TransactionPhase[]; readonly rows: readonly DraftPhase[] }>();
const phaseDraftListeners = new Set<() => void>();
const notifyPhaseDrafts = () => { for (const listener of [...phaseDraftListeners]) listener(); };

let phaseDraftVersion = 0;
const bumpPhaseDrafts = () => { phaseDraftVersion += 1; notifyPhaseDrafts(); };
const subscribePhaseDrafts = (listener: () => void) => { phaseDraftListeners.add(listener); return () => { phaseDraftListeners.delete(listener); }; };

/** The session's unapplied Phase draft for a Transaction (shared by Bottom and Inspector), or undefined when none is pending. */
export function pendingPhaseDraft(transaction: Transaction | undefined): readonly DraftPhase[] | undefined {
  if (!transaction) return undefined;
  const draft = phaseDrafts.get(transaction.id);
  if (!draft) return undefined;
  // A commit (or Undo/Redo) changed the committed phases: the draft's base is stale and must not be resurrected later.
  if (!phasesEqual(draft.base, transaction.phases ?? [])) { phaseDrafts.delete(transaction.id); return undefined; }
  return phasesEqual(draft.rows, transaction.phases ?? []) ? undefined : draft.rows;
}
export function usePendingPhaseDraft(transaction: Transaction | undefined): readonly DraftPhase[] | undefined {
  useSyncExternalStore(subscribePhaseDrafts, () => phaseDraftVersion, () => 0);
  return pendingPhaseDraft(transaction);
}
const draftRowsOrCommitted = (transaction: Transaction): readonly DraftPhase[] => pendingPhaseDraft(transaction) ?? toDraftPhases(transaction.phases ?? []);
export function canAddPhase(transaction: Transaction): boolean {
  return Math.max(transaction.start, ...draftRowsOrCommitted(transaction).map((phase) => phase.end)) < transaction.end;
}
/** Append the next one-cycle Phase to the shared draft (no commit). */
export function addPhaseToDraft(transaction: Transaction): void {
  if (!canAddPhase(transaction)) return;
  const rows = draftRowsOrCommitted(transaction).map((phase) => ({ ...phase }));
  const nextStart = Math.max(transaction.start, ...rows.map((phase) => phase.end));
  rows.push({ name: `Phase ${rows.length + 1}`, start: nextStart, end: nextStart + 1, uid: newPhaseUid() });
  phaseDrafts.set(transaction.id, { base: transaction.phases ?? [], rows });
  bumpPhaseDrafts();
}
export function clearPhaseDraft(transactionId: string): void {
  if (phaseDrafts.delete(transactionId)) bumpPhaseDrafts();
}
/** Validated, time-ordered rows ready to commit, or an error message. */
export function commitPhaseRows(rows: readonly (TransactionPhase & { readonly uid?: string })[], start: number, end: number, perTc = 1): { readonly rows: TransactionPhase[] } | { readonly error: string } {
  const normalized = rows.map((phase) => ({ ...phase, name: phase.name.trim() })).sort((a, b) => a.start - b.start || a.end - b.end);
  const { blocking } = validatePhases(normalized, { start, end }, perTc);
  return blocking ? { error: blocking.message } : { rows: normalized.map(stripPhaseUid) };
}

function initialPhaseRows(transaction: Transaction | undefined): DraftPhase[] {
  const base = transaction?.phases ?? [];
  const draft = transaction ? phaseDrafts.get(transaction.id) : undefined;
  return draft && phasesEqual(draft.base, base) ? draft.rows.map((phase) => ({ ...phase })) : toDraftPhases(base);
}

export function TransactionPhaseEditor({ transaction, commands, compact = false, cyclesPerTc: perTc = 1, parentRange }: { readonly transaction: Transaction | undefined; readonly commands: EditorSurfaceCommandController; readonly compact?: boolean; readonly cyclesPerTc?: number; /** Draft parent Start/End (Inspector): Phases validate against the range that Apply will commit together with them. */ readonly parentRange?: Readonly<{ start: number; end: number }> }) {
  const [rows, setRowsRaw] = useState<DraftPhase[]>(() => initialPhaseRows(transaction));
  const [error, setError] = useState("");
  const setRows = (update: (current: DraftPhase[]) => DraftPhase[]) => setRowsRaw((current) => {
    const next = update(current);
    if (transaction) {
      const base = transaction.phases ?? [];
      if (phasesEqual(next, base)) phaseDrafts.delete(transaction.id); else phaseDrafts.set(transaction.id, { base, rows: next.map((phase) => ({ ...phase })) });
      queueMicrotask(bumpPhaseDrafts);
    }
    return next;
  });
  // Inspector and Bottom both mount this editor; keep one shared draft per Transaction.
  useEffect(() => {
    const sync = () => setRowsRaw((current) => {
      const next = initialPhaseRows(transaction);
      return phasesEqual(current, next) ? current : next;
    });
    phaseDraftListeners.add(sync);
    return () => { phaseDraftListeners.delete(sync); };
  }, [transaction?.id, transaction?.phases]);
  useEffect(() => {
    setRowsRaw(initialPhaseRows(transaction));
    setError("");
  }, [transaction?.id, transaction?.start, transaction?.end, transaction?.phases]);
  if (!transaction) return <section className="transaction-bottom-summary" data-testid="transaction-bottom-phases"><p className="inspector-note">Select a Transaction to edit phases.</p></section>;
  const rangeStart = parentRange?.start ?? transaction.start;
  const rangeEnd = parentRange?.end ?? transaction.end;
  const changed = !phasesEqual(rows, transaction.phases ?? []);
  const addPhase = () => {
    const nextStart = Math.max(rangeStart, ...rows.map((phase) => phase.end));
    if (nextStart >= rangeEnd) return;
    setRows((current) => [...current, { name: `Phase ${current.length + 1}`, start: nextStart, end: nextStart + 1, uid: newPhaseUid() }]);
  };
  const apply = () => {
    if (!changed) return;
    const committed = commitPhaseRows(rows, transaction.start, transaction.end, perTc);
    if ("error" in committed) { setError(committed.error); return; }
    const normalized = committed.rows;
    setError("");
    commands.updateTransactionFromBottom({ transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.groupId === undefined ? { clearGroupId: true } : { groupId: transaction.groupId }), ...(transaction.color === undefined ? { clearColor: true } : { color: transaction.color }), ...(transaction.description === undefined ? { clearDescription: true } : { description: transaction.description }), phases: normalized });
  };
  const duration = rangeEnd - rangeStart;
  const covered = rows.reduce((sum, phase) => sum + Math.max(0, phase.end - phase.start), 0);
  // #751: one shared validator (structured codes, over whole source cycles after TC conversion) feeds the live error and the coverage line.
  const validation = validatePhases(rows.map((phase) => ({ ...phase, name: phase.name.trim() })), { start: rangeStart, end: rangeEnd }, perTc);
  const liveError = changed ? validation.blocking?.message : undefined;
  const coverageProblem = validation.status?.message;
  const shownError = error || liveError || "";
  // Edits/deletes resolve the stable Phase uid, never the displayed (Start-sorted) position.
  const updateRow = (uid: string, patch: Partial<TransactionPhase>) => setRows((current) => current.map((item) => item.uid === uid ? { ...item, ...patch } : item));
  // Start-time projection. While a row is being edited the visible order is held (a row must not jump under the caret on every
  // keystroke); it re-projects as soon as focus leaves the row, and on add / delete / revert / apply.
  const [editingUid, setEditingUid] = useState<string>();
  const heldOrder = useRef<readonly string[]>([]);
  const projected = [...rows].sort(startOrder);
  const displayRows = editingUid !== undefined && heldOrder.current.length === rows.length && heldOrder.current.every((uid) => rows.some((row) => row.uid === uid))
    ? heldOrder.current.map((uid) => rows.find((row) => row.uid === uid)!)
    : projected;
  if (editingUid === undefined) heldOrder.current = projected.map((row) => row.uid);
  return <section className={`transaction-bottom-summary transaction-bottom-phase-editor${compact ? " is-compact" : ""}`} data-testid={compact ? "inspector-phase-editor" : "transaction-bottom-phases"}>
    <header className="transaction-bottom-phase-header">
      <strong>Phases ({rows.length})</strong><span>{transaction.name}</span>
      {changed && <span className="draft-unapplied-indicator" role="status" data-testid="transaction-bottom-phases-unapplied">Unapplied changes</span>}
      {!compact && <span className="bottom-sticky-buttons">
        <button type="button" onClick={() => { setRows(() => toDraftPhases(transaction.phases ?? [])); setError(""); }} disabled={!changed}>Revert</button>
        <button type="button" data-testid={compact ? "apply-transaction-phases" : "apply-bottom-transaction-phases"} onClick={apply} disabled={!changed}>Apply</button>
      </span>}
    </header>
    {!compact && <p className="transaction-bottom-phase-context" data-testid="transaction-bottom-phase-context">Group: {transaction.groupId ?? "Ungrouped"} · Lane: {transaction.laneId ?? "lane_0"} · Start {cyclesToTc(transaction.start, perTc)} · End {cyclesToTc(transaction.end, perTc)} · Duration {cyclesToTc(duration, perTc)} {perTc === 1 ? "cycles" : "TC"} · Coverage {cyclesToTc(covered, perTc)} / {cyclesToTc(duration, perTc)} · Remaining {cyclesToTc(Math.max(0, duration - covered), perTc)}</p>}
    {!compact && <div className="transaction-bottom-phase-timeline" data-testid="transaction-bottom-phase-timeline" role="img" aria-label={`Phase timeline ${cyclesToTc(transaction.start, perTc)} to ${cyclesToTc(transaction.end, perTc)}`}>
      {displayRows.map((phase, index) => {
        const left = Math.max(0, Math.min(100, 100 * (phase.start - rangeStart) / Math.max(1, duration)));
        const width = Math.max(0.5, Math.min(100 - left, 100 * (phase.end - phase.start) / Math.max(1, duration)));
        return <span key={phase.uid} className="transaction-bottom-phase-segment" data-phase-index={index} title={`${phase.name}: ${cyclesToTc(phase.start, perTc)}–${cyclesToTc(phase.end, perTc)}`} style={{ left: `${left}%`, width: `${width}%` }}>{phase.name}</span>;
      })}
    </div>}
    <p className={`transaction-bottom-phase-coverage${coverageProblem ? " is-warning" : ""}`} data-testid="transaction-bottom-phase-coverage">{coverageProblem ?? "✓ Full Transaction range is covered"}</p>
    <div className="transaction-bottom-phase-table"><div className="transaction-bottom-phase-row transaction-bottom-phase-head"><span>Name</span><span>{perTc === 1 ? "Start" : "Start (TC)"}</span><span>{perTc === 1 ? "End" : "End (TC)"}</span><span>{perTc === 1 ? "Duration" : "Duration (TC)"}</span><span /></div>{displayRows.map((phase, index) => <div className="transaction-bottom-phase-row" key={`${transaction.id}-${phase.uid}`} data-phase-index={index} data-phase-uid={phase.uid} onFocus={() => setEditingUid(phase.uid)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditingUid(undefined); }}><input aria-label={`${compact ? "" : "Bottom "}Phase ${index + 1} name`} value={phase.name} onChange={(event) => updateRow(phase.uid, { name: event.target.value })} /><input aria-label={`${compact ? "" : "Bottom "}Phase ${index + 1} start`} type="number" step={perTc === 1 ? 1 : 1 / perTc} value={cyclesToTc(phase.start, perTc)} onChange={(event) => updateRow(phase.uid, { start: tcToCycles(Number(event.target.value), perTc) })} /><input aria-label={`${compact ? "" : "Bottom "}Phase ${index + 1} end`} type="number" step={perTc === 1 ? 1 : 1 / perTc} value={cyclesToTc(phase.end, perTc)} onChange={(event) => updateRow(phase.uid, { end: tcToCycles(Number(event.target.value), perTc) })} /><span>{cyclesToTc(phase.end - phase.start, perTc)}</span><button type="button" aria-label={compact ? `Delete phase ${index + 1}` : `Delete bottom phase ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.uid !== phase.uid))}>×</button></div>)}</div>
    {rows.length === 0 && <p className="inspector-note">No phases defined. Add a phase within the Transaction range.</p>}
    <button type="button" data-testid={compact ? "add-transaction-phase" : "add-bottom-transaction-phase"} onClick={addPhase} disabled={Math.max(rangeStart, ...rows.map((phase) => phase.end)) >= rangeEnd}>Add Phase</button>
    {compact && rows.length > 0 && Math.max(rangeStart, ...rows.map((phase) => phase.end)) >= rangeEnd && <p className="inspector-note" role="note">No unused cycles remain. Extend the Transaction or shorten a Phase to add another.</p>}
    {shownError && <p className="inspector-note" role="alert" data-testid="transaction-bottom-phase-error">{shownError}</p>}
  </section>;
}

export function TransactionPhaseSummary({ transaction, commands, cyclesPerTc }: { readonly transaction: Transaction | undefined; readonly commands: EditorSurfaceCommandController; readonly cyclesPerTc?: number }) {
  return <TransactionPhaseEditor transaction={transaction} commands={commands} {...(cyclesPerTc === undefined ? {} : { cyclesPerTc })} />;
}

export function TransactionLinkedSummary({ transaction, document }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument }) {
  const linked = new Set(transaction?.linkedSignals ?? []);
  const signals = document.signals.filter((signal) => linked.has(signal.id));
  return <section className="transaction-bottom-summary" data-testid="transaction-bottom-linked-signals"><header><strong>Linked Signals ({signals.length})</strong><span>{transaction?.name ?? "Select a Transaction"}</span></header>{signals.length === 0 ? <p className="inspector-note">No linked signals. Manage links in the Inspector.</p> : <div className="transaction-bottom-linked-list">{signals.map((signal) => <span key={signal.id}>{signal.display.name}</span>)}</div>}</section>;
}
