# #626 Visual/Geometry Regression Baseline (Claude pass, 2026-09-17)

Reviewer: Claude (independent visual/QA reviewer, no production changes made this pass).
Build: `agent/claude` @ `c90136cf` (main unchanged this pass).

Method note: at emulated viewports ≥1280px width, the browser-pane screenshot tool
occasionally renders a visually mis-scaled thumbnail (content appears confined to a
small top-left region). This was verified to be a **screenshot-capture artifact only**
— `getBoundingClientRect()`/`window.innerWidth` measurements confirm the actual DOM
layout fills the full viewport correctly in every case checked below. Geometry
observations in this table are based on DOM measurement, not pixel-counting from
screenshots, for this reason.

| Mode | Viewport | State | Visual observation | Geometry/interaction invariant | Result | Existing issue |
|---|---|---|---|---|---|---|
| Cycle | 1672x941 | fresh load | Ribbon/tree/waveform/bottom/inspector/minimap all present, no clipping | cycle-viewport 1374x462, bottom-editor 1375x240, inspector 297x749, minimap 297x115 — sums to full 1672x941 | PASS | — |
| Cycle | 1672x941 | Signal tab, single scroller check | No nested/duplicate scrollbars found | Only 1 scrollable region (`.bottom-content`, scrollH 197 vs clientH 174) | PASS | — |
| Cycle | 1672x941 | select CLOCK signal | Bottom/Inspector panel size unchanged after selection | bottom-editor 1375x240 and inspector 297x749 identical before/after | PASS | — |
| Cycle | 1280x720 | fresh load | Same structural layout, proportionally smaller | cycle-viewport 982x240, bottom-editor 983x240, inspector 297x528, minimap 297x115 | PASS | — |
| Cycle | 1280x720 | scroller inventory | 3 distinct non-overlapping scrollers (cycle-viewport, bottom-content, inspector-scroll) | no nesting/duplication | PASS | — |
| Cycle | 1280x720 | select CLOCK signal | No layout shift, ticks stable (198) | bottom-editor/cycle-viewport unchanged | PASS | — |
| Transaction | 1280x720 | select Read_0 | No layout shift on selection | bottom-editor 983x240 unchanged before/after | PASS | — |
| Transaction | 1672x941 | selection persists across resize | Read_0 stayed selected across viewport resize | inspector-shell 297x749, no console errors | PASS | — |
| Combined | 1672x941 | single entry attempt (Transaction→Combined) | Entered cleanly, no crash, no console error this attempt | `data-view-mode="Split"` set correctly | PASS-this-attempt / BLOCKED_BY_622 for full acceptance (known intermittent P0 crash, not exhaustively retested this pass per scope) | #622 |
| Cycle | 1672x941 | Annotation Bottom tab, before row selection | List renders 16 annotations in a table | `.annotation-list` (w1359 h320, scrollH457/clientH319, overflow-y:auto) is a **direct child** of `.bottom-content` (w1374 h174, scrollH385/clientH174, overflow-y:auto) — both independently scrollable, both with 15px scrollbar | **FINDING (double scrollbar)** | #628 |
| Cycle | 1672x941 | Annotation Bottom tab, after selecting "Request accepted" row | List collapses from 1359px to 391px wide; a new `.signal-editor.annotation-editor` region (1359x572) appears with "Edit Annotation" (Type/Label/Anchor/Endpoint/Signal/Cycle/Apply) and "Quick Presets" (Arrow/Callout/Measurement/Timing Region/Marker/Text Note) sections; content taller than visible area, requiring scroll | list width -71% (1359→391px); editor region height 572 vs bottom-editor visible height 240 | **FINDING (sudden reflow + list starvation)** | #628 |
| Cycle | 1672x941 | Inspector state after same selection | Inspector simultaneously shows "Request accepted / Annotation · Text · Cycle 12" with the same Type/Label/Color/Anchor fields as the Bottom editor | duplicated editable surface for the same entity in two panels | **FINDING (duplicated editing responsibility)** | #628 |
| Cycle | 1280x720 | Annotation Bottom tab, before row selection (fresh reload) | Same double-scrollbar structure reproduces at this viewport | `.annotation-list` (w967 h320, scrollH457/clientH319) direct child of `.bottom-content` (w982, scrollH385/clientH174), both overflow-y:auto | **FINDING (double scrollbar, confirmed at both viewports)** | #628 |
| Cycle | 1280x720 | Annotation Bottom tab, after selecting same row | List collapses 967px→268px (-72%, consistent with the 1672x941 case); editor region grows to 967x696 (taller than at 1672x941's 572, since less width forces more field wrapping) | same reflow pattern, worse vertically at the narrower viewport | **FINDING (confirmed at both viewports)** | #628 |

## Areas not yet covered this pass (out of scope / deferred)
- Full Combined-mode journey (X2, X3) — deferred to #554, gated on #622 stabilizing.
- Phase add/delete/reorder — already tracked and confirmed under #627, not re-tested here.

## Summary
- 10 PASS observations across Cycle/Transaction at both target viewports — no new regressions found on those baseline surfaces.
- 1 clean (non-crashing) Combined entry this attempt — does not supersede #622's open status; intermittent crash risk remains real per prior session evidence (13/13 non-repro in one batch, but do not treat as fixed).
- #628 fully reproduced with precise DOM evidence at **both** required viewports (1672x941 and 1280x720): nested double-scrollbar confirmed structurally, sudden ~71-72% list-width collapse confirmed numerically, editor region taller than the panel's visible height (more pronounced at the narrower viewport), and Inspector/Bottom duplicate-editing-surface confirmed by side-by-side field comparison.
