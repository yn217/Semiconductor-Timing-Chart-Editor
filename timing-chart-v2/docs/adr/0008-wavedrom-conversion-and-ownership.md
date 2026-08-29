# ADR 0008: WaveDrom conversion and stable signal ownership

- Status: Accepted for Phase 3
- Date: 2026-08-25

## Decision

The adapter converts one canonical Signal and render interval into temporary
WaveJSON. Change-point persistence is encoded with `.`; bus/state `data`
entries exist only at semantic changes. Supported logic primitives are
`0`, `1`, `x`, `z`, `d`, and `u`. Clock polarity maps to `p` or `n`; integer
period and WaveDrom phase are retained. Derived timeline gaps replace a
continuation slot with `|`.

The adapter rejects representations that pinned WaveDrom cannot preserve
exactly. Non-50-percent clock duty is expanded only when the integer period
contains exact half-cycle boundaries and the initial level is the inactive
level; finer duty geometry, fractional per-signal change points, and clock
starts/enables/gaps not aligned to the clock period remain rejected. It never
draws an approximate custom trace.

Production rendering calls only pinned `wavedrom@3.6.2` with its package
default skin. Each Signal owns one SVG through its stable `signalId`. Numeric
WaveDrom render indices are allocated once per stable ID and retained across
dispose/remount during the adapter lifetime; row or viewport indices are never
used as identity. Render failure is an explicit `WaveDromAdapterError`.

## Consequences

- WaveJSON, WaveDrom SVG, ownership maps, and counters are derived and never
  saved or included in History.
- Reorder and visibility do not call the adapter because their Phase 2
  ChangeSets omit `waveSemantics`.
- Local Geometry is not estimated. `extractLocalGeometry` explicitly reports
  that Phase 4 is not implemented.
- Data color tokens `2` through `9` and active-edge clock tokens `P`/`N` remain
  unsupported until canonical semantics exist; each has a machine-readable
  reason in the capability manifest.
