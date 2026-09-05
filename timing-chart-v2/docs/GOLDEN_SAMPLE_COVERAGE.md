# Golden sample contract coverage

The production-browser Golden harness reads both immutable sample manifests and applies the following concrete contract to every sample:

| Contract | Production evidence | Export evidence | Negative control |
| --- | --- | --- | --- |
| Declared cycle/signal/transaction counts | `.editor-shell` canonical count attributes and signal status | SVG signal/transaction stable-ID markers | `tests/golden/golden-contract.test.ts` rejects a missing signal |
| Rendered production path | Timing surface reaches idle and at least one stable-ID row is mounted | N/A | Browser test fails before evidence is attached if the surface is absent |
| Save/Open boundary | Each sample is saved, reopened, and revision/history invariants are checked | N/A | Open/revision mismatch fails the test |
| Required SVG export | Export dialog must produce a download; adapter errors fail | Title, V2 scene marker, signal markers and transaction markers | `golden-contract.test.ts` rejects missing scene/objects |
| Declared feature coverage | Manifest `coverage[]` is retained in attached evidence and paired with the count/render/save-open assertions above | Export contract applies to every sample with declared counts | Unsupported output cannot be silently recorded as an adapter limitation |

The immutable Golden image, sample inputs, threshold, and masks are not modified by this harness.

Current-main evidence: on 2026-09-06 at commit `80615a4`, the isolated Chromium production-browser run of `tests/e2e/golden-samples.spec.ts` passed all 3 scenarios: all 20 samples opened and Save/Open round-tripped, the representative A→B switch had no stale row ownership, and all 20 samples exported SVG, PNG, and PDF with unchanged Canonical/session counters. The run used a temporary port-4199 server configuration, which was removed after verification.

The fixed visual gate also passed on current main `273a21d` at 1672×941: geometry matched within the 2px contract, visual diff was 3.1649% against the 5% threshold, the mask had zero area, and the Ribbon had no horizontal overflow. The gate generated evidence only; the checked-in Golden/reference/threshold/mask inputs were unchanged.

Performance evidence on 2026-09-06: `tests/projection/time-mapping.test.ts` passed 14/14, including the 100k-cycle/1k-fold linearity counters. The non-gesture production-browser performance profile passed 7/7: 1k/5k/10k viewport-bounded projection (11 visited rows and zero full-visible-row scans per scale), 1k×1k virtualization with zero duplicate owners, large Open/Save, repeated A/B/A owner cleanup, and median/p95 first-correct-paint. Snap/drag scenarios were intentionally excluded because they overlap the quarantined #221/#222/#223 coordinate/gesture blocker; this is evidence progress, not full performance closure.

The isolated nightly heavy profile also passed 1/1 on current main `b1cab98`: both the 500×500 annotation-heavy and 1000×1000 transaction-heavy fixtures completed in 34.2 seconds. Coordinate-dependent scenarios remain intentionally excluded, so the full V1 performance matrix is still open.

Presentation evidence on 2026-09-06: `production-presentation-equivalence.spec.ts` passed 1/1 at 1672×941, proving normal and `?visual-reference` share Ribbon structure, tabs, pane geometry, bottom/inspector geometry, and visual tokens. The V8 fixture now uses the normative 61px Role + 148px Signal columns (209px frozen pane), and `gui-reference-v8.spec.ts` passed 3/3 with the original wave-width `>890px` guard intact and an exact current-contract `Signal` tab assertion. The earlier 240px/869px and `Signal Editor` failures were stale fixture/test contract drift; no assertion was weakened and no Golden/reference/threshold/mask asset was changed.
