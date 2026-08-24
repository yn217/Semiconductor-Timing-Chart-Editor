const STABLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

export function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

export function deterministicId(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}
