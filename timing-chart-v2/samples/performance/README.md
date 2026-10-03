# Performance workloads

These checked-in JSON documents are deterministic workload inputs, not examples of recommended design style. Their counts and workload contracts are recorded in `manifest.json`; tests reject drift. `perf_100x500_full_span.tcd.json` is the fixed engineering Open benchmark and must retain 100 Signals, 500 source cycles, and full-span rendering for all 100 waveform owners. The 1,000×1,000 and 100×100,000 files exercise virtualization and sparse long-timeline navigation respectively.

Regenerate with `node scripts/generate-performance-sample-fixtures.mjs`. The generator uses the current `@timing-chart-v2/testing` document factory, then each result passes current canonical and resource-budget validation before writing. Performance measurements must keep renderer, viewport, cache condition, trace setting, and workload fixed; fixture presence alone is not a performance result.
