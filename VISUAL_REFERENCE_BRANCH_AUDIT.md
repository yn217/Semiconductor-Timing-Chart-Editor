# Visual Reference Branch Audit

Status: Wave 0 read-only audit, 2026-08-28

Scope: `timing-chart-v2/apps/editor/src/minimal-cycle-view.tsx`,
`timing-chart-v2/apps/editor/src/styles.css`, and the locked visual acceptance
tests. The only visual source of truth is
`timing-chart-v2/references/v2-gui-reference-v8/golden-home-cycle-1672x941.png`.

## Classification

- **Allowed** means the query may select deterministic fixture/state or capture
  behavior. It must not alter the production component tree, controls, layout,
  typography, or ordinary visibility.
- **Forbidden** means the query currently changes presentation. These branches
  must be removed or moved into the shared Production component/default tokens.
- **Audit only** means the branch is not itself forbidden, but must be covered
  by the presentation-equivalence test.

## TypeScript branch inventory

| File | Line/function | Current branch | Category | Action |
|---|---|---|---|---|
| `apps/editor/src/minimal-cycle-view.tsx` | `MinimalCycleView`, `visualReference` query | Reads `?visual-reference` | Allowed capture/state selector | Keep only as a harness fixture/capture-state flag; do not pass it to presentation decisions |
| same | `initialDocument` | `visualReference ? v1ReferenceDocument : cycleDocument` | Allowed fixture | Keep; both documents must render through the same Production tree |
| same | initial selection | `visualReference ? sig_cycle_clock : undefined` | Allowed deterministic state | Keep |
| same | initial multi-selection | `visualReference ? {sig_cycle_clock} : empty` | Allowed deterministic state | Keep |
| same | `leftPaneWidth` | `265 : 330` | **Forbidden presentation** | Remove branch; use shared Production default and make fixture-independent geometry explicit |
| same | `frozenPaneWidth` | `209 : 210` | **Forbidden presentation** | Remove branch; shared default |
| same | `inspectorWidth` | `297 : 300` | **Forbidden presentation** | Remove branch; shared default |
| same | `bottomHeight` | `240 : 270` | **Forbidden presentation** | Remove branch; shared default |
| same | `timelineRange` | `{0,1} : {2,4}` | Allowed deterministic state | Keep as fixture/state, provided it does not alter shell presentation |
| same | `selectedCycle` | `0 : 2` | Allowed deterministic state | Keep |
| same | geometry width effect | `visualReference` changes base width calculation | **Forbidden presentation** | Replace with one shared screen-geometry calculation |
| same | grid/ruler rebuild | `visualReference ? viewport-derived width : undefined` | **Forbidden presentation** | Shared geometry mapping; fixture changes only document/state |
| same | `buildRuler` calls | `visualReference` controls width argument | **Forbidden presentation** | Remove branch and use derived shared wave geometry |
| same | bottom labels | `visualReference` selects English labels | **Forbidden locale coupling** | Move locale to independent state/fixture setting |
| same | root JSX | `data-visual-reference={String(visualReference)}` | Audit-only marker | Replace with a capture-state attribute that has no layout selectors, or retain only for harness diagnostics |
| same | tab labels | query controls English/compatibility labels | **Forbidden presentation** | Shared tab structure and labels; locale is independent |
| same | column headings | query selects English vs Japanese and alternate headings | **Forbidden presentation** | Shared production headings; locale fixture only |
| same | Follow Selection / Pin labels | query selects label presentation | **Forbidden presentation** | Shared Production labels |
| same | status bar | query hides revision/history/dirty/problems/WaveDrom and changes range text | **Forbidden presentation** | Same status DOM and visibility; deterministic fixture may change values only |
| same | Home Ribbon render | `visualReference ? V8GoldenHomeRibbon : Normal Ribbon` | **Forbidden presentation** | Delete alternate component path; promote the approved shared command surface into `ProductionHomeRibbon` |
| same | Home Clipboard group | query hides Duplicate in normal path or changes placement | **Forbidden presentation** | One group/control structure; disable state may follow selection fixture |
| same | Edit group | query changes Duplicate vs Rename | **Forbidden presentation** | One shared control surface |
| same | Timeline group | query replaces TimelineToolbar with V8-only controls | **Forbidden presentation** | One shared Timeline group; deterministic state controls values, not structure |
| same | View group | query hides display subgroup and Fit Selection | **Forbidden presentation** | One shared View/Display surface |
| same | extra Display major group | only in `visualReference` | **Forbidden presentation** | Remove branch; shared Production group |
| same | `V8GoldenHomeRibbon` | dedicated component at function body | **Forbidden presentation** | Remove component after its approved controls are merged into the shared Production Ribbon |
| same | `home-display-subgroup` | rendered only when `!visualReference` | **Forbidden presentation** | Always use shared control structure |
| same | `V8GoldenHomeRibbon` labels | hard-coded English tool labels | **Forbidden locale/presentation** | Shared labels through locale state |

## CSS branch inventory

All selectors below are presentation branches and cannot remain query-specific.
They may be replaced by shared Production defaults or shared class tokens. The
only permitted query-specific CSS is capture determinism (animation,
transition, caret/focus behavior).

