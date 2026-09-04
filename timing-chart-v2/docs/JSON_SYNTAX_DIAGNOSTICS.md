# Deterministic JSON Syntax Diagnostics

Malformed JSON uses the `JsonSyntaxDiagnostic` contract in
`packages/schema/src/json-syntax.ts`:

- `code` is always `JSON_SYNTAX`;
- `offset` is a JavaScript UTF-16 code-unit offset;
- `line` and `column` are one-based;
- `excerpt` and `caret` are deterministic source context;
- the native `JSON.parse()` message is retained only as secondary detail.

`scanJsonSyntax()` is the normative location implementation. It accepts only
the four JSON whitespace characters, handles multiline/CRLF/non-ASCII input,
and reports the first deterministic failure. `parseDocument()` runs the scan
for syntax diagnostics while retaining native parsing for the actual JSON
parse operation.

The current automated browser matrix is Chromium (`playwright.config.ts`).
The browser-independent schema tests are normative across engines, and the
Chromium Advanced JSON E2E verifies the UI can show and navigate the reported
location. If Firefox or WebKit projects are enabled later, they must run the
same Advanced JSON contract without changing the location definition.

Syntax failure is atomic: it returns a failed parse result and never replaces
the current canonical session. Advanced JSON consumes `line`, `column`,
`offset`, `excerpt`, and `caret` as structured fields; it does not parse a
human-readable engine error message.
