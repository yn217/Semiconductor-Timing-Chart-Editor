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

/** Reconcile field-oriented editors without discarding unrelated local drafts. */
export function reconcileExternalDraftFields<T extends Record<string, unknown>>(
  base: T,
  draft: T,
  latest: T,
  equals: (left: unknown, right: unknown) => boolean = Object.is,
): { readonly value: T; readonly base: T; readonly conflicts: readonly (keyof T)[] } {
  const value: Record<string, unknown> = { ...draft };
  const nextBase: Record<string, unknown> = { ...base };
  const conflicts: (keyof T)[] = [];
  for (const rawKey of Object.keys(latest)) {
    const key = rawKey as keyof T;
    if (equals(latest[key], base[key])) continue;
    if (equals(draft[key], base[key]) || equals(draft[key], latest[key])) {
      value[rawKey] = latest[key];
      nextBase[rawKey] = latest[key];
    } else {
      conflicts.push(key);
    }
  }
  return { value: value as T, base: nextBase as T, conflicts };
}

export function pruneExternalSelection<K>(selected: ReadonlySet<K>, valid: ReadonlySet<K>): ReadonlySet<K> {
  if ([...selected].every((key) => valid.has(key))) return selected;
  return new Set([...selected].filter((key) => valid.has(key)));
}
