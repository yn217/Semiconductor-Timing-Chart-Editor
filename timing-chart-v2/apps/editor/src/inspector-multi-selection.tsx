import type { RefObject } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { UiCommandRegistry } from "@timing-chart-v2/ui";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import { MiniMap } from "./minimap.js";

/** Inspector Multi-Selection view (GUI/UX Visual Quality Closure --
 * "Signal/Bus/Annotation/Bookmark/Transaction/Multi-selectionで内容を
 * type-awareにする"). Previously, selecting more than one Signal silently
 * rendered the single-signal editor for whichever one happened to be
 * `selectedSignal` (the "primary"/most-recently-clicked) -- with zero
 * indication that N signals were actually selected, so editing e.g. Name
 * there only ever affected that one signal despite the status bar and
 * Tree both showing a real multi-selection. This is a summary +
 * bulk-actions surface only: Visibility Show/Hide and Delete already work
 * correctly across the whole selection via `registry.execute("selection.
 * visibility"/"selection.delete")` -- the exact same commands the
 * single-signal Inspector, Ribbon and context menu already use, reused
 * here rather than inventing a second bulk-mutation path. The shared action
 * routes multi-Signal changes through one bulk visibility planner. */
export function InspectorMultiSelection({ count, registry, document, viewport, onCancel, onClose }: { readonly count: number; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCancel: () => void; readonly onClose: () => void }) {
  return <aside className="inspector" data-testid="inspector" data-inspector-context="multi-selection" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Multi-Selection" title={`${count} Signals selected`} detail="Bulk actions apply to every selected Signal" />
    <section className="inspector-multi-selection-actions">
      <p className="inspector-note">Individual properties (Name, Role, Style) aren't shown for a multi-selection -- select one Signal to edit its own fields, or use these actions to act on all {count} at once.</p>
      <button type="button" data-testid="multi-selection-show" onClick={() => registry.execute("selection.visibility", { visible: true })}>Show All</button>
      <button type="button" data-testid="multi-selection-hide" onClick={() => registry.execute("selection.visibility", { visible: false })}>Hide All</button>
      {/* #431 item 9 ("Signal Tree productivity"): "show only selected" uses
          the same atomic bulk visibility planner as Show/Hide All. */}
      <button type="button" data-testid="multi-selection-isolate" title="Hide every other Signal, keep only this selection visible" onClick={() => registry.execute("selection.isolate")}>Show Only Selected</button>
      <button type="button" className="danger" data-testid="multi-selection-delete" onClick={() => registry.execute("selection.delete")}>Delete Selected</button>
    </section>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
