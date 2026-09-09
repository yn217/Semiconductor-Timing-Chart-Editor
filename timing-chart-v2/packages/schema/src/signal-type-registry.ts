import { VALUE_SIGNAL_RENDER_POLICY } from "./value-signal-compatibility.js";
import type { Signal, ValueSignal } from "./types.js";

// #474 Signal Type registry: the ONE place mapping a Signal's canonical
// `type` to its display label -- Inspector's Type dropdown and the Left
// Tree's "Add" menu (minimal-cycle-view-panels.tsx) previously hardcoded
// this same {binary:"Signal", bus:"Bus", state:"State", logic:"Level",
// event:"Event"} table independently in two files. They happened to agree
// today, but nothing enforced that -- a label change in one place silently
// drifting from the other is exactly the risk #474 calls out. Both surfaces
// now read this one table instead of inventing their own.
//
// Scope: this covers the label-mapping duplication concretely and safely.
// #474's broader ask -- a shared per-type icon/badge family for the Signal
// Tree (today's tree shows only a Role indicator, i/o/internal, and no
// per-row Type icon at all) and a fully generalized SignalTypeDefinition
// (icon/waveformKind/supportsHighZ/etc.) -- is a larger, still-open design
// surface the issue itself leaves for visual review ("具体的な絵柄は
// visual reviewで決めてよい"); not invented unilaterally here. Value Editor
// policy (the other half of the registry concept) already has its own
// single owner: runtime/value-editor-policy.ts.
export const SIGNAL_TYPE_LABELS: ReadonlyMap<ValueSignal["type"], string> = new Map([
  ["binary", "Signal"],
  ["bus", "Bus"],
  ["state", "State"],
  ["logic", "Level"],
  ["event", "Event"],
]);

export const SIGNAL_TYPE_OPTIONS: readonly { readonly type: ValueSignal["type"]; readonly label: string }[] =
  [...SIGNAL_TYPE_LABELS.entries()].map(([type, label]) => ({ type, label }));

export function signalTypeLabel(type: Signal["type"]): string {
  if (type === "clock") return "Clock";
  if (type === "commentRow") return "Comment";
  if (type === "pulse") return "Pulse";
  return SIGNAL_TYPE_LABELS.get(type) ?? type;
}

/** UI policy derives its waveform domain from the canonical validation owner. */
export function signalTypeDefinition(type: ValueSignal["type"]) {
  const waveform = VALUE_SIGNAL_RENDER_POLICY[type];
  return {
    type,
    label: signalTypeLabel(type),
    icon: type === "binary" ? "signal" as const : type,
    waveformKind: waveform.domain,
    valueEditorKind: waveform.domain === "logic" ? "select" as const : "combo" as const,
    acceptedTokens: waveform.acceptedTokens ?? [],
    legacy: type === "pulse",
  };
}
