# Ribbon layout ownership — 2026-09-07

Base: cf61d6fe86cd2356a7ea848b001f151c1f3a1288.

## Scope

- Schema-rendered Home groups reserve a real caption row in ribbon-layout.css.
- The group body no longer emits a second, hidden caption.
- Home composition declares File/Edit/Time/Zoom/Transaction/Layout/Display order;
  DOM, keyboard and visual order agree without CSS order overrides.
- Removed a duplicate View CSS block. Existing command visibility and legacy
  tab recipes remain unchanged; this is not a complete all-tab CSS migration.

## Verification

- Typecheck, build, architecture boundaries and git diff --check passed.
- ribbon-composition.test.ts: 6 passed.
- Browser run, Chromium, one worker: 14 passed, 1 failed across
  ribbon-caption-layout, ribbon-responsive-overflow,
  ribbon-transaction-context and view-ribbon-slot.
- All new caption tests passed at 1280/1672 through Cycle/Transaction/Split/Cycle.
- Responsive command reachability passed at 1024/1280; Transaction interaction,
  Undo/Redo and layout tests passed. Screenshots accompany this record.

## Existing checks that are not green

- View/Home Zoom alignment expects equal x and width. Observed Home x=911,
  width=280; View x=914, width=320 at 1672px. A browser diagnostic removed the
  new stylesheet, hid the new caption and injected HEAD's original ribbon.css:
  Home group widths and x positions were identical, and View remained x=914,
  width=320. This isolates the mismatch from this CSS layout migration; it is
  not a full baseline worktree test. The assertion was not weakened.
- The broad ribbon-tabs test still looks for .ai-group; current production uses
  .ai-assistant-group/.ai-provider-group after moving the editor to Bottom.
  No AI production or test contract was changed in this patch.
- An initial run also encountered connection refusals/port contention on 4198.
  The final 15-test run used a temporary config on isolated port 4297; the
  temporary config and diagnostic test were removed afterwards.
