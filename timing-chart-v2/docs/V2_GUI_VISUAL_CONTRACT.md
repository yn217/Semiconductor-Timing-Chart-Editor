# V2 GUI Visual / Interaction Contract

Status: reconstructed from historical V1 GUI reference sources and the
approved V2 v8 executable reference. This is a normative migration contract;
it is not a redesign proposal. The historical V1 sources are external inputs
when supplied and mapped; they are not assumed to be present in the current V2
tree.

## Source excavation record

The following sources were inspected or recorded in priority order:

1. `docs/GUI_VISUAL_CONTRACT.md`
2. `docs/GUI_IMPLEMENTATION_REFERENCE.md`
3. Approved V2 v8 `gui-reference.json`, HTML/CSS and PNG under
   `references/v2-gui-reference-v8/`
4. Historical V1 Replacement Pack HTML/CSS/SVG/PNG, when supplied externally
   and mapped to a V2 fixture/state
5. `docs/GUI_SPEC.md` and `docs/GUI_LOCK_SPEC.md`
6. Historical `gui-mockup/` HTML/CSS/assets, when available
7. V2 editor CSS/TSX, for the measured gap only

The approved V2 v8 reference is the authority for current V2 visual structure
and numeric layout values. Historical V1 HTML/CSS and screenshots inform
parity mapping only when the assets and a V2 fixture/state mapping are
available. Screenshots are evidence, not a substitute for source inspection.

## Reference viewport and tokens

All visual acceptance uses Chromium, DPR 1, and `1672x941`. Responsive checks
also cover `1280x720` and the `1024` class.

| Token | V1 reference value | V2 measured/current value | Contract |
|---|---:|---:|---|
| Font family | `"Segoe UI", "Yu Gothic UI", Meiryo, sans-serif` | `"Segoe UI Variable", "Segoe UI", sans-serif` | Restore the V1 stack unless a documented platform exception is measured. |
| Base font | `13px` | `--font-ui: 11px` | V1 visual density is the baseline; compact labels may use 10–11px. |
| Icon size | 25px tool / 17px panel / 15px row | mixed component values | Use shared tokens: 25px ribbon, 17px panel, 15px row. |
| Control height | 30–31px | 26px | Preserve V1 control target for primary controls; compact controls may be 26px. |
| Row height | 36px | `--table-row-height: 28px` plus local rows | Use an explicit shared row token; V1 signal rows target 36px. |
| Border | `#dbe3ee`, secondary `#cbd6e4` | component-local colors | Centralize border hierarchy in V2 tokens. |
| Panel background | `#fff` | mixed white/blue-gray | Panel surfaces are white; shell background may be neutral. |
| Selected background | `#eef6ff` | component-local | Shared selected token must be used for tree, columns, and editors. |
| Hover background | `#f1f6fc` | component-local | Shared hover token must be used. |
| Left width | 330px | 330px default with bounded 280–420px view-only splitter; frozen label and waveform offsets share the width token | Preserve 330px default and bounded resize behavior. |
| Inspector width | 300px | 300px default with bounded 240–420px view-only resize | Preserve 300px default with bounded resize. |
| Ribbon height | 146px | current shell is 76px header plus local surfaces | V1 multi-group ribbon target is 146px after title/tab rows. |
| Title height | 32px | 76px app header | V1 title/app bar target is 32px. |
| Tab row height | 38px | not equivalent in current shell | Preserve 38px ribbon tab row. |
| Bottom height | 270px | current canvas/editor split differs | Preserve 270px Cycle View target, resizable/collapsible. |
| Status height | 27px | 32px shell row | V1 status target is 27px. |

## Required composition

```text
title bar (32px)
ribbon tab row (38px) + Cycle/Transaction/Split selector at right
multi-group Home/Insert/Annotation/View/Check/AI ribbon (146px)
┌──────────── left 330px ────────────┬──── center ────┬─ inspector 300px ─┐
│ Signal / Group tree                │ canvas         │ Inspector          │
│ search, groups, role, visibility   │ ruler/waveform │                    │
│                                    ├────────────────┤                    │
│                                    │ Bottom editor  │                    │
└────────────────────────────────────┴────────────────┴────────────────────┘
status bar (27px)
```

