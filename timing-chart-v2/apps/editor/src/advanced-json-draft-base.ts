import type { Annotation, CanonicalDocument, Signal, SignalGroup, Transaction } from "@timing-chart-v2/schema";

export type AdvancedJsonScope = "selected" | "document";
export type AdvancedJsonEntityTarget = Readonly<{
  kind: "signal" | "group" | "annotation" | "transaction";
  id: string;
  value: Signal | SignalGroup | Annotation | Transaction;
}>;
export type AdvancedJsonDraftContext = Readonly<{
  document: CanonicalDocument;
  documentEpoch: number;
  projectionGeneration: number;
  revision: number;
}>;
export type AdvancedJsonDraftBase = AdvancedJsonDraftContext & Readonly<{ scope: AdvancedJsonScope; selectedTarget?: Omit<AdvancedJsonEntityTarget, "value">; selectedFingerprint?: string }>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function captureAdvancedJsonDraftBase(scope: AdvancedJsonScope, context: AdvancedJsonDraftContext, selected: AdvancedJsonEntityTarget | undefined): AdvancedJsonDraftBase {
  return {
    ...context,
    scope,
    ...(scope === "selected" && selected !== undefined ? {
      selectedTarget: { kind: selected.kind, id: selected.id },
      selectedFingerprint: stableJson(selected.value),
    } : {}),
  };
}

export function resolveAdvancedJsonEntityTarget(document: CanonicalDocument, target: Omit<AdvancedJsonEntityTarget, "value"> | undefined): AdvancedJsonEntityTarget | undefined {
  if (!target) return undefined;
  const value = target.kind === "signal" ? document.signals.find((item) => item.id === target.id)
    : target.kind === "group" ? document.signalGroups.find((item) => item.id === target.id)
      : target.kind === "annotation" ? document.annotations.find((item) => item.id === target.id)
        : document.transactions.find((item) => item.id === target.id);
  return value === undefined ? undefined : { ...target, value };
}

/** Returns a user-facing reason when applying this draft would overwrite newer state. */
export function advancedJsonDraftStaleReason(base: AdvancedJsonDraftBase, current: AdvancedJsonDraftContext): string | undefined {
  if (base.documentEpoch !== current.documentEpoch) return "The document was replaced while this JSON draft was open.";
  if (base.projectionGeneration !== current.projectionGeneration) return "The active Scenario changed while this JSON draft was open.";
  if (base.scope === "document") {
    if (base.revision !== current.revision || base.document !== current.document) return "The document changed while this JSON draft was open.";
    return undefined;
  }
  const selected = resolveAdvancedJsonEntityTarget(current.document, base.selectedTarget);
  if (selected === undefined) return "The selected object no longer exists in this document.";
  if (base.selectedFingerprint !== stableJson(selected.value)) return "The selected object was edited while this JSON draft was open.";
  return undefined;
}
