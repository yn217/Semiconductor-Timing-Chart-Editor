import type { SignalValueChange, ValueSignal } from "./types.js";

export type ValueSignalType = ValueSignal["type"];
export type ValueSignalWaveDomain = "logic" | "data";
export type ValueSignalCompatibilityKind = "logic-token" | "enumerated-data" | "freeform-data";

/**
 * The supported production profile shared by schema validation, commands,
 * factories, editors, and the WaveDrom adapter.
 *
 * Binary intentionally excludes weak drive tokens. Logic retains the full
 * WaveDrom state-token set. Event is a data-domain marker so legacy values
 * such as none/rise/fall remain renderable. Pulse is a logic-domain signal;
 * its width is carried by the transition sequence.
 */
export const VALUE_SIGNAL_RENDER_POLICY: Readonly<Record<ValueSignalType, Readonly<{
  readonly domain: ValueSignalWaveDomain;
  readonly kind: ValueSignalCompatibilityKind;
  readonly acceptedTokens?: readonly string[];
  readonly semantics: string;
}>>> = {
  binary: { domain: "logic", kind: "logic-token", acceptedTokens: ["0", "1", "x", "z"], semantics: "Two-level signal with unknown/high-impedance states." },
  logic: { domain: "logic", kind: "logic-token", acceptedTokens: ["0", "1", "x", "z", "d", "u"], semantics: "Four-state plus weak-drive logic level." },
  event: { domain: "data", kind: "enumerated-data", acceptedTokens: ["none", "rise", "fall"], semantics: "Event marker with an explicit supported value set." },
  pulse: { domain: "logic", kind: "logic-token", acceptedTokens: ["0", "1", "x", "z", "d", "u"], semantics: "Logic-domain pulse; pulse width is represented by transitions." },
  bus: { domain: "data", kind: "freeform-data", semantics: "Data-bearing bus value rendered through WaveDrom data entries." },
  state: { domain: "data", kind: "freeform-data", semantics: "Symbolic or numeric state value rendered through WaveDrom data entries." },
};

const TOKEN_ALIASES: Readonly<Record<string, string>> = {
  low: "0",
  l: "0",
  high: "1",
  h: "1",
  false: "0",
  true: "1",
  undefined: "x",
  "high-impedance": "z",
  "weak-low": "d",
  "weak-high": "u",
};

export function valueSignalWaveDomain(type: ValueSignalType): ValueSignalWaveDomain {
  return VALUE_SIGNAL_RENDER_POLICY[type].domain;
}

function normalizedValueToken(value: string | number): string {
  const normalized = String(value).trim().toLowerCase();
  return TOKEN_ALIASES[normalized] ?? normalized;
}

export function valueSignalAcceptedToken(type: ValueSignalType, value: string | number): string | undefined {
  const token = normalizedValueToken(value);
  return VALUE_SIGNAL_RENDER_POLICY[type].acceptedTokens?.includes(token) ? token : undefined;
}

export function waveDromLogicToken(type: ValueSignalType, value: string | number): string | undefined {
  if (VALUE_SIGNAL_RENDER_POLICY[type].kind !== "logic-token") return undefined;
  return valueSignalAcceptedToken(type, value);
}

export function valueSignalValueProblem(type: ValueSignalType, value: string | number): string | undefined {
  const policy = VALUE_SIGNAL_RENDER_POLICY[type];
  if (policy.kind === "freeform-data") {
    return String(value).trim().length === 0 ? "Data-domain values must not be empty." : undefined;
  }
  if (valueSignalAcceptedToken(type, value) !== undefined) return undefined;
  return policy.kind === "enumerated-data"
    ? `Value '${String(value)}' is not supported for ${type}; supported values are ${policy.acceptedTokens?.join(", ")}.`
    : `Value '${String(value)}' is not supported for ${type} WaveDrom logic semantics.`;
}

export function valuesCompatibleForType(type: ValueSignalType, values: readonly SignalValueChange[]): string | undefined {
  for (const change of values) {
    const issue = valueSignalValueProblem(type, change.value);
    if (issue) return issue;
  }
  return undefined;
}

export function quickValueOptions(type: ValueSignalType): readonly string[] {
  if (type === "bus") return ["Hex", "Binary", "Symbol", "X", "Z"];
  if (type === "state") return ["IDLE", "ACTIVE", "X", "Z"];
  if (type === "event") return ["NONE", "RISE", "FALL"];
  if (type === "logic") return ["0", "1", "D", "U", "X", "Z"];
  return ["0", "1", "X", "Z"];
}

export function quickValueLiteral(type: ValueSignalType, option: string): string {
  if (type !== "bus") return option;
  return option === "Hex" ? "00" : option === "Binary" ? "00000000" : option === "Symbol" ? "VALUE" : option;
}