| File | Lines/selectors | Current behavior | Category | Action |
|---|---|---|---|---|
| `apps/editor/src/styles.css` | 29-40 | alternate frozen/wave columns, surface width, ruler/grid offsets | **Forbidden layout** | Move approved geometry to shared defaults |
| same | 234-236 | alternate MiniMap frame/viewport geometry | **Forbidden layout** | Shared MiniMap geometry |
| same | 252-264 | hides Bottom/Clock controls and injects query-specific label | **Forbidden DOM/presentation** | Shared Clock Bottom component; no injected text |
| same | 265-266 | query-specific selected-row background | **Forbidden styling** | Shared selected-row styling |
| same | 294-305 | alternate token block for dimensions | **Forbidden tokens** | Make approved tokens global Production defaults |
| same | 306-318 | alternate Ribbon heights, widths, control sizes, hidden Fit Selection | **Forbidden Ribbon presentation** | Shared defaults; no query selector |
| same | 319-344 | alternate workspace/column/row transforms and hidden group headers | **Forbidden layout/DOM** | Remove; use shared RowLayout/Screen Geometry |
| same | 345-387 | alternate tree columns, role widths, icons and visibility glyphs | **Forbidden tree presentation** | Shared tree tokens and DOM |
| same | 388-394 | alternate Inspector MiniMap size/rows/viewport | **Forbidden MiniMap presentation** | Shared MiniMap tokens |
| same | 395-408 | alternate Inspector typography, spacing, label columns | **Forbidden Inspector presentation** | Shared Inspector tokens |
| same | 409-417 | alternate playhead, bottom/status/title geometry | **Forbidden layout** | Shared Production defaults |
| same | 418-461 | alternate tab/button/pane/title/display control geometry and visibility | **Forbidden presentation** | Shared Production defaults |
| same | 462-480 | alternate Pin label and Ribbon group caption content | **Forbidden locale/presentation** | Shared labels and locale state |
| same | 556-560 | later query-specific Ribbon widths/control sizes | **Forbidden presentation** | Consolidate into shared defaults; remove duplicate overrides |

## Acceptance harness inventory

| File | Current behavior | Category | Action |
|---|---|---|---|
| `tests/e2e/gui-visual-acceptance.spec.ts` | Captures only `/?visual-reference` | **Forbidden coverage gap** | Capture `/` and `/?visual-reference` through the same Production tree; compare shell contracts |
| same | Computes `geometryPass` and `visualDiff.pass` but does not assert either | **Forbidden gate gap** | Assert both are true; failing visual diff must fail the test/process |
| same | Writes `acceptance: "diagnostic-gap-report"` | **Forbidden acceptance mode** | Replace with a real acceptance gate identifier |
| same | Uses fixed 1672x941 viewport and PNG threshold 24 | Allowed deterministic capture | Keep threshold and Golden immutable |
| same | Masks waveform in whole-image diff while reporting region diffs | Audit-only diagnostic | Keep only as explicitly named diagnostic; the final Golden gate must not treat a masked pass as full GUI pass |
| `tests/e2e/gui-reference-v8.spec.ts` | Validates only the query fixture and captures a query-specific screenshot | Coverage gap | Add shared Production equivalence assertions; do not use HTML reference as visual truth |
| `tests/e2e/full-gui.spec.ts` | Contains `abs((leftY - frozenY) - 44) <= 1` | Unproven geometry assumption | Remove or replace unless derived from an authoritative geometry contract; do not encode implementation drift |

## Allowed deterministic differences

The following are the only intended differences between `/` and
`/?visual-reference`:

1. Canonical fixture/document content.
2. Initial selection and multi-selection.
3. Active tab and selected cycle/range.
4. Scroll position, zoom, and viewport pan state.
5. Animation/transition/caret/focus capture determinism.
6. Explicitly independent locale state, when selected by the harness rather
   than inferred from the query parameter.

These differences must be represented in the harness state contract and must
not change component type, DOM topology, command placement, CSS layout tokens,
pane geometry, font, spacing, iconography, or ordinary control visibility.

## Forbidden presentation summary

The current implementation has query-specific branches in all of the critical
surfaces: Ribbon, tabs, pane dimensions, tree columns, role/signal columns,
Inspector, Bottom, MiniMap, status content/visibility, locale labels, and
WaveDrom/ruler width calculation. Therefore the current visual acceptance is
not yet an acceptance of the normal Production GUI. The next implementation
wave must serially remove these branches, starting with the alternate Home
Ribbon component, while keeping the fixture/state branches above.

## Required Wave 0 artifacts still to add

- `scripts/check-production-presentation-equivalence.mjs`
- `tests/e2e/production-presentation-equivalence.spec.ts`

The machine-readable result must include and require `true` for:

```json
{
  "sameRibbonStructure": true,
  "sameTabsStructure": true,
  "samePaneGeometry": true,
  "sameBottomGeometry": true,
  "sameInspectorGeometry": true,
  "sameVisualTokens": true
}
```

No production feature work should resume until these checks and the real
Golden visual gate exist.
