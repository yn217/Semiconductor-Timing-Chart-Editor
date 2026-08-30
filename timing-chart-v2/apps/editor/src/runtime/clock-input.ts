export function parseSuppressedPeriods(text: string): readonly number[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const values = trimmed.split(/[\s,]+/).map((item) => Number(item));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("Suppressed periods must be non-negative integer slot numbers.");
  const unique = [...new Set(values)].sort((left, right) => left - right);
  if (unique.length !== values.length) throw new Error("Suppressed periods must not contain duplicates.");
  return unique;
}
