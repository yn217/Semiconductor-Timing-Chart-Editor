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
