# ADR 0003: WaveDrom authority and three-layer geometry

- Status: Accepted; WaveDrom and Local Geometry implemented through Phase 4
- Date: 2026-08-24

Only `wavedrom-adapter` may import pinned WaveDrom. The adapter owns temporary
WaveJSON and rendered SVG but no persistent state. Geometry flows from semantic
anchors to WaveDrom-local geometry and then through `projection` to screen
geometry. Fixed cycle pitch is forbidden when rendered geometry exists.

The adapter uses pinned `wavedrom@3.6.2` and its exported default skin.
WaveJSON, SVG, and Local Geometry are derived, unsaved state. Phase 4 extracts
Local Geometry from the rendered SVG. Screen projection remains separate.
