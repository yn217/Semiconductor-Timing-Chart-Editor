# ADR 0001: Isolated V2 workspace and one canonical source

- Status: Accepted for Phase 0
- Date: 2026-08-24

V2 lives under `timing-chart-v2/` and cannot import legacy production,
`cad-v2`, or reference assets. `core` is the sole runtime owner of the
canonical document. The saved representation is specified by `schema`.
Transient and derived state cannot be serialized into `.tcd`.
