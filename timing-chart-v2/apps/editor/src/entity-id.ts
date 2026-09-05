import type { CanonicalDocument } from "@timing-chart-v2/schema";

let entitySequence = 0;

export function nextEntityId(scope: "bookmark" | "time" | "labelAnchor" | "annotation" | "annotationGroup" | "transaction" | "signal" | "group" | "commentRow" | "spacer", document: CanonicalDocument): string {
  const used = new Set<string>([
    ...document.signals.map((item) => item.id),
    ...document.signalGroups.map((item) => item.id),
    ...document.signalGroups.flatMap((item) => item.spacers?.map((spacer) => spacer.id) ?? []),
    ...document.annotations.map((item) => item.id),
    ...(document.annotationGroups ?? []).map((item) => item.id),
    ...document.transactions.map((item) => item.id),
    ...document.bookmarks.map((item) => item.id),
    ...document.timeGroups.map((item) => item.id),
    ...document.timeline.labelAnchors.map((item) => item.id),
    ...document.constraints.map((item) => item.id),
  ]);
  let candidate: string;
  do {
    entitySequence += 1;
    candidate = `${scope}_phase9_${entitySequence}`;
  } while (used.has(candidate));
  return candidate;
}
