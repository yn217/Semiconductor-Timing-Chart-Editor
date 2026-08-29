# User Text Trust Boundary Audit

This document records the V2 production paths reviewed for user-controlled text.
It is an audit record, not permission to treat arbitrary markup as trusted input.

| Path | Production owner | Boundary rule | Evidence |
| --- | --- | --- | --- |
| Signal, group, transaction, annotation, comment, header/footer, legend text | Canonical schema and command planner | Values remain strings in canonical data; commands validate the resulting document before commit. | `packages/schema/src/validation.ts`, `packages/commands/src/planner.ts` |
| Canonical text to WaveJSON | `packages/wavedrom-adapter/src/conversion.ts` | User text is passed as data to the pinned adapter; it is not concatenated into SVG markup by the editor. | `tests/wavedrom/conversion-and-conformance.test.ts` |
| WaveDrom output to editor DOM | `ProductionWaveDromAdapter` | Generated markup crosses one narrow `template` boundary only after `assertSafeWaveDromMarkup()` rejects executable elements, event attributes, and JavaScript URLs. | `packages/wavedrom-adapter/src/renderer.ts` |
| Export labels, metadata, IDs and document layout | `renderExportSvg()` | `xml()` escapes `&`, `<`, `>`, and quotes at every user-text insertion site. | `packages/export/src/index.ts` |
| Exported waveform payload metadata | `renderExportSvg()` | Signal IDs and serialized WaveJSON are attribute-escaped before insertion. | `packages/export/src/index.ts` |
| Imported JSON syntax | `parseDocument()` | Native parser detail is secondary; deterministic syntax diagnostics are produced by the schema scanner before canonical replacement. | `packages/schema/src/serialization.ts`, `packages/schema/src/json-syntax.ts` |

## Reviewed forbidden sinks

The production V2 source was searched for raw `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, `foreignObject`, event-handler attributes, and JavaScript
URL construction. The only intentional markup parse is the WaveDrom adapter
template boundary listed above. Export uses string serialization with escaping;
it does not copy user strings into executable attributes or elements.

## Adversarial coverage

The regression suite covers script-like elements, `javascript:` URLs, event
attributes, brackets, ampersands, quotes, and ordinary engineering labels in
both exported SVG and WaveDrom-generated markup. The expected behavior is to
preserve visible text while rejecting or escaping executable markup.

This audit does not treat browser CSP as the primary protection and does not
modify Golden/reference content.
