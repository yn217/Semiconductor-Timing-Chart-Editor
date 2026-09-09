import { VALUE_SIGNAL_RENDER_POLICY } from "./value-signal-compatibility.js";
import type { Signal, ValueSignal } from "./types.js";

// Shared presentation vocabulary for canonical types. Roles remain separate:
// input/output/internal describe direction; resetSemantics decorates a value
// signal without changing its type. Pulse remains readable but legacy-only.
// The waveform and value-control policies below derive from schema validation.
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