The Bottom Editor is in the center column only. Left Tree and Right Inspector
remain vertically continuous beside it. A full-width bottom strip, a generic
one-row toolbar, or a large dead canvas gap is non-compliant.

## Component contract

| Component | V1 source facts | V2 required behavior |
|---|---|---|
| Ribbon | `ribbon-tabs` has File/Home/Insert/Transaction/Annotation/View/Check/AI; `.ribbon` is grouped with captions and separators; tools are 48px minimum × 74px | Restore the same task grouping and density. No horizontal Ribbon scrollbar at 1672x941. Overflow uses compact controls, split/dropdown, tab responsibility, or responsive collapse; commands are not deleted. |
| Left Tree | 330px pane; 42px header; search row; 32px group headers; 36px rows; role badge, name, eye, more menu | Keep tree and waveform boundary distinct. In the locked V8 visual state the header contains the Signals / Groups title and Add menu while the search control occupies the following 35px row; use stable IDs and SemanticCommands for selection, visibility, reorder, group, and context actions. |
| Role column | V1 role badge is a separate 20px visual column (`i`, `o`, `wire`, comment) | Role is never text injected into waveform lanes. Preserve role styling and column alignment. |
| Signal column | V1 row grid reserves 145px label area in the canvas and ellipsizes labels | Maintain a distinct label column, stable width/resizing, and shared row geometry with the tree. |
| Waveform viewport | V1 `.wave` has 920px minimum width; ruler is 34px; rows are 35px minimum; waveform is primary surface | Use actual WaveDrom geometry through the adapter. In the locked V8 state, Screen Geometry expands the viewport to the full center column after the frozen label column; ruler/grid positions use the same display scale. Canvas bounds, ruler, and labels are compared; trace interior is separately conformance-tested. |
| Inspector | right 300px pane; 42px header; 12px body padding; grouped sections; 92px property labels | Remain visible beside canvas and bottom. Full editor fields are real transient drafts applied through SemanticCommand, not disabled placeholders. |
| Bottom Editor | center-only; 270px target; 38px tabs; Signal/Annotation/Problems/JSON; Transaction only in Transaction/Split; Follow Selection + Pin | Preserve tab availability and distinction between Follow Selection and Pin. Keep spreadsheet-like signal event table. The approved V8 Cycle reference opens with `clk` selected and places the compact Clock context toolbar at the top of the Bottom editor; generic drag/property controls remain available in normal editing and Inspector surfaces. |
| MiniMap | Inspector bottom; 80px mini canvas; blue viewport indicator | Visible in Inspector, click-pan and viewport-drag-pan change screen state only. |
| Status | 27px bar; Ready, signal/annotation/problem counts, time range, zoom | Keep stable left/right ordering and expose derived state without canonical mutation. |
| View mode | right side of ribbon tab row; segmented Cycle/Transaction/Split | View-only switch: Canonical/History/Dirty/Validation/WaveDrom/LocalGeometry counters all remain zero. |
| Grid/Snap/Ruler | Home display group contains four explicit toggles: grid, snap, ruler, minimap | Controls are functional and use shared semantic/screen mappings; no dummy toggles. |
| Icons | V1 uses `icons.svg` symbols via `<svg><use>` | Preserve the approved semantic V2 icon vocabulary or a mapped equivalent when the historical asset is available; do not substitute unrelated emoji. |

## Responsive rules

- At `1672x941`, all normal Home commands fit without Ribbon horizontal
  scrolling.
- At `1280x720`, retain the three-pane composition with compact groups and
  bounded pane sizes; Home keeps the direct V1-compatible command surface and
  has no horizontal Ribbon scroll.
- At the `1024` class, collapse or expose overflow by explicit controls while
  retaining access to every command and keeping the center waveform usable.
  The production More Home Commands menu is the explicit overflow surface.
- Pane resize and collapse are view-only operations and must not affect
  Canonical, History, Dirty, or validation counters.

