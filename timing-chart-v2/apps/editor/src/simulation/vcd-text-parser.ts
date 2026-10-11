import { DOCUMENT_RESOURCE_BUDGET } from "@timing-chart-v2/schema";
import type { VcdTimescale } from "@timing-chart-v2/projection";
import { VCD_RESOURCE_BUDGET } from "./vcd-resource-budget.js";

export type VcdVariable = Readonly<{
  code: string;
  kind: string;
  width: number;
  reference: string;
  scope: readonly string[];
  hierarchicalName: string;
}>;

export type VcdValueChange = Readonly<{
  timestamp: bigint;
  code: string;
  kind: "scalar" | "vector";
  value: string;
}>;

export type ParsedVcdText = Readonly<{
  timescale: VcdTimescale;
  variables: readonly VcdVariable[];
  changes: readonly VcdValueChange[];
}>;

export type VcdParseErrorCode = "malformed" | "unsupported" | "resource-limit" | "aborted";
export type VcdParseError = Readonly<{ code: VcdParseErrorCode; message: string; token?: string }>;
export type VcdParseResult = Readonly<{ ok: true; value: ParsedVcdText }> | Readonly<{ ok: false; error: VcdParseError }>;

export type VcdTextParserOptions = Readonly<{
  signal?: AbortSignal;
  maxInputBytes?: number;
  maxChanges?: number;
  maxVariables?: number;
  maxExpandedValueBits?: number;
}>;

const DEFAULT_MAX_INPUT_BYTES = DOCUMENT_RESOURCE_BUDGET.openFileBytes;
const DEFAULT_MAX_VARIABLES = DOCUMENT_RESOURCE_BUDGET.signalCount;
const DEFAULT_MAX_CHANGES = DOCUMENT_RESOURCE_BUDGET.valueChangeCount;
const DEFAULT_MAX_EXPANDED_VALUE_BITS = VCD_RESOURCE_BUDGET.expandedValueBits;
const TIME_UNITS = new Set<VcdTimescale["unit"]>(["s", "ms", "us", "ns", "ps", "fs"]);

class ParseFailure extends Error {
  constructor(readonly code: VcdParseErrorCode, message: string, readonly token?: string) {
    super(message);
  }
}

function fail(code: VcdParseErrorCode, message: string, token?: string): never {
  throw new ParseFailure(code, message, token);
}

function positiveLimit(value: number | undefined, ceiling: number, name: string): number {
  if (value === undefined) return ceiling;
  if (!Number.isSafeInteger(value) || value < 1) fail("malformed", `${name} must be a positive safe integer.`);
  return Math.min(value, ceiling);
}

async function* whitespaceTokens(chunks: AsyncIterable<string>, signal: AbortSignal | undefined, maxBytes: number): AsyncGenerator<string> {
  const encoder = new TextEncoder();
  let bytes = 0;
  let token = "";
  let pendingHighSurrogate = "";
  for await (const chunk of chunks) {
    if (signal?.aborted) fail("aborted", "VCD parsing was aborted.");
    if (typeof chunk !== "string") fail("malformed", "VCD input chunks must be strings.");
    const byteCountText = pendingHighSurrogate + chunk;
    pendingHighSurrogate = "";
    const lastCodeUnit = byteCountText.charCodeAt(byteCountText.length - 1);
    const countableText = lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff
      ? (pendingHighSurrogate = byteCountText.slice(-1), byteCountText.slice(0, -1))
      : byteCountText;
    bytes += encoder.encode(countableText).byteLength;
    if (bytes > maxBytes) fail("resource-limit", `VCD input exceeds the ${maxBytes}-byte limit.`);
    for (const character of chunk) {
      if (/\s/.test(character)) {
        if (token) yield token;
        token = "";
      } else {
        token += character;
      }
    }
  }
  bytes += encoder.encode(pendingHighSurrogate).byteLength;
  if (bytes > maxBytes) fail("resource-limit", `VCD input exceeds the ${maxBytes}-byte limit.`);
  if (signal?.aborted) fail("aborted", "VCD parsing was aborted.");
  if (token) yield token;
}

function parseTimescale(parts: readonly string[], token?: string): VcdTimescale {
  const compact = parts.join("");
  const match = /^(1|10|100)(s|ms|us|ns|ps|fs)$/i.exec(compact);
  if (!match) fail("unsupported", "VCD timescale must use magnitude 1, 10, or 100 and unit s/ms/us/ns/ps/fs.", token ?? compact);
  const unit = match[2]!.toLowerCase() as VcdTimescale["unit"];
  if (!TIME_UNITS.has(unit)) fail("unsupported", "VCD timescale unit is unsupported.", token ?? compact);
  return { magnitude: BigInt(match[1]!), unit };
}

