# Current V2 Sample Pack

These files are the mutable **current-product** fixtures for manual browser acceptance.
They use the current canonical document contract (`formatVersion: 2`).

Legacy 01-20 Golden fixtures remain under `golden-protocol/` and
`golden-feature-coverage/` as V1 migration/regression references. Do not treat
those legacy files as the current product specification.

## Files

1. `01_cycle_reference.tcd.json`
   - Cycle mode
   - all current signal types/roles already exercised by the large showcase base
   - reset semantics
   - all 16 current annotation types:
     text, callout, verticalLine, range, bracket, highlight, marker,
     measurement, arrow, dependency, timingRegion, ghostTrace,
     rectangle, ellipse, connector, textbox
   - bookmarks, time groups and transactions for cross-feature interaction

2. `02_transaction_reference.tcd.json`
   - Transaction mode
   - Groups, Lanes, Phases, linked Signals
   - Transaction colors/descriptions
   - `transactionTimeScale` with 1 TC = 10 source cycles
   - reference clock + reset semantics

3. `03_combined_reference.tcd.json`
   - Combined mode
   - same current Transaction semantics plus Cycle signals
   - annotations/bookmarks/time group for cross-mode source-time alignment checks
   - intended for Cycle -> Transaction -> Combined -> Cycle round trips

4. `04_long_timeline_stress_reference.tcd.json`
   - 512-cycle stress case
   - horizontal scroll / far jump / ruler / MiniMap / zoom / windowing
   - reset semantics and long-range transactions

## Manual acceptance

Open each file through the production **Open** command, not by injecting state.

For each fixture:
- open -> render -> select/edit -> Save As -> New/Open saved file;
- confirm no console/page errors;
- confirm Canonical data survives the round trip;
- switch relevant view modes and verify no blank/stale surface;
- verify horizontal scrolling does not move fixed rails/columns;
- verify Bottom/Inspector selection remains synchronized.

Run at:
- 1280x720
- 1672x941

For the Transaction fixture, also change TC scale (for example 1, 10, 50)
and verify bars/ruler/hit-test/drag use the same presentation geometry.

## Maintenance rule

When the canonical schema or an accepted product contract changes, update this
directory in the same change or open a dedicated sample-drift Issue. A current
sample must not depend on V1 migration to represent a newly shipped feature.
