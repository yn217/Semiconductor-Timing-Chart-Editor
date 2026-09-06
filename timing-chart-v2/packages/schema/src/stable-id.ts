const STABLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

export function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

export function deterministicId(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}

export function allocateMigrationId(prefix: string, preferredIndex: number, usedIds: Set<string>): string {
  let candidate = deterministicId(prefix, preferredIndex);
  let suffix = 1;
  while (usedIds.has(candidate)) candidate = `${deterministicId(prefix, preferredIndex)}_${suffix++}`;
  usedIds.add(candidate);
  return candidate;
}

/**
 * Allocate a deterministic identifier for a derived entity without encoding
 * the source, command, or provenance in the persisted token. The seed stays
 * internal to the allocator; existing persisted identifiers are untouched.
 */
export function opaqueDerivedId(seed: string, used: ReadonlySet<string>): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const base = `id_${(hash >>> 0).toString(36)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  return candidate;
}
