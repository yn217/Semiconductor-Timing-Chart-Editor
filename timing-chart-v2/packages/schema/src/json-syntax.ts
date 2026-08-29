/**
 * Browser-independent JSON syntax contract. `offset` is a JavaScript UTF-16
 * code-unit offset, and line/column are one-based. The native parser remains
 * useful for secondary detail, but never supplies the normative location.
 */
export interface JsonSyntaxDiagnostic {
  readonly code: "JSON_SYNTAX";
  readonly offset: number;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

function location(source: string, offset: number): Pick<JsonSyntaxDiagnostic, "line" | "column"> {
  const before = source.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") };
}

class JsonSyntaxScanner {
  private index = 0;
  private failure: JsonSyntaxDiagnostic | undefined;
  constructor(private readonly source: string) {}

  scan(): JsonSyntaxDiagnostic | undefined {
    this.skipWhitespace();
    if (this.index === this.source.length) return this.fail(this.index, "JSON input is empty.");
    this.value();
    this.skipWhitespace();
    if (!this.failure && this.index < this.source.length) this.fail(this.index, "Only one JSON value is allowed.");
    return this.failure;
  }
  private skipWhitespace(): void {
    while (this.isJsonWhitespace(this.source[this.index])) this.index += 1;
  }
  private isJsonWhitespace(character: string | undefined): boolean {
    return character === " " || character === "\t" || character === "\r" || character === "\n";
  }
  private value(): void {
    if (this.failure) return;
    const character = this.source[this.index];
    if (character === "{") return this.object();
    if (character === "[") return this.array();
    if (character === '"') return void this.string();
    if (character === "-" || /[0-9]/.test(character ?? "")) return void this.number();
    for (const literal of ["true", "false", "null"]) {
      if (this.source.startsWith(literal, this.index)) { this.index += literal.length; return; }
    }
    this.fail(this.index, "Expected a JSON value.");
  }
  private object(): void {
    this.index += 1; this.skipWhitespace(); if (this.consume("}")) return;
    while (!this.failure) {
      if (this.source[this.index] !== '"') { this.fail(this.index, "Expected an object property name."); return; }
      this.string(); this.skipWhitespace();
      if (!this.consume(":")) { this.fail(this.index, "Expected ':' after an object property name."); return; }
      this.skipWhitespace(); this.value(); this.skipWhitespace();
      if (this.consume("}")) return;
      if (!this.consume(",")) { this.fail(this.index, "Expected ',' or '}' in an object."); return; }
      this.skipWhitespace(); if (this.source[this.index] === "}") { this.fail(this.index, "Trailing commas are not valid in JSON."); return; }
    }
  }
  private array(): void {
    this.index += 1; this.skipWhitespace(); if (this.consume("]")) return;
    while (!this.failure) {
      this.value(); this.skipWhitespace(); if (this.consume("]")) return;
      if (!this.consume(",")) { this.fail(this.index, "Expected ',' or ']' in an array."); return; }
      this.skipWhitespace(); if (this.source[this.index] === "]") { this.fail(this.index, "Trailing commas are not valid in JSON."); return; }
    }
  }
  private string(): void {
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index]!;
      if (character === '"') { this.index += 1; return; }
      if (character.charCodeAt(0) < 0x20) { this.fail(this.index, "Control characters are not allowed in JSON strings."); return; }
      if (character !== "\\") { this.index += 1; continue; }
      this.index += 1; const escape = this.source[this.index];
      if (escape === undefined) { this.fail(this.index, "Unterminated JSON string escape."); return; }
      if (!/["\\/bfnrt]/.test(escape) && escape !== "u") { this.fail(this.index, "Invalid JSON string escape."); return; }
      if (escape === "u") { const digits = this.source.slice(this.index + 1, this.index + 5); if (!/^[0-9a-f]{4}$/i.test(digits)) { this.fail(this.index, "Invalid JSON unicode escape."); return; } this.index += 5; }
      else this.index += 1;
    }
    this.fail(this.index, "Unterminated JSON string.");
  }
  private number(): void {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(this.source.slice(this.index));
    if (!match) { this.fail(this.index, "Invalid JSON number."); return; }
    this.index += match[0].length;
    if (/^[a-zA-Z0-9_.+-]/.test(this.source[this.index] ?? "")) this.fail(this.index, "Invalid JSON number.");
  }
  private consume(character: string): boolean { if (this.source[this.index] !== character) return false; this.index += 1; return true; }
  private fail(offset: number, message: string): undefined { if (!this.failure) this.failure = { code: "JSON_SYNTAX", offset, ...location(this.source, offset), message }; return undefined; }
}

/** Return the first deterministic syntax failure, or undefined for valid JSON. */
export function scanJsonSyntax(source: string): JsonSyntaxDiagnostic | undefined { return new JsonSyntaxScanner(source).scan(); }
