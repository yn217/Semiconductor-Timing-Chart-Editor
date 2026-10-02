# Current product samples

This is the only authoritative current-spec sample pack. These six documents were newly authored from the current canonical schema and are not copied/migrated from historical samples. `manifest.json` states each fixture's intended coverage; `coverage-matrix.json` is generated from the fixture content and checked against the published schema enums. Historical fixtures live under `../old/` for migration and regression archaeology only. Performance workloads live separately under `../performance/` and are not visual examples.

Regenerate with `node scripts/generate-current-sample-fixtures.mjs`; the generator runs canonical and resource-budget validation before writing.
