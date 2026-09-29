function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile literal Find/Replace expressions once for a query, not once per entity. */
export function compileLiteralFindReplace(needle: string): { readonly search: RegExp; readonly replace: RegExp } | undefined {
  if (needle.length === 0) return undefined;
  const escaped = escapeRegExp(needle);
  return { search: new RegExp(escaped, "i"), replace: new RegExp(escaped, "gi") };
}
