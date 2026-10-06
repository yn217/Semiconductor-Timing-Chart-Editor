import type { SignalValueChange } from "@timing-chart-v2/schema";
import { reconcileExternalDraft } from "./external-draft-reconciliation.js";

/** One Transition row's editable fields, as the always-editable row shows them. */
export interface EventRowFields { readonly start: number; readonly value: string; readonly comment: string }

/** An unapplied row Draft. `base` is the committed row it was started from;
 * `conflict` is set when Canonical changed underneath a dirty Draft. */
export interface EventRowDraft { readonly base: EventRowFields; readonly fields: EventRowFields; readonly conflict: boolean }

export function eventRowFields(change: Pick<SignalValueChange, "start" | "value" | "comment">): EventRowFields {
  return { start: change.start, value: String(change.value), comment: change.comment ?? "" };
}

export function sameEventRowFields(left: EventRowFields, right: EventRowFields): boolean {
  return left.start === right.start && left.value === right.value && left.comment === right.comment;
}

/** Record an edit. Editing a row back to its committed values clears its Draft. */
export function nextEventRowDraft(draft: EventRowDraft | undefined, committed: EventRowFields, fields: EventRowFields): EventRowDraft | undefined {
  if (sameEventRowFields(fields, committed)) return undefined;
  return { base: draft?.base ?? committed, fields, conflict: draft?.conflict ?? false };
}

/** Follow external Canonical updates: a Draft whose row disappeared is dropped,
 * a Draft that still equals its base follows Canonical, and a dirty Draft
 * over a changed row is kept and flagged as a conflict (never overwritten). */
export function reconcileEventRowDrafts(drafts: ReadonlyMap<string, EventRowDraft>, committedByKey: (key: string) => EventRowFields | undefined): ReadonlyMap<string, EventRowDraft> {
  let next: Map<string, EventRowDraft> | undefined;
  for (const [key, draft] of drafts) {
    const latest = committedByKey(key);
    if (latest === undefined) { (next ??= new Map(drafts)).delete(key); continue; }
    const resolution = reconcileExternalDraft(draft.base, draft.fields, latest, true, sameEventRowFields);
    if (resolution.kind === "rebase") (next ??= new Map(drafts)).delete(key);
    else if (resolution.kind === "conflict" && !draft.conflict) (next ??= new Map(drafts)).set(key, { ...draft, conflict: true });
  }
  return next ?? drafts;
}
