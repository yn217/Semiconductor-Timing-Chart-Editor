export function parseSuppressedPeriods(text: string): readonly number[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  // Empty tokens (a leading/trailing or doubled comma) are separators, not slot 0.
  const values = trimmed.split(/[\s,]+/).filter((item) => item.length > 0).map((item) => Number(item));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("Suppressed periods must be non-negative integer slot numbers.");
  const unique = [...new Set(values)].sort((left, right) => left - right);
  if (unique.length !== values.length) throw new Error("Suppressed periods must not contain duplicates.");
  return unique;
}
