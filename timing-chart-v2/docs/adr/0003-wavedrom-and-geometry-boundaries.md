# ADR 0003: WaveDrom authority and three-layer geometry

- Status: Accepted; WaveDrom boundary implemented in Phase 3
- Date: 2026-08-24

Only `wavedrom-adapter` may import pinned WaveDrom. The adapter owns temporary
WaveJSON and rendered SVG but no persistent state. Geometry flows from semantic
anchors to WaveDrom-local geometry and then through `projection` to screen
geometry. Fixed cycle pitch is forbidden when rendered geometry exists.

The Phase 3 adapter uses pinned `wavedrom@3.6.2` and its exported default skin.
WaveJSON and SVG are derived, unsaved state. Phase 4 will implement Local
Geometry extraction from the rendered SVG; the Phase 3 method fails explicitly
until then.
