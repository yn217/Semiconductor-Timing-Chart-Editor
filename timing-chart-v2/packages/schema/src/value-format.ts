export type BusValueFormat = "hex" | "binary" | "decimal" | "signed" | "unsigned" | "symbolic";
export interface ParsedBusValue { readonly kind: "numeric" | "unknown" | "symbolic"; readonly value?: bigint; readonly width?: number }
const UNKNOWN = /^[xz?]+$/i;
export function parseBusValue(input: string | number, width?: number): ParsedBusValue {
  if (typeof input === "number") { if (!Number.isSafeInteger(input) || input < 0) throw new Error("Bus numeric values must be non-negative safe integers."); return { kind: "numeric", value: BigInt(input), width: width ?? Math.max(1, input.toString(2).length) }; }
  const source = input.trim().replaceAll("_", "");
  if (!source) throw new Error("Bus value cannot be empty.");
  if (UNKNOWN.test(source)) return { kind: "unknown", width: width ?? source.length };
  const sized = /^(\d+)'([hdb])([0-9a-fxz?]+)$/i.exec(source);
  const prefixed = /^(0x|0b|0d)([0-9a-fxz?]+)$/i.exec(source);
  const base = sized ? ({ h: 16, d: 10, b: 2 }[sized[2]!.toLowerCase() as "h" | "d" | "b"]!) : prefixed ? ({ "0x": 16, "0d": 10, "0b": 2 }[prefixed[1]!.toLowerCase()]!) : /^[0-9]+$/.test(source) ? 10 : /^[01]+$/.test(source) ? 2 : /^[0-9a-f]+$/i.test(source) ? 16 : undefined;
  const digits = sized?.[3] ?? prefixed?.[2] ?? source;
  if (base === undefined) return { kind: "symbolic" };
  if (/[xz?]/i.test(digits)) return { kind: "unknown", width: width ?? (sized ? Number(sized[1]) : base === 16 ? digits.length * 4 : digits.length) };
  const value = BigInt(base === 16 ? `0x${digits}` : base === 2 ? `0b${digits}` : digits);
  const resolvedWidth = width ?? (sized ? Number(sized[1]) : undefined);
  return resolvedWidth === undefined ? { kind: "numeric", value } : { kind: "numeric", value, width: resolvedWidth };
}
export function formatBusValue(input: string | number, format: BusValueFormat = "hex", width?: number): string {
  const parsed = parseBusValue(input, width); if (parsed.kind !== "numeric") return String(input);
  const bits = width ?? parsed.width; let value = parsed.value!;
  if (format === "signed") { const w = bits ?? Math.max(1, value.toString(2).length); if ((value & (1n << BigInt(w - 1))) !== 0n) value -= 1n << BigInt(w); }
  if (format === "binary") return `0b${value.toString(2).padStart(bits ?? 1, "0")}`;
  if (format === "decimal" || format === "signed" || format === "unsigned") return value.toString(10);
  if (format === "symbolic") return String(input);
  return `0x${value.toString(16).toUpperCase().padStart(Math.ceil((bits ?? 1) / 4), "0")}`;
}
