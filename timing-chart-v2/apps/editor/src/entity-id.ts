import { canonicalEntityIds, type CanonicalDocument } from "@timing-chart-v2/schema";

// The sequence is strictly increasing for the page lifetime, so a generated id is never issued twice; no reservation Set is
// retained (#275: a module-global Set of every generated id grew without bound across create/delete/New/Open cycles).
let entitySequence = 0;

export type EntityIdScope = "bookmark" | "time" | "labelAnchor" | "annotation" | "annotationGroup" | "constraint" | "transaction" | "transactionPhase" | "transactionGroup" | "signal" | "signalValueChange" | "group" | "commentRow" | "spacer";

/** Create an operation-scoped allocator so bulk actions scan Canonical IDs once. */
export function createEntityIdAllocator(document: CanonicalDocument): (scope: EntityIdScope) => string {
  const used = new Set(canonicalEntityIds(document));
  return (scope) => {
    let candidate: string;
    do {
      entitySequence += 1;
      candidate = `${scope}_phase9_${entitySequence}`;
    } while (used.has(candidate));
    used.add(candidate);
    return candidate;
  };
}

export function nextEntityId(scope: EntityIdScope, document: CanonicalDocument): string {
  return createEntityIdAllocator(document)(scope);
}
