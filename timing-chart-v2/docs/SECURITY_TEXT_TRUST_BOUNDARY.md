# V2 User Text Trust Boundary

User-controlled document text is data, not markup. Signal, group, annotation,
transaction, bookmark, time-group, header, footer, comment, and WaveDrom value
strings are escaped when serialized into SVG text or attributes.

## Production paths

1. Canonical document input is validated by `normalizeDocument` and the schema.
2. `ProductionWaveDromAdapter` creates WaveDrom markup only from generated
   WaveJSON. `assertSafeWaveDromMarkup` rejects executable tags, event-handler
   attributes, and `javascript:` URLs before parsing.
3. The adapter parses the markup into a template, then
   `assertSafeWaveDromSvg` audits the materialized DOM before it is mounted.
   It rejects executable descendants, `on*` attributes, and `javascript:` or
   `data:` href values. This is the narrow imperative markup boundary.
4. `renderExportSvg` uses `xml()` for every user-derived text and attribute
   value. Export therefore preserves ordinary engineering characters as text
   without interpreting them as SVG markup.

The adapter's local WaveDrom fragment is treated as untrusted generated markup;
the default WaveDrom skin remains the geometry owner. CSP/browser protections
are defense in depth and are not relied on for escaping.

## Evidence

`tests/e2e/wavedrom-security.spec.ts` exercises adversarial text through the
real Open -> production render path and SVG export. The test asserts that the
mounted waveform contains no executable elements or unsafe URLs and that the
payload does not execute. `tests/e2e/export-user-text-boundary.spec.ts` covers
escaped document text in SVG export.

PNG/PDF are rasterized from the same escaped export SVG; they do not provide an
independent text-to-markup path. Future changes introducing imported SVG/HTML
must add a separate reviewed sanitizer boundary before materialization.
