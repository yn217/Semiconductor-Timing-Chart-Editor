export type BusValueFormat = "hex" | "binary" | "decimal" | "signed" | "unsigned" | "symbolic";
export interface ParsedBusValue { readonly kind: "numeric" | "unknown" | "symbolic"; readonly value?: bigint; readonly width?: number }
const UNKNOWN = /^[xz?]+$/i;
// Literal radix is semantic input, independent of displayFormat: bare
// digit-only strings are decimal; A-F-bearing strings are hex; binary/hex
// strings can be explicit with 0b/0x or sized HDL syntax. Sized numeric values
// are truncated to N bits before downstream formatting/validation. displayFormat
// only controls output formatting. Keep validation and rendering on this policy.
export function parseBusValue(input: string | number, width?: number): ParsedBusValue {
  if (typeof input === "number") { if (!Number.isSafeInteger(input) || input < 0) throw new Error("Bus numeric values must be non-negative safe integers."); return { kind: "numeric", value: BigInt(input), width: width ?? Math.max(1, input.toString(2).length) }; }
  const source = input.trim().replaceAll("_", "");
  if (!source) throw new Error("Bus value cannot be empty.");
  if (UNKNOWN.test(source)) return { kind: "unknown", width: width ?? source.length };
  const sized = /^(\d+)'([hdb])([0-9a-fxz?]+)$/i.exec(source);
  const prefixed = /^(0x|0b|0d)([0-9a-fxz?]+)$/i.exec(source);
  const base = sized ? ({ h: 16, d: 10, b: 2 }[sized[2]!.toLowerCase() as "h" | "d" | "b"]!) : prefixed ? ({ "0x": 16, "0d": 10, "0b": 2 }[prefixed[1]!.toLowerCase()]!) : /^[0-9]+$/.test(source) ? 10 : /^[01]+$/.test(source) ? 2 : /^[0-9a-f]+$/i.test(source) ? 16 : undefined;
  const digits = sized?.[3] ?? prefixed?.[2] ?? source;
  if (base === undefined) {
    if (/^\d+'/.test(source)) throw new Error("Invalid sized bus literal.");
    return { kind: "symbolic" };
  }
  const sizedWidth = sized ? Number(sized[1]) : undefined;
  if (sizedWidth !== undefined && (!Number.isSafeInteger(sizedWidth) || sizedWidth <= 0)) throw new Error("Sized bus literal width must be a positive safe integer.");
  // #456: validate the radix alphabet BEFORE classifying an X/Z/? literal, so unknown digits cannot hide an invalid digit.
  if ((sized || prefixed) && !({ 2: /^[01xz?]+$/i, 10: /^[0-9xz?]+$/i, 16: /^[0-9a-fxz?]+$/i }[base] as RegExp).test(digits)) throw new Error("Invalid digit for the bus literal radix.");
  if (/[xz?]/i.test(digits)) return { kind: "unknown", width: width ?? (sizedWidth ?? (base === 16 ? digits.length * 4 : digits.length)) };
  let value = BigInt(base === 16 ? `0x${digits}` : base === 2 ? `0b${digits}` : digits);
  if (sizedWidth !== undefined && value !== 0n && value.toString(2).length > sizedWidth) {
    value &= (1n << BigInt(sizedWidth)) - 1n;
  }
  const resolvedWidth = width ?? sizedWidth;
  return resolvedWidth === undefined ? { kind: "numeric", value } : { kind: "numeric", value, width: resolvedWidth };
}
export function formatBusValue(input: string | number, format: BusValueFormat = "hex", width?: number): string {
  const parsed = parseBusValue(input, width); if (parsed.kind !== "numeric") return String(input);
  const bits = width ?? parsed.width; let value = parsed.value!;
  // Two's complement needs a declared width (argument or sized literal); a
  // value's own bit length is not a width, so without one it stays non-negative.
  const signedWidth = width ?? (typeof input === "number" ? undefined : parsed.width);
  if (format === "signed" && signedWidth !== undefined && (value & (1n << BigInt(signedWidth - 1))) !== 0n) value -= 1n << BigInt(signedWidth);
  if (format === "binary") return `0b${value.toString(2).padStart(bits ?? 1, "0")}`;
  if (format === "decimal" || format === "signed" || format === "unsigned") return value.toString(10);
  if (format === "symbolic") return String(input);
  return `0x${value.toString(16).toUpperCase().padStart(Math.ceil((bits ?? 1) / 4), "0")}`;
}