/** Parse VCD text incrementally. The returned arrays are bounded by the document resource budget. */
export async function parseVcdText(
  chunks: AsyncIterable<string>,
  options: VcdTextParserOptions = {},
): Promise<VcdParseResult> {
  try {
    const maxBytes = positiveLimit(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES, "maxInputBytes");
    const maxVariables = positiveLimit(options.maxVariables, DEFAULT_MAX_VARIABLES, "maxVariables");
    const maxChanges = positiveLimit(options.maxChanges, DEFAULT_MAX_CHANGES, "maxChanges");
    const maxExpandedValueBits = positiveLimit(options.maxExpandedValueBits, DEFAULT_MAX_EXPANDED_VALUE_BITS, "maxExpandedValueBits");
    const iterator = whitespaceTokens(chunks, options.signal, maxBytes)[Symbol.asyncIterator]();
    const readNext = async (): Promise<IteratorResult<string>> => {
      if (!options.signal) return iterator.next();
      if (options.signal.aborted) fail("aborted", "VCD parsing was aborted.");
      return new Promise((resolve, reject) => {
        const onAbort = (): void => {
          options.signal?.removeEventListener("abort", onAbort);
          reject(new ParseFailure("aborted", "VCD parsing was aborted."));
        };
        options.signal!.addEventListener("abort", onAbort, { once: true });
        void iterator.next().then(
          (result) => {
            options.signal?.removeEventListener("abort", onAbort);
            resolve(result);
          },
          (error: unknown) => {
            options.signal?.removeEventListener("abort", onAbort);
            reject(error);
          },
        );
      });
    };
    const next = async (): Promise<string> => {
      if (options.signal?.aborted) fail("aborted", "VCD parsing was aborted.");
      const result = await readNext();
      if (result.done) fail("malformed", "Unexpected end of VCD input.");
      return result.value;
    };
    const expectEnd = async (): Promise<void> => {
      const token = await next();
      if (token !== "$end") fail("malformed", "Expected $end.", token);
    };
    const skipDirectiveBody = async (): Promise<void> => {
      for (;;) if (await next() === "$end") return;
    };

    const scopes: string[] = [];
    const variables: VcdVariable[] = [];
    const variableByCode = new Map<string, VcdVariable[]>();
    let timescale: VcdTimescale | undefined;
    let inDefinitions = true;
    let timestamp: bigint | undefined;
    const changes: VcdValueChange[] = [];
    let expandedValueBits = 0n;

    const addChange = (first: string, currentTimestamp: bigint, separatedCode?: string): void => {
      let kind: VcdValueChange["kind"];
      let value: string;
      let code: string;
      const scalarCompact = /^([01xXzZ])(.+)$/.exec(first);
      if (scalarCompact) {
        kind = "scalar";
        value = scalarCompact[1]!.toLowerCase();
        code = scalarCompact[2]!;
      } else if (/^[01xXzZ]$/.test(first)) {
        kind = "scalar";
        value = first.toLowerCase();
        code = "";
      } else if (/^[bB][01xXzZ]+$/i.test(first)) {
        kind = "vector";
        value = first.slice(1).toLowerCase();
        code = separatedCode ?? "";
      } else {
        fail("unsupported", "Only VCD scalar and binary vector value changes are supported.", first);
      }
      if (!code) {
        fail("malformed", "A value change is missing its identifier code.", first);
      }
      if (code === "" || !variableByCode.has(code)) fail("malformed", "Value change references an unknown identifier code.", code || first);
      if (kind === "scalar" && variableByCode.get(code)!.every((variable) => variable.width !== 1)) {
        fail("malformed", "Scalar value change targets a non-scalar variable.", code);
      }
      if (kind === "vector" && variableByCode.get(code)!.every((variable) => value.length > variable.width)) {
        fail("malformed", "Vector value change exceeds the declared variable width.", code);
      }
      const expandedWidth = variableByCode.get(code)!.reduce((total, variable) => total + BigInt(variable.width), 0n);
      if (expandedValueBits + expandedWidth > BigInt(maxExpandedValueBits)) fail("resource-limit", `Expanded VCD values exceed the ${maxExpandedValueBits}-bit limit.`, code);
      if (changes.length >= maxChanges) fail("resource-limit", `VCD changes exceed the ${maxChanges}-change limit.`);
      changes.push({ timestamp: currentTimestamp, code, kind, value });
      expandedValueBits += expandedWidth;
    };

    while (inDefinitions) {
      const directive = await next();
      if (!directive.startsWith("$")) fail("malformed", "Expected a VCD header directive.", directive);
      switch (directive.toLowerCase()) {
        case "$scope": {
          const scopeType = await next();
          if (!["module", "task", "function", "begin", "fork"].includes(scopeType.toLowerCase())) {
            fail("unsupported", "Unsupported VCD scope type.", scopeType);
          }
          if (scopes.length >= VCD_RESOURCE_BUDGET.scopeDepth) fail("resource-limit", `VCD scope depth exceeds the ${VCD_RESOURCE_BUDGET.scopeDepth}-level limit.`);
          scopes.push(await next());
          await expectEnd();
          break;
        }
        case "$upscope":
          await expectEnd();
          if (scopes.length === 0) fail("malformed", "$upscope has no matching $scope.");
          scopes.pop();
          break;
        case "$var": {
          const kind = await next();
          const widthToken = await next();
          if (!/^\d+$/.test(widthToken)) fail("malformed", "VCD variable width must be a positive integer.", widthToken);
          const width = Number(widthToken);
          if (!Number.isSafeInteger(width) || width < 1) fail("malformed", "VCD variable width must be a positive safe integer.", widthToken);
          if (width > VCD_RESOURCE_BUDGET.variableWidthBits) fail("resource-limit", `VCD variable width exceeds the ${VCD_RESOURCE_BUDGET.variableWidthBits}-bit limit.`, widthToken);
          const code = await next();
          const reference = await next();
          const trailing: string[] = [];
          for (;;) {
            const token = await next();
            if (token === "$end") break;
            trailing.push(token);
            if (trailing.length > 1) fail("unsupported", "Unsupported extra fields in VCD $var declaration.", token);
          }
          const hierarchicalName = [...scopes, reference].join(".");
          const variable: VcdVariable = { code, kind, width, reference, scope: [...scopes], hierarchicalName };
          if (variables.length >= maxVariables) fail("resource-limit", `VCD variables exceed the ${maxVariables}-variable limit.`);
          variables.push(variable);
          const aliases = variableByCode.get(code) ?? [];
          aliases.push(variable);
          variableByCode.set(code, aliases);
          break;
        }
        case "$timescale": {
          if (timescale) fail("malformed", "VCD header contains more than one $timescale.");
          const first = await next();
          let parts = [first];
          let endOrUnit = await next();
          if (endOrUnit !== "$end") {
            parts.push(endOrUnit);
            endOrUnit = await next();
          }
          if (endOrUnit !== "$end") fail("malformed", "Malformed VCD $timescale declaration.", endOrUnit);
          timescale = parseTimescale(parts, first);
          break;
        }
        case "$enddefinitions":
          await expectEnd();
          inDefinitions = false;
          break;
        case "$comment":
        case "$date":
        case "$version":
          await skipDirectiveBody();
          break;
        default:
          fail("unsupported", "Unsupported VCD header directive.", directive);
      }
    }

    if (!timescale) fail("malformed", "VCD input is missing $timescale.");
    if (scopes.length !== 0) fail("malformed", "VCD scopes are not balanced before $enddefinitions.");

    let tokenResult = await readNext();
    while (!tokenResult.done) {
      if (options.signal?.aborted) fail("aborted", "VCD parsing was aborted.");
      const token = tokenResult.value;
      if (token.startsWith("#")) {
        if (!/^#\d+$/.test(token)) fail("malformed", "VCD timestamp must be a non-negative integer.", token);
        const nextTimestamp = BigInt(token.slice(1));
        if (timestamp !== undefined && nextTimestamp < timestamp) fail("malformed", "VCD timestamps must be non-decreasing.", token);
        timestamp = nextTimestamp;
      } else if (token.toLowerCase() === "$dumpvars" || token.toLowerCase() === "$dumpall" || token.toLowerCase() === "$dumpon" || token.toLowerCase() === "$dumpoff") {
        const dumpTimestamp = timestamp ?? 0n;
        if (timestamp === undefined) timestamp = dumpTimestamp;
        for (;;) {
          const dumpToken = await next();
          if (dumpToken === "$end") break;
          if (dumpToken.startsWith("#")) {
            if (!/^#\d+$/.test(dumpToken)) fail("malformed", "VCD timestamp must be a non-negative integer.", dumpToken);
            timestamp = BigInt(dumpToken.slice(1));
          } else {
            if (/^[bB][01xXzZ]+$/i.test(dumpToken)) {
              const codeToken = await next();
              if (codeToken !== "$end" && !codeToken.startsWith("#")) {
                addChange(dumpToken, timestamp ?? dumpTimestamp, codeToken);
              } else {
                fail("malformed", "A vector value change is missing its identifier code.", dumpToken);
              }
            } else {
              addChange(dumpToken, timestamp ?? dumpTimestamp);
            }
          }
        }
      } else if (token.startsWith("$")) {
        fail("unsupported", "Unsupported VCD value-section directive.", token);
      } else {
        if (token.startsWith("b") || token.startsWith("B")) {
          const code = await next();
          if (code.startsWith("$")) fail("malformed", "A vector value change is missing its identifier code.", token);
          addChange(token, timestamp ?? fail("malformed", "Value change appears before a timestamp.", token), code);
        } else {
          addChange(token, timestamp ?? fail("malformed", "Value change appears before a timestamp.", token));
        }
      }
      tokenResult = await readNext();
    }
    if (options.signal?.aborted) fail("aborted", "VCD parsing was aborted.");
    return { ok: true, value: { timescale, variables, changes } };
  } catch (error) {
    if (error instanceof ParseFailure) return { ok: false, error: { code: error.code, message: error.message, ...(error.token === undefined ? {} : { token: error.token }) } };
    return { ok: false, error: { code: "malformed", message: error instanceof Error ? error.message : "Unable to parse VCD input." } };
  }
}
