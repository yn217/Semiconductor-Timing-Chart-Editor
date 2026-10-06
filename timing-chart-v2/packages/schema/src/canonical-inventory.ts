import type { CanonicalDocument } from "./types.js";

export type CanonicalEntityKind = "document" | "signal" | "signalGroup" | "spacer" | "annotation" | "annotationGroup" | "transaction" | "transactionPhase" | "transactionGroup" | "enumDefinition" | "bookmark" | "timeGroup" | "labelAnchor" | "constraint";
export interface CanonicalEntityEntry { readonly id: string; readonly kind: CanonicalEntityKind; readonly path: string; }

/** Single source of truth for every stable-ID canonical entity. */
export function canonicalEntityInventory(document: CanonicalDocument): readonly CanonicalEntityEntry[] {
  const entries: CanonicalEntityEntry[] = [{ id: document.document.id, kind: "document", path: "$.document.id" }];
  document.signals.forEach((item, index) => entries.push({ id: item.id, kind: "signal", path: `$.signals[${index}].id` }));
  document.signalGroups.forEach((group, index) => {
    entries.push({ id: group.id, kind: "signalGroup", path: `$.signalGroups[${index}].id` });
    group.spacers?.forEach((item, itemIndex) => entries.push({ id: item.id, kind: "spacer", path: `$.signalGroups[${index}].spacers[${itemIndex}].id` }));
  });
  document.annotations.forEach((item, index) => entries.push({ id: item.id, kind: "annotation", path: `$.annotations[${index}].id` }));
  document.annotationGroups?.forEach((item, index) => entries.push({ id: item.id, kind: "annotationGroup", path: `$.annotationGroups[${index}].id` }));
  document.transactions.forEach((item, index) => {
    entries.push({ id: item.id, kind: "transaction", path: `$.transactions[${index}].id` });
    item.phases?.forEach((phase, phaseIndex) => entries.push({ id: phase.id, kind: "transactionPhase", path: `$.transactions[${index}].phases[${phaseIndex}].id` }));
  });
  document.transactionGroups?.forEach((item, index) => entries.push({ id: item.id, kind: "transactionGroup", path: `$.transactionGroups[${index}].id` }));
  document.enumDefinitions?.forEach((item, index) => entries.push({ id: item.id, kind: "enumDefinition", path: `$.enumDefinitions[${index}].id` }));
  document.bookmarks.forEach((item, index) => entries.push({ id: item.id, kind: "bookmark", path: `$.bookmarks[${index}].id` }));
  document.timeGroups.forEach((item, index) => entries.push({ id: item.id, kind: "timeGroup", path: `$.timeGroups[${index}].id` }));
  document.timeline.labelAnchors.forEach((item, index) => entries.push({ id: item.id, kind: "labelAnchor", path: `$.timeline.labelAnchors[${index}].id` }));
  document.constraints.forEach((item, index) => entries.push({ id: item.id, kind: "constraint", path: `$.constraints[${index}].id` }));
  return entries;
}

export function canonicalEntityIds(document: CanonicalDocument): ReadonlySet<string> { return new Set(canonicalEntityInventory(document).map((entry) => entry.id)); }
