import { quickValueOptions, valueSignalWaveDomain, VALUE_SIGNAL_RENDER_POLICY, type ValueSignal } from "@timing-chart-v2/schema";

// Value Editor Policy (VALUE type-awareness pass): the ONE place that
// resolves "given this Signal's type, what should the VALUE control look
// like, and what values are already known-good for it" -- Add/Edit
// Transition (event-table.tsx), a Transition row's own inline editor
// (event-table-components.tsx), and anywhere else a Signal's `values`
// entries are edited all read this same policy rather than each inventing
// its own control/candidate list. Canonical *validation* is unchanged and
// still lives in `@timing-chart-v2/schema` (`valueSignalValueProblem` /
// `valuesCompatibleForType`, called by the command planner) -- this module
// only decides which *UI control* to render for a given type; it never
// substitutes for that validation and never itself becomes a second
// validation owner.
export interface ValueEditorOption {
  readonly value: string;
  readonly label: string;
}

export type ValueEditorPolicy =
  // A truly closed value domain (binary/logic/pulse): every value the
  // canonical schema will ever accept for this type is enumerable, so a
  // real <select> is both sufficient and correct -- there is no "other"
  // value a user could legitimately need that isn't already an option.
  | { readonly kind: "select"; readonly options: readonly ValueEditorOption[] }
  // An open value domain (state/event/bus) that nonetheless has known,
  // commonly-reused values worth offering as one-click choices -- a combo
  // (a plain, still-`fill()`-able text input paired with a <datalist>)
  // that always preserves whatever value is already there, even if it
  // isn't one of the suggested options.
  | { readonly kind: "combo"; readonly options: readonly ValueEditorOption[]; readonly placeholder?: string };

const LOGIC_LABELS: Readonly<Record<string, string>> = { d: "D (weak-low)", u: "U (weak-high)" };

// The *authoritative* closed domain for a logic-domain type -- read
// directly from `VALUE_SIGNAL_RENDER_POLICY.acceptedTokens` (the same
// table `valueSignalValueProblem` validates against), not from
// `quickValueOptions` -- that helper is Value Helper's curated shortcut
// subset (Binary and Pulse both fall back to its narrower default 0/1/X/Z
// list, never distinguishing Pulse's actually-wider accepted domain), and
// reusing it here would silently give Pulse an unconditional copy of
// Binary's dropdown -- exactly what a per-type policy must not do.
function logicDomainOptions(type: ValueSignal["type"]): readonly ValueEditorOption[] {
  const tokens = VALUE_SIGNAL_RENDER_POLICY[type].acceptedTokens ?? [];
  return tokens.map((token) => ({ value: token.toUpperCase(), label: LOGIC_LABELS[token] ?? token.toUpperCase() }));
}

// Suggested (non-authoritative) candidates for an open, data-domain type --
// this reuses Value Helper's own `quickValueOptions` list, since these are
// exactly the same one-click shortcuts, not a second invented set.
function suggestedOptions(type: ValueSignal["type"]): readonly ValueEditorOption[] {
  return quickValueOptions(type).map((token) => ({ value: token, label: token }));
}

// State candidates come from the Signal's *own* existing values (there is
// no separate document/schema-level "state list" field) -- each distinct
// value already used on this Signal is a known-good candidate, shown by
// its `displayLabel` when the Signal chose to set one (canonical value
// stays authoritative; the label is presentation only, per
// `SignalValueChange.displayLabel`).
function stateOptions(signal: ValueSignal): readonly ValueEditorOption[] {
  const seen = new Map<string, ValueEditorOption>();
  for (const change of signal.values) {
    const value = String(change.value);
    if (!seen.has(value)) seen.set(value, { value, label: change.displayLabel ?? value });
  }
  // Common defaults stay offered even on a brand-new State Signal with no
  // existing values yet to learn candidates from.
  for (const option of suggestedOptions("state")) if (!seen.has(option.value)) seen.set(option.value, option);
  return [...seen.values()];
}

export function resolveValueEditorPolicy(signal: ValueSignal): ValueEditorPolicy {
  if (valueSignalWaveDomain(signal.type) === "logic") {
    // Binary, Logic, and (legacy-only) Pulse are exactly this: a closed
    // set of WaveDrom logic tokens defined by `VALUE_SIGNAL_RENDER_POLICY`
    // -- Pulse's own accepted-token set (matching Logic's, wider than
    // Binary's) is used as-is, so a Pulse Signal genuinely gets its own
    // type's domain rather than an unconditional Binary-dropdown reuse.
    return { kind: "select", options: logicDomainOptions(signal.type) };
  }
  if (signal.type === "state") return { kind: "combo", options: stateOptions(signal) };
  if (signal.type === "event") return { kind: "combo", options: suggestedOptions("event") };
  // Bus: genuinely arbitrary data (hex/binary/symbolic per its own
  // `displayFormat`) -- X/Z stay offered as one-click special values (note:
  // *not* `quickValueOptions("bus")` here -- that list is Value Helper's
  // format-picker labels "Hex"/"Binary"/"Symbol", meaningful only via
  // `quickValueLiteral`'s translation, not literal candidate values a
  // datalist should offer as-is).
  return { kind: "combo", options: [{ value: "X", label: "X (High-Z unknown)" }, { value: "Z", label: "Z (High-Z)" }], placeholder: signal.displayFormat === "binary" ? "e.g. 00000000" : signal.displayFormat === "symbolic" ? "e.g. VALUE" : "e.g. 00" };
}
