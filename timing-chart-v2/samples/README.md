# Golden Sample Plan

20 fixtures are defined by Issue #17. Those 01-20 files are retained as **legacy V1 Golden / migration-regression fixtures**; they are not the current canonical product specification.

## Current V2 acceptance pack

For current-product browser verification use:

- `samples/current-v2/01_cycle_reference.tcd.json`
- `samples/current-v2/02_transaction_reference.tcd.json`
- `samples/current-v2/03_combined_reference.tcd.json`
- `samples/current-v2/04_long_timeline_stress_reference.tcd.json`

All four use `formatVersion: 2` and are intentionally mutable when the accepted product contract changes. See `samples/current-v2/README.md` for the acceptance matrix.

## Protocol / use-case 01-10
1. APB register access
2. AHB-Lite pipelined transfer
3. AXI4 Full write burst
4. AXI4 Full read outstanding
5. SRAM 1-port
6. SRAM 2-port
7. AXI4 to DRAM read path
8. Async FIFO / CDC
9. Accelerator request/response
10. AXI4-Stream packet/backpressure

## Feature coverage 11-20
11. Signal types / roles / legend
12. Group Bands / vertical spacing / Spacer
13. Signal name layout
14. Annotation overlay all types
15. Transition arrows / anchor styles
16. Clock phase / gating / collapsed gap
17. Cycle insert/delete/ripple
18. Legend free placement / arbitrary group order
19. Header/footer/export
20. Transaction/Cycle linked views

Prepared ZIP identities:
- `TimingChartEditor_10_Samples.zip`: SHA-256 `9e9fde221c7847456b2a728195655b6d244f89aa76fcf9f0d4c73456d2e6429d`
- `TimingChartEditor_Feature_Coverage_10_Samples.zip`: SHA-256 `4123864f906e8d752dac0a6cc04830b7478db1df3c5e5a60871931588744c0be`

The GitHub connector used for bootstrap does not expose binary ZIP upload. See Issue #17 for acceptance requirements and package identity.

The prepared packages are also retained under `references/` and unpacked for local validation under:

- `samples/golden-protocol/` — 01-10
- `samples/golden-feature-coverage/` — 11-20

`scripts/validate-samples.mjs` no longer exists. The legacy 01-20 pack is retained for migration/reference coverage; current-product acceptance is performed with the V2 pack above plus schema/unit/E2E gates.

## Non-Golden showcase samples

These are intentionally outside the immutable 20-sample Golden set so they can evolve with the product without changing Golden manifests, thresholds, masks, or Issue #17 expectations.

- `samples/showcase/21_large_feature_showcase.tcd.json` — **128 cycles / 48 signals**. Broad all-in-one feature inspection: four clocks, reset sequencing, input/output/internal roles, binary/bus/state/logic/event/pulse/commentRow, group bands/spacers, clock suppression/gating, edge counters, AXI-like traffic, pipeline latency, Async FIFO/CDC Gray pointers, the original 12 annotation families (the current schema has 16; use `current-v2/01_cycle_reference.tcd.json` for all 16), bookmarks, collapsed time groups/ruler label anchors, transactions/phases, legend, constraints, deep source paths, MiniMap/scroll/filter/Inspector and Save/Open/export starting-state coverage.
- `samples/showcase/22_clockless_annotation_showcase.tcd.json` — **96 cycles / 24 signals / zero clocks**. Dedicated clockless cycle-axis fixture with Input/Output/Internal filtering, bus/state/event/pulse/comment rows, pipeline latency, all canonical annotation families, bookmarks, collapsed idle range and transactions. Use this to verify that Ruler/Grid/selection/annotation behavior does not depend on a Clock Signal.
- `samples/showcase/23_multiclock_cdc_showcase.tcd.json` — **160 cycles / 28 signals / 4 clocks**. Multi-clock, phase/duty, gated/suppressed clocks, reset domains, 2FF synchronizer, pulse transfer, Async FIFO Gray pointers, synchronized pointer copies, full/empty behavior, CDC annotations and linked transactions.
- `samples/showcase/24_protocol_transaction_showcase.tcd.json` — **192 cycles / 32 signals / 7 transactions**. APB wait-state/read/write/error examples plus AXI write/read bursts, backpressure, outstanding count, transaction phases, linked Signals and protocol annotations.
- `samples/showcase/25_long_timeline_stress_showcase.tcd.json` — **512 cycles / 32 signals**. Long horizontal timeline for scroll/zoom/MiniMap/ruler performance, collapsed 128-cycle idle range, repeated Input/Internal/Output rows, buses/states, bookmarks and long-range transaction inspection.

The showcase suite is not part of the immutable Golden count. It is intended for manual inspection, focused E2E fixtures, implementation-time smoke checks and the later Final Integration / Regression Batch.
