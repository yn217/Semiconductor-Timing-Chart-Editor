# Sample data policy

The sample tree has three deliberately separate purposes:

- [`current/`](current/README.md): the only authoritative, mutable current-product/specification example pack. It contains six freshly authored V2 canonical documents. Use these for current behavior, feature coverage, and Save/Open acceptance.
- [`performance/`](performance/README.md): checked-in deterministic current-schema workloads for fixed engineering measurements. These are workload inputs, not recommended visual examples; honor their manifests and never reduce declared counts to make a result pass.
- [`old/`](old/README.md): historical material retained for migration, regression archaeology, and provenance. It is not a current specification source. The complete active packs that existed before the 2026-10-02 reset are preserved in `old/pre-reset-2026-10-02/` with their manifests and documentation intact.

Do not add active `.tcd.json` documents outside `current/` or `performance/`. When the schema or accepted product contract changes, author/update current fixtures from the current schema, update the coverage matrix and manifest, and run the focused canonical sample-contract tests. Historical samples must remain byte-preserved when archived; never silently rewrite them to look current.

The checked-in fixtures are structurally and semantically validated by `tests/schema/current-samples-contract.test.ts` and `tests/schema/performance-samples-contract.test.ts`. The production-path browser acceptance suite is `tests/e2e/issue-777-current-v2-samples-acceptance.spec.ts`; its required viewport runs remain a separate acceptance gate from the deterministic schema checks.
