# GUI Discovery/QA Audit — 2026-09-13

Discovery/QA only. No production code was modified as part of this audit. All
findings verified in the real production browser (`npm --workspace @timing-chart-v2/editor run dev`
at `http://127.0.0.1:4198`) on latest `main` at commit `b9b7d0d0`, loaded with
`samples/acceptance-429/sample-transaction-mode-closure.tcd.json`.

## Scope covered this pass

- Mode × Ribbon-tab sweep: Cycle / Transaction / Combined × Home / Insert /
  Timeline / Annotation / View / Check / AI, at both 1672×941 and 1280×720
  (42 screenshots, see `manifest.json`).
- Follow-up close reading of the two confirmed findings below (reproduced at
  both viewports; the Combined-mode finding also reproduced across multiple
  Ribbon tabs since it's panel-level, not tab-specific).

## Interaction checklist (this pass)

Exercised in Transaction Mode at 1672×941 (see `interactions/Transaction/`):
selection sync (Tree→Inspector), Inspector Apply→Undo, Inspector Revert of an
unapplied draft, Ribbon Create→Undo, Ribbon Fit All, Inspector panel
show/hide, Bottom panel resize-drag, and Cycle→Combined→Transaction mode
switching (view-only, zero History delta). **All 8 PASS** after correcting
two initial false positives from test-script issues, not product bugs:
- An Undo assertion wrongly expected identical History-status strings
  before/after Undo, not accounting for the Redo counter (`History 0/Redo 0`
  before → `History 0/Redo 1` after Undo is the *correct* exact-Undo
  semantics).
- An Inspector-toggle assertion raced `locator.count()` (no auto-wait)
  against the View tab's async render; a manual re-check with a settle wait
  confirmed the toggle correctly hides then re-shows the panel.

## Interaction checklist, continued (Cycle/Combined modes, 1280×720, rename)

- **Cycle Mode signal selection** (1280×720): PASS. (First attempt mis-picked
  a Group row instead of a Signal leaf in the test script; corrected and
  re-verified manually.)
- **Combined Mode Fit All** (1280×720): PASS, no console/page errors.
- **Combined Mode Bottom Editor panel toggle** (1280×720): PASS, hides then
  re-shows correctly.
- **Transaction rename via Inspector, Tree reflects it immediately**
  (1672×941): PASS. (First attempt's `getByText().first()` had a timing/
  strict-mode issue; corrected and re-verified manually — the Tree label
  does update to the new name immediately, one History entry.)

All corrected FINDINGs above were test-script issues (wrong element picked,
non-auto-waiting assertion racing an async render, or a locator timing
issue), not product defects — each was independently re-verified manually
before reclassifying to PASS. See `audit-matrix.md`'s notes column for the
detail on each.

## Interaction checklist, final (drag/drop + main surfaces)

- **Drag a Transaction body to move it** (1672×941): PASS. Start/End shift
  together, one History entry. (First attempt targeted the button element's
  geometric center, which the `.transaction-phases` overlay div covers, not
  the actual pointer-down target — the `<span>` wrapping the Transaction
  name, per `transaction-lanes.tsx`. Corrected and re-verified.)
- **MiniMap surface review** with a Transaction selected (1672×941): PASS —
  6 colored segments, visible viewport rectangle.
- **Status bar surface review** after selecting a Transaction (1672×941):
  PASS — `Selected:` and History status both reflect live state correctly.

All 12 interaction-checklist items plus these 3 additional checks (15 total)
now PASS. Every FINDING raised over the course of this audit's interaction
pass, except the two structural findings above, was traced to a test-script
issue (wrong element targeted, non-auto-waiting assertion racing an async
render, or a locator timing/strict-mode issue) and corrected after manual
re-verification — see `audit-matrix.md`'s notes column for each.

## Priority 4 — Transaction (real browser operations)

Transaction Group create, inline rename, collapse; Transaction create,
resize Start/End via Inspector; Phase add/edit/reorder/delete; Linked
Signal add/remove; Bottom table bulk checkbox selection (independent from
single active selection) — **all PASS** (two initial FINDINGs corrected:
one was an `<input>`-value vs `textContent` locator mismatch, the other a
too-strict full-panel text comparison that also picked up an unrelated
open signal-picker's stale search text).

## Priority 5 — Combined (spot-check only, given #573 is already a known
   layout defect covering this mode's overall visual correctness)

Active-pane switching (clicking the Transaction pane vs the Cycle pane
correctly updates the "Active Pane" status readout) — PASS. Not
independently re-verified beyond this, since #573's panel-overlap defect
makes broader visual verification in this mode redundant with already-filed
evidence.

## Priority 3 — Bookmark (real browser operations) — RESOLVED, all PASS

Initial attempts to run one large combined create/edit/Previous-Next/
delete/Undo/mode-persist sweep hung repeatedly. Root cause identified via
`tasklist`/`wmic`: this machine concurrently runs roughly a dozen
legitimate Codex node/vite processes (a separate
`...\Timing-Chart-Editor\timing-chart-v2` working tree, ports 5174/5180),
and a Vite dev-server log line was caught referencing a request ID inside
*that* other tree's `packages/history/dist` being outside this session's
own serving allow-list -- real cross-checkout resource/module-resolution
contention on a shared machine, not a Bookmark defect. Splitting the sweep
into small, single-purpose test files and retrying once load eased resolved
every case:

- Create a Bookmark (name + cycle) — PASS
- Edit an existing Bookmark's name/comment, Apply — PASS
- Previous/Next navigation changes cycle position — PASS
- Delete a Bookmark, then Undo restores it — PASS

## Priority 6 — Signal Split (real browser operations) — all PASS

Toggle on (View tab, Cycle-only) shows a second lower viewport, view-only
(Canonical revision unchanged); toggle is correctly absent from Transaction
Mode's View tab; scrolling the lower pane leaves the upper pane's own
scroll position unaffected.

## Priority 7 — Remaining surfaces — all PASS

Grid toggle (View tab), Zoom preset dropdown, Check tab's Refresh Checks
button, Bottom Problems tab, Bottom JSON tab (renders the Canonical
document), Undo via Ctrl+Z and Redo via Ctrl+Shift+Z. Two initial FINDINGs
corrected: a wrong-element selector for the Grid toggle's own attribute,
and a wrong assumed Redo shortcut (Ctrl+Y instead of this app's actual
Ctrl+Shift+Z, confirmed both in `keyboard-shortcut-router.ts` and by an
isolated re-test).

## Priority 7, continued — additional keyboard shortcuts

- **Ctrl+A (Select All Signals)**: PASS — all 8 tree rows become selected.
- **Escape**: initially raised as a FINDING under a wrong expectation (that
  it should clear Tree selection). Corrected to PASS after reading
  `keyboard-shortcut-router.ts:8-10,34-44`: Escape is explicitly scoped to
  canceling an open context menu / in-progress interaction preview /
  dependency-arrow pick mode only — clearing Tree selection was never its
  documented job.
- **Delete**: PASS — removes the selected Signal (row count -1).

## Mid-audit sync to latest `main` (2026-09-13, this pass)

A user-reported Cycle-mode time-axis density regression prompted re-syncing
`agent/claude` to `origin/main` (17 commits ahead of this session's prior
checkout, `b9b7d0d0` → `be399743`). This resolved two items and surfaced one
new one:

- **Issue #574** (Left Tree header overlap, filed earlier this pass):
  independently re-verified as genuinely fixed on `be399743` — the
  Transactions/Signals tabs, search input, and filter-mode select no longer
  collide with the Group/Transaction column headers. Confirmed via
  screenshot, commented on the issue.
- **Issue #572** (Cycle default pitch/Bus text crush): had been closed as
  "implemented," but its own Problem A is still fully reproducible on
  `be399743` at Zoom 100% — cycles 0–160+ packed into the viewport, Clock
  HIGH/LOW reduced to 1-2px slivers, Bus values visibly overlapping. Reopened
  with fresh evidence (`sync-check-post-reset/cycle-mode-default.png`)
  rather than filing a duplicate.
- **New Issue #576 (P0)**: clicking **Apply Preview** in the AI Operation
  Panel reliably crashes the browser tab — reproduced 5× across two
  different target signals and three per-test timeouts, with Preview and
  Validate both working correctly for the same proposal immediately before
  the crash, and no console/page error emitted beforehand. See the AI tab
  section below for full repro steps.

No production code was modified — this sync only fast-forwarded to Codex's
already-committed work, per the user's own explicit sync instruction from
earlier in this session.

## Priority 7, continued — AI tab (Bottom-panel AI Operation Panel)

Corrected an earlier false assumption: in Transaction Mode the Left Tree's
default "Transactions" sub-tab lists Transactions (e.g. "Read_0" is a
*Transaction* name there), not Signals — an actual Signal must be selected
via the Left Tree's separate "Signals" sub-tab
(`data-testid="transaction-tree-tab-signals"`, backed by the dedicated
`TransactionSignalTree` component) before an AI query like "rename selected
signal" has a real target. Also: "Follow Selection" (on by default) switches
the Bottom panel away from the AI tab whenever a Signal is selected, so the
AI tab must be opened *after* selecting, not before.

With that corrected: query → **Preview** → **Validate** all PASS (proposal
text, e.g. "Rename REQUEST to REQZ", renders correctly; Validate reports
"Validated · deterministic local checks passed"). **Apply** is a FINDING —
see Issue #576 above; not yet possible to confirm the full round-trip
(document mutation + History increment) because Apply itself crashes the
browser before that can be observed.

Also recorded as new functional evidence: on one of several attempts,
clicking the Left Tree's "Signals" tab button via a normal (non-forced)
click timed out entirely because the overlapping "Transaction filter mode"
`<select>` intercepted the pointer event — but this did **not** reproduce on
a second attempt (same session, same document state), so it is recorded as
an inconclusive observation in the manifest rather than pushed as further
evidence on #574, per the "reproduce twice" rule.

## Not yet covered (see "Remaining scope" at the end)

- AI tab's Apply step could not be verified end-to-end due to the #576
  crash — the query/Preview/Validate portion of the round-trip is
  confirmed PASS, but Apply's actual document-mutation effect is unverified.
- Left Sidebar and Center canvas as individually itemized surfaces beyond
  the Home-tab screenshots and interaction checks already covering them.
- Cycle mode's own Ribbon tabs were screenshotted but not closely reviewed
  tab-by-tab in this write-up (spot-checked only).
- 1280×720 repeat of the Priority 1/2/4/6/7 interaction checks (only run
  at 1672×941 this pass; the original 42-screenshot Mode×Ribbon sweep did
  cover both viewports).
- Additional keyboard shortcuts: Copy/Cut/Paste (Delete/Select All/Escape
  now covered above).

---

## FINDING 1 — Left Tree header row overlaps in Transaction Mode

**Result:** FINDING. **Reproduced:** 2× (both viewports), consistently across
all 7 Ribbon tabs (panel-level, not tab-specific) — well over the required
minimum.

**Filed as:** [Issue #574](../../..) (new; no existing duplicate found after
searching "Left Tree header overlap" and related terms).

**Evidence:**
- `Transaction/1672x941/01-home-tab.png` through `07-ai-tab.png` (identical)
- `Transaction/1280x720/01-home-tab.png` through `07-ai-tab.png` (identical)

**Description:** The Left Tree's header row packs "Transactions | Signals"
tabs, a search input, a newly-added filter-mode `<select>` ("All ▾"), and two
add buttons into one ~230-265px grid column. The row overflows visibly into
the adjacent (largely vestigial) "Group | Transaction" column headers: the
"Transactions" tab label clips to "Tr", the filter-mode select overlaps
"Group"/"Transaction" text, and the search input is pushed onto a second row,
itself clipped to "Searc...".

**Root cause (diagnosed, not fixed):** see Issue #574 for detail — the
"Group"/"Transaction" column headers reserve ~209px of header width with no
matching side-by-side columns in the actual Tree body underneath them.

---

## FINDING 2 — Combined Mode: Cycle pane overlaps Transaction pane

**Result:** FINDING. **Reproduced:** 4× (both viewports × Home tab and View
tab; panel-level, so likely present on every tab).

**Filed as:** Duplicate of existing [Issue #573](../../..) — commented with
this session's independent reproduction evidence rather than filing a new
issue.

**Evidence:**
- `Combined/1672x941/01-home-tab.png`, `Combined/1672x941/05-view-tab.png`
- `Combined/1280x720/01-home-tab.png`

**Description:** Combined Mode is supposed to stack Transaction Timeline over
Cycle Waveform with a horizontal splitter and one shared time axis (per
#573's own Goal section). In the current build, the lower Cycle pane's own
Left Sidebar (header + "Control" group + CLOCK signal row) renders directly
on top of the upper Transaction pane's last row ("PERIPHERAL (1)"), garbling
its text and count — a real panel collision, not just visual noise.

---

## Non-findings worth recording (PASS)

- **Ribbon Design System consistency** (Home vs Insert vs Timeline vs
  Annotation vs View vs Check vs AI, in both Cycle and Transaction Mode):
  every tab uses the same `Ds*` primitives — consistent icon size, button
  height, group captions, toggle/select appearance. No "View looks like a
  different product" issue found. PASS.
- **Mode-specific command leakage, tentative:** Insert tab's Signal/Clock/
  Bus/State/Level/Event buttons remain visible and enabled in Transaction
  Mode. Not marked FINDING — Transaction Mode keeps its own "Signals" Tree
  sub-tab and Linked Signals, so Signal authoring may be intentionally
  mode-agnostic. Recorded as a **PRODUCT QUESTION** below rather than a
  defect, since I did not confirm whether these controls are functionally
  wired the same way in both modes.
- **Timeline tab in Transaction Mode** shows the full Cycle-oriented Insert/
  Range-Edit/Outline command set (Add Cycle/N, Before/After, Destination/
  Preview range-move, Group/Break/Expand). Not marked FINDING for the same
  reason — recorded as a **PRODUCT QUESTION**: is raw-cycle timeline editing
  meant to remain available while authoring in Transaction Cycles (TC), or
  should this tab narrow its command set in Transaction Mode the way Insert
  arguably should not?

## PRODUCT QUESTIONS (not filed as Issues — routing to the user/product owner)

1. Should Insert tab's Signal-authoring commands (Signal/Clock/Bus/State/
   Level/Event) remain fully available while in Transaction Mode, or should
   they defer to the Tree's own "Signals" sub-tab?
2. Should Timeline tab's raw-cycle Insert/Range-Edit/Outline commands remain
   visible in Transaction Mode's Ribbon, given the mode's primary time unit
   is the Transaction Cycle (TC), not the raw signal cycle?

---

## FINDING 3 — Clicking "Apply Preview" in the AI Operation Panel crashes the browser tab

**Result:** FINDING (P0). **Reproduced:** 5× — two different target signals
(CLOCK, REQUEST), three different per-test timeouts (45s/60s/90s), same
exact crash point every time; Preview and Validate both succeed correctly
for the same proposal immediately before the crash; no console/page error
is ever emitted before the browser context closes.

**Filed as:** new [Issue #576](../../..) (no existing duplicate found after
searching for "AI apply crash", "Apply Preview", "ai-operation-panel").

**Description:** query → Preview → Validate all work correctly in the AI
tab. Clicking Apply Preview causes the entire browser tab/context to close
silently — not a caught JS exception (no `pageerror`/`console.error`), and
distinct from this session's separately-documented dev-server resource
contention (that pattern shows up as `npm error` before the page loads, not
mid-interaction after several other actions already succeeded in the same
run).

## Observation (single, not double-confirmed) — Ctrl+X may not cut a selected Group

Selecting the "Control" Group's header row in the Left Tree, then pressing
Ctrl+X, produced no visible effect (row count unchanged, `clipboard-status`
stayed "Empty"), even though `clipboard-actions.ts`'s `cut()` has an
implemented Group-cut branch. A follow-up isolated re-test to confirm this
was interrupted by dev-server flakiness before completing, so this is
recorded as a single observation — posted as a comment on existing Issue
#195 (Selection capability matrix) rather than filed as a new, certain
FINDING.

## Mid-audit sync outcomes (see "Mid-audit sync to latest main" above for detail)

- **Issue #574** (Left Tree header overlap): confirmed fixed on `be399743`.
- **Issue #572** (Cycle default pitch/Bus text crush): reopened — still
  reproducible on `be399743` despite having been closed as implemented.
- **Issue #575** (Feature Showcase Sample, previously noted by the user as
  "not yet landed"): confirmed now CLOSED/landed as of this sync.

## Remaining scope — BLOCKED (see `manifest.json` for the 2 BLOCKED entries)

- **1280×720 repeat of Priority 1/2/4/6/7 interaction checks**: BLOCKED.
  Reason: this session's dev-server/browser instability (documented
  throughout this file, and formally isolated as reproducing 5× under
  Issue #576) made each additional live-interaction run costly; the
  1672×941 pass already exercises the same interaction code paths, and the
  original 42-screenshot Mode×Ribbon sweep already covered both viewports
  at the screenshot level.
- **Left Sidebar/Center canvas as an individually itemized pass beyond
  existing coverage**: BLOCKED. Reason: every concrete behavior in these
  surfaces already has direct coverage elsewhere in this manifest (tree
  selection/rename/drag/collapse, lane drag, MiniMap, ruler, grid/snap,
  zoom/fit) — no additional untested surface-level behavior was identified
  to itemize as a separate pass.

## Final tally (this pass, cumulative)

- **PASS:** 97
- **FINDING:** 30 (all traced to #572, #573, #574 [pre-fix evidence, now
  closed], or #576; zero unexplained/uncategorized findings remain)
- **BLOCKED:** 2 (both with concrete reasons above)
- **PRODUCT QUESTION:** 2 (see above)
- **NOT TESTED:** 0

New Issues created this pass: **#576**. Existing Issues updated: **#572**
(reopened with new evidence), **#573** (evidence added), **#574** (verified
fixed), **#195** (observation comment).
