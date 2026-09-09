import { canonicalEntityIds, type CanonicalDocument } from "@timing-chart-v2/schema";

let entitySequence = 0;

export function nextEntityId(scope: "bookmark" | "time" | "labelAnchor" | "annotation" | "annotationGroup" | "transaction" | "transactionGroup" | "signal" | "group" | "commentRow" | "spacer", document: CanonicalDocument): string {
  const used = new Set(canonicalEntityIds(document));
  let candidate: string;
  do {
    entitySequence += 1;
    candidate = `${scope}_phase9_${entitySequence}`;
  } while (used.has(candidate));
  return candidate;
}
