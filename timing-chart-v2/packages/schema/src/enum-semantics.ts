import type { EnumDefinition } from "./types.js";

export function validateEnumDefinition(definition: EnumDefinition): string | undefined {
  if (!definition.id || !definition.name.trim()) return "Enum id and name are required.";
  const values = new Set<string | number>(); const labels = new Set<string>();
  for (const entry of definition.entries) {
    if (!Number.isSafeInteger(entry.value) && typeof entry.value !== "string") return "Enum values must be safe integers or strings.";
    if (!entry.label.trim() || values.has(entry.value) || labels.has(entry.label)) return "Enum values and labels must be unique and non-empty.";
    values.add(entry.value); labels.add(entry.label);
  }
}

export function resolveEnumValue(definition: EnumDefinition | undefined, value: string | number): string {
  if (!definition) return String(value);
  return definition.entries.find((entry) => String(entry.value).toLowerCase() === String(value).toLowerCase())?.label ?? String(value);
}
