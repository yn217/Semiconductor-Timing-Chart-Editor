import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "../application/editor-surface-command-controller.js";
import type { RibbonGroupSpec } from "../ribbon-schema.js";
import { DsRibbonToggleButton } from "../design-system.js";

export type SignalRibbonContext = Readonly<{
  document: CanonicalDocument;
  range: { readonly start: number; readonly end: number };
  commands: EditorSurfaceCommandController;
  compactCycleCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  viewMode: "Cycle" | "Transaction" | "Split";
  onMoveUp: () => void;
  onMoveDown: () => void;
  waveformPencilEnabled: boolean;
  onToggleWaveformPencil: () => void;
}>;

/**
 * Home Ribbon groups owned by the Signal/Cycle domain (#615): row order and timeline insert/delete (Time)
 * and Auto Space (Layout). Transaction-domain groups live in transaction-ribbon-groups.tsx; composeRibbon
 * merges them by ActiveContext.
 */
export function buildSignalRibbonGroups(context: SignalRibbonContext): readonly RibbonGroupSpec[] {
  const { document, range, commands, compactCycleCount, canMoveUp, canMoveDown, viewMode, onMoveUp, onMoveDown, waveformPencilEnabled, onToggleWaveformPencil } = context;
  return [
    {
      id: "signal-editing", majorGroup: "Signal", caption: "Signal", items: [
        { kind: "custom", id: "waveform-pencil", render: () => <DsRibbonToggleButton ariaLabel="Waveform Pencil" checked={waveformPencilEnabled} disabled={viewMode !== "Cycle"} dataTestId="waveform-pencil-ribbon" icon={<span aria-hidden="true">✎</span>} onClick={onToggleWaveformPencil} title="Draw HIGH/LOW directly on an editable Binary Signal by dragging; Clock, Bus, and Enum signals are not supported" size="medium">Pencil</DsRibbonToggleButton> },
      ],
    },
    {
      id: "timeline", majorGroup: "Time", caption: "Time", items: [
        { kind: "button", id: "row-up", icon: "i-up", label: "Up", ariaLabel: "Move selected row up", onClick: onMoveUp, disabled: !canMoveUp },
        { kind: "button", id: "row-down", icon: "i-down", label: "Down", ariaLabel: "Move selected row down", onClick: onMoveDown, disabled: !canMoveDown },
        { kind: "button", id: "cycle-insert", icon: "i-plus", label: "Cycle Insert", ariaLabel: "Insert one cycle", onClick: () => commands.insertTimeline(range.start, 1) },
        { kind: "button", id: "cycle-delete", icon: "i-delete", label: "Cycle Delete", ariaLabel: "Delete one cycle", onClick: () => commands.deleteTimeline(range.start, Math.min(document.timeline.cycleCount, range.start + 1)) },
        { kind: "button", id: "n-cycle-insert", icon: "i-plus", label: "N Cycle Insert", ariaLabel: `Insert ${compactCycleCount} cycles`, onClick: () => commands.insertTimeline(range.start, compactCycleCount) },
        { kind: "button", id: "n-cycle-delete", icon: "i-delete", label: "N Cycle Delete", ariaLabel: `Delete ${compactCycleCount} cycles`, onClick: () => commands.deleteTimeline(range.start, Math.min(document.timeline.cycleCount, range.start + compactCycleCount)) },
      ],
    },
    {
      // #416 Home Ribbon cleanup: "Edit Interval" was a pure navigation
      // duplicate (`onOpenTimeline` is just `setRibbonTab("Timeline")`,
      // and a "Timeline" tab already sits in the top tab strip) and
      // "Time Group" duplicated the Timeline Ribbon's own "Create" button
      // (timeline-toolbar.tsx's `time-group-create`, already functional --
      // TimeGroup is Timeline-domain, not Home's). Both removed rather than
      // kept disabled/hidden, per the issue's own explicit "don't keep as
      // disabled/hidden" instruction. `onOpenTimeline` itself stays wired
      // (use-editor-ai-assistant-model.ts's AI View Intent route still
      // calls it) -- only this Home button is gone, not the callback.
      // "Normalize Spacing" is a different feature (layout clamp, not
      // TimeGroup/Outline) per the issue's own explicit separation --
      // stays here rather than migrating alongside TimeGroup.
      id: "layout", majorGroup: "Layout", caption: "Layout", items: [
        { kind: "button", id: "normalize-spacing", icon: "i-auto-layout", label: "Auto Space", ariaLabel: "Normalize row spacing", title: "Normalize row height and signal spacing to the supported minimums.", onClick: () => commands.normalizeLayout({ ...document.layout, rowHeight: Math.max(24, document.layout.rowHeight), signalSpacing: Math.max(2, document.layout.signalSpacing) }) },
      ],
    },
  ];
}
