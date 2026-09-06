import type { ActiveContext, ViewMode } from "./workspace/use-workspace-ui-state.js";
import type { RibbonGroupSpec } from "./ribbon-schema.js";

/** #403/#405: the one Ribbon composition owner -- assembles a tab's actual
 * rendered groups from Common groups (shown in every ActiveContext) plus
 * whichever context-specific groups apply, instead of each call site
 * hand-branching `if (viewMode === ...)` per button/group. Home uses this
 * owner with an explicit group order so visual and keyboard order agree.
 *
 * `RibbonContext` deliberately reuses `ViewMode`/`ActiveContext` from
 * #404's workspace UI state rather than inventing a third parallel
 * concept -- `WorkspacePreset` is a panel/layout preset name, never a
 * Ribbon semantic-context selector (explicitly forbidden by #405). */
export type RibbonContext = Readonly<{ viewMode: ViewMode; activeContext: ActiveContext }>;

/** Per-ActiveContext group sets. `common` groups render in every context;
 * `bySignal`/`byTransaction` render only when `activeContext` matches.
 * Without an explicit order, Common groups precede context-specific ones.
 * An explicit order interleaves these sets; unlisted groups follow in their
 * original relative order. Composition never mutates the input arrays. */
export type RibbonContextGroups = Readonly<{
  common: readonly RibbonGroupSpec[];
  bySignal: readonly RibbonGroupSpec[];
  byTransaction: readonly RibbonGroupSpec[];
}>;

export function composeRibbon(groups: RibbonContextGroups, context: RibbonContext, order: readonly string[] = []): readonly RibbonGroupSpec[] {
  const contextGroups = context.activeContext === "Transaction" ? groups.byTransaction : groups.bySignal;
  const rank = (group: RibbonGroupSpec) => {
    const index = order.indexOf(group.id);
    return index < 0 ? order.length : index;
  };
  return [...groups.common, ...contextGroups].sort((left, right) => rank(left) - rank(right));
}
