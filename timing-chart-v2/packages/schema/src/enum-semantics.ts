import type { EnumDefinition } from "./types.js";

export function enumValueIdentity(value: string | number): string { return String(value).toLowerCase(); }
export function enumLabelIdentity(label: string): string { return label.trim().toLowerCase(); }

export function validateEnumDefinition(definition: EnumDefinition): string | undefined {
  if (!definition.id || !definition.name.trim()) return "Enum id and name are required.";
  const values = new Set<string>(); const labels = new Set<string>();
  for (const entry of definition.entries) {
    if ((typeof entry.value !== "number" && typeof entry.value !== "string") || (typeof entry.value === "number" && !Number.isSafeInteger(entry.value))) return "Enum values must be safe integers or strings.";
    if (!entry.label.trim() || values.has(enumValueIdentity(entry.value)) || labels.has(enumLabelIdentity(entry.label))) return "Enum values and labels must be unique and non-empty.";
    values.add(enumValueIdentity(entry.value)); labels.add(enumLabelIdentity(entry.label));
  }
}

export function resolveEnumValue(definition: EnumDefinition | undefined, value: string | number): string {
  if (!definition) return String(value);
  return definition.entries.find((entry) => enumValueIdentity(entry.value) === enumValueIdentity(value))?.label ?? String(value);
}
