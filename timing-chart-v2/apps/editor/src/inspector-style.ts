export function styleString(style: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  return typeof style[key] === "string" ? style[key] as string : fallback;
}

export function styleNumber(style: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  return typeof style[key] === "number" ? style[key] as number : fallback;
}
