# E2E implementation-coupling audit (#782 B2)

Generated from `qa/test-coupling-candidates.json` (static scan of `tests/e2e/*.spec.ts`: `querySelector`, `getComputedStyle`, `dataset`/`data-*`
reads, `.contains`, CSS custom properties, `classList`). 1,442 coupled call sites across 394 specs. Classification vocabulary:
USER_OBSERVABLE_KEEP / ARCHITECTURE_GUARD / MOVE_LAYER / REWRITE / MERGE / DELETE_DUPLICATE.

## Policy used

- `data-*` hooks that the product publishes as readiness/identity signals (`data-cycle-view-ready`, `data-editor-idle`, `data-canonical-revision`,
  `data-row-id`, `data-signal-id`, `data-annotation-id`, `data-transaction-id`, `data-source-cycle`) are the suite's agreed observation channel and
  are **USER_OBSERVABLE_KEEP**. They dominate the raw count (≈70 %) and are not coupling debt.
- `getComputedStyle` of colour / outline / font-weight / box position is **USER_OBSERVABLE_KEEP** (it measures what the user sees).
- Reads of CSS custom properties (`--gui-left-width`, `--time-domain-left`), `parent.contains(child)` topology, `overflow-x` owner assertions and
  hand-built DOM in the page are implementation-coupled: **REWRITE** to the user-visible effect, or **ARCHITECTURE_GUARD** if the structure itself is the
  invariant (then it belongs in a static/component check, not a 1-minute browser journey).

## Top candidates and decisions

| Spec | Coupling | Decision |
| --- | --- | --- |
| `mode-isolation-journey.spec.ts` | `getComputedStyle(...).left` of `geometry-grid`, `--gui-left-width` / `--gui-frozen-width` custom properties | REWRITE to measured pane/ruler X (user effect); the journey itself stays (USER_JOURNEY) |
| `view-ribbon-slot.spec.ts` | `getComputedStyle` on ribbon buttons, `owner.children` topology | KEEP style assertions (visual contract); REWRITE the `owner.children` topology check to "no control leaves its group box" (geometry) |
| `bottom-tab-header-visibility.spec.ts` | `classList.contains("active")` | REWRITE to `aria-selected` / `aria-current` (accessible state); colours stay |
| `gui-left-pane-resize.spec.ts` | `gridTemplateColumns` of `.column-headings` | KEEP for now (header-column layout contract; no semantic hook exists for the heading cells — a rewrite needs one in production, see follow-up) |
| `transaction-lane-scaling.spec.ts` | 11 `querySelector` + 24 `data-*` | KEEP: the selectors bulk-count 10k mounted owners page-side (virtualization contract); Locator round trips per element would be prohibitively slow |
| `issue-755-canvas-production-acceptance.spec.ts` | 10 `querySelector` on canvas internals | KEEP (canvas pixel/geometry contract needs in-page access); candidate to share `wave-probe`-style helper |
| `wavedrom-shared-definitions.spec.ts`, `issue-895-canvas-wave-semantics.spec.ts`, `design-system-foundation.spec.ts` | build their own DOM in the page | KEEP as browser-required component harnesses (iframe/canvas/pixel rendering); they test renderer/design-system output, not the app workspace — ARCHITECTURE_GUARD tier |
| `full-gui.spec.ts`, `timeline-editor.spec.ts`, `transaction-export.spec.ts`, `annotation-snap.spec.ts` | many `data-*` reads | USER_OBSERVABLE_KEEP (agreed hooks) |

Duplicate-contract (B5) status: the "view-only operation leaves Canonical / History / Dirty unchanged" contract was re-implemented by hand in ≥82
specs. `tests/e2e/view-only.ts` (`documentState` / `expectViewOnly`) now owns it; batches migrate the exact capture-three-values / assert-three-values shape.
Specs that assert it in a different shape (explicit `toHaveText("History 2 / Redo 0")`) stay as they are because they also pin the exact history depth.
