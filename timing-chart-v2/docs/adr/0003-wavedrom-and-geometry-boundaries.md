# ADR 0003: WaveDrom authority and three-layer geometry

- Status: Accepted for Phase 0
- Date: 2026-08-24

Only `wavedrom-adapter` may import pinned WaveDrom. The adapter owns temporary
WaveJSON and rendered SVG but no persistent state. Geometry flows from semantic
anchors to WaveDrom-local geometry and then through `projection` to screen
geometry. Fixed cycle pitch is forbidden when rendered geometry exists.