## Interaction invariants

- Selection, visibility, reorder, clipboard, inspector apply, and bottom-editor
  apply all route through the existing SemanticCommand/UiCommandRegistry path.
- Typing is a transient draft. Apply/commit creates one canonical operation,
  one validation, one History entry, and one ChangeSet.
- View-only actions (tabs, mode, zoom, fit, grid/snap/ruler/minimap display,
  pane resize, follow, pin) have Canonical/History/Dirty delta zero.
- Stable IDs, not array indices, DOM positions, or viewport indices, identify
  signals, groups, annotations, and transactions.
- WaveDrom remains the production waveform renderer; custom overlays consume
  geometry from the WaveDrom adapter.

## V1/V2 DOM/CSS gap register

| Component | V1 | V2 current | Gap / required change |
|---|---|---|---|
| Ribbon | 146px grouped Office-style surface, no scroll at reference viewport | sparse/locally composed controls; current styles permit `overflow-x` in ribbon implementations | Match V1 grouping, dimensions, and zero-scroll acceptance. |
| Left Tree | dedicated 330px Signal/Group pane with search and role/visibility columns | tokenized 330px default pane with bounded 280–420px splitter; frozen label remains a separate derived column | Preserve the V1 pane boundary while keeping stable-column behavior and shared geometry offsets. |
| Role column | role badge in tree and canvas, separate from trace | V2 has role and frozen label surfaces | Preserve the boundary and tokenized badge styling. |
| Signal column | 145px canvas label area, 36px rows | V2 layout defaults role 62px/name 178px and 30px rows | Contract gap: adopt measured V1-compatible tokens or document an approved exception. |
| Waveform viewport | center remaining width; ruler 34px; no dead blank region | V2 reference mode now derives the wave width from the available center column and scales ruler/grid screen positions from the adapter's local geometry; normal mode retains its scrollable width | Keep center-first composition and validate bounds independently of trace paths. The V8 real-browser wave-owner width gate is >890px at 1672px viewport. |
| Inspector | fixed 300px default, continuous beside bottom | capability exists with tokenized 300px default and 240–420px view-only resize; Inspector is a bounded vertical flex surface so the MiniMap remains anchored below the scrollable editor | Complete remaining Inspector visual/field parity; resize and collapse behavior are covered by `gui-inspector-resize.spec.ts`; V8 MiniMap placement is covered by `gui-reference-v8.spec.ts`. |
| Bottom | center-only, 270px, 38px tabs | center editor uses a bounded 180–420px view-only splitter and existing collapse toggle; V8 reference state now selects `clk` and uses the compact Clock toolbar composition | Keep the splitter/collapse metrics and complete the remaining V1 tab/editor visual matrix. Current geometry gate is exact; pixel diff remains diagnostic/open. |
| MiniMap | Inspector lower section, 80px canvas | V2 MiniMap component exists | Match placement/size and retain functional pan behavior. |
| Status | 27px, derived counts and range | V2 status bar uses 32px row | Align height and field ordering with V1. |
| View Mode | right side of tab row | V2 selector exists in app surface | Lock position, dimensions, and view-only counter invariant. |

## Visual acceptance artifacts

Each GUI migration batch must produce `reference.png`, `dut.png`, `diff.png`,
and `layout-metrics.json` at the reference viewport. The following are never
masked: Ribbon, left pane, role/signal columns, waveform viewport bounds,
Inspector, Bottom, splitter, MiniMap, and Status. Only WaveDrom trace interior
may be masked when its separate geometry conformance evidence is attached.

The reproducible V2 production evidence command is
`npm run visual:acceptance` from `timing-chart-v2/`. It writes the four files
under `artifacts/gui-visual-acceptance/`. The screenshot diff is diagnostic and
does not convert a visual gap into a pass; `layout-metrics.json` records the
geometry/ribbon gates and the explicit `acceptance` state.

Major layout metrics target 0–2px against the approved V2 v8 reference;
historical Replacement Pack comparisons require an explicit mapped fixture and
existing documented cross-platform allowances must be explicit.
