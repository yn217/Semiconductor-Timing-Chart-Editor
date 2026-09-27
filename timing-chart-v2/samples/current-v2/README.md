# Current V2 Sample Pack

These four files are the mutable **current-product Canonical JSON references**.
They intentionally stay on `formatVersion: 2`: the format version remains stable
while new optional Canonical fields are added. Current samples therefore track the
actual schema and accepted persisted product contracts, not only the numeric version.

The pre-refresh snapshot is archived under
`../old/current-v2-2026-09-27/`. Legacy immutable 01-20 Golden fixtures remain
under `golden-protocol/` and `golden-feature-coverage/`.

## Current persisted-contract coverage

Across the four fixtures the pack now demonstrates:

- stable Signal value-change `id` plus `displayLabel` / `comment` metadata;
- all current Signal types/roles, reset semantics, clocks and display presentation;
- `enumDefinitions` and stable `enumId` assignment for State Signals;
- all 16 Annotation types plus current `color`, `comment`, `labelOffset`,
  `labelPlacement`, `style`, `rotation`, `align`, and `locked` fields;
- explicit transition anchors, Measurement profile/layout, Highlight
  `positionMode`, Marker `verticalSpan`, Timing Region/Ghost Trace semantics;
- Annotation Groups;
- nested Time Groups via `parentId`, fold presentation and resume anchors;
- Transaction Groups, phases, linked Signals, visibility/category,
  style/metadata/links, colors/descriptions and `transactionTimeScale`;
- editable/custom Legend entries and Legend style;
- Bookmarks, constraints and `checkSettings`;
- Cycle / Transaction / Combined / long-timeline windowing use cases.

## Files

1. `01_cycle_reference.tcd.json`
   - 128-cycle broad Cycle reference and all 16 Annotation types.
   - Current Measurement/Marker/Highlight/label-layout semantics.
   - Enum-backed State, nested Time Groups, Transaction Groups/time scale.

2. `02_transaction_reference.tcd.json`
   - Transaction-focused reference.
   - Groups, lanes, phases, linked Signals, colors/descriptions.
   - Current Transaction visibility/category/style/metadata/links.
   - `transactionTimeScale` and Enum-backed response State.

3. `03_combined_reference.tcd.json`
   - Combined Cycle + Transaction reference.
   - Current Annotation placement/style/Marker vertical-span semantics.
   - Nested Time Group and cross-mode source-time alignment.

4. `04_long_timeline_stress_reference.tcd.json`
   - 512-cycle scroll/zoom/MiniMap/ruler/windowing stress reference.
   - Current Transaction Group/time-scale, nested Time Group,
     Enum-backed State and Marker vertical span.

## Maintenance rule

When an accepted Canonical field or persisted product contract is added:

1. update at least one current-v2 JSON to demonstrate it;
2. keep all four files valid under `validateCanonicalDocument()`;
3. archive the previous pack under `samples/old/<dated-snapshot>/` when a broad
   refresh materially changes these references;
4. do not modify the immutable Legacy V1 Golden packs merely to make current
   Canonical samples look newer.

The drift guard is `tests/schema/current-v2-samples-drift-guard.test.ts`.
