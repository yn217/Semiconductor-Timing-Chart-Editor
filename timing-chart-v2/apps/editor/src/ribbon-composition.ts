import type { ActiveContext, ViewMode } from "./workspace/use-workspace-ui-state.js";
import type { RibbonGroupSpec } from "./ribbon-schema.js";

/** #403/#405: the one Ribbon composition owner -- assembles a tab's actual
 * rendered groups from Common groups (shown in every ActiveContext) plus
 * whichever context-specific groups apply, instead of each call site
 * hand-branching `if (viewMode === ...)` per button/group. This file is
 * additive scaffolding only (#405's own explicit scope: "composition基盤
 * まで" -- the composition foundation, not yet wiring an existing Ribbon
 * tab through it): nothing currently calls `composeRibbon` from
 * minimal-cycle-view-ribbon.tsx, so this cannot regress the existing
 * Cycle-mode Ribbon. Wiring a real tab (and the actual Transaction-context
 * group content) is #406+'s scope, per the epic's own sequencing.
 *
 * `RibbonContext` deliberately reuses `ViewMode`/`ActiveContext` from
 * #404's workspace UI state rather than inventing a third parallel
 * concept -- `WorkspacePreset` is a panel/layout preset name, never a
 * Ribbon semantic-context selector (explicitly forbidden by #405). */
export type RibbonContext = Readonly<{ viewMode: ViewMode; activeContext: ActiveContext }>;

/** Per-ActiveContext group sets. `common` groups render in every context;
 * `bySignal`/`byTransaction` render only when `activeContext` matches.
 * Groups within each list keep their own array order; Common groups
 * always precede context-specific ones, so a tab composed from the same
 * inputs for the same context always yields the same group order
 * (deterministic composition, per #405's own test requirement). */
export type RibbonContextGroups = Readonly<{
  common: readonly RibbonGroupSpec[];
  bySignal: readonly RibbonGroupSpec[];
  byTransaction: readonly RibbonGroupSpec[];
}>;

export function composeRibbon(groups: RibbonContextGroups, context: RibbonContext): readonly RibbonGroupSpec[] {
  const contextGroups = context.activeContext === "Transaction" ? groups.byTransaction : groups.bySignal;
  return [...groups.common, ...contextGroups];
}
