/** Reconcile a local editor draft with a newer value from its Canonical owner.
 * Clean drafts follow Canonical automatically; dirty drafts require an
 * explicit user choice before they can replace a newer value. */
export function reconcileExternalDraft<T>(base: T, draft: T, latest: T, editing: boolean, equals: (left: T, right: T) => boolean):
  | { readonly kind: "unchanged" }
  | { readonly kind: "rebase"; readonly value: T }
  | { readonly kind: "conflict" } {
  if (equals(latest, base)) return { kind: "unchanged" };
  if (!editing || equals(draft, base)) return { kind: "rebase", value: latest };
  return { kind: "conflict" };
}

export function pruneExternalSelection<K>(selected: ReadonlySet<K>, valid: ReadonlySet<K>): ReadonlySet<K> {
  if ([...selected].every((key) => valid.has(key))) return selected;
  return new Set([...selected].filter((key) => valid.has(key)));
}
