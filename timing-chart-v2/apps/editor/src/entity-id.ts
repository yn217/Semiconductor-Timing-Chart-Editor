import { canonicalEntityIds, type CanonicalDocument } from "@timing-chart-v2/schema";

// The sequence is strictly increasing for the page lifetime, so a generated id is never issued twice; no reservation Set is
// retained (#275: a module-global Set of every generated id grew without bound across create/delete/New/Open cycles).
let entitySequence = 0;

export type EntityIdScope = "bookmark" | "time" | "labelAnchor" | "annotation" | "annotationGroup" | "constraint" | "transaction" | "transactionPhase" | "transactionGroup" | "signal" | "signalValueChange" | "group" | "commentRow" | "spacer";

/**
 * IDs owned by Scenarios outside the active projection. A Scenario-aware session registers its source while it is live; the
 * sequence restarts on every page load, so without this a new entity could reuse an ID another Scenario already owns (DUPLICATE_ID).
 * Non-scenario documents leave it unset and allocate exactly as before.
 */
let reservedEntityIdSource: (() => ReadonlySet<string>) | undefined;

export function setReservedEntityIdSource(source: (() => ReadonlySet<string>) | undefined): void {
  reservedEntityIdSource = source;
}

/** Create an operation-scoped allocator so bulk actions scan Canonical IDs once. */
export function createEntityIdAllocator(document: CanonicalDocument): (scope: EntityIdScope) => string {
  const used = new Set(canonicalEntityIds(document));
  for (const id of reservedEntityIdSource?.() ?? []) used.add(id);
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
