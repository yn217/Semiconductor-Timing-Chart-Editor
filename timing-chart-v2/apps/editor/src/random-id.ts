let fallbackSequence = 0;

/** A unique id string. `crypto.randomUUID` only exists in secure contexts (https / localhost), so a plain-http deployment must not depend on it. */
export function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  fallbackSequence += 1;
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint32Array(2));
  const random = bytes ? `${bytes[0]!.toString(36)}${bytes[1]!.toString(36)}` : Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}-${fallbackSequence}`;
}
